-- =====================================================================
-- GLOBO-3D — Esquema do algoritmo de comportamento (Neon / PostgreSQL)
--
-- ADITIVO ao db/schema.sql: nada aqui altera region_messages, region_news
-- ou ads. Cole no SQL Editor do Neon e execute depois do outro.
--
-- A ideia em três camadas:
--
--   profiles          quem é a pessoa (uma linha por navegador/conta)
--   behavior_events   o que ela fez (append-only, barato de escrever)
--   affinity          o que ela gosta (rolagem acumulada, barata de ler)
--
-- Guardar só os eventos brutos obrigaria a recalcular o gosto a cada
-- recomendação. Guardar só o resumo perderia o histórico. Por isso os dois: o
-- evento entra e já atualiza a afinidade correspondente, então recomendar vira
-- uma leitura indexada em vez de uma varredura.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Perfil
-- ---------------------------------------------------------------------
create table if not exists profiles (
  id                bigint generated always as identity primary key,

  -- Identidade que funciona antes de existir login: um id estável gerado no
  -- navegador. Quando a conta chega, o mesmo client_id ganha e-mail e nome, e
  -- o histórico anterior continua valendo.
  client_id         text not null unique,

  email             text,
  name              text,
  city              text,

  -- Base legal do perfilamento: o aceite dos termos no cadastro. Guardar
  -- QUANDO e QUAL VERSÃO foi aceita é o que torna esse aceite demonstrável
  -- depois — sem isso, resta só a afirmação de que houve.
  terms_accepted_at timestamptz,
  terms_version     text,

  created_at        timestamptz not null default now(),
  last_seen_at      timestamptz not null default now()
);

create index if not exists profiles_email_idx on profiles (email);

-- ---------------------------------------------------------------------
-- Eventos de comportamento (append-only)
-- ---------------------------------------------------------------------
create table if not exists behavior_events (
  id          bigint generated always as identity primary key,
  client_id   text not null,

  -- 'region_view' | 'dwell' | 'news_open' | 'news_read' | 'like' | 'dislike'
  -- | 'pin_add' | 'trip_plan' | 'tourism_view' | 'search'
  kind        text not null,

  region_key  text,      -- país / estado / cidade envolvido
  topic       text,      -- categoria: local, sports, business, health...
  ref_id      text,      -- id do artigo, do ponto turístico, do anúncio
  dwell_ms    integer,   -- tempo de tela, quando o evento mede permanência

  -- Peso já resolvido na escrita: um "dislike" pesa negativo, um "like" pesa
  -- muito mais que uma passada de olho.
  weight      real not null default 1,

  created_at  timestamptz not null default now()
);

create index if not exists behavior_events_client_idx
  on behavior_events (client_id, created_at desc);
create index if not exists behavior_events_kind_idx
  on behavior_events (kind, created_at desc);

-- ---------------------------------------------------------------------
-- Afinidade acumulada (o que a recomendação lê)
-- ---------------------------------------------------------------------
create table if not exists affinity (
  client_id   text not null,

  -- 'region' ou 'topic'. Duas dimensões cobrem o essencial: onde a pessoa
  -- presta atenção e sobre o que ela gosta de ler.
  dimension   text not null,
  value       text not null,

  score       double precision not null default 0,
  updated_at  timestamptz not null default now(),

  primary key (client_id, dimension, value)
);

create index if not exists affinity_lookup_idx
  on affinity (client_id, dimension, score desc);

-- ---------------------------------------------------------------------
-- Apagar tudo de uma pessoa
--
-- Existe porque quem aceitou os termos pode pedir a exclusão depois. Ter isso
-- como uma função só evita esquecer uma tabela quando o pedido chegar.
-- ---------------------------------------------------------------------
create or replace function forget_client(target_client_id text)
returns void language sql as $$
  delete from behavior_events where client_id = target_client_id;
  delete from affinity        where client_id = target_client_id;
  delete from profiles        where client_id = target_client_id;
$$;
