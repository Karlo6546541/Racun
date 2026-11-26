#!/usr/bin/env python3
"""Mobile web remote for an Android/Google TV, driven over ADB.

Run on the laptop that already has `adb` connected to the TV:
    python3 tvremote.py                  # TV defaults to 192.168.0.177:5555
    TV=192.168.0.177:5555 PIN=1234 python3 tvremote.py
Then open the printed http://<laptop-ip>:8080 on the phone (same Wi-Fi) and use
"Add to Home screen" to get an app-like icon. Standard library only.
"""
import json, os, shlex, socket, subprocess, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import quote

TV = os.environ.get("TV", "192.168.0.177:5555")
PIN = os.environ.get("PIN", "")
PORT = int(os.environ.get("PORT", "8080"))
ADB = os.environ.get("ADB", "adb")

KEYS = {"up": "DPAD_UP", "down": "DPAD_DOWN", "left": "DPAD_LEFT", "right": "DPAD_RIGHT",
        "ok": "DPAD_CENTER", "back": "BACK", "home": "HOME", "menu": "MENU",
        "vol_up": "VOLUME_UP", "vol_down": "VOLUME_DOWN", "mute": "VOLUME_MUTE",
        "play": "MEDIA_PLAY_PAUSE", "next": "MEDIA_NEXT", "prev": "MEDIA_PREVIOUS",
        "ff": "MEDIA_FAST_FORWARD", "rew": "MEDIA_REWIND", "power": "POWER",
        "wake": "WAKEUP", "sleep": "SLEEP", "input": "TV_INPUT", "settings": "SETTINGS",
        "del": "DEL", "enter": "ENTER", "search": "SEARCH"}
APPS = {"youtube": "com.google.android.youtube.tv",
        "ytmusic": "com.google.android.youtube.tvmusic",
        "netflix": "com.netflix.ninja",
        "prime": "com.amazon.amazonvideo.livingroom",
        "tcl": "com.tcl.waterfall.overseas"}

def adb(*args, timeout=10):
    cmd = [ADB, "-s", TV, *args]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0 and ("offline" in r.stderr or "not found" in r.stderr or "no devices" in r.stderr):
        subprocess.run([ADB, "connect", TV], capture_output=True, text=True, timeout=timeout)
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    return r.returncode == 0, (r.stdout + r.stderr).strip()

def sh(command):
    return adb("shell", command)

def handle(path, body):
    if path == "/api/key":
        k = KEYS.get(body.get("key", ""))
        return sh(f"input keyevent KEYCODE_{k}") if k else (False, "unknown key")
    if path == "/api/text":
        t = str(body.get("text", ""))[:200]
        return sh("input text " + shlex.quote(t.replace(" ", "%s")))
    if path == "/api/app":
        p = APPS.get(body.get("app", ""))
        return sh(f"monkey -p {p} -c android.intent.category.LEANBACK_LAUNCHER 1") if p else (False, "unknown app")
    if path == "/api/youtube":
        q = quote(str(body.get("query", ""))[:200])
        url = f"https://www.youtube.com/results?search_query={q}"
        return sh("am start -a android.intent.action.VIEW -d " + shlex.quote(url) + " " + APPS["youtube"])
    if path == "/api/url":
        u = str(body.get("url", ""))
        if not u.startswith(("http://", "https://")):
            return False, "bad url"
        return sh("am start -a android.intent.action.VIEW -d " + shlex.quote(u))
    if path == "/api/status":
        return adb("get-state")
    return False, "not found"

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, data, ctype="application/json"):
        b = data if isinstance(data, bytes) else data.encode()
        self.send_response(code); self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if self.path == "/manifest.json":
            return self._send(200, json.dumps({"name": "TV Remote", "short_name": "TV", "start_url": "/",
                "display": "standalone", "background_color": "#000000", "theme_color": "#000000"}))
        self._send(200, PAGE, "text/html; charset=utf-8")
    def do_POST(self):
        if PIN and self.headers.get("X-Pin", "") != PIN:
            return self._send(401, json.dumps({"ok": False, "msg": "PIN"}))
        try:
            n = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(n) or b"{}")
            ok, msg = handle(self.path, body)
        except Exception as e:
            ok, msg = False, str(e)
        self._send(200, json.dumps({"ok": ok, "msg": msg}))

PAGE = r"""<!doctype html><html lang="hr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<link rel="manifest" href="/manifest.json"><meta name="theme-color" content="#000">
<title>TV Remote</title><style>
:root{color-scheme:dark}*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;user-select:none}
body{margin:0;background:#000;color:#eee;font:16px system-ui,sans-serif;padding:12px 16px 40px;max-width:460px;margin:auto}
button{background:#1c1c1e;color:#eee;border:0;border-radius:14px;font-size:18px;padding:14px 0;width:100%}
button:active{background:#3a3a3c}.row{display:grid;gap:10px;margin:10px 0}.c3{grid-template-columns:repeat(3,1fr)}
.c4{grid-template-columns:repeat(4,1fr)}.c2{grid-template-columns:1fr 1fr}
#pad{height:230px;border-radius:24px;background:#111;display:flex;align-items:center;justify-content:center;touch-action:none;color:#555;margin:10px 0}
input{width:100%;background:#1c1c1e;color:#eee;border:0;border-radius:12px;padding:14px;font-size:17px}
#st{font-size:13px;color:#888;text-align:center;height:18px}h2{font-size:13px;color:#888;margin:18px 0 0;font-weight:500}
.ok{background:#2c5cff}</style></head><body>
<div id="st">&nbsp;</div>
<div class="row c2"><button data-k="wake" class="ok">⏻ Upali</button><button data-k="sleep">Ugasi</button></div>
<div class="row c4"><button data-k="power">⏻</button><button data-a="youtube">YouTube</button><button data-a="netflix">Netflix</button><button data-a="prime">Prime</button></div>
<div class="row c4"><button data-a="ytmusic">YT Music</button><button data-k="input">Input</button><button data-k="settings">⚙</button><button data-a="tcl">TCL</button></div>
<h2>YouTube pretraga</h2>
<div class="row c2" style="grid-template-columns:1fr 90px"><input id="yq" placeholder="npr. ime pjesme" enterkeyhint="search"><button id="yb" class="ok">Traži</button></div>
<div id="pad">povuci prstom · dodir = OK</div>
<div class="row c3"><span></span><button data-k="up" data-r>▲</button><span></span>
<button data-k="left" data-r>◀</button><button data-k="ok" class="ok">OK</button><button data-k="right" data-r>▶</button>
<span></span><button data-k="down" data-r>▼</button><span></span></div>
<div class="row c3"><button data-k="back">⮌ Natrag</button><button data-k="home">⌂ Home</button><button data-k="menu">☰</button></div>
<div class="row c4"><button data-k="rew">⏪</button><button data-k="play">⏯</button><button data-k="ff">⏩</button><button data-k="mute">🔇</button></div>
<div class="row c4"><button data-k="vol_down" data-r>Vol −</button><button data-k="vol_up" data-r>Vol +</button><button data-k="prev">⏮</button><button data-k="next">⏭</button></div>
<h2>Tipkovnica na TV-u</h2>
<div class="row" style="grid-template-columns:1fr 70px 70px"><input id="tx" placeholder="upiši tekst u polje na TV-u"><button id="tb">Šalji</button><button data-k="del">⌫</button></div>
<script>
let pin=localStorage.getItem('pin')||'';const st=document.getElementById('st');
async function api(p,b){try{const r=await fetch(p,{method:'POST',headers:{'X-Pin':pin},body:JSON.stringify(b)});
if(r.status==401){pin=prompt('PIN')||'';localStorage.setItem('pin',pin);return api(p,b)}
const j=await r.json();st.textContent=j.ok?'✓':'✗ '+j.msg;return j}catch(e){st.textContent='✗ nema veze s laptopom'}}
const key=k=>{navigator.vibrate&&navigator.vibrate(8);return api('/api/key',{key:k})};
document.querySelectorAll('[data-k]').forEach(b=>{let t;const k=b.dataset.k;
b.addEventListener('click',()=>key(k));
if(b.hasAttribute('data-r')){b.addEventListener('pointerdown',()=>{t=setTimeout(function f(){key(k);t=setTimeout(f,150)},450)});
['pointerup','pointerleave','pointercancel'].forEach(e=>b.addEventListener(e,()=>clearTimeout(t)))}});
document.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>api('/api/app',{app:b.dataset.a}));
const yq=document.getElementById('yq');const ys=()=>yq.value.trim()&&api('/api/youtube',{query:yq.value.trim()});
document.getElementById('yb').onclick=ys;yq.onkeydown=e=>{if(e.key=='Enter')ys()};
const tx=document.getElementById('tx');document.getElementById('tb').onclick=async()=>{if(tx.value){await api('/api/text',{text:tx.value});tx.value=''}};
const pad=document.getElementById('pad');let sx,sy,moved;
pad.onpointerdown=e=>{sx=e.clientX;sy=e.clientY;moved=false;pad.setPointerCapture(e.pointerId)};
pad.onpointermove=e=>{const dx=e.clientX-sx,dy=e.clientY-sy;if(Math.hypot(dx,dy)>40){moved=true;
key(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up'));sx=e.clientX;sy=e.clientY}};
pad.onpointerup=()=>{if(!moved)key('ok')};
</script></body></html>"""

def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try: s.connect(("10.255.255.255", 1)); return s.getsockname()[0]
    except OSError: return "127.0.0.1"
    finally: s.close()

if __name__ == "__main__":
    subprocess.run([ADB, "connect", TV], capture_output=True, text=True)
    print(f"TV: {TV}   PIN: {'set' if PIN else 'none (anyone on your Wi-Fi can use it)'}")
    print(f"Open on your phone: http://{lan_ip()}:{PORT}")
    try: ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
    except KeyboardInterrupt: sys.exit(0)
