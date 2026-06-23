#!/usr/bin/env python3
"""Bulk-import books.json (+ covers.json) into the Supabase `books` table.
Connection + auth come from env vars (PGPASSWORD set by caller)."""
import os, json
import psycopg2
from psycopg2.extras import execute_values

HERE = os.path.dirname(os.path.abspath(__file__))
books = json.load(open(os.path.join(HERE, "books.json")))
covers = {}
cp = os.path.join(HERE, "covers.json")
if os.path.exists(cp):
    covers = json.load(open(cp))

rows = []
for b in books:
    cid = str(b["id"])
    cover_path = f"{cid}.webp" if covers.get(cid) else ""   # object name in the 'covers' bucket
    rows.append((
        cid, b.get("title", ""), b.get("author", ""), b.get("isbn", ""),
        b.get("format", ""), b.get("pages", ""), b.get("publisher", ""),
        b.get("year", ""), b.get("genre", ""), cover_path,
    ))

conn = psycopg2.connect(
    host=os.environ.get("PGHOST", "aws-1-eu-central-1.pooler.supabase.com"), port=5432,
    user=os.environ.get("PGUSER", "postgres.bbbppgebsjaapohyqscm"), dbname="postgres",
    password=os.environ["PGPASSWORD"], sslmode="require",
)
conn.autocommit = False
cur = conn.cursor()
execute_values(cur, """
  insert into public.books
    (clz_id,title,author,isbn,format,pages,publisher,year,genre,cover_path)
  values %s
  on conflict (clz_id) do update set
    title=excluded.title, author=excluded.author, isbn=excluded.isbn,
    format=excluded.format, pages=excluded.pages, publisher=excluded.publisher,
    year=excluded.year, genre=excluded.genre, cover_path=excluded.cover_path
""", rows, page_size=1000)
conn.commit()
cur.execute("select count(*), count(*) filter (where cover_path<>'') from public.books;")
total, withcov = cur.fetchone()
print(f"imported. total rows={total}, with cover_path={withcov}")
cur.close(); conn.close()
