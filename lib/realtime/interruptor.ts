/**
 * O INTERRUPTOR DO TEMPO REAL — conversa, presença e sinais.
 *
 * POR QUE ELE EXISTE. O tempo real é a única parte deste projeto que custa
 * dinheiro PARADA. O resto desce a zero sozinho quando ninguém está usando:
 * a Vercel só cobra por requisição, o Neon dorme, e os bytes de vídeo nunca
 * passam por servidor nenhum — vão do celular direto para o R2. Já o socket
 * exige um processo ligado vinte e quatro horas, todo dia, mesmo numa
 * madrugada sem ninguém online.
 *
 * E havia um agravante medido: a conexão abria para TODO visitante assim que o
 * globo carregava, antes de qualquer conversa. Numa rede de notícias a imensa
 * maioria das pessoas só lê — elas seguravam uma conexão que nunca usariam.
 *
 * O QUE ESTE ARQUIVO NÃO É: uma remoção. Nenhuma linha de lógica foi apagada.
 * O servidor em `realtime/`, o protocolo, as telas de conversa, a presença no
 * globo, os sinais — está tudo inteiro, compilando e coberto pelos testes, que
 * continuam passando porque falam com o servidor diretamente. O que mudou é
 * que o aplicativo não ABRE a conexão e não OFERECE as telas que dependem
 * dela.
 *
 * PARA LIGAR DE VOLTA: troque para `true` aqui, confirme que
 * `NEXT_PUBLIC_REALTIME_URL` aponta para o servidor e que a máquina do Fly
 * está de pé (`fly scale count 1`). Nada além disto.
 */
export const CHAT_LIGADO = false;
