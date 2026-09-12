/**
 * Quem é quem, do lado do servidor de realtime.
 *
 * Este servidor não tem cookie de sessão nem banco de contas. Ele recebe, no
 * aperto de mão do socket, um token curto assinado pelo app Next (que tem os
 * dois) e confere a assinatura. Se bater, a conexão passa a ter dono.
 *
 * ANÔNIMO CONTINUA ENTRANDO. Sem token, o socket conecta do mesmo jeito — só
 * que sem `userId`. Ele aparece no globo, não consegue reivindicar um nickname
 * e não tem caixa postal. Recusar a conexão seria transformar um recurso
 * opcional em exigência de login para ver o planeta girar.
 *
 * O TOKEN VENCE EM MINUTOS, mas a conexão dura horas. Isso é de propósito e não
 * é contradição: ele é um crachá de ENTRADA. Uma vez verificado, a identidade
 * vive na conexão; quando a conexão cai, o cliente pega um token novo para
 * reconectar. Token curto encurta a janela em que um vazado serve para alguma
 * coisa, sem obrigar ninguém a reconectar de cinco em cinco minutos.
 */

import { verifyRealtimeToken } from '../shared/token.js';
import type { RealtimeServer, RealtimeSocket } from './presence.js';

export function registerAuth(
  io: RealtimeServer,
  log: (...args: unknown[]) => void,
): void {
  const segredo = process.env.REALTIME_TOKEN_SECRET?.trim();

  if (!segredo || segredo.length < 32) {
    log(
      '\x1b[33mSem REALTIME_TOKEN_SECRET: ninguem consegue se identificar.\x1b[0m',
    );
    log(
      '\x1b[33m  A busca por nickname e a caixa postal ficam desligadas; o globo funciona.\x1b[0m',
    );
    return;
  }

  io.use((socket, next) => {
    // `auth` é o campo do aperto de mão do Socket.io. Não é cabeçalho HTTP de
    // propósito: no WebSocket o navegador não deixa definir cabeçalho.
    const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
    const crachá = verifyRealtimeToken(token, segredo);

    if (crachá) {
      socket.data.userId = crachá.uid;
      socket.data.nickname = crachá.nick;
    }

    // Token inválido não derruba a conexão: ela segue anônima. Derrubar faria
    // uma sessão vencida virar tela quebrada em vez de globo funcionando.
    next();
  });
}

/** Atalho para os handlers: quem não tem conta não usa o que exige conta. */
export function exigirConta(socket: RealtimeSocket): string | null {
  return socket.data.userId ?? null;
}
