import { NextResponse } from 'next/server';
import { isDbEnabled, recordEvents, type BehaviorEvent } from '@/lib/db/behavior';

/**
 * Entrada dos eventos de comportamento.
 *
 * Recebe em LOTE de propósito. Uma requisição por clique deixaria a navegação
 * pesada — e num globo em 3D qualquer trabalho extra na thread principal
 * aparece como engasgo. O cliente acumula e descarrega de tempos em tempos.
 */

export const runtime = 'nodejs';

/** Teto por requisição, para um cliente com defeito não inundar o banco. */
const MAX_EVENTS_PER_BATCH = 60;

export async function POST(request: Request) {
  if (!isDbEnabled) {
    // Sem banco configurado o app funciona igual, só não aprende nada.
    return NextResponse.json({ ok: false, reason: 'db-desativado' }, { status: 503 });
  }

  let clientId = '';
  let events: BehaviorEvent[] = [];

  try {
    const body = await request.json();
    clientId = typeof body?.clientId === 'string' ? body.clientId : '';
    events = Array.isArray(body?.events) ? body.events.slice(0, MAX_EVENTS_PER_BATCH) : [];
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!clientId || events.length === 0) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    const saved = await recordEvents(clientId, events);
    return NextResponse.json({ ok: true, saved });
  } catch (error) {
    console.error('[track] falha ao gravar eventos:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
