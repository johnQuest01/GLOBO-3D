/**
 * Repasse de sinalização — e nada além disso.
 *
 * Aqui passam SDP e candidatos ICE, que são o "como eu te acho" de cada lado.
 * O servidor NÃO abre o campo `data`, não guarda, não registra em log. Ele
 * copia de um socket para o outro.
 *
 * É por isso que o chat é ponta a ponta de verdade: depois deste aperto de
 * mão, o texto, a imagem e o vídeo vão direto de navegador para navegador. O
 * servidor não tem o que entregar a quem pedir, porque nunca teve.
 *
 * O ÚNICO CONTROLE: os dois sockets precisam ter sido apresentados
 * (matchmaking.ts registrou o par). Repasse cego para qualquer socketId
 * deixaria qualquer pessoa despejar tráfego na conexão de qualquer outra —
 * seria o broadcast que o projeto inteiro evita, entrando pela porta dos
 * fundos.
 */

import type { RealtimeServer, RealtimeSocket } from './presence.js';

export function registerSignaling(
  io: RealtimeServer,
  socket: RealtimeSocket,
  log: (...args: unknown[]) => void,
): void {
  socket.on('signal', ({ toSocketId, data }) => {
    if (typeof toSocketId !== 'string' || !toSocketId) return;

    // Sem apresentação, sem repasse.
    if (!socket.data.peers?.has(toSocketId)) return;

    io.to(toSocketId).emit('signal', { fromSocketId: socket.id, data });
  });

  socket.on('peer:hangup', ({ peerSocketId }) => {
    if (typeof peerSocketId !== 'string' || !peerSocketId) return;
    if (!socket.data.peers?.has(peerSocketId)) return;

    socket.data.peers.delete(peerSocketId);
    io.to(peerSocketId).emit('peer:disconnected', { peerSocketId: socket.id });
    log(`hangup ${socket.id} -x- ${peerSocketId}`);
  });

  socket.on('disconnect', async () => {
    const peers = socket.data.peers;
    if (!peers || peers.size === 0) return;

    // Avisa quem estava conversando. Sem isto, o outro lado ficaria com um
    // painel de chat aberto e um arco desenhado no globo para uma pessoa que
    // já foi embora.
    for (const peerSocketId of peers) {
      io.to(peerSocketId).emit('peer:disconnected', { peerSocketId: socket.id });
      // Tira o par do outro lado também, senão ele continuaria autorizado a
      // sinalizar para um socket que não existe mais.
      const outros = await io.in(peerSocketId).fetchSockets();
      outros[0]?.data.peers?.delete(socket.id);
    }
    peers.clear();
  });
}
