"""Serve Flow Human's authoring canvas, 3D renderer and optional local speech."""
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
import argparse,sys
from urllib.parse import unquote, urlsplit
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from speech_backend import SpeechBackend,speech_route
speech=SpeechBackend()
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def do_GET(self):
        if self.path in ('/',''):self.path='/playground.html'
        path=unquote(urlsplit(self.path).path)
        allowed={'/playground.html','/app.js','/core.js','/demo-flow.js','/gesture-map.js','/style.css'}
        if path not in allowed and not path.startswith('/static/'):self.send_error(404);return
        target=(ROOT/path.lstrip('/')).resolve()
        if not target.is_relative_to(ROOT) or any(part.startswith('.') for part in path.split('/')):self.send_error(404);return
        super().do_GET()
    def do_POST(self):
        if not speech_route(self,speech):self.send_error(404)
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--port',type=int,default=8020);args=parser.parse_args();print(f'Flow Human: http://127.0.0.1:{args.port}',flush=True);ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
