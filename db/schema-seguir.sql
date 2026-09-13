-- Seguir: lugares e pessoas.
--
-- POR QUE O POST PRECISA DE COLUNAS DE LUGAR. Ele já guarda `lugar` como um
-- texto pronto para a tela ("Moscou, Rússia") e a coordenada. Nenhum dos dois
-- serve para assinar: casar texto é exatamente o erro que mandou uma conta para
-- a Sibéria (ver lib/geo/lugar.ts), e comparar coordenada com raio transforma
-- cada leitura do mural numa conta trigonométrica por linha.
--
-- Com país, estado e cidade em colunas próprias, "seguir Brasil" vira uma
-- igualdade indexada — e continua sendo o texto que a pessoa escolheu na lista,
-- então não há tradução no meio.

alter table posts add column if not exists pais   text;
alter table posts add column if not exists estado text;
alter table posts add column if not exists cidade text;

-- As contas que já publicaram herdam o lugar do autor. São no máximo 24 horas
-- de posts: o resto já venceu e não é lido por ninguém.
update posts p
   set pais   = coalesce(p.pais, u.country),
       estado = coalesce(p.estado, u.state),
       cidade = coalesce(p.cidade, u.city)
  from users u
 where u.id = p.author_id
   and (p.pais is null or p.estado is null or p.cidade is null);

-- O índice que a assinatura usa. Parcial pelo mesmo motivo do índice do mural:
-- post morto nunca é consultado, e mantê-lo aqui faria a estrutura crescer com
-- o histórico em vez de com o que está no ar.
create index if not exists posts_lugar_idx
  on posts (pais, estado, cidade, created_at desc)
  where removido_em is null and oculto_em is null;

-- ---------------------------------------------------------------------------
-- Seguir um LUGAR
-- ---------------------------------------------------------------------------
--
-- `tipo` é a camada: país, estado ou cidade. Três, e não quatro.
--
-- PROXIMIDADE NÃO ENTRA, e a ausência é deliberada. As células são de ~2 km;
-- assinar uma é receber, todo dia e sem esforço, um fluxo do quarteirão de uma
-- pessoa específica. Os posts já são públicos, então não é informação nova — é
-- CONVENIÊNCIA DE VIGIAR, que é outra coisa. Proximidade serve para "quem está
-- perto de mim agora", que é um gesto do presente; assinar é um gesto sobre o
-- futuro, e futuro sobre o quarteirão de alguém não é uma função de rede
-- social.
create table if not exists seguindo_lugar (
  user_id     uuid not null references users(id) on delete cascade,
  tipo        text not null check (tipo in ('pais', 'estado', 'cidade')),
  -- O nome como a pessoa escolheu na lista — o mesmo texto que o post guarda.
  valor       text not null,
  -- Guardado para desempatar cidade homônima ("Santiago" existe em vários
  -- países) sem precisar de uma segunda tabela.
  pais        text,
  created_at  timestamptz not null default now(),
  primary key (user_id, tipo, valor, pais)
);

create index if not exists seguindo_lugar_user_idx on seguindo_lugar (user_id);

-- ---------------------------------------------------------------------------
-- Seguir uma PESSOA
-- ---------------------------------------------------------------------------
--
-- SEGUIR AQUI É PRIVADO: ninguém descobre quem o segue, e não existe contagem
-- de seguidores em lugar nenhum.
--
-- Não é timidez de produto, é a única forma de ter "seguir" sem ter placar. No
-- minuto em que existe um número de seguidores visível, ele vira o objetivo, e
-- as pessoas passam a publicar para ele em vez de para quem está do outro lado
-- — o que mata justamente o que este aplicativo faz. Privado, seguir continua
-- sendo o que deveria ser: um filtro do SEU mural.
--
-- A chave primária composta faz "seguir duas vezes" ser uma operação só.
create table if not exists seguindo_pessoa (
  seguidor_id  uuid not null references users(id) on delete cascade,
  seguido_id   uuid not null references users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (seguidor_id, seguido_id),
  -- Seguir a si mesmo encheria o próprio mural com o próprio conteúdo.
  constraint nao_a_si_mesmo check (seguidor_id <> seguido_id)
);

create index if not exists seguindo_pessoa_seguidor_idx on seguindo_pessoa (seguidor_id);
