/**
 * Cliente de teste da Fase 1 — sem front, sem navegador.
 *
 * Abre uma conexão, entra numa região e bate heartbeat, imprimindo tudo que o
 * servidor manda. Rode em dois terminais para ver um aparecer no snapshot do
 * outro, e feche um para ver o `presence:update` de saída chegar no que ficou.
 *
 *   npm run probe -- --name Ana
 *   npm run probe -- --name Bruno --region "minas gerais" --lat -19.9 --lon -43.9
 */

import { io, type Socket } from 'socket.io-client';

import type {
  ClientToServer,
  ServerToClient,
} from '../shared/protocol.js';
import { HEARTBEAT_INTERVAL_MS } from '../shared/protocol.js';

function arg(nome: string, padrao: string): string {
  const i = process.argv.indexOf(`--${nome}`);
  return i !== -1 && process.argv[i + 1] ? String(process.argv[i + 1]) : padrao;
}

const URL = arg('url', process.env.REALTIME_URL ?? 'http://localhost:8080');
const NOME = arg('name', `probe-${Math.random().toString(36).slice(2, 6)}`);
const REGIAO = arg('region', 'são paulo');
const LAT = Number(arg('lat', '-23.55'));
const LON = Number(arg('lon', '-46.63'));
const CLIENT_ID = arg('client', `probe-${NOME}`);

const hora = () => new Date().toISOString().slice(11, 19);
const log = (...a: unknown[]) => console.log(hora(), `[${NOME}]`, ...a);

const socket: Socket<ServerToClient, ClientToServer> = io(URL, {
  transports: ['websocket'],
});

socket.on('connect', () => {
  log(`conectado (socketId=${socket.id})`);
  socket.emit('presence:join', {
    clientId: CLIENT_ID,
    lat: LAT,
    lon: LON,
    regionKey: REGIAO,
    name: NOME,
  });
});

socket.on('presence:snapshot', ({ presences, beacons }) => {
  log(
    `snapshot: ${presences.length} presenca(s) em "${REGIAO}" ->`,
    presences.map((p) => p.name ?? p.clientId).join(', ') || '(vazio)',
    `| ${beacons.length} beacon(s)`,
  );
});

socket.on('presence:update', ({ kind, presence }) => {
  log(`update: ${kind} -> ${presence.name ?? presence.clientId} (${presence.regionKey})`);
});

socket.on('error', ({ code, message }) => log(`ERRO ${code}: ${message}`));
socket.on('disconnect', (motivo) => log(`desconectado (${motivo})`));
socket.on('connect_error', (e) => log(`falha ao conectar: ${e.message}`));

const batida = setInterval(() => {
  if (socket.connected) socket.emit('presence:heartbeat');
}, HEARTBEAT_INTERVAL_MS);

// Ctrl+C avisa o servidor antes de cair, para a saída aparecer na hora no
// outro terminal em vez de esperar o TTL.
process.on('SIGINT', () => {
  log('saindo');
  clearInterval(batida);
  socket.emit('presence:leave');
  socket.close();
  setTimeout(() => process.exit(0), 200);
});
