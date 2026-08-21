-- ADITIVO: nada aqui altera profiles, behavior_events ou affinity.
--
-- Conta de verdade, com senha e sessão. Até agora o "login" do projeto era
-- teatro: aceitava qualquer e-mail, inventava idade e cidade e gravava no
-- localStorage. Isto substitui aquilo por algo que o servidor consegue provar.
--
-- A LIGAÇÃO COM O ANÔNIMO: `client_id` é o mesmo `globoClientId` que o
-- navegador já usava. Quando a conta chega, o histórico de comportamento que a
-- pessoa já tinha passa a ter dono — que é exatamente o que o comentário da
-- tabela `profiles` previa.

create extension if not exists pgcrypto;

create table if not exists users (
  id              uuid primary key default gen_random_uuid(),

  -- Guardado sempre em minúsculas e sem espaços nas pontas. A unicidade é do
  -- banco, não da aplicação: duas requisições simultâneas com o mesmo e-mail
  -- não podem virar duas contas.
  email           text not null unique,

  -- NUNCA a senha. Formato: scrypt$N$r$p$salt$hash (ver lib/auth/password.ts).
  password_hash   text not null,

  full_name       text,
  country         text,
  state           text,
  city            text,

  -- O anônimo que virou esta conta.
  client_id       text,

  created_at      timestamptz not null default now(),
  last_login_at   timestamptz,

  -- --- Política de uso ---
  -- Banir NÃO apaga a conta: a pessoa precisa continuar existindo para o
  -- report do outro lado fazer sentido, e para o banimento ser reversível.
  banned_at       timestamptz,
  banned_reason   text,

  -- Corte de sessões: toda sessão criada ANTES deste instante é inválida.
  -- É o que permite deslogar alguém em todos os aparelhos de uma vez, sem
  -- caçar linha por linha na tabela de sessões.
  sessions_valid_from timestamptz not null default now()
);

create index if not exists users_client_idx on users (client_id);

create table if not exists sessions (
  -- SHA-256 do token, não o token. Um vazamento desta tabela não entrega
  -- sessão nenhuma: o que o navegador manda não está guardado aqui.
  token_hash   text primary key,

  user_id      uuid not null references users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz,

  -- Só para a pessoa reconhecer a própria sessão numa tela de "onde estou
  -- conectado". Não é usado para autenticar.
  user_agent   text,
  ip           text
);

create index if not exists sessions_user_idx on sessions (user_id, created_at desc);
create index if not exists sessions_expires_idx on sessions (expires_at);

-- Denúncias. v1 é contagem e leitura humana: nada aqui bane automaticamente,
-- porque banir por volume é o caminho mais curto para virar arma de quem
-- denuncia em grupo.
create table if not exists policy_reports (
  id                bigserial primary key,
  target_user_id    uuid references users(id) on delete cascade,
  target_client_id  text,
  reporter_client_id text,
  reason            text not null,
  created_at        timestamptz not null default now()
);

create index if not exists policy_reports_target_idx
  on policy_reports (target_user_id, created_at desc);

-- Limpeza de sessão vencida. Não é obrigatório rodar: a validação já recusa
-- sessão expirada. Serve para a tabela não crescer para sempre.
create or replace function purge_expired_sessions() returns void as $$
  delete from sessions where expires_at < now() - interval '7 days';
$$ language sql;
