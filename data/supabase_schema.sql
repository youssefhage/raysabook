-- ============================================================
-- RaysABook — Supabase schema
-- Run this once in your Supabase project:  Dashboard → SQL Editor → paste → Run
-- ============================================================

-- 1) Books table -------------------------------------------------
create table if not exists public.books (
  id          bigint generated always as identity primary key,
  clz_id      text unique,                 -- original CLZ id (kept for the one-time import / dedupe)
  title       text not null,
  author      text default '',
  isbn        text default '',
  format      text default '',
  pages       text default '',
  publisher   text default '',
  year        text default '',
  genre       text default '',
  cover_path  text default '',             -- path inside the 'covers' storage bucket ('' = use fallback)
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- helpful indexes for search / sort
create index if not exists books_title_idx  on public.books (lower(title));
create index if not exists books_author_idx on public.books (lower(author));
create index if not exists books_year_idx   on public.books (year);

-- 2) Row Level Security -----------------------------------------
-- Public can READ the catalog; only logged-in admins can change it.
alter table public.books enable row level security;

create policy "public can read books"
  on public.books for select
  using ( true );

create policy "authenticated can insert books"
  on public.books for insert
  to authenticated with check ( true );

create policy "authenticated can update books"
  on public.books for update
  to authenticated using ( true );

create policy "authenticated can delete books"
  on public.books for delete
  to authenticated using ( true );

-- keep updated_at fresh
create or replace function public.touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;

drop trigger if exists books_touch on public.books;
create trigger books_touch before update on public.books
  for each row execute function public.touch_updated_at();

-- ============================================================
-- 3) Storage bucket for cover images
--    Create in Dashboard → Storage → New bucket:
--      name: covers      public: YES
--    Then run the policy below so only admins can upload/delete,
--    while anyone can view covers.
-- ============================================================
-- (public read is automatic for a public bucket; these guard writes)
create policy "authenticated can upload covers"
  on storage.objects for insert
  to authenticated with check ( bucket_id = 'covers' );

create policy "authenticated can update covers"
  on storage.objects for update
  to authenticated using ( bucket_id = 'covers' );

create policy "authenticated can delete covers"
  on storage.objects for delete
  to authenticated using ( bucket_id = 'covers' );
