import { NextResponse } from 'next/server';
import { forgetClient, isDbEnabled, upsertProfile } from '@/lib/db/behavior';

/**
 * Perfil da pessoa.
 *
 * POST registra/atualiza (incluindo a versao dos termos aceita no cadastro,
 * que e a base legal do perfilamento).
 * DELETE apaga tudo o que foi coletado — eventos, afinidade e perfil.
 */

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isDbEnabled) {
    return NextResponse.json({ ok: false, reason: 'db-desativado' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const clientId = typeof body?.clientId === 'string' ? body.clientId : '';
    if (!clientId) return NextResponse.json({ ok: false }, { status: 400 });

    await upsertProfile({
      clientId,
      email: body?.email ?? null,
      name: body?.name ?? null,
      city: body?.city ?? null,
      termsVersion: body?.termsVersion ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[profile] falha:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!isDbEnabled) {
    return NextResponse.json({ ok: false, reason: 'db-desativado' }, { status: 503 });
  }

  const clientId = new URL(request.url).searchParams.get('clientId') ?? '';
  if (!clientId) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    await forgetClient(clientId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[profile] falha ao apagar:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
