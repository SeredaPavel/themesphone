"""Exercise real Caddy with disposable HTTP upstreams, without secrets or a VPS."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request

binary = str(Path(sys.argv[1]).resolve())
source = Path(__file__).resolve().parents[1] / 'themesphone-public.caddy'

def port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"upstream":true}')
    do_HEAD = do_POST = do_DELETE = do_GET
    def log_message(self, *args):
        pass

upstream = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=upstream.serve_forever, daemon=True).start()
front, cms = port(), port()
text = source.read_text().replace(
    'themesphone.ru, www.themesphone.ru, themesphone.com, www.themesphone.com',
    f'http://127.0.0.1:{front}').replace('cms.themesphone.ru', f'http://127.0.0.1:{cms}')
for target in ['themesphone-frontend:3000', 'themesphone-backend:1337']:
    text = text.replace(target, f'127.0.0.1:{upstream.server_port}')
text = '{\n admin off\n auto_https off\n}\n' + text
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def status(port, path, method='GET'):
    request = urllib.request.Request(f'http://127.0.0.1:{port}{path}', method=method)
    try:
        with opener.open(request, timeout=3) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code

with tempfile.TemporaryDirectory() as folder:
    config = Path(folder) / 'Caddyfile'
    config.write_text(text)
    subprocess.run([binary, 'validate', '--config', str(config), '--adapter', 'caddyfile'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    with (Path(folder) / 'log').open('w') as log:
        process = subprocess.Popen([binary, 'run', '--config', str(config), '--adapter', 'caddyfile'], stdout=log, stderr=log)
        try:
            for _ in range(60):
                try:
                    if status(front, '/healthz') == 200:
                        break
                except OSError:
                    time.sleep(.05)
            cases = [(front, path, 'GET', 200) for path in ['/', '/cart', '/auth/login', '/checkout/1', '/_next/image', '/api/top-wallpapers']]
            cases += [(cms, path, 'GET', 200) for path in ['/admin', '/content-manager/test', '/upload/files', '/uploads/example.jpg', '/api/wallpapers', '/api/categories?populate=*', '/api/devices/test']]
            cases += [(front, path, method, 410) for path in ['/api/download?url=http://127.0.0.1', '/api/checkout/pay', '/api/register', '/api/me', '/api', '/API/download', '//api/download', '/%61pi/download', '/api%2Fdownload'] for method in ['GET', 'POST']]
            cases += [(cms, path, method, 410) for path in ['/api/users', '/api/orders', '/api/auth/local', '/API/users', '//api/users', '/%61pi/users', '/api%2Fusers'] for method in ['GET', 'POST']]
            cases += [(cms, '/api/wallpapers', 'POST', 410), (front, '/api/top-wallpapers', 'POST', 410), (cms, '/documentation', 'GET', 404), (cms, '/documentation/v1', 'GET', 404)]
            for target, path, method, expected in cases:
                actual = status(target, path, method)
                assert actual == expected, (path, method, expected, actual)
            print(f'PASS: {len(cases)} real Caddy route checks; UI routes preserved, restricted APIs blocked.')
        finally:
            process.terminate()
            process.wait(timeout=10)
            upstream.shutdown()
