// app/api/messages/route.ts
// Endpoint da rede social: ler (GET) e enviar (POST) mensagens de região.
// Roda no servidor — a connection string do Neon fica protegida aqui.

import { NextRequest, NextResponse } from 'next/server';
import {
  isDbEnabled,
  getMessagesSince,
  insertMessage,
} from '@/lib/db/messages';
import { getUserFromRequest } from '@/lib/auth/verify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/messages?since=<ISO>
// Retorna as mensagens novas desde `since`. Sem `since`, retorna as recentes
// (o cliente usa isso apenas para estabelecer a linha de base, sem re-exibir).
export async function GET(req: NextRequest) {
  if (!isDbEnabled) {
    return NextResponse.json({ enabled: false, messages: [], serverTime: new Date().toISOString() });
  }

  const since = req.nextUrl.searchParams.get('since');
  try {
    const messages = await getMessagesSince(since);
    return NextResponse.json({
      enabled: true,
      messages,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[api/messages GET] erro:', err);
    return NextResponse.json(
      { enabled: true, messages: [], serverTime: new Date().toISOString() },
      { status: 500 },
    );
  }
}

// POST /api/messages  { client_id, text, lat, lon }
export async function POST(req: NextRequest) {
  if (!isDbEnabled) {
    // Sem backend: no-op silencioso (o app já exibiu a mensagem localmente)
    return NextResponse.json({ ok: false, enabled: false });
  }

  try {
    const body = await req.json();
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const clientId = typeof body.client_id === 'string' ? body.client_id : '';
    const lat = Number(body.lat);
    const lon = Number(body.lon);

    if (!text || text.length > 280 || !clientId) {
      return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json({ ok: false, error: 'invalid_coords' }, { status: 400 });
    }

    // Identidade opcional: se veio um token do Neon Auth, registra o autor.
    const user = await getUserFromRequest(req);

    await insertMessage({
      client_id: clientId,
      text,
      lat,
      lon,
      author_name: user?.name ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/messages POST] erro:', err);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
