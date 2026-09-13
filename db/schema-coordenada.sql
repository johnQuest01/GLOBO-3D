-- A coordenada de quem escolheu o lugar.
--
-- POR QUE ELA PRECISA SER GUARDADA. Até aqui o app tinha só os NOMES do lugar
-- e adivinhava a coordenada procurando esses nomes no mapa do globo. Adivinhar
-- funciona quando os nomes batem — e eles quase nunca batem: a lista mostra
-- "Moscou", o mapa indexa "moscow city"; a lista mostra "Rússia", o mapa
-- indexa "Russia". Cada país é um caso, cada camada é outra chance de errar.
--
-- O sintoma no uso real: uma conta com Rússia e Moscou preenchidos apareceu na
-- Sibéria, a 6 mil km de casa — porque o nome da cidade não resolvia, o do
-- estado resolvia (o estado escolhido por engano numa lista longa), e o do país
-- nunca chegava a ser consultado.
--
-- A LISTA DE LUGARES JÁ TEM A COORDENADA. Ela vem junto de cada cidade e de
-- cada país. Guardar o que a pessoa escolheu, em vez de reconstruir depois a
-- partir do rótulo, elimina a adivinhação inteira — e com ela a classe de erro.

alter table users add column if not exists lat double precision;
alter table users add column if not exists lon double precision;
