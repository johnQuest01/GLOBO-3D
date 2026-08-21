import { NextResponse } from 'next/server';

import { getSecret } from '@/lib/auth/cookies';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { startSession } from '@/lib/auth/session';
import { findUserByEmail, isAuthDbEnabled, markLogin } from '@/lib/db/auth';

export const runtime = 'nodejs';

/**
 * Entrada.
 *
 * DOIS CUIDADOS QUE PARECEM PARANOIA E NÃO SÃO:
 *
 * 1. A resposta de "e-mail não existe" e a de "senha errada" são idênticas.
 *    Diferenciá-las transforma a tela de login num verificador de quem tem
 *    conta no site — que é o primeiro passo de quem monta lista para ataque.
 *
 * 2. Quando o e-mail não existe, ainda assim gastamos o tempo de um scrypt.
 *    Sem isso, a resposta para e-mail inexistente volta em 2ms e a de senha
 *    errada em 80ms, e a diferença de tempo entrega a mesma informação que o
 *    item 1 esconde.
 */

const HASH_FALSO_BASE = 'senha-que-nao-existe-neste-banco';

export async function POST(request: Request) {
  if (!getSecret()) {
    return NextResponse.json(
      { ok: false, reason: 'auth-nao-configurado' },
      { status: 503 },
    );
  }
  if (!isAuthDbEnabled) {
    return NextResponse.json({ ok: false, reason: 'db-desativado' }, { status: 503 });
  }

  let email = '';
  let password = '';
  try {
    const body = await request.json();
    email = typeof body?.email === 'string' ? body.email : '';
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!email || !password || password.length > 200) {
    return NextResponse.json({ ok: false, reason: 'credenciais' }, { status: 401 });
  }

  const user = await findUserByEmail(email);

  if (!user) {
    await hashPassword(HASH_FALSO_BASE);
    return NextResponse.json({ ok: false, reason: 'credenciais' }, { status: 401 });
  }

  const senhaOk = await verifyPassword(password, user.passwordHash);
  if (!senhaOk) {
    return NextResponse.json({ ok: false, reason: 'credenciais' }, { status: 401 });
  }

  // Conta banida não entra, e aqui a mensagem é específica de propósito: a
  // pessoa precisa saber por que foi barrada — o contrário é só confusão.
  if (user.bannedAt) {
    return NextResponse.json(
      { ok: false, reason: 'banida', message: user.bannedReason ?? 'Conta suspensa.' },
      { status: 403 },
    );
  }

  const abriu = await startSession(user, {
    userAgent: request.headers.get('user-agent'),
    ip: request.headers.get('x-forwarded-for'),
  });
  if (!abriu) {
    return NextResponse.json({ ok: false, reason: 'sessao-falhou' }, { status: 500 });
  }

  await markLogin(user.id);

  return NextResponse.json({
    ok: true,
    user: {
      email: user.email,
      fullName: user.fullName,
      city: user.city,
      state: user.state,
      country: user.country,
    },
  });
}
