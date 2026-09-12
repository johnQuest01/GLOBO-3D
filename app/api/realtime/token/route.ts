import { NextResponse } from 'next/server';

import { getSecret } from '@/lib/auth/cookies';
import { getSession } from '@/lib/auth/session';
import { isAuthDbEnabled } from '@/lib/db/auth';
import { mintRealtimeToken, TOKEN_TTL_SEC } from '@/realtime/shared/token';

/**
 * O crachá que o navegador apresenta ao servidor de realtime.
 *
 * Quem prova a identidade é ESTE servidor, que tem o cookie de sessão e o
 * banco. O servidor de realtime não tem nenhum dos dois: ele recebe um token
 * curto e assinado e confia na assinatura, e é só isso que ele precisa fazer.
 *
 * Sem sessão, 401 — e o cliente segue sem token, como visitante anônimo. Isso
 * não o impede de ver o globo; impede de dizer que é alguém.
 */

export const runtime = 'nodejs';

function segredo(): string | null {
  const s = process.env.REALTIME_TOKEN_SECRET?.trim();
  // O mesmo critério do AUTH_SECRET: curto demais não é segredo, e um valor
  // padrão "para funcionar em dev" acabaria em produção.
  return s && s.length >= 32 ? s : null;
}

export async function GET() {
  if (!getSecret() || !isAuthDbEnabled) {
    return NextResponse.json(
      { ok: false, reason: 'auth-nao-configurado' },
      { status: 503 },
    );
  }

  const chave = segredo();
  if (!chave) {
    // 503 e não 500: isto é configuração ausente, não defeito. A interface
    // trata como "realtime indisponível" e o globo continua igual.
    return NextResponse.json(
      { ok: false, reason: 'realtime-nao-configurado' },
      { status: 503 },
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, reason: 'nao-logado' }, { status: 401 });
  }

  const token = mintRealtimeToken(
    {
      uid: session.user.id,
      ...(session.user.nickname ? { nick: session.user.nickname.toLowerCase() } : {}),
    },
    chave,
  );

  return NextResponse.json(
    { ok: true, token, expiresInSec: TOKEN_TTL_SEC },
    // Um crachá com nome dentro não pode ficar em cache de proxy nenhum.
    { headers: { 'cache-control': 'no-store' } },
  );
}
