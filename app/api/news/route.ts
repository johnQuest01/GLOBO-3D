// app/api/news/route.ts
// Endpoint de notícias por região (leitura). A connection string do Neon
// fica protegida no servidor.

import { NextRequest, NextResponse } from 'next/server';
import { isDbEnabled, getNewsByRegion } from '@/lib/db/news';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/news?region=<regionKey>
export async function GET(req: NextRequest) {
  const region = req.nextUrl.searchParams.get('region') || '';

  if (!isDbEnabled || !region) {
    return NextResponse.json({ enabled: isDbEnabled, news: [] });
  }

  try {
    const rows = await getNewsByRegion(region);
    return NextResponse.json({ enabled: true, news: rows });
  } catch (err) {
    console.error('[api/news GET] erro:', err);
    return NextResponse.json({ enabled: true, news: [] }, { status: 500 });
  }
}
