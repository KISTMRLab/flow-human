"""Python side of Flow Human: gesture-rule matching and the demo server boundary."""
import importlib.util
import json
import sys
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from gesture_match import GestureMatcher, SbertEncoder, matcher_from_settings  # noqa: E402

RULES = [{"phrase": "welcome hello glad to meet you", "gesture": "welcome"},
         {"phrase": "look over there at this point", "gesture": "point"},
         {"phrase": "let me think about your question", "gesture": "thinking"}]


class StubEncoder:
    """Stands in for Sentence-BERT: maps synonyms to the same direction."""
    name = "sbert"
    AXES = {"welcome": 0, "hello": 0, "greetings": 0, "hi": 0, "look": 1, "point": 1, "think": 2, "question": 2}

    def fit(self, phrases):
        return self

    def encode(self, texts):
        rows = []
        for text in texts:
            row = [0.0, 0.0, 0.0, 0.05]
            for word in text.lower().split():
                if word.strip(".,!?") in self.AXES:
                    row[self.AXES[word.strip(".,!?")]] += 1
            rows.append(row)
        return rows


def test_tfidf_matches_rule_and_floors_out_of_vocabulary_to_idle():
    matcher = GestureMatcher()
    assert matcher.match("Hello, glad to meet you", RULES)["gesture"] == "welcome"
    miss = matcher.match("The quarterly invoice arrives tomorrow", RULES)
    assert (miss["gesture"], miss["matched"], miss["index"]) == ("idle", False, None)


def test_sentence_encoder_matches_synonyms_with_floor():
    matcher = GestureMatcher(StubEncoder())
    hit = matcher.match("Greetings everyone", RULES)
    assert hit["gesture"] == "welcome" and hit["backend"] == "sbert" and hit["score"] > 0.9
    assert matcher.match("Greetings everyone", RULES, floor=min(1.0, hit["score"] + 1e-4))["gesture"] == "idle"
    assert matcher.match("nothing related", RULES)["gesture"] == "idle"


def test_sbert_requires_a_local_model_folder(tmp_path, monkeypatch):
    import gesture_match
    for name in gesture_match.SBERT_ENV:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(gesture_match, "MODELS_DIR", tmp_path / "models")
    with pytest.raises(FileNotFoundError):
        SbertEncoder(tmp_path / "missing")
    assert matcher_from_settings(None).backend == "tfidf"


def test_rule_map_reads_the_same_sbert_settings_as_beat_retrieval(tmp_path, monkeypatch):
    # Regression (V2 D3): with SBERT_MODEL/BEAT_SBERT_MODEL set the rule map said TF-IDF while BEAT used SBERT.
    import gesture_match
    for name in gesture_match.SBERT_ENV:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(gesture_match, "MODELS_DIR", tmp_path / "models")
    assert gesture_match.sbert_model_path() is None
    loaded = []
    monkeypatch.setattr(gesture_match, "SbertEncoder", lambda path: loaded.append(str(path)) or StubEncoder())
    for name in ("SBERT_MODEL", "BEAT_SBERT_MODEL", "FLOW_SBERT_MODEL"):  # each overrides the one before
        monkeypatch.setenv(name, str(tmp_path / name))
        assert matcher_from_settings().backend == "sbert" and loaded[-1] == str(tmp_path / name)
    for name in gesture_match.SBERT_ENV:
        monkeypatch.delenv(name)
    (tmp_path / "models" / "all-MiniLM-L6-v2").mkdir(parents=True)
    assert matcher_from_settings().backend == "sbert" and loaded[-1].endswith("all-MiniLM-L6-v2")
    assert matcher_from_settings(str(tmp_path / "explicit")).backend == "sbert" and loaded[-1].endswith("explicit")


def test_unloadable_environment_model_falls_back_to_tfidf_but_explicit_model_fails(tmp_path, monkeypatch):
    import gesture_match
    for name in gesture_match.SBERT_ENV:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(gesture_match, "MODELS_DIR", tmp_path / "models")
    monkeypatch.setenv("SBERT_MODEL", str(tmp_path / "missing"))
    assert matcher_from_settings().backend == "tfidf"
    with pytest.raises(FileNotFoundError):
        matcher_from_settings(str(tmp_path / "missing"))


def test_match_rejects_bad_requests():
    with pytest.raises(ValueError):
        GestureMatcher().match("", RULES)
    with pytest.raises(ValueError):
        GestureMatcher().match("hello", [{"gesture": "x"}])


@pytest.fixture()
def server(monkeypatch):
    spec = importlib.util.spec_from_file_location("flow_demo", ROOT / "scripts" / "demo.py")
    demo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(demo)
    monkeypatch.setitem(sys.modules, "beat_runtime", None)  # simulate an install without numpy
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), demo.make_handler(GestureMatcher()))
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()


def post(url, payload):
    request = urllib.request.Request(url, json.dumps(payload).encode(), {"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())


def test_demo_server_serves_editor_and_degrades_without_beat_runtime(server):
    with urllib.request.urlopen(server + "/", timeout=10) as response:
        assert b"Flow Human" in response.read()
    with urllib.request.urlopen(server + "/api/beat-library", timeout=10) as response:
        library = json.loads(response.read())
    assert library["ready"] is False and "requirements-demo" in library["message"]
    status, query = post(server + "/api/beat-query", {"text": "hello"})
    assert status == 503 and query["ready"] is False
    status, match = post(server + "/api/gesture-match", {"text": "hello glad to meet you", "rules": RULES})
    assert status == 200 and match["gesture"] == "welcome" and match["backend"] == "tfidf"
    status, error = post(server + "/api/gesture-match", {"text": "hello", "rules": []})
    assert status == 400 and "rules" in error["error"]
    with pytest.raises(urllib.error.HTTPError):
        urllib.request.urlopen(server + "/scripts/demo.py", timeout=10)
