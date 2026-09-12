/**
 * Cliente de teste do realtime — sem navegador.
 *
 * Serve para provar o servidor sozinho: presença, beacons, o aperto de mão de
 * conexão e o repasse de sinalização. O que ele NÃO faz é WebRTC — isso exige
 * navegador, e é validado no front.
 *
 *   npm run probe -- --name Ana
 *   npm run probe -- --name Bruno --beacon "quero conversar" --auto-accept
 *   npm run probe -- --name Ana --connect probe-Bruno --signal-test
 *   npm run probe -- --name Spam --flood-beacon 6
 *   npm run probe -- --name Ana --block probe-Bruno
 *   npm run probe -- --name Ana --nick ana_mg
 *   npm run probe -- --name Bruno --nick bruno --find ana_mg --connect-found
 */

import { io, type Socket } from 'socket.io-client';

import type { ClientToServer, ServerToClient } from '../shared/protocol.js';
import { HEARTBEAT_INTERVAL_MS } from '../shared/protocol.js';

function arg(nome: string, padrao: string): string {
  const i = process.argv.indexOf(`--${nome}`);
  return i !== -1 && process.argv[i + 1] ? String(process.argv[i + 1]) : padrao;
}
const temFlag = (nome: string) => process.argv.includes(`--${nome}`);

const URL = arg('url', process.env.REALTIME_URL ?? 'http://localhost:8080');
const NOME = arg('name', `probe-${Math.random().toString(36).slice(2, 6)}`);
const REGIAO = arg('region', 'são paulo');
const LAT = Number(arg('lat', '-23.55'));
const LON = Number(arg('lon', '-46.63'));
const CLIENT_ID = arg('client', `probe-${NOME}`);
/** O nome publico. Sem ele, este probe aparece no globo mas nao e encontravel. */
const NICK = arg('nick', '').trim().toLowerCase();

const BEACON = arg('beacon', '');
const BEACON_TTL = Number(arg('beacon-ttl', '300'));
const CONECTAR = arg('connect', '');
const BLOQUEAR = arg('block', '');
const DENUNCIAR = arg('report', '');
const FLOOD = Number(arg('flood-beacon', '0'));
const AUTO_ACEITA = temFlag('auto-accept');
const AUTO_RECUSA = temFlag('auto-decline');
const TESTE_SINAL = temFlag('signal-test');
const PROCURAR = arg('find', '').trim().toLowerCase();
/** Achou pelo nickname? Ja pede conexao — o caminho inteiro da lupa num comando. */
const CONECTAR_ACHADO = temFlag('connect-found');

const hora = () => new Date().toISOString().slice(11, 19);
const log = (...a: unknown[]) => console.log(hora(), `[${NOME}]`, ...a);

const socket: Socket<ServerToClient, ClientToServer> = io(URL, {
  transports: ['websocket'],
});

/** Com quem estamos pareados, para o teste de sinalização. */
let peerSocketId = '';

socket.on('connect', () => {
  log(`conectado (socketId=${socket.id})`);
  socket.emit('presence:join', {
    clientId: CLIENT_ID,
    lat: LAT,
    lon: LON,
    regionKey: REGIAO,
    name: NOME,
    /*
     * DE PROPOSITO um campo que o protocolo nao declara mais.
     *
     * Ate a Fase G o servidor aceitava o nickname daqui, e era assim que
     * qualquer um aparecia na busca no lugar de outra pessoa. O probe continua
     * mandando — com uma conversao de tipo explicita, para nao dar a impressao
     * de que isto e' suportado — porque e' exatamente o ataque que o teste
     * precisa reproduzir: `npm run probe -- --nick alguem` NAO pode mais
     * roubar o nome de ninguem.
     */
    ...(NICK ? ({ nickname: NICK } as Record<string, string>) : {}),
  } as Parameters<ClientToServer['presence:join']>[0]);

  if (PROCURAR) {
    // Espera o join ser processado: procurar antes dele e' NOT_JOINED.
    setTimeout(() => {
      socket.emit('directory:find', { nicknames: [PROCURAR] });
      log(`procurando "${PROCURAR}"`);
    }, 300);
  }

  if (BLOQUEAR) {
    socket.emit('block', { targetClientId: BLOQUEAR });
    log(`bloqueei ${BLOQUEAR}`);
  }
  if (DENUNCIAR) {
    socket.emit('report', { targetClientId: DENUNCIAR, reason: 'teste automatizado' });
    log(`denunciei ${DENUNCIAR}`);
  }

  if (BEACON) {
    socket.emit('beacon:raise', { topic: BEACON, ttlSec: BEACON_TTL });
    log(`acendi beacon: "${BEACON}" por ${BEACON_TTL}s`);
  }

  if (FLOOD > 0) {
    log(`disparando ${FLOOD} beacons seguidos para testar o limite`);
    for (let i = 0; i < FLOOD; i++) {
      socket.emit('beacon:raise', { topic: `flood ${i + 1}`, ttlSec: 120 });
    }
  }

  if (CONECTAR) {
    // Espera o snapshot chegar antes de pedir: assim o alvo já está registrado.
    setTimeout(() => {
      socket.emit('connect:request', { targetClientId: CONECTAR });
      log(`pedi conexao a ${CONECTAR}`);
    }, 400);
  }
});

// --- Presença ---------------------------------------------------------------

socket.on('presence:snapshot', ({ presences, beacons }) => {
  log(
    `snapshot: ${presences.length} presenca(s) ->`,
    presences.map((p) => p.name ?? p.clientId).join(', ') || '(vazio)',
    `| ${beacons.length} beacon(s)`,
    beacons.map((b) => `${b.clientId}${b.topic ? `:"${b.topic}"` : ''}`).join(', '),
  );
});

socket.on('presence:update', ({ kind, presence }) => {
  log(`update: ${kind} -> ${presence.name ?? presence.clientId}`);
});

// --- Diretorio (a lupa) -----------------------------------------------------

socket.on('directory:result', ({ encontrados }) => {
  for (const { nickname, presence } of encontrados) {
    if (!presence) {
      log(`busca "${nickname}": nao esta online agora`);
      continue;
    }
    log(
      `busca "${nickname}": ONLINE em ${presence.regionKey} ` +
        `(lat ${presence.lat}, lon ${presence.lon}) clientId=${presence.clientId}`,
    );
    if (CONECTAR_ACHADO) {
      socket.emit('connect:request', { targetClientId: presence.clientId });
      log(`  pedi conexao a ${presence.clientId}`);
    }
  }
});

// --- Beacons ----------------------------------------------------------------

socket.on('beacon:new', (b) => {
  log(
    `beacon:new de ${b.clientId}${b.topic ? ` ("${b.topic}")` : ''} expira em ${Math.round((b.expiresAt - Date.now()) / 1000)}s`,
  );
});

socket.on('beacon:gone', ({ beaconId }) => {
  log(`beacon:gone ${beaconId.slice(0, 8)}`);
});

// --- Conexão ----------------------------------------------------------------

socket.on('connect:incoming', ({ requestId, fromClientId, fromName }) => {
  log(`CONVITE de ${fromName ?? fromClientId} (${requestId.slice(0, 8)})`);
  if (AUTO_RECUSA) {
    socket.emit('connect:decline', { requestId });
    log('recusei');
  } else if (AUTO_ACEITA) {
    socket.emit('connect:accept', { requestId });
    log('aceitei');
  }
});

socket.on('connect:accepted', ({ requestId, peerSocketId: peer, polite, iceServers }) => {
  peerSocketId = peer;
  log(
    `ACEITO ${requestId.slice(0, 8)} | par=${peer.slice(0, 8)} | polite=${polite} | iceServers=${iceServers.length}`,
  );
  if (iceServers.length === 0) {
    log('  ATENCAO: nenhum servidor ICE veio do ambiente (STUN_URL/TURN_URL vazios)');
  }

  if (TESTE_SINAL) {
    // Não é WebRTC de verdade: é só uma carga qualquer, para provar que o
    // servidor repassa sem olhar o conteúdo.
    socket.emit('signal', {
      toSocketId: peer,
      data: { tipo: 'ola-do-teste', de: NOME, quando: Date.now() },
    });
    log('  enviei um sinal de teste');
  }
});

socket.on('connect:declined', ({ requestId }) => {
  log(`RECUSADO/indisponivel ${requestId ? requestId.slice(0, 8) : '(sem id)'}`);
});

socket.on('signal', ({ fromSocketId, data }) => {
  log(`SINAL recebido de ${fromSocketId.slice(0, 8)}:`, JSON.stringify(data));
  // Devolve uma vez, para provar o caminho de volta.
  const carga = data as { tipo?: string };
  if (TESTE_SINAL && carga?.tipo === 'ola-do-teste') {
    socket.emit('signal', {
      toSocketId: fromSocketId,
      data: { tipo: 'resposta-do-teste', de: NOME },
    });
    log('  respondi o sinal');
  }
});

socket.on('peer:disconnected', ({ peerSocketId: quem }) => {
  log(`par desconectado: ${quem.slice(0, 8)}`);
});

// --- Segurança --------------------------------------------------------------

socket.on('rate_limited', ({ action, retryAfterMs }) => {
  log(`LIMITADO em "${action}" — tente em ${Math.ceil(retryAfterMs / 1000)}s`);
});

socket.on('error', ({ code, message }) => log(`ERRO ${code}: ${message}`));
socket.on('disconnect', (motivo) => log(`desconectado (${motivo})`));
socket.on('connect_error', (e) => log(`falha ao conectar: ${e.message}`));

const batida = setInterval(() => {
  if (socket.connected) socket.emit('presence:heartbeat');
}, HEARTBEAT_INTERVAL_MS);

process.on('SIGINT', () => {
  log('saindo');
  clearInterval(batida);
  if (peerSocketId) socket.emit('peer:hangup', { peerSocketId });
  socket.emit('presence:leave');
  socket.close();
  setTimeout(() => process.exit(0), 200);
});
