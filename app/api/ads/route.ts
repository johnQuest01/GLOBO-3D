// app/api/ads/route.ts
// Endpoint de anúncios ativos (marketing interativo).

import { NextResponse } from 'next/server';
import { isDbEnabled, getActiveAds } from '@/lib/db/ads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/ads
export async function GET() {
  if (!isDbEnabled) {
    return NextResponse.json({ enabled: false, ads: [] });
  }
  try {
    const rows = await getActiveAds();
    return NextResponse.json({ enabled: true, ads: rows });
  } catch (err) {
    console.error('[api/ads GET] erro:', err);
    return NextResponse.json({ enabled: true, ads: [] }, { status: 500 });
  }
}
