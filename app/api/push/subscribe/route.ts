import { NextResponse } from 'next/server';

import { getSecret } from '@/lib/auth/cookies';
import { getSession } from '@/lib/auth/session';
import { guardarInscricao, isAuthDbEnabled, removerInscricao } from '@/lib/db/auth';

/**
 * Onde avisar esta pessoa quando o app estiver fechado.
 *
 * O navegador gera a inscrição (um endereço no servidor de push do Google, da
 * Apple ou da Mozilla, mais duas chaves) e manda para cá. Guardar é tudo o que
 * esta rota faz — quem empurra de verdade é o servidor de realtime, que é quem
 * sabe se a mensagem foi entregue ou ficou esperando.
 *
 * EXIGE SESSÃO, e isso não é burocracia: a inscrição é a permissão de fazer o
 * telefone de alguém tocar. Se qualquer um pudesse gravar uma inscrição em
 * nome de outra conta, teria comprado o direito de receber os avisos dela.
 */

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!getSecret() || !isAuthDbEnabled) {
    return NextResponse.json({ ok: false, reason: 'indisponivel' }, { status: 503 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, reason: 'nao-logado' }, { status: 401 });
  }

  let body: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'json-invalido' }, { status: 400 });
  }

  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
  const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh : '';
  const auth = typeof body.keys?.auth === 'string' ? body.keys.auth : '';

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ ok: false, reason: 'inscricao-incompleta' }, { status: 400 });
  }

  // O endpoint é uma URL de terceiro; aceitar qualquer string aqui seria deixar
  // o servidor de realtime tentar falar com um endereço escolhido por quem
  // manda o corpo da requisição.
  try {
    const u = new URL(endpoint);
    if (u.protocol !== 'https:') throw new Error('sem https');
  } catch {
    return NextResponse.json({ ok: false, reason: 'endpoint-invalido' }, { status: 400 });
  }

  await guardarInscricao({ endpoint, userId: session.user.id, p256dh, auth });
  return NextResponse.json({ ok: true });
}

/** A pessoa desligou os avisos neste aparelho. */
export async function DELETE(request: Request) {
  if (!getSecret() || !isAuthDbEnabled) {
    return NextResponse.json({ ok: false, reason: 'indisponivel' }, { status: 503 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, reason: 'nao-logado' }, { status: 401 });
  }

  const endpoint = new URL(request.url).searchParams.get('endpoint');
  if (!endpoint) {
    return NextResponse.json({ ok: false, reason: 'sem-endpoint' }, { status: 400 });
  }

  // O `user_id` vai no where: conhecer o endpoint de outra pessoa não pode
  // bastar para desligar os avisos dela.
  await removerInscricao(endpoint, session.user.id);
  return NextResponse.json({ ok: true });
}
