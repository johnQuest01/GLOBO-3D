/**
 * Apresentação de duas pessoas — o "opt-in" do sistema.
 *
 * A ordem importa e é o que impede spam: A vê o beacon de B, A PEDE, B ACEITA.
 * Sem o aceite não existe canal, e sem canal não trafega uma letra sequer. É o
 * oposto de "mandar mensagem para quem estiver perto".
 *
 * O QUE SAI NO ACEITE: o socketId do outro, a lista de servidores ICE, e quem
 * é `polite`. Esse último é o detalhe que evita o problema clássico do WebRTC:
 * se os dois lados criarem uma oferta ao mesmo tempo ("glare"), a negociação
 * trava. Na negociação perfeita, um dos lados cede — e quem cede tem que ser
 * decidido por alguém de fora, senão os dois cedem ou nenhum cede. Esse alguém
 * é este servidor.
 */

import { randomUUID } from 'node:crypto';

import type { IceServer } from '../shared/protocol.js';
import { ErrorCode } from '../shared/protocol.js';
import type { RealtimeServer, RealtimeSocket } from './presence.js';
import { permitir, type Limitador } from './safety.js';
import type { PresenceStore } from './store.js';

/** Um convite que ninguém respondeu não fica pendurado para sempre. */
const REQUEST_TTL_SEC = 60;

/**
 * Servidores ICE, montados a partir do ambiente. NUNCA no código.
 *
 * STUN só descobre o endereço público de cada lado; ele não carrega mídia.
 * Quando os dois estão atrás de NAT que não deixa a conexão direta acontecer
 * — o caso comum em rede de celular com CGNAT — é o TURN que retransmite. Sem
 * TURN configurado, uma parte real das conexões simplesmente não fecha, e o
 * sintoma é um chat que "às vezes não conecta".
 */
export function iceServersDoAmbiente(): IceServer[] {
  const lista: IceServer[] = [];

  const stun = process.env.STUN_URL?.trim();
  if (stun) lista.push({ urls: stun });

  const turn = process.env.TURN_URL?.trim();
  const user = process.env.TURN_USER?.trim();
  const cred = process.env.TURN_CRED?.trim();
  if (turn && user && cred) {
    lista.push({ urls: turn, username: user, credential: cred });
  }

  return lista;
}

export function avisarSeFaltaTurn(log: (...a: unknown[]) => void): void {
  const temTurn = Boolean(process.env.TURN_URL?.trim());
  if (!temTurn) {
    log(
      '\x1b[33mSem TURN_URL: conexoes atras de NAT restrito (celular/CGNAT) vao falhar.\x1b[0m',
    );
  }
}

export function registerMatchmaking(
  io: RealtimeServer,
  socket: RealtimeSocket,
  store: PresenceStore,
  limitador: Limitador,
  log: (...args: unknown[]) => void,
): void {
  socket.on('connect:request', async ({ targetClientId }) => {
    const meuClientId = socket.data.clientId;
    if (!meuClientId) {
      socket.emit('error', {
        code: ErrorCode.NOT_JOINED,
        message: 'connect:request antes de presence:join.',
      });
      return;
    }

    if (typeof targetClientId !== 'string' || !targetClientId) {
      socket.emit('error', {
        code: ErrorCode.BAD_PAYLOAD,
        message: 'connect:request precisa de targetClientId.',
      });
      return;
    }

    if (targetClientId === meuClientId) return;
    if (!permitir(socket, limitador, 'connect:request')) return;

    // Bloqueio vale antes de qualquer coisa, e nos dois sentidos.
    if (await store.isBlocked(meuClientId, targetClientId)) {
      // A resposta é a mesma de "pessoa indisponível", de propósito: dizer
      // "você foi bloqueado" entrega ao incômodo a informação que ele quer.
      socket.emit('connect:declined', { requestId: '' });
      return;
    }

    const alvoSocketId = await store.socketOfClient(targetClientId);
    if (!alvoSocketId) {
      socket.emit('connect:declined', { requestId: '' });
      return;
    }

    const requestId = randomUUID();
    await store.putRequest(
      {
        requestId,
        fromSocketId: socket.id,
        fromClientId: meuClientId,
        toSocketId: alvoSocketId,
        toClientId: targetClientId,
      },
      REQUEST_TTL_SEC,
    );

    // `io.to(socketId)` alcança a conexão mesmo em outra instância, porque o
    // adapter do Redis está no meio.
    io.to(alvoSocketId).emit('connect:incoming', {
      requestId,
      fromClientId: meuClientId,
      ...(socket.data.presence?.name ? { fromName: socket.data.presence.name } : {}),
    });

    log(`pedido ${requestId.slice(0, 8)}: ${meuClientId} -> ${targetClientId}`);
  });

  socket.on('connect:accept', async ({ requestId }) => {
    if (typeof requestId !== 'string' || !requestId) return;

    // `take` lê e apaga: aceitar duas vezes o mesmo convite não cria duas
    // conexões.
    const req = await store.takeRequest(requestId);
    if (!req) {
      socket.emit('error', {
        code: ErrorCode.BAD_PAYLOAD,
        message: 'Convite expirado ou ja respondido.',
      });
      return;
    }

    // Só quem recebeu o convite pode aceitá-lo. Sem esta checagem, conhecer um
    // requestId bastaria para forçar uma conexão entre terceiros.
    if (req.toSocketId !== socket.id) return;

    if (await store.isBlocked(req.fromClientId, req.toClientId)) return;

    const iceServers = iceServersDoAmbiente();

    // O par é registrado nos dois lados: é o que autoriza a sinalização
    // seguinte (ver signaling.ts). Sem isso, qualquer socket poderia mandar
    // SDP para qualquer outro.
    socket.data.peers = socket.data.peers ?? new Set();
    socket.data.peers.add(req.fromSocketId);

    const sockets = await io.in(req.fromSocketId).fetchSockets();
    const solicitante = sockets[0];
    if (!solicitante) {
      socket.emit('error', {
        code: ErrorCode.BAD_PAYLOAD,
        message: 'A outra pessoa saiu antes do aceite.',
      });
      return;
    }
    solicitante.data.peers = solicitante.data.peers ?? new Set();
    solicitante.data.peers.add(socket.id);

    // QUEM CEDE: quem convidou. É arbitrário, e ser arbitrário é o ponto —
    // basta que os dois recebam papéis OPOSTOS, decididos por um terceiro.
    io.to(req.fromSocketId).emit('connect:accepted', {
      requestId,
      peerSocketId: socket.id,
      polite: true,
      iceServers,
    });
    socket.emit('connect:accepted', {
      requestId,
      peerSocketId: req.fromSocketId,
      polite: false,
      iceServers,
    });

    log(
      `aceito ${requestId.slice(0, 8)}: ${req.fromClientId} <-> ${req.toClientId} (${iceServers.length} servidor(es) ICE)`,
    );
  });

  socket.on('connect:decline', async ({ requestId }) => {
    if (typeof requestId !== 'string' || !requestId) return;
    const req = await store.takeRequest(requestId);
    if (!req || req.toSocketId !== socket.id) return;
    io.to(req.fromSocketId).emit('connect:declined', { requestId });
    log(`recusado ${requestId.slice(0, 8)}`);
  });
}
