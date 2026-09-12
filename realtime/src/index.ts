/**
 * Servidor de realtime do GLOBO-3D.
 *
 * POR QUE ISTO É UM PACOTE SEPARADO, e não uma rota do Next: função serverless
 * não segura conexão aberta. Socket.io precisa de um processo vivo, com estado
 * na memória e o socket de pé — o oposto do modelo da Vercel. Este pacote tem
 * package.json próprio e vai para um host always-on (Railway).
 *
 * O QUE ELE FAZ: presença, beacons, apresentação de dois peers e repasse de
 * sinalização. O QUE ELE NÃO FAZ: ver conteúdo de conversa. O texto, a imagem e
 * o vídeo vão direto de navegador para navegador por WebRTC; aqui passa só o
 * aperto de mão.
 *
 * Fase 1 implementa apenas presença. Os outros eventos estão declarados no
 * protocolo e entram nas fases seguintes.
 */

// PRIMEIRO de todos, e a ordem importa: este import carrega o .env antes que
// qualquer outro modulo leia process.env. Ver o comentario em src/env.ts.
import './env.js';

import { createServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { Server } from 'socket.io';

import type { ClientToServer, ServerToClient } from '../shared/protocol.js';
import { HEARTBEAT_INTERVAL_MS, PRESENCE_TTL_SEC } from '../shared/protocol.js';
import { registerAuth } from './auth.js';
import { registerBeacons } from './beacons.js';
import { registerDirectory } from './directory.js';
import { mailboxLigada, registerMailbox } from './mailbox.js';
import { avisarSeFaltaTurn, registerMatchmaking } from './matchmaking.js';
import { registerPresence, type RealtimeServer, type SocketData } from './presence.js';
import { criarLimitador, registerSafety } from './safety.js';
import { registerSignaling } from './signaling.js';
import { createMemoryStore, createRedisStore, type PresenceStore } from './store.js';

const PORT = Number(process.env.PORT ?? 8080);
const REDIS_URL = process.env.REDIS_URL?.trim();
const NODE_ENV = process.env.NODE_ENV ?? 'development';
const ehProducao = NODE_ENV === 'production';

/**
 * De onde o navegador tem permissão de conectar.
 *
 * Sem isto qualquer site poderia abrir socket contra este servidor em nome do
 * seu usuário. Aceita lista separada por vírgula (produção e preview da
 * Vercel, por exemplo). Em desenvolvimento, sem a variável, libera tudo — e
 * avisa.
 */
const CORS_ORIGIN = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const log = (...args: unknown[]) =>
  console.log(new Date().toISOString().slice(11, 19), ...args);

async function main() {
  // --- Store de presença ---------------------------------------------------
  let store: PresenceStore;
  let adapterPair: { pub: Redis; sub: Redis } | null = null;

  if (REDIS_URL) {
    const pub = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    const sub = pub.duplicate();
    pub.on('error', (e: Error) => console.error('[redis]', e.message));
    sub.on('error', (e: Error) => console.error('[redis:sub]', e.message));
    store = createRedisStore(pub);
    adapterPair = { pub, sub };
    log('presenca em Redis');
  } else if (ehProducao && process.env.ALLOW_MEMORY_PRESENCE !== '1') {
    /*
     * Em produção, cair para memória CALADO seria pior que não subir: com duas
     * instâncias, metade das pessoas ficaria invisível para a outra metade e
     * nenhum erro apareceria em lugar nenhum.
     *
     * A saída não é proibir — é exigir que alguém assuma. `ALLOW_MEMORY_PRESENCE=1`
     * é essa assinatura: quem a escreve está dizendo "eu sei, e garanto UMA
     * máquina só". É o caso do primeiro deploy, antes de existir Redis.
     *
     * A garantia mora no fly.toml (`min_machines_running = 1`, e nunca
     * escalar). No dia em que este app subir para duas máquinas sem Redis, o
     * bug volta — e volta silencioso, que é o motivo de estar escrito aqui e
     * lá.
     */
    console.error('REDIS_URL ausente em producao. Recusando subir.');
    console.error('  Se for mesmo UMA maquina so, assuma com ALLOW_MEMORY_PRESENCE=1.');
    process.exit(1);
  } else {
    store = createMemoryStore();
    log(
      ehProducao
        ? '\x1b[33mpresenca em MEMORIA em PRODUCAO (ALLOW_MEMORY_PRESENCE=1) — NAO escale este app\x1b[0m'
        : '\x1b[33mpresenca em MEMORIA (sem REDIS_URL) — so vale para dev local\x1b[0m',
    );
  }

  // --- Socket.io -----------------------------------------------------------
  const httpServer = createServer((req, res) => {
    // Endpoint de saúde: é o que o Railway usa para saber se a máquina subiu.
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, store: store.kind, uptime: process.uptime() }));
      return;
    }
    res.writeHead(404).end();
  });

  const io: RealtimeServer = new Server<
    ClientToServer,
    ServerToClient,
    Record<string, never>,
    SocketData
  >(httpServer, {
    cors: {
      origin: CORS_ORIGIN.length > 0 ? CORS_ORIGIN : true,
      credentials: true,
    },
    // O cliente bate heartbeat de aplicação a cada 15s; este é o ping do
    // protocolo, mais curto, que derruba conexão morta rápido.
    pingInterval: 20_000,
    pingTimeout: 20_000,

    /*
     * Quadro máximo. O padrão do Socket.io é 1 MB, e foto e áudio não cabem
     * nele: o envelope carrega os bytes em base64 dentro do próprio evento.
     * Precisa ser maior que PAYLOAD_MAX (2 milhões de caracteres) mais o JSON
     * em volta — senão a mensagem é recusada pelo transporte antes de qualquer
     * validação nossa, e o cliente vê a conexão cair sem explicação.
     */
    maxHttpBufferSize: 3_000_000,
  });

  if (adapterPair) {
    // Com o adapter, `io.to(regiao).emit(...)` alcança quem está conectado em
    // OUTRA instância. Sem ele, escalar para duas máquinas parte as salas ao
    // meio de forma silenciosa.
    io.adapter(createAdapter(adapterPair.pub, adapterPair.sub));
    log('adapter Redis ligado');
  }

  // A identidade vem ANTES de qualquer handler: o middleware roda no aperto de
  // mão, então quando o primeiro evento chega o socket já sabe de quem é.
  registerAuth(io, log);

  // Um limitador para o processo inteiro: os baldes são por conexão, mas o
  // mapa que os guarda é compartilhado.
  const limitador = criarLimitador();

  io.on('connection', (socket) => {
    log(`conn   ${socket.id}`);
    registerPresence(io, socket, store, log);
    registerBeacons(io, socket, store, limitador, log);
    registerDirectory(io, socket, store, limitador, log);
    registerMatchmaking(io, socket, store, limitador, log);
    registerSignaling(io, socket, log);
    registerSafety(io, socket, store, limitador, log);
    registerMailbox(io, socket, store, limitador, log);
    socket.on('disconnect', () => limitador.esquecer(socket.id));
  });

  httpServer.listen(PORT, () => {
    log(`realtime ouvindo em :${PORT}`);
    log(`cors: ${CORS_ORIGIN.length > 0 ? CORS_ORIGIN.join(', ') : '\x1b[33mliberado (defina CORS_ORIGIN)\x1b[0m'}`);
    log(`heartbeat ${HEARTBEAT_INTERVAL_MS / 1000}s, presenca expira em ${PRESENCE_TTL_SEC}s`);
    avisarSeFaltaTurn(log);
    log(
      mailboxLigada()
        ? 'caixa postal LIGADA (mensagem para quem esta offline fica guardada)'
        : '[33mcaixa postal desligada: falta DATABASE_URL ou MESSAGE_KEY[0m',
    );
  });

  // --- Encerramento limpo --------------------------------------------------
  const encerrar = async (sinal: string) => {
    log(`${sinal}: encerrando`);
    io.close();
    await store.close().catch(() => {});
    await adapterPair?.sub.quit().catch(() => {});
    httpServer.close(() => process.exit(0));
    // Se alguma conexão travar o close, não fica pendurado para sempre.
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.on('SIGTERM', () => void encerrar('SIGTERM'));
  process.on('SIGINT', () => void encerrar('SIGINT'));
}

main().catch((e) => {
  console.error('falha ao subir o realtime:', e);
  process.exit(1);
});

