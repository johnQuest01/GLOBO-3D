/**
 * O empurrão — o aviso que chega com o app fechado.
 *
 * POR QUE ELE PRECISA EXISTIR. Tudo o que este projeto faz de conversa depende
 * de um socket, e socket morre quando a aba fecha. Até aqui, a mensagem para
 * quem estava fora ficava guardada e esperava em silêncio: a pessoa só
 * descobria abrindo o site por conta própria. É a diferença entre um site de
 * conversa e um aplicativo de conversa.
 *
 * POR QUE ELE MORA NO SERVIDOR DE REALTIME e não no app Next: quem sabe se a
 * mensagem foi ENTREGUE é quem tentou entregar. Do lado do Next, decidir isso
 * exigiria perguntar ao realtime — e seria a mesma informação, com uma volta a
 * mais e uma chance a mais de errar.
 *
 * O QUE VAI DENTRO: quem mandou e de que tipo era. Nunca o texto. O empurrão
 * atravessa o servidor de push do Google, da Apple ou da Mozilla — é o único
 * caminho que existe para acordar um telefone —, e o conteúdo da conversa não
 * tem o que fazer lá. O texto continua no envelope cifrado, e só sai quando o
 * aparelho da pessoa se conecta e o pede.
 */

import webpush from 'web-push';

import { apagarInscricao, inscricoesDe } from './db.js';

let ligado = false;

export function pushLigado(): boolean {
  return ligado;
}

export function configurarPush(log: (...args: unknown[]) => void): void {
  const publica = process.env.VAPID_PUBLIC_KEY?.trim();
  const privada = process.env.VAPID_PRIVATE_KEY?.trim();
  const assunto = process.env.VAPID_SUBJECT?.trim() || 'mailto:contato@example.com';

  if (!publica || !privada) {
    log(
      '\x1b[33mSem VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY: aviso com o app fechado desligado.\x1b[0m',
    );
    return;
  }

  webpush.setVapidDetails(assunto, publica, privada);
  ligado = true;
  log('avisos com o app fechado LIGADOS (web push)');
}

/**
 * Avisa todos os aparelhos de uma conta.
 *
 * NÃO ESPERA A RESPOSTA de quem chamou — o `void` na chamada é de propósito. O
 * servidor de push de terceiro pode demorar segundos, e a entrega da mensagem
 * para quem está online não pode ficar atrás disso numa fila.
 */
export async function avisar(
  userId: string,
  aviso: { de: string; tipo: string },
  log: (...args: unknown[]) => void,
): Promise<void> {
  if (!ligado) return;

  const inscricoes = await inscricoesDe(userId);
  if (inscricoes.length === 0) return;

  const corpo = JSON.stringify(aviso);

  await Promise.all(
    inscricoes.map(async (i) => {
      try {
        await webpush.sendNotification(
          { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
          corpo,
          // Vale um dia. Mais que isso seria acordar alguém para avisar de uma
          // mensagem que ela já leu ontem no outro aparelho.
          { TTL: 60 * 60 * 24, urgency: 'high' },
        );
      } catch (e) {
        const status = (e as { statusCode?: number })?.statusCode;

        /*
         * 404 e 410 SÃO DEFINITIVOS: aquele aparelho não existe mais para o
         * servidor de push (app desinstalado, permissão revogada, inscrição
         * expirada). Apagar é o certo — tentar de novo para sempre encheria o
         * banco de endereços mortos e gastaria uma requisição por mensagem,
         * por endereço morto, para sempre.
         */
        if (status === 404 || status === 410) {
          await apagarInscricao(i.endpoint);
          log(`push   inscricao morta removida (${status})`);
          return;
        }
        log(`push   falhou (${status ?? 'sem status'})`);
      }
    }),
  );
}
