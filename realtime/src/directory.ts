/**
 * A lupa: "onde está fulano agora?"
 *
 * POR QUE ISTO NÃO É UMA CONSULTA AO BANCO. O Neon sabe quem existe e em que
 * cidade a pessoa disse morar; ele não sabe — e não deve saber — quem está com
 * a aba aberta neste segundo, nem em que ponto do globo desenhar o pino.
 * Presença muda a cada 15 segundos. Gravar isso numa tabela seria uma escrita
 * por pessoa por heartbeat, para um dado que não sobrevive ao próximo minuto.
 *
 * Então a busca tem DUAS metades, e a interface junta as duas:
 *   - `/api/users/search` (Next + Neon): quem EXISTE com esse começo de nome.
 *   - `directory:find` (aqui): dessa pessoa, ela está ONLINE e onde.
 *
 * O QUE ISTO NÃO DEVOLVE: nada além da presença que a própria pessoa publicou
 * ao entrar. Sem e-mail, sem IP, sem socketId. O socketId fica de fora de
 * propósito — quem o tem pode tentar sinalizar direto; é o matchmaking que
 * decide isso, depois do aceite.
 */

import type { Presence } from '../shared/protocol.js';
import { DIRECTORY_MAX_POR_BUSCA, ErrorCode } from '../shared/protocol.js';
import type { RealtimeServer, RealtimeSocket } from './presence.js';
import { permitir, type Limitador } from './safety.js';
import type { PresenceStore } from './store.js';

const NICK_MAX = 20;

export function registerDirectory(
  _io: RealtimeServer,
  socket: RealtimeSocket,
  store: PresenceStore,
  limitador: Limitador,
  log: (...args: unknown[]) => void,
): void {
  socket.on('directory:find', async ({ nicknames }) => {
    if (!Array.isArray(nicknames) || nicknames.length === 0) {
      socket.emit('error', {
        code: ErrorCode.BAD_PAYLOAD,
        message: 'directory:find precisa de uma lista de nicknames.',
      });
      return;
    }

    // Precisa ter entrado antes. Sem isto, uma conexao que nunca se
    // identificou poderia varrer o diretorio inteiro sem nunca aparecer nele.
    const meuClientId = socket.data.clientId;
    if (!meuClientId) {
      socket.emit('error', {
        code: ErrorCode.NOT_JOINED,
        message: 'directory:find antes de presence:join.',
      });
      return;
    }

    if (!permitir(socket, limitador, 'directory:find')) return;

    // Corta o excesso em vez de recusar o pedido inteiro: quem manda 50 nomes
    // recebe os 10 primeiros, e nao um erro que a interface teria que tratar.
    const alvos = [
      ...new Set(
        nicknames
          .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
          .map((n) => n.trim().toLowerCase().slice(0, NICK_MAX)),
      ),
    ].slice(0, DIRECTORY_MAX_POR_BUSCA);

    const encontrados: { nickname: string; presence: Presence | null }[] = [];

    for (const alvo of alvos) {
      const clientId = await store.clientOfNickname(alvo);

      // Nao encontrado e bloqueado respondem IGUAL, de proposito: uma resposta
      // diferente para "existe mas te bloqueou" entrega ao incomodo exatamente
      // a informacao que ele quer.
      if (!clientId || (await store.isBlocked(meuClientId, clientId))) {
        encontrados.push({ nickname: alvo, presence: null });
        continue;
      }

      const socketId = await store.socketOfClient(clientId);
      const presence = socketId ? await store.getPresence(socketId) : null;
      encontrados.push({ nickname: alvo, presence });
    }

    socket.emit('directory:result', { encontrados });
    log(
      `find   ${meuClientId} -> ${alvos.join(', ')} ` +
        `(${encontrados.filter((e) => e.presence).length} online)`,
    );
  });
}
