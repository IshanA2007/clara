from app.manual_analytics import compute_manual_analytics
from app.models import SlideTranscript, WordTimestamp, Expectations, Tone


def _make_slide(words_data, start=0.0, end=10.0, index=0):
    """Helper to create a SlideTranscript from (word, start, end) tuples."""
    words = [WordTimestamp(word=w, start=s, end=e) for w, s, e in words_data]
    text = " ".join(w for w, _, _ in words_data)
    return SlideTranscript(
        slide_index=index, start_time=start, end_time=end,
        words=words, text=text,
    )


def _formal_expectations():
    return Expectations(tone=Tone.formal, expected_duration_minutes=10, context="test")


def test_word_count():
    slide = _make_slide([("hello", 0.0, 0.5), ("world", 1.0, 1.5)])
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].word_count == 2


def test_duration():
    slide = _make_slide([], start=5.0, end=50.2)
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].duration_seconds == 45.2


def test_wpm_basic():
    # 120 words in 60 seconds = 120 WPM
    words = [(f"word{i}", i * 0.5, i * 0.5 + 0.3) for i in range(120)]
    slide = _make_slide(words, start=0.0, end=60.0)
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].wpm == 120.0


def test_wpm_zero_duration():
    slide = _make_slide([("hello", 0.0, 0.5)], start=0.0, end=0.0)
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].wpm == 0


def test_wpm_rounded_to_one_decimal():
    # 11 words in 7.0 seconds = 11 / (7/60) = 94.28571... -> 94.3
    words = [(f"w{i}", i * 0.5, i * 0.5 + 0.3) for i in range(11)]
    slide = _make_slide(words, start=0.0, end=7.0)
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].wpm == 94.3


def test_speaking_pace_formal_slow():
    # WPM < 130 for formal = slow
    words = [(f"w{i}", i * 0.5, i * 0.5 + 0.3) for i in range(100)]
    slide = _make_slide(words, start=0.0, end=60.0)  # 100 WPM
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].speaking_pace == "slow"


def test_speaking_pace_formal_normal():
    words = [(f"w{i}", i * 0.4, i * 0.4 + 0.2) for i in range(150)]
    slide = _make_slide(words, start=0.0, end=60.0)  # 150 WPM
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].speaking_pace == "normal"


def test_speaking_pace_formal_fast():
    words = [(f"w{i}", i * 0.3, i * 0.3 + 0.2) for i in range(180)]
    slide = _make_slide(words, start=0.0, end=60.0)  # 180 WPM
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    assert result["slide_0"].speaking_pace == "fast"


def test_empty_slide():
    slide = _make_slide([], start=0.0, end=10.0)
    result = compute_manual_analytics({"slide_0": slide}, _formal_expectations())
    m = result["slide_0"]
    assert m.word_count == 0
    assert m.wpm == 0
    assert m.filler_words.count == 0
    assert m.pauses.count == 0
    assert len(m.repeated_phrases) == 0
    assert m.speaking_pace == "slow"
