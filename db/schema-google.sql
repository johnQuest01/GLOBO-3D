-- Entrar com o Google.
--
-- POR QUE UMA COLUNA E NÃO "a senha é o id do Google". Uma conta do Google não
-- tem senha neste projeto, e inventar uma (um hash de algo previsível) seria
-- pior que não ter: viraria uma senha real que ninguém escolheu e que o dono
-- da conta não sabe que existe. Então `password_hash` passa a aceitar nulo, e
-- a ausência dele é o que diz "esta conta entra pelo Google".
--
-- `google_sub` É O IDENTIFICADOR ESTÁVEL DO GOOGLE (o campo `sub` do
-- id_token), e não o e-mail. O e-mail de uma conta Google pode mudar; o `sub`
-- não. Casar por e-mail faria a pessoa perder a conta no dia em que trocasse
-- o endereço — e, pior, faria um e-mail reciclado cair numa conta alheia.

alter table users add column if not exists google_sub text;

-- Único, mas permitindo muitos nulos: quase todas as contas continuam sendo de
-- e-mail e senha, e nulo não conflita com nulo em índice único do Postgres.
create unique index if not exists users_google_sub_key
  on users (google_sub)
  where google_sub is not null;

-- A senha deixa de ser obrigatória. As contas que já existem não mudam.
alter table users alter column password_hash drop not null;

-- Guarda a foto do perfil do Google, que é o único dado a mais que vale a pena
-- trazer: é o que evita a conta nova aparecer como uma letra num círculo.
alter table users add column if not exists avatar_url text;
