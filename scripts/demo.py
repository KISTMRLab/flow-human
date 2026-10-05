"""Serve Flow Human's authoring canvas, 3D renderer, gesture matching and optional local speech."""
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
import argparse,json,sys
from urllib.parse import unquote, urlsplit
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from speech_backend import SpeechBackend,speech_route
from gesture_match import matcher_from_settings
speech=SpeechBackend()
BEAT_SETUP='Recorded BEAT gestures need numpy and a prepared bank: pip install -r scripts/requirements-demo.txt, then python scripts/prepare_beat_demo.py.'
STATIC={'/playground.html','/app.js','/core.js','/demo-flow.js','/gesture-map.js','/style.css'}

def serve_beat(handler,root,mode):
    """The vendored BEAT runtime needs numpy; import it lazily so the editor runs without it."""
    if urlsplit(handler.path).path not in {'/api/beat-library','/api/beat-query'}:return False
    try:
        from beat_runtime import serve_beat as beat
    except ImportError as exc:
        send_json(handler,{'ready':False,'error':f'{BEAT_SETUP} ({exc})','message':BEAT_SETUP},503 if handler.command=='POST' else 200);return True
    return beat(handler,root,mode)

def send_json(handler,payload,status=200):
    body=json.dumps(payload,ensure_ascii=False).encode('utf-8')
    handler.send_response(status);handler.send_header('Content-Type','application/json; charset=utf-8');handler.send_header('Content-Length',str(len(body)));handler.end_headers();handler.wfile.write(body)

def make_handler(matcher):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
        def do_GET(self):
            if serve_beat(self, ROOT, 'automatic'):return
            if urlsplit(self.path).path=='/api/gesture-status':send_json(self,{'backend':matcher.backend});return
            if urlsplit(self.path).path in ('/',''):self.path='/playground.html'
            path=unquote(urlsplit(self.path).path)
            if path not in STATIC and not path.startswith('/static/'):self.send_error(404);return
            target=(ROOT/path.lstrip('/')).resolve()
            if not target.is_relative_to(ROOT) or any(part.startswith('.') for part in path.split('/')):self.send_error(404);return
            super().do_GET()
        def do_POST(self):
            if serve_beat(self, ROOT, 'automatic'):return
            if urlsplit(self.path).path=='/api/gesture-match':
                try:
                    size=int(self.headers.get('Content-Length','0'))
                    if not 0<size<=4_000_000:raise ValueError('Request must be under 4 MB')
                    payload=json.loads(self.rfile.read(size))
                    send_json(self,matcher.match(payload.get('text',''),payload.get('rules'),payload.get('floor')))
                except (ValueError,TypeError,AttributeError,json.JSONDecodeError) as exc:send_json(self,{'error':str(exc)},400)
                return
            if not speech_route(self,speech):self.send_error(404)
    return Handler

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--port',type=int,default=8020)
    parser.add_argument('--sbert-model',help='local sentence-transformers folder for gesture-rule matching (env FLOW_SBERT_MODEL, BEAT_SBERT_MODEL or SBERT_MODEL, or models/all-MiniLM-L6-v2); TF-IDF otherwise')
    args=parser.parse_args();matcher=matcher_from_settings(args.sbert_model)
    print(f'Flow Human: http://127.0.0.1:{args.port} (gesture matching: {matcher.backend})',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),make_handler(matcher)).serve_forever()
