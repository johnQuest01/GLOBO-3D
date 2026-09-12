import { NextResponse } from 'next/server';

import { getSecret } from '@/lib/auth/cookies';
import { getSession, refreshCache } from '@/lib/auth/session';
import { findUserById, isAuthDbEnabled, setLocal } from '@/lib/db/auth';

/**
 * Onde a pessoa está no globo.
 *
 * PARA QUEM É: quem entrou pelo Google. O formulário de cadastro pergunta país,
 * estado e cidade; o botão do Google não pergunta nada — é essa a graça dele.
 * O resultado é uma conta sem lugar nenhum, e no globo isso não é um detalhe:
 * sem coordenada a pessoa não aparece no mapa, não acende sinal e ninguém a
 * encontra ali. O pedido vem no momento em que isso passa a importar.
 *
 * DIFERENTE DO NICKNAME, AQUI DÁ PARA TROCAR quantas vezes quiser. Nome público
 * mudado quebra conversas em andamento; mudar de cidade é só mudar de cidade —
 * é o que acontece com quem se muda.
 */

export const runtime = 'nodejs';

/** O bastante para um nome de lugar, e curto o bastante para não virar depósito. */
const LIMITE = 120;

function limpar(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().slice(0, LIMITE);
  return s.length > 0 ? s : null;
}

export async function POST(request: Request) {
  if (!getSecret() || !isAuthDbEnabled) {
    return NextResponse.json(
      { ok: false, reason: 'auth-nao-configurado' },
      { status: 503 },
    );
  }

  const session = await getSession({ exigirBanco: true });
  if (!session) {
    return NextResponse.json({ ok: false, reason: 'nao-logado' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'json-invalido' }, { status: 400 });
  }

  const country = limpar(body.country);
  const state = limpar(body.state);
  const city = limpar(body.city);

  /*
   * O PAÍS É O MÍNIMO. Estado e cidade são melhores — o globo aproxima mais —,
   * mas exigir os três deixaria de fora quem mora onde essa divisão não existe
   * do mesmo jeito, e o país já coloca a pessoa no mapa.
   */
  if (!country) {
    return NextResponse.json(
      { ok: false, errors: { country: 'Diga ao menos o país.' } },
      { status: 400 },
    );
  }

  await setLocal(session.user.id, { country, state, city });

  // O perfil da tela é remontado a partir daqui; sem refazer o cache, a
  // interface continuaria vendo a conta sem lugar pelo tempo de vida dele.
  const fresco = await findUserById(session.user.id);
  if (fresco) await refreshCache(fresco);

  return NextResponse.json({ ok: true, country, state, city });
}
