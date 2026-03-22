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
    FeedbackItem,
    FeedbackType,
    SlideFeedback,
    SlideTranscript,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VALID_TYPES = {t.value for t in FeedbackType}

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
    "You are a presentation transcript analyzer. You detect language-level patterns\n"
    "that a word-counting algorithm cannot.\n"
    "\n"
    "You may ONLY return these flag types:\n"
    "- REPETITION: A phrase or sentence structure repeated across multiple slides\n"
    "  (not within a single slide). Example: \"the key thing is\" on slides 2, 4, 6.\n"
    "- HEDGE_STACK: Three or more hedging words in the same sentence. Individual\n"
    "  hedges are fine. Example: \"I sort of kind of think maybe we should probably...\"\n"
    "- FALSE_START: Speaker begins a sentence, abandons it, restarts. Example:\n"
    "  \"So the architecture is — well actually the way we built it is — so basically...\"\n"
    "- SLIDE_READING: Speaker reads the slide text nearly verbatim. Only flag if\n"
    "  slide text is provided and the transcript closely matches it.\n"
    "\n"
    "Rules:\n"
    "- If nothing notable is found, return an empty array. Do not force feedback.\n"
    "- Return at most 2 flags per slide.\n"
    "- Do not flag short slide durations, speaking pace, or word count — these are\n"
    "  already shown in metrics.\n"
    "- Do not provide positive feedback, encouragement, or suggestions.\n"
    "- Do not comment on grammar, vocabulary choices, or formality unless the\n"
    "  transcript shows hedge stacking.\n"
    "- Only flag patterns that a word-counting algorithm could not detect.\n"
    "- Each flag must reference specific words or phrases from the transcript.\n"
    "- Respond ONLY with a valid JSON array — no markdown, no explanation, no preamble."
)

USER_PROMPT_TEMPLATE = (
    "PRESENTATION CONTEXT:\n"
    "- Tone: {tone}\n"
    "- Context: {context}\n"
    "\n"
    "FULL PRESENTATION TRANSCRIPT (for cross-slide repetition detection):\n"
    "{full_transcript}\n"
    "\n"
    "SLIDE {slide_number} OF {total_slides}:\n"
    "Transcript: \"{slide_transcript}\"\n"
    "{slide_text_section}"
    "\n"
    "Analyze ONLY Slide {slide_number}. Return a JSON array of flags.\n"
    "\n"
    "Format:\n"
    "[\n"
    "  {{\n"
    "    \"type\": \"REPETITION|HEDGE_STACK|FALSE_START|SLIDE_READING\",\n"
    "    \"text\": \"the specific words or phrase flagged\",\n"
    "    \"detail\": \"brief explanation under 200 characters\"\n"
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
    for item in items[:2]:  # max 2
        flag_type = item.get("type")
        if flag_type not in VALID_TYPES:
            continue

        text = item.get("text", "")
        detail = item.get("detail", "")

        if len(text) > 200:
            text = text[:197] + "..."
        if len(detail) > 200:
            detail = detail[:197] + "..."

        # Filter banned phrases from detail
        lower_detail = detail.lower()
        if any(phrase in lower_detail for phrase in BANNED_PHRASES):
            continue

        validated.append(
            FeedbackItem(
                type=FeedbackType(flag_type),
                text=text,
                detail=detail,
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
    slide_texts: Dict[str, str],
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

            # Build slide text section (only if PDF text available)
            pdf_text = slide_texts.get(slide_id, "").strip()
            if pdf_text:
                slide_text_section = f'Slide text (from PDF): "{pdf_text}"\n'
            else:
                slide_text_section = ""

            user_prompt = USER_PROMPT_TEMPLATE.format(
                tone=expectations.tone.value,
                context=expectations.context,
                full_transcript=full_text,
                slide_number=slide.slide_index + 1,
                total_slides=total_slides,
                slide_transcript=slide.text,
                slide_text_section=slide_text_section,
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
