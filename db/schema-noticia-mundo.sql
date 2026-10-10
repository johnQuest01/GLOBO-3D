-- A noticia passa a poder alcancar o MUNDO.
--
-- POR QUE FALTAVA. O alcance nasceu com tres camadas — cidade, estado, pais —
-- porque o produto era "noticia da minha regiao": um alagamento numa rua
-- interessa ao bairro, e quem mora longe nao deve receber a rua de ninguem.
-- A regra estava certa e continua.
--
-- O QUE ELA IMPEDIA, e so' ficou visivel agora: um terremoto, uma eleicao, um
-- carnaval — nada disso tinha como atravessar a fronteira. Num aplicativo que
-- se propoe a ser uma rede de NOTICIAS e de quem quer VIAJAR, a camada que
-- faltava era justamente a que da' sentido ao globo: o mundo inteiro.
--
-- MUNDO E' UMA ESCOLHA DE QUEM ESCREVE, como as outras tres. Ninguem promove
-- nada automaticamente para o mundo: quem publica diz ate' onde aquilo vale, e
-- responde por isso na mesma fila de moderacao.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'posts_alcance_valido') then
    alter table posts drop constraint posts_alcance_valido;
  end if;
  alter table posts
    add constraint posts_alcance_valido
    check (alcance is null or alcance in ('cidade', 'estado', 'pais', 'mundo'));
end $$;

-- A leitura do mundo pede os mais recentes de todos, sem filtro de regiao: um
-- indice por data cobre exatamente isso.
create index if not exists noticias_mundo_idx
  on posts (created_at desc)
  where tipo = 'noticia' and removido_em is null and oculto_em is null;
