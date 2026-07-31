-- =====================================================================
-- GLOBO-3D — Schema do backend (Supabase / Postgres)
-- Cole este arquivo no SQL Editor do seu projeto Supabase e execute.
-- Veja docs/BACKEND_SETUP.md para o passo a passo completo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Mensagens por região (o "mural social" que voa até o local no globo)
-- ---------------------------------------------------------------------
create table if not exists public.region_messages (
  id          uuid primary key default gen_random_uuid(),
  client_id   text        not null,             -- id gerado no navegador (evita eco da própria msg)
  text        text        not null check (char_length(text) between 1 and 280),
  lat         double precision not null,
  lon         double precision not null,
  region_key  text,                              -- opcional: chave do local (país/estado/cidade)
  author_name text,                              -- opcional: nome de quem enviou
  created_at  timestamptz not null default now()
);

create index if not exists region_messages_created_at_idx
  on public.region_messages (created_at desc);

-- Segurança em nível de linha (RLS)
alter table public.region_messages enable row level security;

-- Leitura pública (qualquer visitante vê as mensagens da região)
drop policy if exists "region_messages_select_public" on public.region_messages;
create policy "region_messages_select_public"
  on public.region_messages for select
  using (true);

-- Envio público (para começar). Em produção, troque por: to authenticated.
drop policy if exists "region_messages_insert_public" on public.region_messages;
create policy "region_messages_insert_public"
  on public.region_messages for insert
  with check (char_length(text) between 1 and 280);

-- Habilita realtime nesta tabela (mensagens novas chegam ao vivo)
alter publication supabase_realtime add table public.region_messages;

-- ---------------------------------------------------------------------
-- 2. (Futuro) Notícias por região — para o painel de cada local
-- ---------------------------------------------------------------------
create table if not exists public.region_news (
  id          uuid primary key default gen_random_uuid(),
  region_key  text not null,
  category    text not null default 'local',
  title       text not null,
  body        text,
  image_url   text,
  created_at  timestamptz not null default now()
);
create index if not exists region_news_region_idx on public.region_news (region_key);
alter table public.region_news enable row level security;
drop policy if exists "region_news_select_public" on public.region_news;
create policy "region_news_select_public"
  on public.region_news for select using (true);

-- ---------------------------------------------------------------------
-- 3. (Futuro) Anúncios / marketing interativo exibidos ao dar zoom
-- ---------------------------------------------------------------------
create table if not exists public.ads (
  id          uuid primary key default gen_random_uuid(),
  region_key  text,
  title       text not null,
  image_url   text,
  link_url    text,
  lat         double precision,
  lon         double precision,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.ads enable row level security;
drop policy if exists "ads_select_public" on public.ads;
create policy "ads_select_public"
  on public.ads for select using (active = true);
