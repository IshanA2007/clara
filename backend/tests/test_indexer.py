from app.indexer import index_slides
from app.models import WordTimestamp

def test_basic_three_slides():
    words = [
        WordTimestamp(word="hello", start=0.0, end=0.5),
        WordTimestamp(word="world", start=1.0, end=1.5),
        WordTimestamp(word="slide", start=10.5, end=11.0),
        WordTimestamp(word="two", start=12.0, end=12.5),
        WordTimestamp(word="final", start=25.0, end=25.5),
    ]
    result = index_slides(
        words=words,
        slide_timestamps=[0.0, 10.0, 20.0],
        total_slides=3,
        recording_duration=30.0,
    )
    assert len(result) == 3
    assert result["slide_0"].slide_index == 0
    assert len(result["slide_0"].words) == 2  # hello, world
    assert len(result["slide_1"].words) == 2  # slide, two
    assert len(result["slide_2"].words) == 1  # final
    assert result["slide_0"].start_time == 0.0
    assert result["slide_0"].end_time == 10.0
    assert result["slide_2"].end_time == 30.0

def test_word_at_boundary_goes_to_next_slide():
    words = [
        WordTimestamp(word="before", start=9.0, end=9.5),
        WordTimestamp(word="exact", start=10.0, end=10.5),  # at boundary
    ]
    result = index_slides(
        words=words,
        slide_timestamps=[0.0, 10.0],
        total_slides=2,
        recording_duration=20.0,
    )
    assert len(result["slide_0"].words) == 1  # "before" only
    assert len(result["slide_1"].words) == 1  # "exact" goes to next

def test_empty_slide():
    words = [
        WordTimestamp(word="hello", start=0.0, end=0.5),
        WordTimestamp(word="skip", start=25.0, end=25.5),
    ]
    result = index_slides(
        words=words,
        slide_timestamps=[0.0, 10.0, 20.0],
        total_slides=3,
        recording_duration=30.0,
    )
    assert len(result["slide_1"].words) == 0
    assert result["slide_1"].text == ""

def test_extra_timestamps_truncated():
    words = [WordTimestamp(word="hello", start=0.0, end=0.5)]
    result = index_slides(
        words=words,
        slide_timestamps=[0.0, 10.0, 20.0, 30.0],  # 4 timestamps
        total_slides=2,  # but only 2 slides
        recording_duration=40.0,
    )
    assert len(result) == 2
    assert "slide_2" not in result
    assert result["slide_1"].end_time == 40.0  # last slide goes to recording end

def test_no_words():
    result = index_slides(
        words=[],
        slide_timestamps=[0.0, 10.0],
        total_slides=2,
        recording_duration=20.0,
    )
    assert len(result) == 2
    assert len(result["slide_0"].words) == 0
    assert len(result["slide_1"].words) == 0
