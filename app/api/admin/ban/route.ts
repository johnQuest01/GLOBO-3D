import { NextResponse } from 'next/server';

import { COOKIE_CACHE_TTL_SEC } from '@/lib/auth/cookies';
import { isAdmin } from '@/lib/auth/session';
import { banUser, isAuthDbEnabled, unbanUser } from '@/lib/db/auth';

/**
 * Derrubar quem violou a política.
 *
 * Só responde a quem tem o cookie assinado de administrador — que é emitido
 * pelo /api/admin/login depois de conferir e-mail e senha no servidor. O
 * sessionStorage do navegador não vale nada aqui: ele é do lado de lá.
 *
 * O QUE O BANIMENTO FAZ, na ordem:
 *   1. marca a conta como banida (ela não some — o banimento é reversível e a
 *      denúncia do outro lado precisa continuar apontando para alguém);
 *   2. move o corte `sessions_valid_from` para agora, o que invalida toda
 *      sessão anterior, inclusive em outros aparelhos;
 *   3. revoga as linhas de sessão que ainda estavam abertas.
 *
 * O QUE ELE NÃO FAZ: cortar o acesso no mesmo instante. Enquanto o COOKIE_CACHE
 * daquela pessoa não vencer, a navegação dela ainda passa sem consultar o
 * banco. A resposta devolve `efeitoEmSegundos` para isso ficar visível a quem
 * está moderando, em vez de virar surpresa.
 */

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ ok: false, reason: 'nao-autorizado' }, { status: 401 });
  }
  if (!isAuthDbEnabled) {
    return NextResponse.json({ ok: false, reason: 'db-desativado' }, { status: 503 });
  }

  let email = '';
  let reason = '';
  let acao = 'ban';
  try {
    const body = await request.json();
    email = typeof body?.email === 'string' ? body.email : '';
    reason = typeof body?.reason === 'string' ? body.reason.slice(0, 500) : '';
    acao = body?.acao === 'unban' ? 'unban' : 'ban';
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!email) {
    return NextResponse.json({ ok: false, reason: 'email-obrigatorio' }, { status: 400 });
  }

  if (acao === 'unban') {
    const user = await unbanUser(email);
    if (!user) {
      return NextResponse.json({ ok: false, reason: 'nao-encontrado' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, acao: 'unban', email: user.email });
  }

  if (!reason.trim()) {
    return NextResponse.json({ ok: false, reason: 'motivo-obrigatorio' }, { status: 400 });
  }

  const user = await banUser(email, reason.trim());
  if (!user) {
    return NextResponse.json({ ok: false, reason: 'nao-encontrado' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    acao: 'ban',
    email: user.email,
    motivo: user.bannedReason,
    efeitoEmSegundos: COOKIE_CACHE_TTL_SEC,
  });
}
