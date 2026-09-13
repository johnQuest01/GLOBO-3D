-- Notícias da região — e por que elas NÃO ganham uma tabela própria.
--
-- A tentação era criar `noticias` do zero. Seria uma segunda tabela com autor,
-- lugar, mídia, denúncia, ocultação e remoção — ou seja, uma cópia de `posts`
-- com outro nome. E cópia diverge: o dia em que a moderação mudasse, mudaria
-- num lugar só, e o outro ficaria para trás sem ninguém notar.
--
-- O QUE MUDA DE VERDADE entre uma publicação do mural e uma notícia são três
-- coisas, e nenhuma delas é estrutura:
--
--   · o mural morre em 24 horas; a notícia fica;
--   · a notícia tem título e assunto, porque é lida numa lista;
--   · a notícia declara ATÉ ONDE quer alcançar — a cidade, o estado ou o país.
--
-- Então são três colunas, e tudo o mais — mídia no R2, coordenada, denúncia,
-- fila de moderação, bloqueio — continua sendo o mesmo código.

alter table posts add column if not exists tipo text not null default 'mural';

-- `check` acrescentado à parte: a coluna já pode existir de uma execução
-- anterior, e `add column` com check junto falharia nesse caso.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'posts_tipo_valido'
  ) then
    alter table posts
      add constraint posts_tipo_valido check (tipo in ('mural', 'noticia'));
  end if;
end $$;

alter table posts add column if not exists titulo text;
alter table posts add column if not exists categoria text;

-- Até onde a notícia alcança.
--
-- QUEM ESCREVE DECIDE, e não o aplicativo. Um alagamento numa rua interessa ao
-- bairro; uma eleição interessa ao país. Deixar o sistema adivinhar pela
-- coordenada produziria as duas coisas no mesmo lugar — e a pessoa que mora
-- longe receberia o alagamento de uma rua que ela nunca vai ver.
alter table posts add column if not exists alcance text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'posts_alcance_valido'
  ) then
    alter table posts
      add constraint posts_alcance_valido
      check (alcance is null or alcance in ('cidade', 'estado', 'pais'));
  end if;
end $$;

-- A notícia NÃO VENCE, e é isso que a separa do mural.
--
-- `expires_at` continua sendo `not null` por causa das linhas que já existem;
-- para notícia ele recebe uma data distante, e a consulta do mural — que filtra
-- por `tipo = 'mural'` — nunca a alcança de qualquer forma.

-- O índice da lista de notícias: por lugar e por data.
create index if not exists posts_noticias_idx
  on posts (pais, estado, cidade, created_at desc)
  where tipo = 'noticia' and removido_em is null and oculto_em is null;

-- E o índice da página de alguém: as notícias daquela pessoa.
create index if not exists posts_noticias_autor_idx
  on posts (author_id, created_at desc)
  where tipo = 'noticia' and removido_em is null;

-- O índice do mural passa a excluir notícia, senão ele carregaria as duas
-- coisas e a separação existiria só na consulta.
drop index if exists posts_vivos_idx;
create index if not exists posts_vivos_idx
  on posts (created_at desc)
  where tipo = 'mural' and removido_em is null and oculto_em is null;

-- ---------------------------------------------------------------------------
-- Busca
-- ---------------------------------------------------------------------------
--
-- BUSCA DE TEXTO NO PRÓPRIO POSTGRES, e não num serviço à parte.
--
-- A pergunta que veio junto foi "indexar em algum banco de dados" — e a
-- resposta honesta é que o banco que já existe resolve isso por muito mais
-- tempo do que parece. `tsvector` com índice GIN faz busca em milhões de linhas
-- em milissegundos; trazer um Elasticsearch ou um Algolia agora seria um
-- segundo sistema para manter, sincronizar e pagar, resolvendo um problema que
-- ainda não existe.
--
-- O DIA DE TROCAR tem sinal claro: quando a busca começar a demorar com o
-- índice quente, ou quando for preciso ordenar por relevância de um jeito que o
-- Postgres não faz bem. Até lá, isto aqui basta.
--
-- `portuguese` como dicionário: ele reduz "alagamentos" a "alag", então
-- procurar "alagamento" acha o plural — que é o mínimo que uma busca precisa
-- fazer para não parecer quebrada.
alter table posts
  add column if not exists busca tsvector
  generated always as (
    to_tsvector('portuguese', coalesce(titulo, '') || ' ' || coalesce(body, ''))
  ) stored;

create index if not exists posts_busca_idx on posts using gin (busca);
