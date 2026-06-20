#!/usr/bin/env python3
"""Build site/books.js from data/books.json (+ optional data/covers.json)."""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

books = json.load(open(os.path.join(HERE, "books.json")))

covers = {}
cov_path = os.path.join(HERE, "covers.json")
if os.path.exists(cov_path):
    covers = json.load(open(cov_path))

out = []
ncov = 0
for b in books:
    cid = str(b["id"])
    cover = covers.get(cid, "") or ""
    if cover:
        ncov += 1
    out.append({
        "id": b["id"],
        "title": b.get("title", ""),
        "author": b.get("author", ""),
        "isbn": b.get("isbn", ""),
        "format": b.get("format", ""),
        "pages": b.get("pages", ""),
        "publisher": b.get("publisher", ""),
        "year": b.get("year", ""),
        "genre": b.get("genre", ""),
        "cover": cover,
    })

dst = os.path.join(ROOT, "site", "books.js")
with open(dst, "w", encoding="utf-8") as f:
    f.write("window.BOOKS=")
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";")

print(f"wrote {dst}: {len(out)} books, {ncov} with covers ({ncov*100//max(1,len(out))}%)")
