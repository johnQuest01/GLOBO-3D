-- O que a atencao das pessoas deixa em cada publicacao.
--
-- ESTAS DUAS COLUNAS SAO O COMBUSTIVEL DO FEED "PARA VOCE". Um feed que
-- otimiza tempo de tela precisa saber, por publicacao, quanto tempo ela
-- segurou quem passou por ela. Contar isso na hora de ler seria somar a
-- tabela de eventos inteira a cada abertura do feed — o mesmo erro que as
-- curtidas evitam com o contador na linha. Entao o contador mora aqui, e
-- quem escreve e' a rota de eventos, em lote.
--
-- `vistas` conta quantas vezes a publicacao ficou na tela por mais de um
-- segundo; `tempo_visto_seg` soma o tempo. A razao entre os dois — tempo
-- medio por vista — e' o sinal mais forte que existe de "isto prende".

alter table posts add column if not exists vistas          int              not null default 0;
alter table posts add column if not exists tempo_visto_seg double precision not null default 0;

-- Para o ranking achar rapido o que esta' prendendo agora.
create index if not exists posts_atencao_idx
  on posts (created_at desc)
  where removido_em is null and oculto_em is null and tipo = 'mural';
