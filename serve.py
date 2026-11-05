"""Serves Kreide on this computer only (127.0.0.1).

Like `python3 -m http.server`, but tells the browser to re-check files on every load,
so after an update it never mixes old and new app files.
"""
import functools
import http.server
import sys
from pathlib import Path


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8642
handler = functools.partial(NoCacheHandler, directory=str(Path(__file__).parent))
with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as server:
    server.serve_forever()
