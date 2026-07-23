"""
Tests for the kanji-candidate selector: JapaneseDictionary.lookup() auto-applying
the most common kanji spelling for a kana word's reading (JMdict-ranked), while
keeping every candidate so the frontend can offer a one-click override — including
reverting to plain kana. Hits the real installed jamdict/jamdict-data, no mocking,
same precedent as test_word_analysis_timed.py.
"""
from app.word_analysis.dictionary import JapaneseDictionary, _priority_rank


def test_priority_rank_orders_known_tags_before_unranked():
    assert _priority_rank(["ichi1"]) < _priority_rank(["news2"])
    assert _priority_rank(["spec1"]) < _priority_rank(["ichi1"])
    assert _priority_rank([]) > _priority_rank(["gai2"])


async def test_ambiguous_reading_returns_ranked_kanji_candidates():
    dictionary = JapaneseDictionary()

    candidates = dictionary._kanji_candidates_for_reading("はし", "eng")

    texts = [c.text for c in candidates]
    assert "橋" in texts
    assert "箸" in texts
    assert "端" in texts
    # ichi1/news1-tagged 橋 must rank ahead of untagged homographs like 嘴/喙.
    assert texts.index("橋") < texts.index("嘴") if "嘴" in texts else True


async def test_lookup_auto_applies_top_candidate_for_kana_word():
    dictionary = JapaneseDictionary()

    result = await dictionary.lookup(word="はし", reading="はし", target_language="es")

    assert result.script_type == "kanji"
    assert result.reading == "はし"
    assert result.kanji_candidates is not None
    assert len(result.kanji_candidates) > 1
    assert result.text == result.kanji_candidates[0].text


async def test_lookup_leaves_inflected_kana_word_untouched():
    # JMdict indexes lemma readings only — たべた (past tense surface) has zero entries,
    # so this must safely stay as kana with no candidates, not guess a wrong kanji.
    dictionary = JapaneseDictionary()

    result = await dictionary.lookup(word="たべた", reading="たべた", target_language="es")

    assert result.script_type == "hiragana"
    assert result.text == "たべた"
    assert not result.kanji_candidates


async def test_lookup_never_overrides_a_word_that_already_arrived_as_kanji():
    dictionary = JapaneseDictionary()

    result = await dictionary.lookup(word="橋", reading=None, target_language="es")

    assert result.text == "橋"
    assert result.kanji_candidates is None


async def test_lookup_with_no_reading_skips_candidate_generation():
    # Mirrors WordAnalysisService._break_compound's call shape (per-character, no reading).
    dictionary = JapaneseDictionary()

    result = await dictionary.lookup(word="は", reading=None, target_language="es")

    assert result.kanji_candidates is None
