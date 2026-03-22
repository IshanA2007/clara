# Clara — Snowflake LLM Service Specification

This module generates structured, per-slide speaking feedback using Snowflake Cortex REST API. It is the only component that makes LLM calls.

Implemented as a Python module within the FastAPI application: `app/llm_feedback.py`

---

## Snowflake Cortex Usage

### API Endpoint

Snowflake Cortex REST API — Complete endpoint.

**Base URL:**
```
https://<account>.snowflakecomputing.com/api/v2/cortex/inference:complete
```

**Authentication:** Bearer token (JWT or OAuth token from Snowflake)

**Required environment variables:**
```
SNOWFLAKE_ACCOUNT=<account_identifier>
SNOWFLAKE_USER=<username>
SNOWFLAKE_PASSWORD=<password>
SNOWFLAKE_ROLE=<role>        # e.g., CORTEX_USER_ROLE
SNOWFLAKE_WAREHOUSE=<warehouse>
```

### Request Format

```json
{
  "model": "mistral-large2",
  "messages": [
    {
      "role": "system",
      "content": "..."
    },
    {
      "role": "user",
      "content": "..."
    }
  ],
  "temperature": 0.3,
  "max_tokens": 1024
}
```

**Model selection:** Use `mistral-large2` or `llama3.1-70b` (available on Cortex). Prefer `mistral-large2` for better instruction following. Make model configurable via environment variable `CORTEX_MODEL`.

**Temperature:** 0.3 — low enough for consistency, high enough to avoid degenerate repetition.

### Authentication Flow

1. Generate a JWT token using Snowflake key-pair authentication, OR
2. Use username/password to get a session token via Snowflake's token endpoint

For hackathon simplicity, use the Snowflake Python connector to obtain a session token:

```python
import snowflake.connector
import requests

conn = snowflake.connector.connect(
    account=SNOWFLAKE_ACCOUNT,
    user=SNOWFLAKE_USER,
    password=SNOWFLAKE_PASSWORD,
    role=SNOWFLAKE_ROLE,
    warehouse=SNOWFLAKE_WAREHOUSE
)
token = conn.rest.token
```

Then use `Authorization: Bearer {token}` on Cortex REST calls.

---

## Purpose and Scope

The LLM exists to catch **language-level patterns that regex and counting cannot detect**. It does NOT duplicate the deterministic analytics layer (WPM, filler words, pauses, repeated phrases via n-gram counting). It does NOT provide subjective style critiques or encouragement.

---

## Allowed Flag Types

Exactly 4 flag types. No others are permitted.

### REPETITION
The same phrase or sentence structure repeated **across slides** (not within a single slide — the deterministic n-gram counter handles intra-slide repetition). Example: "the key thing is" appears on slides 2, 4, and 6.

### HEDGE_STACK
Multiple hedging words piled into the **same sentence** (3 or more). Individual hedges ("maybe", "probably") are fine and not flagged. Example: "I sort of kind of think maybe we should probably consider this."

### FALSE_START
Speaker begins a sentence, abandons it, and restarts. Example: "So the architecture is — well actually the way we built it is — so basically the architecture..."

### SLIDE_READING
Transcript closely matches the slide text verbatim. Only flag this if slide text (from PDF extraction) is provided in the input. Compare the transcript segment to the slide text and flag if the speaker is clearly just reading the slide word-for-word.

### Killed Flag Types

These are **permanently removed** and must never appear:

- ~~CLARITY~~ — too subjective, LLM invents problems
- ~~DICTION~~ — style policing nobody asked for
- ~~STRUCTURE~~ — "abrupt transition" is not measurable
- ~~TIMING~~ — restates duration stat from metrics
- ~~PACING~~ — restates WPM stat from metrics
- Any positive feedback, encouragement, or "good job" comments

---

## Prompt Structure

Each slide gets its own API call. The prompt includes:
1. Full presentation context (for cross-slide awareness)
2. The specific slide transcript to analyze
3. The slide text from PDF (if available, for SLIDE_READING detection)
4. Presentation expectations (tone used only to calibrate hedge stacking severity)
5. Strict output format instructions

### System Prompt

```
You are a presentation transcript analyzer. You detect language-level patterns
that a word-counting algorithm cannot.

You may ONLY return these flag types:
- REPETITION: A phrase or sentence structure repeated across multiple slides
  (not within a single slide). Example: "the key thing is" on slides 2, 4, 6.
- HEDGE_STACK: Three or more hedging words in the same sentence. Individual
  hedges are fine. Example: "I sort of kind of think maybe we should probably..."
- FALSE_START: Speaker begins a sentence, abandons it, restarts. Example:
  "So the architecture is — well actually the way we built it is — so basically..."
- SLIDE_READING: Speaker reads the slide text nearly verbatim. Only flag if
  slide text is provided and the transcript closely matches it.

Rules:
- If nothing notable is found, return an empty array. Do not force feedback.
- Return at most 2 flags per slide.
- Do not flag short slide durations, speaking pace, or word count — these are
  already shown in metrics.
- Do not provide positive feedback, encouragement, or suggestions.
- Do not comment on grammar, vocabulary choices, or formality unless the
  transcript shows hedge stacking.
- Only flag patterns that a word-counting algorithm could not detect.
- Each flag must reference specific words or phrases from the transcript.
- Respond ONLY with a valid JSON array — no markdown, no explanation, no preamble.
```

### User Prompt Template

```
PRESENTATION CONTEXT:
- Tone: {tone}
- Context: {context}

FULL PRESENTATION TRANSCRIPT (for cross-slide repetition detection):
{full_transcript}

SLIDE {slide_number} OF {total_slides}:
Transcript: "{slide_transcript}"
{slide_text_section}

Analyze ONLY Slide {slide_number}. Return a JSON array of flags.

Format:
[
  {
    "type": "REPETITION|HEDGE_STACK|FALSE_START|SLIDE_READING",
    "text": "the specific words or phrase flagged",
    "detail": "brief explanation under 200 characters"
  }
]
```

The `{slide_text_section}` is conditionally included:
- If slide text is available: `Slide text (from PDF): "{slide_text}"`
- If not available: omitted entirely

**Note:** `slide_duration` and `slide_word_count` are intentionally excluded from the prompt to prevent the LLM from commenting on metrics.

---

## PDF Text Extraction

To support SLIDE_READING detection, the pipeline extracts text from each PDF slide page using PyMuPDF (`fitz`).

```python
import fitz  # PyMuPDF

def extract_slide_texts(pdf_path: str, total_slides: int) -> Dict[str, str]:
    doc = fitz.open(pdf_path)
    slide_texts = {}
    for i in range(min(total_slides, len(doc))):
        slide_texts[f"slide_{i}"] = doc[i].get_text().strip()
    doc.close()
    return slide_texts
```

This runs once per presentation before the analysis phase. The resulting dict is passed to `generate_llm_feedback()`.

---

## Slide-Focused Analysis

The LLM is called N times for N slides. Each call:

1. Receives the full presentation transcript as context
2. Is told to focus only on the current slide
3. Can reference patterns across slides (e.g., "the phrase X also appears on slides 2 and 5")
4. Receives the PDF slide text for that page (if available)

**Why per-slide calls instead of one bulk call:**
- Better focus and specificity per slide
- Avoids exceeding token limits for long presentations
- Allows structured output per slide
- Each slide's feedback is independent and parseable

---

## Concise Feedback Format

Each feedback item:

| Field | Type | Constraints |
|-------|------|-------------|
| `type` | string | One of: `REPETITION`, `HEDGE_STACK`, `FALSE_START`, `SLIDE_READING` |
| `text` | string | The specific words or phrase flagged from the transcript. Max 200 chars. |
| `detail` | string | Brief explanation. Max 200 characters. |

**Maximum 2 feedback items per slide.** If the LLM returns more, truncate to first 2.

---

## Structured Response Schema

The LLM must return a JSON array. Parse and validate:

```python
VALID_TYPES = {"REPETITION", "HEDGE_STACK", "FALSE_START", "SLIDE_READING"}

def parse_llm_response(raw_response: str) -> List[FeedbackItem]:
    # Strip any markdown code fences if present
    cleaned = raw_response.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1].rsplit("```", 1)[0]

    items = json.loads(cleaned)

    validated = []
    for item in items[:2]:  # Max 2
        if item.get("type") not in VALID_TYPES:
            continue
        text = item.get("text", "")
        detail = item.get("detail", "")
        if len(text) > 200:
            text = text[:197] + "..."
        if len(detail) > 200:
            detail = detail[:197] + "..."
        # Filter banned phrases
        if not filter_generic(detail):
            continue
        validated.append(item)

    return validated
```

---

## Constraints to Avoid Generic AI Feedback

These constraints are enforced in the system prompt and validated post-response:

| Constraint | Enforcement |
|-----------|-------------|
| No praise or encouragement | System prompt rule. Filter responses containing "great", "excellent", "good job", "well done" |
| No metrics commentary | System prompt rule. No duration, WPM, or word count observations |
| No grammar/style policing | System prompt rule. Only hedge stacking triggers language critique |
| Must reference transcript | System prompt rule. `text` field must contain actual words from transcript |
| Only 4 flag types | Post-processing validation. Unknown types silently dropped |
| Under 200 characters | Post-processing truncation on both `text` and `detail` |
| Max 2 per slide | Post-processing truncation |
| Empty array for clean slides | System prompt rule. No forced feedback |

**Post-processing filters:**

```python
BANNED_PHRASES = [
    "great job", "well done", "excellent", "good work",
    "nicely done", "impressive", "keep it up", "good job",
    "try to be more", "consider being more", "you should try"
]

def filter_generic(text: str) -> bool:
    """Return True if text should be kept."""
    lower = text.lower()
    return not any(phrase in lower for phrase in BANNED_PHRASES)
```

---

## Deterministic Output Structure

The module returns a dict keyed by slide ID:

```python
async def generate_llm_feedback(
    slide_transcript: Dict[str, SlideTranscript],
    expectations: Expectations,
    full_text: str,
    slide_texts: Dict[str, str],
) -> Dict[str, SlideFeedback]:
```

**Output:**
```json
{
  "slide_0": {
    "feedback": [
      {
        "type": "REPETITION",
        "text": "You know",
        "detail": "Phrase 'You know' appears on slides 2, 5, and 7"
      }
    ]
  },
  "slide_1": {
    "feedback": []
  }
}
```

Every slide in the input must have a corresponding entry in the output, even if `feedback` is empty.

---

## Error Handling

| Error | Handling |
|-------|----------|
| Cortex API returns non-200 | Retry once after 2 seconds. If still failing, raise exception (pipeline marks presentation as `failed`) |
| LLM returns invalid JSON | Retry once with same prompt. If still invalid, return empty feedback for that slide |
| LLM returns too many items | Truncate to 2 |
| LLM returns banned phrases | Filter them out silently |
| Cortex rate limit (429) | Wait 5 seconds, retry once |
| Empty slide (no transcript) | Skip LLM call, return `{"feedback": []}` |

---

## Performance Expectations

| Metric | Target |
|--------|--------|
| Per-slide API call | 2–10 seconds |
| 10-slide presentation | 20–100 seconds total (sequential) |
| Optimization | Consider parallel API calls if rate limits allow |

**Note:** For hackathon, sequential calls are acceptable. If time permits, use `asyncio.gather` with a semaphore to parallelize up to 3 concurrent calls.

---

## Snowflake Compliance

- All LLM inference MUST go through Snowflake Cortex
- No direct calls to OpenAI, Anthropic, or other LLM providers for feedback generation
- OpenAI is used ONLY for Whisper transcription (separate concern, not LLM feedback)
- The Snowflake account, credentials, and model must be configurable via environment variables
- No Snowflake data is persisted — all calls are stateless inference requests
