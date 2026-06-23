# RaysABook — online catalog, admin portal & WhatsApp enquiry

> **🌐 Website:** https://youssefhage.github.io/raysabook/
> **🔐 Admin:** https://youssefhage.github.io/raysabook/admin.html
> **📦 Code repo:** https://github.com/youssefhage/raysabook

A storefront for the full **7,566-book** collection. Visitors browse/search the
catalog and add books to an **enquiry list** that opens a pre-filled **WhatsApp**
message to **+961 3 345683**. There is no online payment — pricing/availability is
handled by you over WhatsApp. An **admin portal** lets you add, edit and remove books
(with cover upload) — no code needed.

## 🏗 How it's built

- **Frontend** (this repo, hosted on GitHub Pages) — static HTML/CSS/vanilla JS, no build step.
- **Backend: Supabase** (project `raysabook-eu`, **Frankfurt** region) provides:
  - the **books database** (the catalog — 7,566 rows)
  - **admin login** (Supabase Auth)
  - **cover image storage** (6,944 covers, served as WebP thumbnails)
- The storefront reads live from Supabase, so admin changes appear immediately.
- **CLZ is no longer used** — the catalog was migrated off it entirely.

```
site/                     ← the deployed website (GitHub Pages serves this)
  index.html              storefront
  app.js                  storefront logic (reads catalog from Supabase)
  admin.html / admin.js   admin portal (login + add/edit/remove + cover upload)
  config.js               Supabase URL + PUBLISHABLE key (safe to be public)
  styles.css, favicon.svg, og.png, manifest.webmanifest
data/                     ← one-time migration / setup tools (not deployed)
  supabase_schema.sql     the database schema (table, security rules, storage policies)
  import_books.py         imports books.json → Supabase
  migrate_covers.py       downloads covers → uploads to Supabase storage
  books.json, covers.json the original extracted data (source of truth for re-imports)
.secrets/                 ← gitignored: Supabase DB password + secret/publishable keys
```

## 🔐 Admin portal

- Go to **/admin.html**, sign in with the Supabase user you created
  (e.g. `admin@raysabook.com` + your password).
- **Add a book**: fill the form, optionally upload a cover (auto-resized to a small
  WebP). **Edit / Delete**: search, click a book, change or remove it.
- Changes are live on the storefront instantly.
- Security: the public can only *read* the catalog. All writes require admin login
  (enforced by Supabase Row-Level Security — verified).

### Managing admin users
Add or remove admins in the Supabase dashboard → **Authentication → Users**.

## 🔧 Editing the catalog directly (optional)

You normally won't need this — use the admin portal. But the Supabase dashboard
→ **Table editor → books** lets you edit rows directly, and **Storage → covers**
holds the cover images.

## 🚀 Hosting & deploys

Currently on **GitHub Pages** (branch `gh-pages` serves the `site/` folder).
To publish frontend changes:
```bash
git add -A && git commit -m "update"
git push origin main
git subtree push --prefix site origin gh-pages
```
You can move hosting to **Cloudflare Pages** anytime (free, faster) — point it at this
repo with output dir `site`, or `npx wrangler pages deploy site`. If you change domain,
update `og:url` / `og:image` / `canonical` in `site/index.html`.

## 🤝 Handover to a new owner

Two things transfer, both free and built-in:
1. **GitHub repo** → repo **Settings → Transfer ownership**.
2. **Supabase project** → project **Settings → General → Transfer project** to their org.

Then the new owner updates `site/config.js` only if the Supabase project URL/key change,
and re-deploys. The DB password & keys are in `.secrets/` (hand those over securely,
out-of-band — not via the repo).

## 💡 Notes

- Supabase free tier comfortably covers a small audience (~1,500–2,500 visits/mo).
  If it ever grows, moving the cover images to Cloudflare R2 removes the limit.
- Free Supabase projects pause after ~7 days of zero traffic (a live storefront stays active).
