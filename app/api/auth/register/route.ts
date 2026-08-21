import { NextResponse } from 'next/server';

import { getSecret } from '@/lib/auth/cookies';
import { hashPassword, validatePassword } from '@/lib/auth/password';
import { startSession } from '@/lib/auth/session';
import { createUser, isAuthDbEnabled, normalizeEmail } from '@/lib/db/auth';

/**
 * Cadastro.
 *
 * A senha entra por aqui e sai como derivação scrypt — em nenhum momento ela é
 * gravada, registrada em log ou devolvida. Se algum dia alguém precisar
 * depurar este arquivo, o valor a NÃO imprimir é `password`.
 */

export const runtime = 'nodejs';

const LIMITES = { nome: 170, cidade: 120, estado: 120, pais: 120, email: 254 };

function texto(valor: unknown, max: number): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  if (!limpo || limpo.length > max) return null;
  return limpo;
}

/**
 * Validação de e-mail deliberadamente simples.
 *
 * Regex de e-mail "completa" é folclore: a gramática real (RFC 5322) aceita
 * coisas que nenhum provedor usa, e toda regex que tenta cobri-la rejeita
 * endereço válido. O que garante que o e-mail existe é confirmá-lo por
 * mensagem — o que este cadastro ainda NÃO faz (ver o README da autenticação).
 */
function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= LIMITES.email;
}

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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'json-invalido' }, { status: 400 });
  }

  const email = texto(body.email, LIMITES.email)?.toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const confirm = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';

  const erros: Record<string, string> = {};

  if (!email || !emailValido(email)) erros.email = 'E-mail inválido.';

  const erroSenha = validatePassword(password);
  if (erroSenha) erros.password = erroSenha;
  // A confirmação é conferida no SERVIDOR também: a do formulário protege
  // contra o erro de digitação, não contra uma requisição montada à mão.
  else if (password !== confirm) erros.confirmPassword = 'As senhas não coincidem.';

  const fullName = texto(body.fullName, LIMITES.nome);
  const city = texto(body.city, LIMITES.cidade);
  const state = texto(body.state, LIMITES.estado);
  const country = texto(body.country, LIMITES.pais);

  if (!fullName) erros.fullName = 'Nome completo é obrigatório.';
  if (!city) erros.city = 'Cidade é obrigatória.';
  if (!state) erros.state = 'Estado é obrigatório.';
  if (!country) erros.country = 'País é obrigatório.';

  if (Object.keys(erros).length > 0) {
    return NextResponse.json({ ok: false, errors: erros }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);

  const user = await createUser({
    email: normalizeEmail(email!),
    passwordHash,
    fullName,
    city,
    state,
    country,
    // Liga a conta ao anônimo que já navegava: o histórico de comportamento
    // que a pessoa tinha passa a ter dono.
    clientId: texto(body.clientId, 120),
  });

  if (!user) {
    // E-mail já cadastrado. A mensagem é genérica de propósito: dizer "esta
    // conta existe" transforma o cadastro num verificador de quem tem conta.
    return NextResponse.json(
      { ok: false, errors: { email: 'Não foi possível cadastrar este e-mail.' } },
      { status: 409 },
    );
  }

  const abriu = await startSession(user, {
    userAgent: request.headers.get('user-agent'),
    ip: request.headers.get('x-forwarded-for'),
  });
  if (!abriu) {
    return NextResponse.json({ ok: false, reason: 'sessao-falhou' }, { status: 500 });
  }

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
