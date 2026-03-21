import asyncio

import openai
from app.config import OPENAI_API_KEY
from app.models import WordTimestamp


def _transcribe_sync(audio_path: str) -> dict:
    """Blocking Whisper API call — run via asyncio.to_thread."""
    client = openai.OpenAI(api_key=OPENAI_API_KEY)

    with open(audio_path, "rb") as audio_file:
        response = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="verbose_json",
            timestamp_granularities=["word", "segment"],
        )

    words = [
        WordTimestamp(word=w.word, start=w.start, end=w.end)
        for w in (response.words or [])
    ]

    return {
        "words": words,
        "text": response.text or "",
        "duration": response.duration or 0.0,
    }


async def transcribe_audio(audio_path: str) -> dict:
    """Call OpenAI Whisper API without blocking the event loop."""
    return await asyncio.to_thread(_transcribe_sync, audio_path)
