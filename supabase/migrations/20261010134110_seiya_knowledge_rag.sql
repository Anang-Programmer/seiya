-- Seiya RAG: public/static product help and general financial-education chunks only.
-- No household/account/transaction data belongs in this table.

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

create table if not exists public.seiya_knowledge_chunks (
  chunk_key text primary key,
  source_file text not null,
  title text not null,
  category text not null check (category in ('seiya_help', 'financial_education')),
  content text not null,
  content_sha256 text not null,
  embedding_model text not null check (embedding_model = 'gemini-embedding-001'),
  embedding extensions.vector(768) not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default pg_catalog.now()
);

create index if not exists seiya_knowledge_chunks_active_category_idx
  on public.seiya_knowledge_chunks (category, is_active);

alter table public.seiya_knowledge_chunks enable row level security;
revoke all on public.seiya_knowledge_chunks from public, anon, authenticated;
grant select, insert, update on public.seiya_knowledge_chunks to service_role;

create or replace function public.match_seiya_knowledge_chunks(
  query_embedding extensions.vector(768),
  match_threshold double precision default 0.42,
  match_count integer default 3
)
returns table (
  chunk_key text,
  title text,
  category text,
  content text,
  similarity double precision
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select
    k.chunk_key,
    k.title,
    k.category,
    k.content,
    (1 - (k.embedding <=> query_embedding))::double precision as similarity
  from public.seiya_knowledge_chunks as k
  where auth.uid() is not null
    and k.is_active = true
    and k.embedding_model = 'gemini-embedding-001'
    and (1 - (k.embedding <=> query_embedding)) >= greatest(-1, least(match_threshold, 1))
  order by k.embedding <=> query_embedding asc
  limit least(greatest(match_count, 1), 3);
$$;

revoke all on function public.match_seiya_knowledge_chunks(extensions.vector, double precision, integer) from public, anon;
grant execute on function public.match_seiya_knowledge_chunks(extensions.vector, double precision, integer) to authenticated, service_role;
