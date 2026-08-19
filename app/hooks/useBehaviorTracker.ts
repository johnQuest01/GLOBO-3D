'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Coletor de comportamento do lado do cliente.
 *
 * A regra que governa este arquivo: **não atrapalhar o globo**. Um `fetch` por
 * clique, ou pior, qualquer trabalho por quadro, apareceria como engasgo na
 * animação. Então nada aqui roda no laço de renderização — os eventos entram
 * numa fila em memória (um `useRef`, sem re-render) e são descarregados de
 * tempos em tempos, ou quando a aba perde o foco.
 *
 * Na saída da página o envio usa `sendBeacon`, que o navegador entrega mesmo
 * depois do fechamento. Um `fetch` comum seria cancelado e o último trecho da
 * sessão — justamente o mais informativo — se perderia.
 */

/** Versão dos termos aceitos no cadastro. Suba isto ao mudar o texto. */
export const TERMS_VERSION = '2026-08-19';

/** De quanto em quanto tempo a fila é descarregada. */
const FLUSH_INTERVAL_MS = 15_000;

/** Fila maior que isto descarrega na hora, sem esperar o intervalo. */
const FLUSH_AT_SIZE = 20;

const CLIENT_ID_KEY = 'globoClientId';

export type BehaviorKind =
  | 'region_view'
  | 'dwell'
  | 'news_open'
  | 'news_read'
  | 'like'
  | 'dislike'
  | 'pin_add'
  | 'trip_plan'
  | 'tourism_view'
  | 'search';

export interface TrackInput {
  kind: BehaviorKind;
  regionKey?: string | null;
  topic?: string | null;
  refId?: string | null;
  dwellMs?: number | null;
}

/**
 * Identidade estável do navegador. Nasce antes de existir conta, e quando o
 * cadastro acontece o mesmo id recebe e-mail e nome — o histórico anterior
 * continua valendo em vez de recomeçar do zero.
 */
export function getClientId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

/**
 * Fila e estado no escopo do MODULO, nao do componente.
 *
 * O hook e usado em mais de um lugar (o canvas e os handlers do globo). Com o
 * estado dentro do componente, cada chamada teria a sua fila, o seu timer e o
 * seu registro de perfil — eventos se perderiam em filas paralelas e o mesmo
 * perfil seria gravado varias vezes. Compartilhando aqui, todos empurram para
 * a mesma fila e o registro acontece uma vez so.
 */
const queue: TrackInput[] = [];
const dwellStart = new Map<string, number>();
let sharedClientId = '';

let listenersInstalled = false;

export function useBehaviorTracker() {
  const queueRef = useRef(queue);
  const clientIdRef = useRef('');
  const dwellStartRef = useRef(dwellStart);

  const flush = useCallback((useBeacon = false) => {
    const events = queueRef.current.splice(0, queueRef.current.length);
    const clientId = clientIdRef.current || sharedClientId;
    if (!clientId || events.length === 0) return;

    const payload = JSON.stringify({ clientId, events });

    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(
        '/api/track',
        new Blob([payload], { type: 'application/json' }),
      );
      return;
    }

    // keepalive: se a aba fechar no meio, o envio ainda completa.
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {
      /* perder telemetria nunca pode quebrar a navegação */
    });
  }, []);

  const track = useCallback(
    (input: TrackInput) => {
      queueRef.current.push(input);
      if (queueRef.current.length >= FLUSH_AT_SIZE) flush();
    },
    [flush],
  );

  /** Marca o início de uma permanência (abrir um popup, um vídeo, uma tela). */
  const startDwell = useCallback((key: string) => {
    dwellStartRef.current.set(key, performance.now());
  }, []);

  /** Fecha a permanência e registra quanto tempo durou. */
  const endDwell = useCallback(
    (key: string, meta: Omit<TrackInput, 'kind' | 'dwellMs'> = {}) => {
      const started = dwellStartRef.current.get(key);
      if (started === undefined) return;
      dwellStartRef.current.delete(key);

      const dwellMs = Math.round(performance.now() - started);
      // Abaixo de um segundo é passagem, não interesse.
      if (dwellMs < 1000) return;

      track({ kind: 'dwell', dwellMs, ...meta });
    },
    [track],
  );

  useEffect(() => {
    sharedClientId = sharedClientId || getClientId();
    clientIdRef.current = sharedClientId;

    // Uma instalacao so, mesmo com varios componentes usando o hook.
    if (listenersInstalled) return;
    listenersInstalled = true;

    // Registra o perfil e o aceite dos termos assim que a sessão começa.
    let saved: { name?: string; email?: string; city?: string } = {};
    try {
      saved = JSON.parse(localStorage.getItem('userData') ?? '{}');
    } catch {
      /* sem cadastro ainda */
    }


    fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: clientIdRef.current,
        email: saved.email ?? null,
        name: saved.name ?? null,
        city: saved.city ?? null,
        termsVersion: TERMS_VERSION,
      }),
    }).catch(() => {
      /* idem: sem banco, o app segue normal */
    });

    const timer = window.setInterval(() => flush(), FLUSH_INTERVAL_MS);

    // Trocar de aba já é o melhor momento para descarregar: no celular, muitas
    // vezes é o único aviso antes do navegador congelar a página.
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush(true);
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', () => flush(true));

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onHidden);
      listenersInstalled = false;
      flush(true);
    };
  }, [flush]);

  return { track, startDwell, endDwell, getClientId };
}
