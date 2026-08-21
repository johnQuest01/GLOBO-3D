import { NextResponse } from 'next/server';

import { startAdminSession } from '@/lib/auth/session';

/**
 * Conferência da senha de administrador NO SERVIDOR.
 *
 * A senha vive em `ADMIN_PASSWORD` (variável de ambiente do servidor) e nunca
 * entra no pacote que o navegador baixa. Se ela fosse comparada no cliente,
 * qualquer pessoa leria o valor abrindo o DevTools — o que é especialmente
 * grave quando a senha é reaproveitada de outro lugar.
 *
 * ATUALIZADO: agora o acerto emite um COOKIE ASSINADO de administrador
 * (lib/auth/session.ts), e não mais só um `{ok:true}` que o navegador guardava
 * por conta própria. A troca deixou de ser opcional no dia em que o painel
 * ganhou poder de banir conta — forjar a resposta no DevTools continuaria
 * escondendo o painel de animações, mas não produziria o cookie que a rota de
 * moderação exige.
 */

export const runtime = 'nodejs';

/** Comparação em tempo constante, para o tempo de resposta não vazar o acerto. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(request: Request) {
  const expectedEmail = process.env.ADMIN_EMAIL;
  const expectedPassword = process.env.ADMIN_PASSWORD;

  // Sem credencial configurada o painel simplesmente não abre para ninguém.
  if (!expectedEmail || !expectedPassword) {
    return NextResponse.json(
      { ok: false, reason: 'admin-nao-configurado' },
      { status: 503 },
    );
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

  const emailOk = safeEqual(
    email.trim().toLowerCase(),
    expectedEmail.trim().toLowerCase(),
  );
  const passwordOk = safeEqual(password, expectedPassword);

  if (!emailOk || !passwordOk) {
    // Uma resposta só para os dois casos: não dizer qual campo errou.
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // A partir daqui existe uma sessão assinada de administrador, e não só um
  // `{ok:true}` que o navegador guardava por conta própria. Era o que o
  // comentário no topo deste arquivo pedia — e passou a ser necessário no dia
  // em que o painel ganhou poder de banir conta (/api/admin/ban).
  const abriu = await startAdminSession(expectedEmail);

  return NextResponse.json({ ok: true, sessao: abriu });
}
