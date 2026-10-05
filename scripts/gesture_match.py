"""Server-side text matching for Flow Human's gesture rule map.

Flow Human matches dialogue text to rule phrases with Sentence-BERT (paper
section 2.2). ``SbertEncoder`` loads a sentence-transformers model from a local
directory only (no implicit download); ``TfidfEncoder`` is the dependency-free
fallback. Scores below the similarity floor return the idle fallback.
"""
from __future__ import annotations

import math
import os
import re
from collections import Counter
from pathlib import Path

TOKEN = re.compile(r"[^\W_]+", re.UNICODE)
STOPWORDS = frozenset("a an and are as at be but by for from i if in into is it its me my of on or our so that the their this to us was we were will with you your".split())
DEFAULT_FLOOR = {"sbert": 0.45, "tfidf": 0.2}


def tokens(text: str) -> list[str]:
    return [token for token in TOKEN.findall(str(text).casefold()) if token not in STOPWORDS]


def cosine(a, b) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return dot / norm if norm else 0.0


class TfidfEncoder:
    """Fit on the rule phrases; out-of-vocabulary queries encode to zero vectors."""

    name = "tfidf"

    def fit(self, phrases: list[str]) -> "TfidfEncoder":
        counts = [Counter(tokens(phrase)) for phrase in phrases]
        frequency = Counter(term for count in counts for term in count)
        self.vocabulary = {term: index for index, term in enumerate(sorted(frequency))}
        self.idf = {term: math.log((1 + len(phrases)) / (1 + df)) + 1 for term, df in frequency.items()}
        return self

    def encode(self, texts: list[str]) -> list[list[float]]:
        rows = []
        for text in texts:
            row = [0.0] * len(self.vocabulary)
            for term, count in Counter(tokens(text)).items():
                if term in self.vocabulary:
                    row[self.vocabulary[term]] = count * self.idf[term]
            rows.append(row)
        return rows


class SbertEncoder:
    """sentence-transformers model from a local folder, e.g. a saved all-MiniLM-L6-v2."""

    name = "sbert"

    def __init__(self, model_path: str | Path):
        path = Path(model_path)
        if not path.is_dir():
            raise FileNotFoundError(f"Sentence-BERT model folder not found: {path}")
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            raise ImportError("pip install sentence-transformers to use --sbert-model") from exc
        os.environ.setdefault("HF_HUB_OFFLINE", "1")
        self.model = SentenceTransformer(str(path), device="cpu", local_files_only=True)

    def fit(self, phrases: list[str]) -> "SbertEncoder":
        return self

    def encode(self, texts: list[str]) -> list[list[float]]:
        return [list(map(float, row)) for row in self.model.encode(list(texts), normalize_embeddings=True)]


class GestureMatcher:
    def __init__(self, encoder=None):
        self.encoder = encoder
        self._cache: dict[tuple[str, ...], tuple[object, list[list[float]]]] = {}

    @property
    def backend(self) -> str:
        return getattr(self.encoder, "name", "tfidf")

    def _rules(self, phrases: tuple[str, ...]):
        if phrases not in self._cache:
            encoder = self.encoder if self.encoder is not None else TfidfEncoder()
            encoder = encoder.fit(list(phrases))
            self._cache = {phrases: (encoder, encoder.encode(list(phrases)))}
        return self._cache[phrases]

    def match(self, text: str, rules: list[dict], floor: float | None = None) -> dict:
        if not isinstance(text, str) or not text.strip() or len(text) > 2000:
            raise ValueError("Supply 1-2000 characters of text")
        if not isinstance(rules, list) or not rules or len(rules) > 5000:
            raise ValueError("Supply 1-5000 rules")
        phrases = tuple(str(rule.get("phrase", "")) if isinstance(rule, dict) else "" for rule in rules)
        if not all(phrase.strip() for phrase in phrases):
            raise ValueError("Each rule needs a phrase")
        encoder, embeddings = self._rules(phrases)
        query = encoder.encode([text])[0]
        scores = [cosine(query, row) for row in embeddings]
        best = max(range(len(scores)), key=scores.__getitem__)
        floor = DEFAULT_FLOOR.get(self.backend, 0.3) if floor is None else float(floor)
        matched = scores[best] >= floor and scores[best] > 0
        return {"index": best if matched else None, "matched": matched, "score": round(scores[best], 4),
                "gesture": rules[best].get("gesture") if matched else "idle", "phrase": phrases[best] if matched else None,
                "floor": floor, "backend": self.backend}


def matcher_from_settings(model_path: str | None = None) -> GestureMatcher:
    """--sbert-model or FLOW_SBERT_MODEL selects Sentence-BERT; otherwise TF-IDF."""
    model_path = model_path or os.environ.get("FLOW_SBERT_MODEL")
    return GestureMatcher(SbertEncoder(model_path) if model_path else None)
