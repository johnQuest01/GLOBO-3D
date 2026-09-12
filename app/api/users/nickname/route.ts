import { NextResponse } from 'next/server';

import { getSecret } from '@/lib/auth/cookies';
import { normalizeNickname, validateNickname } from '@/lib/auth/nickname';
import { getSession, refreshCache } from '@/lib/auth/session';
import { findUserById, isAuthDbEnabled, setNickname } from '@/lib/db/auth';

/**
 * Escolher um nickname depois do cadastro.
 *
 * PARA QUEM É: as contas criadas antes de o nickname existir. Elas não são
 * poucas nem descartáveis — são as primeiras pessoas do projeto —, e sem nome
 * público elas ficavam num limbo cruel: conseguiam ENVIAR mensagem, mas do
 * outro lado a conversa aparecia com o remetente "?" e não dava para
 * responder. Também não apareciam na busca.
 *
 * A coluna continua nulável de propósito (ver db/schema-nickname.sql): exigir
 * o nickname no banco deslogaria essas contas em vez de convidá-las a
 * escolher.
 */

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!getSecret() || !isAuthDbEnabled) {
    return NextResponse.json(
      { ok: false, reason: 'auth-nao-configurado' },
      { status: 503 },
    );
  }

  // `exigirBanco` porque isto MUDA a conta: o cache assinado do cookie pode
  // estar até um minuto atrás da verdade, e aqui a verdade importa.
  const session = await getSession({ exigirBanco: true });
  if (!session) {
    return NextResponse.json({ ok: false, reason: 'nao-logado' }, { status: 401 });
  }

  // Quem já tem nickname não troca por aqui. Trocar de nome público tem
  // consequências (conversas em andamento apontam para o nome antigo) e merece
  // uma tela própria, com aviso — não um POST silencioso.
  //
  // A RESPOSTA DEVOLVE O NICKNAME QUE JÁ EXISTE, e isso não é detalhe: quem
  // cai aqui é justamente a tela que estava vendo um perfil velho e por isso
  // pediu um nome que a conta já tinha. Sem o nome na resposta, ela só
  // conseguia repetir "já existe" e a pessoa ficava presa. Com ele, a tela se
  // corrige e segue. Não vaza nada: o nickname é público na busca.
  if (session.user.nickname) {
    return NextResponse.json(
      {
        ok: false,
        reason: 'ja-tem-nickname',
        nickname: session.user.nickname,
        errors: { nickname: 'Sua conta já tem um nickname.' },
      },
      { status: 409 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'json-invalido' }, { status: 400 });
  }

  const cru = typeof body.nickname === 'string' ? body.nickname : '';
  const erro = validateNickname(cru);
  if (erro) {
    return NextResponse.json({ ok: false, errors: { nickname: erro } }, { status: 400 });
  }

  const escolhido = normalizeNickname(cru);
  const atualizado = await setNickname(session.user.id, escolhido);

  if (!atualizado) {
    // O `setNickname` só grava se ninguém mais tiver o nome — a checagem é da
    // mesma consulta que escreve, e não de um `select` antes, que duas pessoas
    // escolhendo o mesmo nome ao mesmo tempo atravessariam.
    return NextResponse.json(
      { ok: false, errors: { nickname: 'Esse nickname já está em uso.' } },
      { status: 409 },
    );
  }

  // O cookie de cache guarda o nickname; sem refazê-lo, a interface
  // continuaria vendo a conta sem nome pelo tempo de vida do cache.
  const fresco = await findUserById(session.user.id);
  if (fresco) await refreshCache(fresco);

  return NextResponse.json({ ok: true, nickname: atualizado.nickname });
}
