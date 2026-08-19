import { NextResponse } from 'next/server';
import { getAffinity, getRecommendedNews, isDbEnabled } from '@/lib/db/behavior';

/**
 * Notícias ordenadas pelo perfil de quem pede.
 *
 * Quem ainda não tem histórico recebe as mais recentes: o algoritmo degrada
 * para cronológico em vez de devolver vazio.
 */

export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!isDbEnabled) {
    return NextResponse.json({ ok: false, reason: 'db-desativado', news: [] }, { status: 503 });
  }

  const url = new URL(request.url);
  const clientId = url.searchParams.get('clientId') ?? '';
  const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 50);
  const withAffinity = url.searchParams.get('affinity') === '1';

  if (!clientId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    const news = await getRecommendedNews(clientId, limit);
    const affinity = withAffinity ? await getAffinity(clientId) : undefined;
    return NextResponse.json({ ok: true, news, affinity });
  } catch (error) {
    console.error('[recommendations] falha:', error);
    return NextResponse.json({ ok: false, news: [] }, { status: 500 });
  }
}
