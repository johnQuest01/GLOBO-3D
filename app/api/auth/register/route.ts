import { NextResponse } from 'next/server';

import { getSecret } from '@/lib/auth/cookies';
import { normalizeNickname, validateNickname } from '@/lib/auth/nickname';
import { hashPassword, validatePassword } from '@/lib/auth/password';
import { startSession } from '@/lib/auth/session';
import {
  createUser,
  emailExists,
  isAuthDbEnabled,
  normalizeEmail,
} from '@/lib/db/auth';

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

  // O nickname e o unico campo que OUTRAS pessoas vao ver e digitar. As regras
  // vivem em lib/auth/nickname.ts porque o formulario usa as mesmas.
  const nicknameCru = typeof body.nickname === 'string' ? body.nickname : '';
  const erroNickname = validateNickname(nicknameCru);
  if (erroNickname) erros.nickname = erroNickname;
  const nickname = normalizeNickname(nicknameCru);

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
    nickname,
    fullName,
    city,
    state,
    country,
    // Liga a conta ao anônimo que já navegava: o histórico de comportamento
    // que a pessoa tinha passa a ter dono.
    clientId: texto(body.clientId, 120),
  });

  if (!user) {
    // Bateu num dos dois índices únicos, e a resposta PRECISA dizer em qual:
    // um erro de e-mail exibido num cadastro que falhou pelo nickname manda a
    // pessoa trocar o campo errado e tentar de novo para sempre.
    //
    // Sobre o e-mail a mensagem continua genérica de propósito — dizer "esta
    // conta existe" transforma o cadastro num verificador de quem tem conta.
    // Com o nickname não há esse problema: ele já é público na busca, e a
    // pessoa precisa saber que aquele nome está tomado para escolher outro.
    if (await emailExists(email!)) {
      return NextResponse.json(
        { ok: false, errors: { email: 'Não foi possível cadastrar este e-mail.' } },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { ok: false, errors: { nickname: 'Esse nickname já está em uso.' } },
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
      nickname: user.nickname,
      fullName: user.fullName,
      city: user.city,
      state: user.state,
      country: user.country,
    },
  });
}
