"""
Regression tests for title_cleaning.clean_title_artist — covers the real YouTube
video titles that were sinking Genius lookups almost every time (see the bug this
was written for: raw video titles/channel names going straight into the Genius
search query with zero normalization).
"""
from app.song_processing.title_cleaning import clean_artist_name, clean_title_artist


def test_delimiter_split_overrides_bad_channel_name_hint():
    # Real case: uploader/channel hint ("Kei Takahashi") is not the actual artist —
    # the title's own "Artist / Title" delimiter should win.
    title, artist = clean_title_artist(
        "YOASOBI / 祝福 (Shukufuku) (The Blessing) Full Version Lyrics [Kan_Rom_Eng]",
        "Kei Takahashi",
    )
    assert title == "祝福"
    assert artist == "YOASOBI"


def test_quoted_bracket_title_with_trailing_annotation():
    # Real case: correct artist hint given, but the title itself still sinks the
    # search without bracket-extraction + trailing-parenthetical stripping.
    title, artist = clean_title_artist(
        "YOASOBI「祝福」Official Music Video (『機動戦士ガンダム 水星の魔女』オープニングテーマ)",
        "YOASOBI",
    )
    assert title == "祝福"
    assert artist == "YOASOBI"


def test_keeps_hint_when_title_has_no_extractable_pattern():
    title, artist = clean_title_artist("Some Song Official Video", "Real Artist")
    assert title == "Some Song"
    assert artist == "Real Artist"


def test_no_pattern_and_no_hint_leaves_title_intact_minus_junk():
    title, artist = clean_title_artist("Some Song Lyrics [HD]", "")
    assert title == "Some Song"
    assert artist == ""


def test_clean_artist_name_strips_channel_suffixes():
    assert clean_artist_name("MYTH & ROID Official Channel") == "MYTH & ROID"
    assert clean_artist_name("MYTH & ROID - Topic") == "MYTH & ROID"
    assert clean_artist_name("Taylor Swift VEVO") == "Taylor Swift"
