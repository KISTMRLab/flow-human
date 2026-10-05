"""Check Flow Human's Python server boundary and write gesture-matching outputs.

Starts the demo server in-process, then checks the editor page, the BEAT route
status, and rule-map matching with the bundled example map. Matching uses
Sentence-BERT from --sbert-model (or FLOW_SBERT_MODEL), else TF-IDF.
The browser runtime (flows, branching, export) is covered by
`node scripts/verify.mjs` and the JavaScript tests.
"""
import argparse
import importlib.util
import json
import threading
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Mirrors gesture-map.js exampleMap.
EXAMPLE_RULES = [{"phrase": "welcome hello glad meet", "gesture": "welcome"}, {"phrase": "look point here there", "gesture": "point"},
                 {"phrase": "think consider question explain", "gesture": "thinking"}, {"phrase": "help information tell", "gesture": "open_hand"}]
LINES = ["Welcome to this demonstration.", "Let me explain the next question.", "Please look here at the screen.",
         "The quarterly invoice arrives tomorrow."]

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--sbert-model")
parser.add_argument("--output", type=Path, default=ROOT / "outputs" / "verify")
args = parser.parse_args()
spec = importlib.util.spec_from_file_location("flow_demo", ROOT / "scripts" / "demo.py")
demo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(demo)
matcher = demo.matcher_from_settings(args.sbert_model)
httpd = ThreadingHTTPServer(("127.0.0.1", 0), demo.make_handler(matcher))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{httpd.server_address[1]}"


def get(path):
    with urllib.request.urlopen(base + path, timeout=30) as response:
        return response.read()


def post(path, payload):
    request = urllib.request.Request(base + path, json.dumps(payload).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read())


try:
    assert b"Flow Human" in get("/"), "editor page missing"
    for asset in ("/app.js", "/core.js", "/gesture-map.js", "/demo-flow.js", "/style.css"):
        assert get(asset), f"{asset} missing"
    library = json.loads(get("/api/beat-library"))
    matches = [{"text": line, **post("/api/gesture-match", {"text": line, "rules": EXAMPLE_RULES})} for line in LINES]
finally:
    httpd.shutdown()
assert matches[0]["gesture"] == "welcome", matches[0]
assert matches[-1]["gesture"] == "idle", "out-of-vocabulary text must fall back to idle"
args.output.mkdir(parents=True, exist_ok=True)
(args.output / "gesture-match.json").write_text(json.dumps({"backend": matcher.backend, "matches": matches}, indent=2), encoding="utf-8")
print(json.dumps({"backend": matcher.backend, "beat_library_ready": library.get("ready"),
                  "matches": {m["text"]: f"{m['gesture']} ({m['score']})" for m in matches},
                  "output": str(args.output / "gesture-match.json")}, indent=2))
