-- ============================================================
-- RaysABook — autocomplete helpers for the admin form
-- Suggest EXISTING values so new entries reuse them (no messy variants).
-- ============================================================

-- Distinct values for a whitelisted field, ranked by how common they are,
-- optionally filtered by a typed query.
create or replace function public.field_suggestions(field text, q text default '', lim int default 12)
returns table(value text, freq bigint)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if field not in ('format', 'author', 'publisher') then
    raise exception 'invalid field %', field;
  end if;
  return query execute format($f$
    select t.%1$I as value, count(*) as freq
    from public.books t
    where coalesce(t.%1$I, '') <> ''
      and ($1 = '' or t.%1$I ilike '%%' || $1 || '%%')
    group by t.%1$I
    order by count(*) desc, t.%1$I asc
    limit $2
  $f$, field) using q, lim;
end;
$$;

-- Individual genre tags (genres are stored " | "-separated; this splits them).
create or replace function public.genre_tokens(q text default '', lim int default 14)
returns table(value text, freq bigint)
language sql stable security definer
set search_path = public
as $$
  select trim(tok) as value, count(*) as freq
  from public.books b,
       lateral unnest(string_to_array(coalesce(b.genre, ''), ' | ')) as tok
  where trim(tok) <> ''
    and (q = '' or trim(tok) ilike '%' || q || '%')
  group by trim(tok)
  order by count(*) desc, trim(tok) asc
  limit lim;
$$;

grant execute on function public.field_suggestions(text, text, int) to anon, authenticated;
grant execute on function public.genre_tokens(text, int) to anon, authenticated;
