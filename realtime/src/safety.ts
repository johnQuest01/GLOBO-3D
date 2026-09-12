/**
 * Limite de taxa, bloqueio e denúncia.
 *
 * Isto não é "fase futura". Um beacon é um convite a estranho, e um pedido de
 * conexão chega na tela de alguém: sem freio, os dois viram canhão de spam, e
 * é justamente isso que faz um produto de conversa com desconhecido virar
 * terra de ninguém.
 *
 * TRÊS PEÇAS, com alcances diferentes:
 *
 * 1. LIMITE (token bucket), por CONEXÃO e em memória. Pode ser em memória
 *    porque um socket vive numa instância só — o balde dele não precisa ser
 *    compartilhado. Fechar a aba e reabrir zera o balde, e tudo bem: o custo de
 *    reconectar já é o freio nesse caso.
 *
 * 2. BLOQUEIO, no store (Redis), porque precisa sobreviver à reconexão dos
 *    dois lados e valer em qualquer instância. É simétrico: quem bloqueia
 *    também para de receber.
 *
 * 3. DENÚNCIA, que na v1 é registro e contagem. De propósito não banimos por
 *    volume: banir automaticamente por número de denúncias entrega a moderação
 *    a quem denunciar em grupo.
 */

import type { RealtimeServer, RealtimeSocket } from './presence.js';
import type { PresenceStore } from './store.js';

// ---------------------------------------------------------------------------
// Token bucket
// ---------------------------------------------------------------------------

export interface LimiteConfig {
  /** Quantas ações seguidas cabem sem espera. */
  capacidade: number;
  /** Em quanto tempo o balde enche de novo, do zero ao cheio. */
  recargaMs: number;
}

/**
 * Os números.
 *
 * Beacon é mais raro que pedido de conexão: acender é dizer "estou aqui,
 * quero conversar", o que ninguém precisa fazer dez vezes por minuto. Já
 * pedido de conexão pode acontecer em sequência legítima — a pessoa tenta
 * três beacons até alguém responder.
 */
export const LIMITES: Record<string, LimiteConfig> = {
  'beacon:raise': { capacidade: 3, recargaMs: 5 * 60_000 },
  'connect:request': { capacidade: 5, recargaMs: 60_000 },
  // Busca é barata e legítima em rajada — a pessoa erra o nome e tenta de
  // novo. O teto existe só para impedir varredura do diretório inteiro.
  'directory:find': { capacidade: 20, recargaMs: 60_000 },
  report: { capacidade: 5, recargaMs: 10 * 60_000 },
};

interface Balde {
  tokens: number;
  ultimaRecarga: number;
}

export interface Limitador {
  /** Consome um token. Devolve quanto falta esperar (0 = pode). */
  consumir(socketId: string, acao: string): number;
  esquecer(socketId: string): void;
}

export function criarLimitador(agora: () => number = Date.now): Limitador {
  const baldes = new Map<string, Balde>();

  return {
    consumir(socketId, acao) {
      const config = LIMITES[acao];
      if (!config) return 0;

      const chave = `${socketId}|${acao}`;
      const t = agora();
      const balde = baldes.get(chave) ?? { tokens: config.capacidade, ultimaRecarga: t };

      // Recarga contínua: o balde não espera o período inteiro para devolver
      // um token. Quem gastou tudo espera um pedaço, não a janela toda.
      const decorrido = t - balde.ultimaRecarga;
      if (decorrido > 0) {
        const ganho = (decorrido / config.recargaMs) * config.capacidade;
        balde.tokens = Math.min(config.capacidade, balde.tokens + ganho);
        balde.ultimaRecarga = t;
      }

      if (balde.tokens >= 1) {
        balde.tokens -= 1;
        baldes.set(chave, balde);
        return 0;
      }

      baldes.set(chave, balde);
      const faltando = 1 - balde.tokens;
      return Math.ceil((faltando / config.capacidade) * config.recargaMs);
    },

    esquecer(socketId) {
      for (const chave of baldes.keys()) {
        if (chave.startsWith(`${socketId}|`)) baldes.delete(chave);
      }
    },
  };
}

/**
 * Aplica o limite e já avisa o cliente quando barra.
 * Devolve true se a ação pode seguir.
 */
export function permitir(
  socket: RealtimeSocket,
  limitador: Limitador,
  acao: string,
): boolean {
  const esperaMs = limitador.consumir(socket.id, acao);
  if (esperaMs === 0) return true;
  socket.emit('rate_limited', { action: acao, retryAfterMs: esperaMs });
  return false;
}

// ---------------------------------------------------------------------------
// Bloqueio e denúncia
// ---------------------------------------------------------------------------

/** Contagem de denúncias por alvo. Some quando o processo reinicia — v1. */
const denuncias = new Map<string, number>();

export function registerSafety(
  _io: RealtimeServer,
  socket: RealtimeSocket,
  store: PresenceStore,
  limitador: Limitador,
  log: (...args: unknown[]) => void,
): void {
  socket.on('block', async ({ targetClientId }) => {
    const meu = socket.data.clientId;
    if (!meu || typeof targetClientId !== 'string' || !targetClientId) return;
    if (targetClientId === meu) return;

    await store.block(meu, targetClientId);
    log(`block  ${meu} -x- ${targetClientId}`);
  });

  socket.on('report', async ({ targetClientId, reason }) => {
    const meu = socket.data.clientId;
    if (!meu || typeof targetClientId !== 'string' || !targetClientId) return;
    if (!permitir(socket, limitador, 'report')) return;

    const total = (denuncias.get(targetClientId) ?? 0) + 1;
    denuncias.set(targetClientId, total);

    // Denunciar implica não querer mais contato: bloqueia junto, senão a
    // pessoa denuncia e continua recebendo convite de quem denunciou.
    await store.block(meu, targetClientId);

    log(
      `report ${targetClientId} (${total} no total) por ${meu}: ${String(reason).slice(0, 120)}`,
    );
  });
}

/** Só para inspeção em teste. */
export function contagemDeDenuncias(clientId: string): number {
  return denuncias.get(clientId) ?? 0;
}
