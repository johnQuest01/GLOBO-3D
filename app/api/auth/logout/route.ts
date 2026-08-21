import { NextResponse } from 'next/server';

import { endSession } from '@/lib/auth/session';

/**
 * Saída.
 *
 * Só POST: se fosse GET, bastaria alguém colocar a URL numa tag <img> num
 * outro site para deslogar quem visitasse a página.
 */

export const runtime = 'nodejs';

export async function POST() {
  await endSession();
  return NextResponse.json({ ok: true });
}
