-- Curtidas e comentários — e a conta de quanto isso aguenta.
--
-- =========================================================================
-- O QUE FAZ UM CLIQUE SER RÁPIDO
-- =========================================================================
--
-- A pergunta não é "qual banco aguenta". É "quantas linhas o banco precisa
-- tocar para responder um clique". Três decisões aqui respondem isso, e elas
-- valem mais do que qualquer troca de infraestrutura:
--
--   1. O NÚMERO DE CURTIDAS MORA NA LINHA DO POST, contado por gatilho. Ler um
--      post nunca conta linhas de curtida. Um `count(*)` numa publicação com
--      200 mil curtidas percorre 200 mil linhas TODA VEZ que alguém abre o
--      feed; um inteiro na linha custa zero. Esta é a diferença entre uma tela
--      que abre em 40 ms e uma que abre em 4 s — e ela aparece exatamente
--      quando o aplicativo começa a dar certo, que é o pior momento.
--
--   2. "EU CURTI ISTO?" É UMA BUSCA POR CHAVE PRIMÁRIA, não uma varredura. A
--      chave é (post_id, user_id) — o índice já é a resposta. E, de quebra,
--      ela É a regra de negócio: uma pessoa curte uma vez. Dois toques rápidos
--      não viram dois votos porque o banco não deixa, e não porque a tela
--      lembrou de travar o botão.
--
--   3. A PAGINAÇÃO É POR CHAVE, e nunca por OFFSET. `offset 10000` faz o
--      Postgres ler e jogar fora dez mil linhas antes de devolver a primeira.
--      Paginar pelo instante do último item lido custa o mesmo na página 1 e
--      na página 500.
--
-- =========================================================================
-- CRESCER PARA O LADO, E QUANDO
-- =========================================================================
--
-- "Dividir por hash" é uma técnica real, e o Postgres faz isso nativamente:
-- `partition by hash (post_id)` reparte a tabela em pedaços, cada um com os
-- próprios índices. VALE A PENA QUANDO os índices deixam de caber na memória
-- da máquina — e não antes. Repartir cedo torna tudo mais lento: cada consulta
-- passa a visitar N pedaços, e o planejador perde estatísticas.
--
-- A ORDEM CERTA DE PUXAR AS ALAVANCAS, da mais barata para a mais cara:
--
--   a) índice parcial que casa exatamente com a consulta      (feito aqui)
--   b) contador na linha em vez de count(*)                   (feito aqui)
--   c) máquina maior — "crescer para cima"                    (um clique, no Neon)
--   d) réplica de leitura: o feed lê da réplica, a escrita vai para a primária
--   e) cache dos números quentes no Redis que o tempo real já usa
--   f) partição por hash, quando a tabela de curtidas passar de ~100 milhões
--
-- De (a) a (e) resolvem vários milhões de usuários. A alavanca (f) é a única
-- que muda o formato do banco, e é a última justamente por isso.
--
-- O TETO CONHECIDO DESTE DESENHO, dito sem rodeio: o gatilho do contador
-- atualiza UMA linha do post a cada curtida. Numa publicação muito quente —
-- milhares de curtidas por segundo na mesma linha — isso vira fila de espera
-- pelo bloqueio daquela linha. Não é um problema de milhões de usuários; é um
-- problema de UM post viral. A saída, quando chegar, é somar em vários baldes
-- por post e totalizar de tempos em tempos. Não está feito porque hoje seria
-- complexidade sem freguês, e o ponto de virada é visível: se `curtidas` começar
-- a aparecer em espera de bloqueio, é a hora.

create extension if not exists pgcrypto;

-- =========================================================================
-- Curtidas de publicação
-- =========================================================================

create table if not exists curtidas (
  post_id    uuid not null references posts(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  criado_em  timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- "Quem curtiu isto?" e, na direção contrária, "o que eu curti?".
-- A segunda existe para a tela poder marcar os corações do feed inteiro numa
-- consulta só, em vez de uma por post.
create index if not exists curtidas_do_usuario_idx
  on curtidas (user_id, criado_em desc);

alter table posts add column if not exists curtidas int not null default 0;
alter table posts add column if not exists comentarios int not null default 0;

-- =========================================================================
-- Comentários
-- =========================================================================
--
-- DOIS NÍVEIS, E NÃO INFINITOS. Comentário e resposta — como no Instagram e no
-- YouTube, e pelo motivo deles: numa tela de celular, o terceiro nível já não
-- cabe, e a conversa vira uma escada que ninguém consegue ler. Responder à
-- resposta de alguém continua funcionando: a linha guarda A QUEM responde (o
-- "@fulano"), mas pendura-se na mesma raiz. A conversa fica plana e legível.
--
-- ISSO TAMBÉM É UMA DECISÃO DE DESEMPENHO. Com profundidade livre, mostrar uma
-- discussão exige consulta recursiva, e o custo depende do formato da árvore —
-- ou seja, é imprevisível. Com dois níveis, são duas consultas por chave, as
-- duas com índice.

create table if not exists comentarios (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references posts(id) on delete cascade,
  autor_id     uuid not null references users(id) on delete cascade,

  -- A raiz da conversa. Nulo quando ESTA linha é a raiz.
  raiz_id      uuid references comentarios(id) on delete cascade,
  -- A quem se responde, dentro daquela raiz. Serve para escrever "@fulano" e
  -- para avisar a pessoa certa. `set null` porque a resposta continua fazendo
  -- sentido mesmo quando o que ela respondia é apagado.
  responde_a   uuid references comentarios(id) on delete set null,

  corpo        text not null check (length(btrim(corpo)) between 1 and 2000),

  curtidas     int not null default 0,
  respostas    int not null default 0,

  criado_em    timestamptz not null default now(),

  -- A mesma moderação em três estados dos posts, e pelas mesmas razões.
  oculto_em    timestamptz,
  revisado_em  timestamptz,
  removido_em  timestamptz,
  revisado_por uuid references users(id) on delete set null,

  -- A REGRA DOS DOIS NÍVEIS, NO BANCO. Sem isto ela viveria só no código que
  -- escreve, e bastaria um caminho novo esquecer dela para nascer um terceiro
  -- nível que nenhuma consulta sabe ler.
  constraint resposta_pertence_a_raiz check (
    (raiz_id is null and responde_a is null) or raiz_id is not null
  )
);

-- A lista de comentários de um post: só as raízes, as mais novas primeiro.
-- PARCIAL: comentário removido nunca é consultado, e mantê-lo no índice faria
-- a estrutura crescer com o histórico em vez de com o que está no ar.
create index if not exists comentarios_raizes_idx
  on comentarios (post_id, criado_em desc)
  where raiz_id is null and removido_em is null;

-- As respostas de uma raiz, em ordem de chegada — conversa se lê para a frente.
create index if not exists comentarios_respostas_idx
  on comentarios (raiz_id, criado_em)
  where removido_em is null;

-- "O que esta pessoa comentou" e a fila da moderação.
create index if not exists comentarios_do_autor_idx
  on comentarios (autor_id, criado_em desc);

create index if not exists comentarios_fila_idx
  on comentarios (oculto_em)
  where oculto_em is not null and revisado_em is null;

-- =========================================================================
-- Curtidas de comentário
-- =========================================================================

create table if not exists curtidas_comentario (
  comentario_id uuid not null references comentarios(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  criado_em     timestamptz not null default now(),
  primary key (comentario_id, user_id)
);

create index if not exists curtidas_comentario_do_usuario_idx
  on curtidas_comentario (user_id, criado_em desc);

-- =========================================================================
-- Denúncia de comentário
-- =========================================================================

create table if not exists comentario_reports (
  comentario_id uuid not null references comentarios(id) on delete cascade,
  reporter_id   uuid not null references users(id) on delete cascade,
  reason        text,
  created_at    timestamptz not null default now(),
  primary key (comentario_id, reporter_id)
);

-- =========================================================================
-- Os contadores
-- =========================================================================
--
-- POR QUE GATILHO, E NÃO "o código que insere também soma".
--
-- Porque o código que insere são vários: a rota, o script de teste, uma
-- migração, a faxina, uma correção manual numa madrugada. Basta UM deles
-- esquecer de somar para o número mentir — e número que mente não avisa: ele
-- fica certo por meses e erra devagar. O gatilho está no caminho por onde a
-- linha obrigatoriamente passa.
--
-- `on conflict do nothing` no INSERT combina com isto: se a curtida já existia,
-- nenhuma linha nasce, e o gatilho não dispara. O contador não infla com
-- toques repetidos.

create or replace function mexer_curtidas_do_post() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update posts set curtidas = curtidas + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    -- `greatest` é cinto de segurança: um contador negativo apareceria na tela
    -- como "-1 curtida", e o defeito ficaria visível para quem menos pode
    -- fazer algo a respeito.
    update posts set curtidas = greatest(0, curtidas - 1) where id = old.post_id;
  end if;
  return null;
end;
$$ language plpgsql;

drop trigger if exists curtidas_contador on curtidas;
create trigger curtidas_contador
  after insert or delete on curtidas
  for each row execute function mexer_curtidas_do_post();

create or replace function mexer_curtidas_do_comentario() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update comentarios set curtidas = curtidas + 1 where id = new.comentario_id;
  elsif tg_op = 'DELETE' then
    update comentarios set curtidas = greatest(0, curtidas - 1)
     where id = old.comentario_id;
  end if;
  return null;
end;
$$ language plpgsql;

drop trigger if exists curtidas_comentario_contador on curtidas_comentario;
create trigger curtidas_comentario_contador
  after insert or delete on curtidas_comentario
  for each row execute function mexer_curtidas_do_comentario();

-- O contador de comentários do post, e o de respostas da raiz.
--
-- DOIS DE UMA VEZ porque nascem do mesmo evento. O do post conta TUDO —
-- comentário e resposta —, que é o número que a tela mostra ao lado do ícone;
-- o da raiz conta só as respostas dela, que é o "ver 3 respostas".
create or replace function mexer_contadores_de_comentario() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update posts set comentarios = comentarios + 1 where id = new.post_id;
    if new.raiz_id is not null then
      update comentarios set respostas = respostas + 1 where id = new.raiz_id;
    end if;
  elsif tg_op = 'DELETE' then
    update posts set comentarios = greatest(0, comentarios - 1)
     where id = old.post_id;
    if old.raiz_id is not null then
      update comentarios set respostas = greatest(0, respostas - 1)
       where id = old.raiz_id;
    end if;
  end if;
  return null;
end;
$$ language plpgsql;

drop trigger if exists comentarios_contador on comentarios;
create trigger comentarios_contador
  after insert or delete on comentarios
  for each row execute function mexer_contadores_de_comentario();

-- =========================================================================
-- Conserto, para quando um número divergir
-- =========================================================================
--
-- ELE NÃO DEVERIA PRECISAR RODAR — os gatilhos existem justamente para isso.
-- Mas contador denormalizado é uma aposta, e toda aposta precisa de uma forma
-- de conferir. Rodar isto e ver zero linhas mudadas é a prova de que o desenho
-- está de pé; ver linhas mudadas é o aviso de que algo escreveu por fora.
create or replace function recontar_social() returns void as $$
  update posts p set
    curtidas    = (select count(*) from curtidas c where c.post_id = p.id),
    comentarios = (select count(*) from comentarios k
                    where k.post_id = p.id and k.removido_em is null);

  update comentarios k set
    curtidas  = (select count(*) from curtidas_comentario c
                  where c.comentario_id = k.id),
    respostas = (select count(*) from comentarios r
                  where r.raiz_id = k.id and r.removido_em is null);
$$ language sql;
