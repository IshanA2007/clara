import asyncio
import json
import snowflake.connector
from typing import Dict, List

from app.config import (
    SNOWFLAKE_ACCOUNT,
    SNOWFLAKE_USER,
    SNOWFLAKE_PASSWORD,
    SNOWFLAKE_ROLE,
    SNOWFLAKE_WAREHOUSE,
    CORTEX_MODEL,
)
from app.models import (
    Expectations,
    FeedbackCategory,
    FeedbackItem,
    Severity,
    SlideFeedback,
    SlideTranscript,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VALID_CATEGORIES = {c.value for c in FeedbackCategory}

BANNED_PHRASES = [
    "great job",
    "well done",
    "excellent",
    "good work",
    "nicely done",
    "impressive",
    "keep it up",
    "good job",
    "try to be more",
    "consider being more",
    "you should try",
]

SYSTEM_PROMPT = (
    "You are a presentation speech analyst. Your role is to provide specific,\n"
    "data-grounded feedback on speaking patterns observed in presentation transcripts.\n"
    "\n"
    "Rules:\n"
    "- Every comment MUST reference specific words, phrases, or patterns from the transcript\n"
    "- Do NOT give generic advice like \"try to be more engaging\" or \"good job\"\n"
    "- Do NOT rate the quality of the content or ideas\n"
    "- Do NOT give encouragement or praise\n"
    "- Focus ONLY on observable speaking behaviors: word choice, repetition, pacing patterns, clarity of phrasing, structural transitions\n"
    "- Each comment must be under 200 characters\n"
    "- Respond ONLY with valid JSON — no markdown, no explanation"
)

USER_PROMPT_TEMPLATE = (
    "PRESENTATION CONTEXT:\n"
    "- Tone: {tone}\n"
    "- Expected duration: {expected_duration_minutes} minutes\n"
    "- Context: {context}\n"
    "\n"
    "FULL PRESENTATION TRANSCRIPT (for reference across slides):\n"
    "{full_transcript}\n"
    "\n"
    "SLIDE {slide_number} OF {total_slides}:\n"
    "Transcript: \"{slide_text}\"\n"
    "Duration: {slide_duration} seconds\n"
    "Word count: {slide_word_count}\n"
    "\n"
    "Analyze ONLY Slide {slide_number}. Consider repetition and patterns relative to the rest of the presentation.\n"
    "\n"
    "Categories to evaluate:\n"
    "- repetition: repeated words or phrases within this slide or across the presentation\n"
    "- clarity: unclear or convoluted phrasing\n"
    "- diction: word choice issues, overly complex or informal language for the tone\n"
    "- pacing: observations about information density relative to slide duration\n"
    "- structure: how the speaker transitions into or out of this slide\n"
    "- timing: time spent on this slide relative to its content\n"
    "\n"
    "Respond with a JSON array of feedback objects. Maximum 5 items. If few issues found, return fewer items.\n"
    "\n"
    "Format:\n"
    "[\n"
    "  {{\n"
    "    \"category\": \"repetition|clarity|diction|pacing|structure|timing\",\n"
    "    \"comment\": \"specific observation under 200 characters\",\n"
    "    \"severity\": \"observation|suggestion\"\n"
    "  }}\n"
    "]"
)

# ---------------------------------------------------------------------------
# Snowflake connection
# ---------------------------------------------------------------------------


def _get_snowflake_connection() -> snowflake.connector.SnowflakeConnection:
    """Create a Snowflake connection for Cortex SQL calls."""
    return snowflake.connector.connect(
        account=SNOWFLAKE_ACCOUNT,
        user=SNOWFLAKE_USER,
        password=SNOWFLAKE_PASSWORD,
        role=SNOWFLAKE_ROLE,
        warehouse=SNOWFLAKE_WAREHOUSE,
    )


# ---------------------------------------------------------------------------
# Cortex SQL call (synchronous)
# ---------------------------------------------------------------------------


def _call_cortex(
    conn: snowflake.connector.SnowflakeConnection,
    system_prompt: str,
    user_prompt: str,
) -> str:
    """
    Call Snowflake Cortex COMPLETE via SQL.
    Returns the raw text content of the LLM reply.
    """
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    options = {"temperature": 0.3, "max_tokens": 1024}

    query = "SELECT SNOWFLAKE.CORTEX.COMPLETE(%(model)s, PARSE_JSON(%(messages)s), PARSE_JSON(%(options)s))"
    cursor = conn.cursor()
    try:
        cursor.execute(
            query,
            {
                "model": CORTEX_MODEL,
                "messages": json.dumps(messages),
                "options": json.dumps(options),
            },
        )
        row = cursor.fetchone()
    finally:
        cursor.close()

    if row is None:
        raise RuntimeError("Cortex COMPLETE returned no result")

    result = row[0]
    # SQL COMPLETE returns a JSON string with {"choices":[{"messages":"..."}]}
    if isinstance(result, str):
        parsed = json.loads(result)
    else:
        parsed = result

    return parsed["choices"][0]["messages"]


# ---------------------------------------------------------------------------
# Response parsing
# ---------------------------------------------------------------------------


def _parse_llm_response(raw: str) -> List[FeedbackItem]:
    """Strip markdown fences, parse JSON, validate and filter items."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0]

    items = json.loads(cleaned)

    validated: List[FeedbackItem] = []
    for item in items[:5]:  # max 5
        category = item.get("category")
        if category not in VALID_CATEGORIES:
            continue

        severity = item.get("severity", "observation")
        if severity not in ("observation", "suggestion"):
            severity = "observation"

        comment = item.get("comment", "")
        if len(comment) > 200:
            comment = comment[:197] + "..."

        lower_comment = comment.lower()
        if any(phrase in lower_comment for phrase in BANNED_PHRASES):
            continue

        validated.append(
            FeedbackItem(
                category=FeedbackCategory(category),
                comment=comment,
                severity=Severity(severity),
            )
        )

    return validated


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------


async def generate_llm_feedback(
    slide_transcript: Dict[str, SlideTranscript],
    expectations: Expectations,
    full_text: str,
) -> Dict[str, SlideFeedback]:
    """
    Generate per-slide LLM feedback via Snowflake Cortex.
    Returns a dict keyed by slide_id (e.g. "slide_0") with SlideFeedback values.
    Every input slide has a corresponding output entry.
    """
    conn = await asyncio.to_thread(_get_snowflake_connection)

    try:
        total_slides = len(slide_transcript)
        result: Dict[str, SlideFeedback] = {}

        for slide_id, slide in slide_transcript.items():
            # Empty slide — skip LLM call
            if not slide.words:
                result[slide_id] = SlideFeedback(feedback=[])
                continue

            slide_duration = slide.end_time - slide.start_time
            user_prompt = USER_PROMPT_TEMPLATE.format(
                tone=expectations.tone.value,
                expected_duration_minutes=expectations.expected_duration_minutes,
                context=expectations.context,
                full_transcript=full_text,
                slide_number=slide.slide_index + 1,
                total_slides=total_slides,
                slide_text=slide.text,
                slide_duration=round(slide_duration, 2),
                slide_word_count=len(slide.words),
            )

            # First attempt — run blocking Cortex call off the event loop
            try:
                raw = await asyncio.to_thread(
                    _call_cortex, conn, SYSTEM_PROMPT, user_prompt
                )
                feedback_items = _parse_llm_response(raw)
            except json.JSONDecodeError:
                # Retry once on invalid JSON
                try:
                    raw = await asyncio.to_thread(
                        _call_cortex, conn, SYSTEM_PROMPT, user_prompt
                    )
                    feedback_items = _parse_llm_response(raw)
                except (json.JSONDecodeError, Exception):
                    feedback_items = []

            result[slide_id] = SlideFeedback(feedback=feedback_items)
    finally:
        conn.close()

    return result
