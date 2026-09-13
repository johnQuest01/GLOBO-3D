import { NextResponse } from 'next/server';

import { getSecret } from '@/lib/auth/cookies';
import { getSession } from '@/lib/auth/session';
import { estaAberto, isAuthDbEnabled, setAberto } from '@/lib/db/auth';

/**
 * "Aceito conversa de qualquer pessoa do mundo."
 *
 * GET diz como está; POST muda. Duas coisas separadas porque a tela precisa
 * mostrar o estado antes de oferecer o interruptor — um botão que não sabe se
 * está ligado é um botão que a pessoa desliga sem querer.
 *
 * NÃO HÁ CACHE aqui. É preferência de privacidade: quando alguém desliga, quer
 * que valha agora, e não no próximo minuto.
 */

export const runtime = 'nodejs';

export async function GET() {
  if (!getSecret() || !isAuthDbEnabled) {
    return NextResponse.json({ ok: false, reason: 'indisponivel' }, { status: 503 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, reason: 'nao-logado' }, { status: 401 });
  }

  return NextResponse.json({ ok: true, aberto: await estaAberto(session.user.id) });
}

export async function POST(request: Request) {
  if (!getSecret() || !isAuthDbEnabled) {
    return NextResponse.json({ ok: false, reason: 'indisponivel' }, { status: 503 });
  }

  const session = await getSession({ exigirBanco: true });
  if (!session) {
    return NextResponse.json({ ok: false, reason: 'nao-logado' }, { status: 401 });
  }

  let body: { aberto?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'json-invalido' }, { status: 400 });
  }

  if (typeof body.aberto !== 'boolean') {
    return NextResponse.json({ ok: false, reason: 'valor-invalido' }, { status: 400 });
  }

  await setAberto(session.user.id, body.aberto);
  return NextResponse.json({ ok: true, aberto: body.aberto });
}
