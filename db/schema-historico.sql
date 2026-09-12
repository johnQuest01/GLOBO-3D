-- O histórico passa a viver no servidor.
--
-- O QUE MUDA, E POR QUE. Até aqui o servidor apagava a mensagem no instante em
-- que o aparelho confirmava o recebimento. Era a promessa mais forte do
-- projeto — "entregue é apagado" — e ela cobrava um preço que só apareceu no
-- uso com dois aparelhos: o que você manda do celular não existe no
-- computador, e o que chega é entregue a UM aparelho, que confirma e faz o
-- servidor apagar antes de o outro ver.
--
-- A escolha foi trocar aquela promessa por esta: a conversa acompanha a CONTA,
-- e não o aparelho. Quem entrar na conta em qualquer lugar vê o mesmo
-- histórico. O conteúdo continua cifrado aqui dentro (ver cofre.ts) e continua
-- tendo prazo para morrer — o que deixa de existir é a exclusão imediata.
--
-- A TABELA É A MESMA de antes, e isso é de propósito: as mensagens que estavam
-- esperando entrega continuam valendo, sem migração e sem um segundo sistema
-- vivendo ao lado do primeiro.

-- Quando o aparelho do destinatário confirmou. Nulo = ainda não chegou a
-- nenhum. É o que vira o segundo tique, e o que antes era representado pela
-- ausência da linha.
alter table envelopes add column if not exists delivered_at timestamptz;

-- Quando ele abriu a conversa. Vira o tique azul — e agora sobrevive ao
-- recarregar, porque não depende mais de os dois estarem online no momento.
alter table envelopes add column if not exists read_at timestamptz;

-- "O que mudou desde a última vez que este aparelho sincronizou?" é a única
-- consulta nova, e ela é feita nos dois sentidos: as que recebi e as que
-- mandei. Dois índices, um para cada lado.
create index if not exists envelopes_para_desde_idx
  on envelopes (to_user_id, created_at);

create index if not exists envelopes_de_desde_idx
  on envelopes (from_user_id, created_at);
