from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import base64, json
class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/save-design-check':
            self.send_error(404); return
        data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        target = Path('tmp/design-check'); target.mkdir(exist_ok=True)
        for key in ['report','report-long']:
            if key in data:
                (target/(key+'.png')).write_bytes(base64.b64decode(data[key].split(',')[1]))
        if 'checks' in data:
            (target/'checks.json').write_text(json.dumps(data['checks'],ensure_ascii=False,indent=2),encoding='utf-8')
        self.send_response(200); self.end_headers(); self.wfile.write(b'OK')
ThreadingHTTPServer(('127.0.0.1',8767),Handler).serve_forever()
