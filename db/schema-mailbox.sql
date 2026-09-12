-- ADITIVO: nada aqui altera users, sessions, profiles, behavior_events ou
-- affinity.
--
-- A CAIXA POSTAL. É o que permite mandar mensagem para quem está com a aba
-- fechada — e é, com todas as letras, o fim da promessa antiga de que nada
-- ficava gravado. O servidor passa a guardar a mensagem até entregar, e apaga
-- depois. É o modelo do WhatsApp, e a tela precisa dizer isso.
--
-- O ENVELOPE É OPACO DE PROPÓSITO. O servidor sabe DE QUEM, PARA QUEM, QUANDO
-- e QUE TIPO (texto, imagem, áudio) — o que ele precisa para entregar e para
-- dizer "fulano te mandou uma foto" numa notificação. O conteúdo em si é um
-- bloco de bytes que ele trata sem abrir. Hoje ele até CONSEGUE abrir (a chave
-- é dele, ver `enc`); quando a criptografia ponta a ponta entrar, a chave passa
-- a ser dos dois aparelhos e esta tabela não muda uma linha.

create table if not exists envelopes (
  id             bigserial primary key,

  -- Id gerado por quem envia. É o que permite reenviar sem duplicar: a mesma
  -- mensagem reenviada depois de uma queda de rede bate no índice único
  -- abaixo e não vira duas.
  msg_id         text not null,

  from_user_id   uuid not null references users(id) on delete cascade,
  to_user_id     uuid not null references users(id) on delete cascade,

  -- Nulo hoje: uma conta, um destino. A coluna já existe porque com
  -- criptografia ponta a ponta cada APARELHO tem sua própria chave, e a mesma
  -- mensagem passa a ser guardada uma vez por aparelho do destinatário.
  -- Acrescentar isso depois obrigaria a mexer no índice de unicidade, que é a
  -- parte que não se mexe com a tabela em uso.
  to_device_id   text,

  -- 'texto' | 'imagem' | 'audio'. Metadado, não conteúdo.
  kind           text not null,

  -- COMO ler o payload. 'srv-v1' = AES-256-GCM com a chave do servidor;
  -- 'e2e-v1' virá quando a chave for dos aparelhos. Está gravado em cada
  -- linha, e não numa constante do código, porque na migração as duas formas
  -- convivem: mensagem antiga não se reescreve.
  enc            text not null,

  payload        bytea not null,

  created_at     timestamptz not null default now(),

  -- Mensagem que ninguém veio buscar não fica para sempre. A entrega apaga a
  -- linha; isto aqui é a rede de segurança para quem nunca mais voltou.
  expires_at     timestamptz not null default now() + interval '30 days'
);

-- Dedupe: a MESMA mensagem para o MESMO destino entra uma vez só.
create unique index if not exists envelopes_dedupe_idx
  on envelopes (to_user_id, msg_id);

-- A consulta que roda toda vez que alguém conecta: "o que chegou para mim?"
create index if not exists envelopes_inbox_idx
  on envelopes (to_user_id, created_at);

create index if not exists envelopes_expira_idx on envelopes (expires_at);

-- Faxina do que venceu. Não é obrigatório rodar — a entrega já apaga o que foi
-- entregue —, serve para a tabela não crescer com o que nunca foi buscado.
create or replace function purge_expired_envelopes() returns void as $$
  delete from envelopes where expires_at < now();
$$ language sql;

-- BLOQUEIO ENTRE CONTAS.
--
-- Já existe um bloqueio no Redis, por clientId (o identificador anônimo do
-- navegador), e ele continua valendo para o pedido de conexão P2P. Este aqui é
-- por CONTA, e é o que a caixa postal consulta: bloqueio que se perde quando a
-- pessoa troca de navegador não é bloqueio, e mensagem guardada para entregar
-- depois precisa de uma decisão que sobreviva a isso.
create table if not exists user_blocks (
  blocker_user_id uuid not null references users(id) on delete cascade,
  blocked_user_id uuid not null references users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id)
);

-- Para a checagem nos dois sentidos sair por índice: quem bloqueia também não
-- recebe.
create index if not exists user_blocks_reverso_idx
  on user_blocks (blocked_user_id, blocker_user_id);
