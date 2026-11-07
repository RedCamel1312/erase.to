"""Exercise the shipped nginx limits using private sockets and a synthetic upstream."""

import http.client
import queue
import re
import shutil
import socket
import ssl
import subprocess
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


DEPLOY = Path(__file__).resolve().parents[1] / "deploy"
NOTE = "/api/notes/" + "A" * 43


class Upstream(BaseHTTPRequestHandler):
    def reply(self):
        if self.path == "/api/challenge" and not self.server.release.is_set():
            self.server.arrivals.release()
            self.server.release.wait(timeout=8)
        if self.path == "/inspect-request":
            if self.headers.get("Transfer-Encoding") == "chunked":
                body = bytearray()
                while size := int(self.rfile.readline(), 16):
                    body.extend(self.rfile.read(size))
                    assert self.rfile.read(2) == b"\r\n"
                assert self.rfile.readline() == b"\r\n"
            else:
                body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            self.server.observed.put(({key.lower(): v for key, v in self.headers.items()}, body))
        if self.path == "/upstream-busy":
            self.send_response(429)
            self.send_header("Retry-After", "7")
        else:
            self.send_response(200)
        self.send_header("Content-Length", "0")
        self.end_headers()

    do_GET = do_HEAD = do_POST = do_DELETE = reply

    def log_message(self, *args):
        pass


def call(listener, method, path, tls=None, headers=None, body=None):
    connection = http.client.HTTPConnection("erase.test", timeout=10)
    try:
        connection.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        connection.sock.settimeout(10)
        connection.sock.connect(str(listener))
        if tls:
            connection.sock = tls.wrap_socket(connection.sock, server_hostname="erase.test")
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        response.read()
        return response.status, response.headers.get_all("Retry-After") or []
    finally:
        connection.close()


def check(listener, upstream, slots, tls=None):
    def request(method, path):
        return call(listener, method, path, tls)

    # Fill the active challenge connections before checking independent operations.
    upstream.release.clear()
    with ThreadPoolExecutor(slots) as pool:
        pending = [pool.submit(request, "GET", "/api/challenge") for _ in range(slots)]
        try:
            for _ in pending:
                assert upstream.arrivals.acquire(timeout=5), "challenge did not reach upstream"
            assert request("GET", "/api/challenge") == (503, ["2"])
            for method, path in [("GET", "/api/config"), ("POST", "/api/notes"),
                                 ("POST", NOTE + "/meta"), ("POST", NOTE + "/open"),
                                 ("DELETE", NOTE)]:
                assert request(method, path) == (200, []), (method, path)
        finally:
            upstream.release.set()
        assert all(work.result() == (200, []) for work in pending)

    # Saturate the rate bucket using short, completed requests, independently of concurrency.
    for _ in range(64):
        if request("GET", "/api/challenge") == (429, ["2"]):
            break
    else:
        raise AssertionError("challenge rate limit did not engage")
    assert request("POST", NOTE + "/open") == (200, [])
    assert request("GET", "/upstream-busy") == (429, ["7"])


def check_i2p_headers(listener, upstream):
    allowed = {"Origin": "http://erase.test", "Sec-Fetch-Site": "same-origin",
               "Content-Type": "application/octet-stream", "X-Erase-Challenge": "test",
               "X-Erase-Nonce": "0", "Content-Encoding": "test-encoding"}
    private = {name: "test" for name in ("X-I2P-DestHash", "X-I2P-DestB32", "X-I2P-DestB64",
               "X-I2P-Future-Header", "X-Real-IP", "X-Forwarded-For", "Forwarded", "Referer",
               "Cookie", "Authorization", "User-Agent")}
    # Let nginx generate valid upstream framing for fixed-length and streamed requests.
    for body in (b"synthetic bytes", iter([b"synthetic ", b"bytes"])):
        assert call(listener, "POST", "/inspect-request", headers=allowed | private,
                    body=body) == (200, [])
        forwarded, seen_body = upstream.observed.get(timeout=1)
        assert seen_body == b"synthetic bytes"
        assert forwarded["host"] == "erase.test"
        for name, value in allowed.items():
            assert forwarded[name.lower()] == value, name
        assert not set(forwarded).intersection(name.lower() for name in private)
    try:
        call(listener, "GET", "/", headers={"Host": "different.test"})
    except http.client.RemoteDisconnected:
        pass  # nginx 444
    else:
        raise AssertionError("I2P listener accepted a different Host")


@contextmanager
def nginx(directory, config):
    name = directory / "nginx.conf"
    name.write_text(config)
    cmd = [shutil.which("nginx") or "/usr/sbin/nginx", "-p", str(directory),
           "-e", "stderr", "-c", str(name)]
    subprocess.run([*cmd, "-t", "-q"], check=True)
    process = subprocess.Popen([*cmd, "-g", "daemon off;"], stderr=subprocess.PIPE)
    try:
        for _ in range(100):
            if process.poll() is not None:
                raise RuntimeError(process.stderr.read().decode())
            if (directory / "entry.sock").exists():
                break
            time.sleep(0.02)
        else:
            raise RuntimeError("private nginx did not start")
        yield
    finally:
        if process.poll() is None:
            process.terminate()
        process.communicate(timeout=10)


def run_templates(root, upstream):
    upstream_url = "http://127.0.0.1:" + str(upstream.server_port)
    policy = (DEPLOY / "nginx-admission.conf").read_text()
    for target in ("native", "onion", "i2p", "container"):
        directory = root / target
        directory.mkdir()
        listener = directory / "entry.sock"
        if target == "container":
            config = (DEPLOY / "container-proxy.conf").read_text()
            config = config.replace("/tmp/", str(directory) + "/")
            config = config.replace("listen 8080;", f"listen unix:{listener};")
            config = config.replace("http://app:3001", upstream_url)
        else:
            common = (DEPLOY / "nginx.conf").read_text()
            if target in ("onion", "i2p"):
                vhost = (DEPLOY / f"nginx-{target}.conf").read_text()
                vhost = vhost.replace("/run/erase-onion/erase.sock", str(listener))
                vhost = vhost.replace("listen 127.0.0.1:7382;", f"listen unix:{listener};")
                vhost = vhost.replace(f"__{target.upper()}_HOST__", "erase.test")
                common = common.split("server {", 1)[0] + vhost
            else:
                # All listeners become private sockets, including both default virtual hosts.
                common = re.sub(r"(?m)^\s*listen \[::\]:[^;]+;", "", common)
                common = common.replace("listen 80", f"listen unix:{directory}/http.sock")
                common = common.replace("listen 443", f"listen unix:{listener}")
                common = common.replace("/etc/letsencrypt/live/__DOMAIN__/", str(root) + "/")
                common = common.replace("__DOMAIN__", "erase.test")
            common = common.replace("/run/erase-nginx/", str(directory) + "/")
            common = common.replace("http://127.0.0.1:3001", upstream_url)
            config = f"pid {directory}/nginx.pid; events {{}} http {{ access_log off; {common} }}"
        config = config.replace("include /etc/nginx/erase-admission.conf;", policy)
        with nginx(directory, config):
            tls = ssl.create_default_context(cafile=str(root / "fullchain.pem")) if target == "native" else None
            check(listener, upstream, 4 if target in ("onion", "i2p") else 8, tls)
            if target == "i2p":
                check_i2p_headers(listener, upstream)
                print("PASS i2p: destination headers stripped, exact host, request bodies preserved")
        print(f"PASS {target}: challenge rate and connection isolation, Retry-After")


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="erase-proxy-") as temp:
        root = Path(temp)
        subprocess.run(["openssl", "req", "-x509", "-newkey", "ec", "-pkeyopt",
                        "ec_paramgen_curve:P-256", "-nodes", "-days", "1", "-subj",
                        "/CN=erase.test", "-addext", "subjectAltName=DNS:erase.test",
                        "-keyout", root / "privkey.pem", "-out", root / "fullchain.pem"],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        with ThreadingHTTPServer(("127.0.0.1", 0), Upstream) as upstream:
            upstream.release = threading.Event()
            upstream.arrivals = threading.Semaphore(0)
            upstream.observed = queue.Queue()
            worker = threading.Thread(target=upstream.serve_forever, daemon=True)
            worker.start()
            try:
                run_templates(root, upstream)
            finally:
                upstream.release.set()
                upstream.shutdown()
                worker.join()
