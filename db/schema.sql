-- =====================================================================
-- GLOBO-3D — Schema do backend (Neon / PostgreSQL)
-- Cole no SQL Editor do Neon (aba "SQL Editor" do seu projeto) e execute.
-- Veja docs/BACKEND_SETUP.md para o passo a passo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Mensagens por região (o "mural social" que voa até o local no globo)
-- ---------------------------------------------------------------------
create table if not exists region_messages (
  id          bigint generated always as identity primary key,
  client_id   text        not null,            -- id gerado no navegador (evita eco da própria msg)
  text        text        not null,
  lat         double precision not null,
  lon         double precision not null,
  region_key  text,                             -- opcional: chave do local (país/estado/cidade)
  author_name text,                             -- opcional: nome de quem enviou
  created_at  timestamptz not null default now()
);

-- Índice para consultar rapidamente "mensagens desde X"
create index if not exists region_messages_created_at_idx
  on region_messages (created_at);

-- ---------------------------------------------------------------------
-- (Futuro) Notícias por região — para o painel de cada local
-- ---------------------------------------------------------------------
create table if not exists region_news (
  id          bigint generated always as identity primary key,
  region_key  text not null,
  category    text not null default 'local',
  title       text not null,
  body        text,
  image_url   text,
  created_at  timestamptz not null default now()
);
create index if not exists region_news_region_idx on region_news (region_key);

-- ---------------------------------------------------------------------
-- (Futuro) Anúncios / marketing interativo exibidos ao dar zoom
-- ---------------------------------------------------------------------
create table if not exists ads (
  id          bigint generated always as identity primary key,
  region_key  text,
  title       text not null,
  image_url   text,
  link_url    text,
  lat         double precision,
  lon         double precision,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
