-- "Aceito conversa de qualquer pessoa do mundo."
--
-- POR QUE ISTO PRECISA EXISTIR ANTES DA RECOMENDAÇÃO. Recomendar alguém é
-- mostrar o nome dessa pessoa a estranhos e convidá-los a chamá-la. Fazer isso
-- sem perguntar transformaria cada conta nova numa porta aberta que ninguém
-- destrancou — e a primeira pessoa a se arrepender seria justamente quem o
-- aplicativo deveria proteger.
--
-- O PADRÃO É SIM, e é uma escolha, não um descuido: o propósito declarado do
-- projeto é conhecer gente do mundo inteiro, e uma conta que nasce fechada
-- deixaria o globo cheio de pessoas invisíveis umas para as outras. Quem não
-- quiser desliga num toque, e o desligamento vale para os dois lados: sai das
-- recomendações E para de receber a primeira mensagem de desconhecido.
--
-- O QUE ELE NÃO FAZ: não apaga conversa existente. Quem já falou com você
-- continua falando — o filtro é sobre o PRIMEIRO contato, e não sobre quem já
-- foi aceito uma vez.

alter table users
  add column if not exists aberto_a_conversas boolean not null default true;

-- A recomendação pergunta "quem está aberto", e pergunta com frequência.
create index if not exists users_abertos_idx
  on users (aberto_a_conversas)
  where aberto_a_conversas;
