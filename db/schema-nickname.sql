-- ADITIVO: nada aqui altera profiles, behavior_events, affinity ou sessions.
--
-- O NICKNAME é o nome público — o único identificador que aparece na busca do
-- globo. E-mail não serve para isso: uma caixa de busca que aceita e-mail vira
-- um verificador de "esta pessoa tem conta aqui?" para qualquer um. Nome
-- completo também não: é dado pessoal, e duas pessoas podem ter o mesmo.
--
-- A coluna é NULÁVEL de propósito. As contas criadas antes desta migração não
-- têm nickname, e exigir a coluna preenchida quebraria o login delas. Elas
-- escolhem um na primeira vez que abrirem a busca (ver CHAT-GLOBAL-PLAN.md).

alter table users add column if not exists nickname text;

-- UNICIDADE NO BANCO, e sobre `lower()`: "Bruno" e "bruno" são a mesma pessoa
-- para quem digita na busca, então precisam ser o mesmo nickname para o banco.
-- A checagem é do índice e não da aplicação — dois cadastros simultâneos com o
-- mesmo nickname passariam por um `select antes de inserir` ao mesmo tempo.
create unique index if not exists users_nickname_key
  on users (lower(nickname));

-- BUSCA POR PREFIXO. O índice acima não serve para `like 'bru%'`: com a
-- collation padrão, o Postgres não consegue usá-lo em comparação de padrão.
-- `text_pattern_ops` existe exatamente para esse caso.
create index if not exists users_nickname_prefix_idx
  on users (lower(nickname) text_pattern_ops);
