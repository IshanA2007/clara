from typing import Dict, List
from app.models import WordTimestamp, SlideTranscript

def index_slides(
    words: List[WordTimestamp],
    slide_timestamps: List[float],
    total_slides: int,
    recording_duration: float,
) -> Dict[str, SlideTranscript]:
    # Truncate extra timestamps beyond total_slides
    timestamps = slide_timestamps[:total_slides]

    result: Dict[str, SlideTranscript] = {}

    for i in range(total_slides):
        slide_start = timestamps[i]
        slide_end = timestamps[i + 1] if i + 1 < len(timestamps) else recording_duration

        slide_words = [
            w for w in words
            if w.start >= slide_start and w.start < slide_end
        ]
        slide_text = " ".join(w.word for w in slide_words)

        result[f"slide_{i}"] = SlideTranscript(
            slide_index=i,
            start_time=slide_start,
            end_time=slide_end,
            words=slide_words,
            text=slide_text,
        )

    return result
