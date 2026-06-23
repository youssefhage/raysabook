#!/usr/bin/env python3
"""Download covers from CLZ CDN, convert to WebP, upload to Supabase Storage 'covers'.
Object name = <clz_id>.webp  (matches books.cover_path set during import).
Env: SB_URL, SB_SECRET. Optional: LIMIT (test), WORKERS (default 16)."""
import os, json, io, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
from PIL import Image

SB_URL = os.environ["SB_URL"].rstrip("/")
SECRET = os.environ["SB_SECRET"]
CDN = "https://clzbooks.r.sizr.io"
LIMIT = int(os.environ.get("LIMIT", "0"))
WORKERS = int(os.environ.get("WORKERS", "16"))

covers = json.load(open(os.path.join(HERE, "covers.json")))
items = list(covers.items())
if LIMIT:
    items = items[:LIMIT]

ok = 0; fail = 0; errs = []
import threading
lock = threading.Lock()

def one(kv):
    global ok, fail
    clz_id, path = kv
    try:
        req = urllib.request.Request(CDN + path, headers={"User-Agent": "Mozilla/5.0"})
        raw = urllib.request.urlopen(req, timeout=30).read()
        im = Image.open(io.BytesIO(raw)).convert("RGB")
        # covers are ~128px; cap at 400 just in case, never upscale
        if im.width > 400:
            im = im.resize((400, int(im.height * 400 / im.width)))
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=80, method=4)
        data = buf.getvalue()
        url = f"{SB_URL}/storage/v1/object/covers/{clz_id}.webp"
        up = urllib.request.Request(url, data=data, method="POST", headers={
            "Authorization": f"Bearer {SECRET}",
            "apikey": SECRET,
            "Content-Type": "image/webp",
            "x-upsert": "true",
        })
        urllib.request.urlopen(up, timeout=30).read()
        with lock: ok += 1
    except Exception as e:
        with lock:
            fail += 1
            if len(errs) < 5: errs.append(f"{clz_id}: {e}")

with ThreadPoolExecutor(max_workers=WORKERS) as ex:
    for i, _ in enumerate(ex.map(one, items), 1):
        if i % 250 == 0:
            print(f"  {i}/{len(items)}  ok={ok} fail={fail}", flush=True)

print(f"DONE: uploaded={ok} failed={fail} of {len(items)}")
if errs: print("sample errors:", errs)
