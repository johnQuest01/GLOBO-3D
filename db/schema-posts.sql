-- O mural do globo: o que as pessoas publicam, e por 24 horas.
--
-- POR QUE O POST TEM COORDENADA PRÓPRIA, e não se apoia na do autor. A pessoa
-- muda de cidade; o post não. Um post de Moscou que vira post de Belo Horizonte
-- porque quem escreveu se mudou não é um detalhe estranho — desfaz a única
-- coisa que este mural tem de diferente de todos os outros, que é ele acontecer
-- EM ALGUM LUGAR do globo.
--
-- POR QUE `expires_at` É UMA COLUNA, e não um cálculo de 24h na consulta. O
-- prazo é do post, e não da regra: dá para prorrogar um caso específico, dá
-- para encurtar, e dá para ler no banco quando algo vai sumir sem reimplementar
-- a aritmética em cada lugar que pergunta.

create extension if not exists pgcrypto;

create table if not exists posts (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references users(id) on delete cascade,

  kind          text not null check (kind in ('texto', 'imagem', 'video')),
  -- O texto do post, ou a legenda da foto. Nulo num post só de imagem.
  body          text,
  -- A chave no R2. O arquivo não passa pelo banco — ver lib/midia/r2.ts.
  midia_chave   text,

  -- Onde no globo. Copiada do autor no momento da publicação, de propósito.
  lat           double precision not null,
  lon           double precision not null,
  -- O rótulo que aparece na tela ("São Paulo, Brasil"). Guardado junto pelo
  -- mesmo motivo da coordenada: é o lugar DO POST.
  lugar         text,

  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '24 hours',

  -- --- Moderação -----------------------------------------------------------
  --
  -- SÃO TRÊS ESTADOS E NÃO DOIS, e é isso que permite as duas camadas
  -- conviverem sem uma atropelar a outra:
  --
  --   oculto_em    a comunidade juntou denúncias e o post saiu do ar. É uma
  --                PAUSA, reversível, e existe por aritmética: um post vive 24
  --                horas e a revisão humana não é instantânea. Sem isto, algo
  --                ruim ficaria no ar durante a noite inteira.
  --
  --   revisado_em  uma pessoa da moderação olhou. Marcar isso é o que tira o
  --                post da fila — e o que impede que a comunidade o esconda de
  --                novo pelo mesmo motivo já julgado.
  --
  --   removido_em  decisão final da moderação. Esta ganha das outras duas.
  --
  -- Nada aqui remove sozinho. Ocultar por volume é uma pausa; REMOVER por
  -- volume seria entregar a moderação a quem denuncia em grupo.
  oculto_em     timestamptz,
  revisado_em   timestamptz,
  removido_em   timestamptz,
  -- Quem decidiu, para a fila mostrar e para dar para desfazer.
  revisado_por  uuid references users(id) on delete set null
);

-- A consulta do mural: os vivos, os não removidos, os mais novos primeiro.
--
-- O ÍNDICE É PARCIAL de propósito. Post morto e post removido nunca são
-- consultados, e mantê-los no índice faria a estrutura crescer com o histórico
-- inteiro em vez de com o que está no ar — que é sempre um dia de posts.
create index if not exists posts_vivos_idx
  on posts (created_at desc)
  where removido_em is null and oculto_em is null;

create index if not exists posts_do_autor_idx on posts (author_id, created_at desc);

-- A fila da moderação: o que está escondido ou já foi julgado e ainda não saiu.
create index if not exists posts_fila_idx
  on posts (oculto_em)
  where oculto_em is not null and revisado_em is null;

-- Denúncia de post.
--
-- A CHAVE PRIMÁRIA COMPOSTA É A REGRA DE NEGÓCIO, e não organização: uma pessoa
-- denuncia um post UMA vez. Sem isso, contar denúncias contaria cliques, e o
-- limite que esconde um post seria alcançado por uma pessoa sozinha repetindo o
-- gesto.
create table if not exists post_reports (
  post_id      uuid not null references posts(id) on delete cascade,
  reporter_id  uuid not null references users(id) on delete cascade,
  reason       text,
  created_at   timestamptz not null default now(),
  primary key (post_id, reporter_id)
);

create index if not exists post_reports_post_idx on post_reports (post_id);

-- Faxina do que já venceu.
--
-- NÃO É O QUE FAZ O POST SUMIR — quem faz isso é o `expires_at` na consulta, e
-- é assim que tem de ser: se o mural dependesse desta função ter rodado, um
-- atraso dela deixaria conteúdo vencido no ar. Isto aqui é só para a tabela não
-- crescer para sempre.
--
-- A MÍDIA NO R2 é apagada pela regra de ciclo de vida do próprio bucket, no
-- prefixo dos posts. Apagar objeto daqui exigiria uma tarefa com credencial de
-- escrita rodando sozinha, e o armazenamento já sabe fazer isso de graça.
create or replace function purge_expired_posts() returns void as $$
  delete from posts where expires_at < now() - interval '7 days';
$$ language sql;
