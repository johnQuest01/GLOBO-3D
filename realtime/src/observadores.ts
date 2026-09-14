/**
 * "Me avise quando fulano entrar ou sair."
 *
 * O PROBLEMA QUE ISTO RESOLVE foi relatado do celular: a bolinha verde da
 * conversa demorava, e a pessoa recarregava a página para ver o outro online.
 * Duas causas, e este arquivo trata as duas.
 *
 * A PRIMEIRA: "online" era PERGUNTADO, não avisado. O aparelho consultava o
 * diretório a cada dez segundos enquanto a conversa estava aberta — dez
 * segundos de atraso no melhor caso, e nada quando a lista estava fechada.
 * Agora o aparelho diz uma vez quem quer observar, e o servidor avisa no
 * instante em que qualquer uma dessas contas conecta ou desconecta.
 *
 * A SEGUNDA: "online" queria dizer "desenhado no globo". A resposta do
 * diretório era a presença — a coordenada —, e quem estava conectado SEM
 * coordenada (entrou pelo Google e ainda não disse a cidade; mora num lugar
 * que o mapa não conhece) aparecia offline, recebendo mensagens ao vivo. Para
 * a conversa, online é "tem um socket vivo nesta conta". A coordenada vai
 * junto quando existe, para o pino do globo — mas não decide a cor.
 *
 * COMO É FEITO: uma sala por conta observada. Sala é a primitiva que já
 * atravessa as instâncias do servidor (o adaptador do Redis a replica), então
 * quem observa numa máquina recebe o aviso de uma conexão que aconteceu em
 * outra.
 */

import type { Presence } from '../shared/protocol.js';
import { userIdDoNickname } from './db.js';
import type { RealtimeServer, RealtimeSocket } from './presence.js';
import { permitir, type Limitador } from './safety.js';

/** A sala de todas as conexões de uma conta. É por ela que a caixa postal entrega. */
export const salaDaConta = (userId: string) => `conta:${userId}`;

/** A sala de quem quer saber quando esta conta entra ou sai. */
const salaDeObservadores = (userId: string) => `watch:${userId}`;

/** Teto de contas observadas por conexão: os contatos mais recentes cabem folgados. */
const OBSERVADOS_MAX = 30;

/**
 * A conta está online, e onde?
 *
 * Online = pelo menos uma conexão viva na sala da conta, em QUALQUER
 * instância — `fetchSockets` atravessa o adaptador. A presença sai da
 * primeira conexão que tiver uma: a pessoa pode estar no celular sem
 * coordenada e no computador com ela, e a coordenada é o que interessa ao
 * globo.
 */
export async function estadoDaConta(
  io: RealtimeServer,
  userId: string,
): Promise<{ online: boolean; presence: Presence | null }> {
  const conexoes = await io.in(salaDaConta(userId)).fetchSockets();
  const comPresenca = conexoes.find((c) => c.data.presence);
  return {
    online: conexoes.length > 0,
    presence: comPresenca?.data.presence ?? null,
  };
}

/** Manda o estado de uma conta para quem a observa. */
export function avisarObservadores(
  io: RealtimeServer,
  userId: string,
  nickname: string,
  online: boolean,
  presence: Presence | null,
): void {
  io.to(salaDeObservadores(userId)).emit('presence:changed', { nickname, online, presence });
}

export function registerObservadores(
  io: RealtimeServer,
  socket: RealtimeSocket,
  limitador: Limitador,
  log: (...args: unknown[]) => void,
): void {
  /**
   * O pedido SUBSTITUI a lista anterior — não acrescenta.
   *
   * Assim a interface manda "estas são as conversas na tela" sempre que a
   * tela muda, sem ter que lembrar do que pediu antes para desfazer. E uma
   * conexão nunca acumula observações de conversas que já fechou.
   */
  socket.on('presence:watch', async ({ nicknames }) => {
    if (!Array.isArray(nicknames)) return;
    if (!permitir(socket, limitador, 'presence:watch')) return;

    const anteriores = socket.data.observando ?? [];
    for (const userId of anteriores) void socket.leave(salaDeObservadores(userId));

    const alvos = [
      ...new Set(
        nicknames
          .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
          .map((n) => n.trim().toLowerCase()),
      ),
    ].slice(0, OBSERVADOS_MAX);

    const observando: string[] = [];
    for (const nick of alvos) {
      const userId = await userIdDoNickname(nick);
      // Conta que não existe: responde offline em vez de silêncio, para a
      // interface não ficar esperando um aviso que nunca vem.
      if (!userId) {
        socket.emit('presence:changed', { nickname: nick, online: false, presence: null });
        continue;
      }
      await socket.join(salaDeObservadores(userId));
      observando.push(userId);

      // O estado de AGORA sai na hora: observar sem a resposta imediata
      // deixaria a bolinha cinza até a próxima mudança, que pode demorar.
      const estado = await estadoDaConta(io, userId);
      socket.emit('presence:changed', { nickname: nick, ...estado });
    }
    socket.data.observando = observando;

    if (observando.length > 0) log(`watch  ${socket.id} observa ${observando.length} conta(s)`);
  });
}
