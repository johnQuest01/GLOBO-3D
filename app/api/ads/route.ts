// app/api/ads/route.ts
// Endpoint de anúncios ativos COM segmentação por interesse + região.

import { NextRequest, NextResponse } from 'next/server';
import { isDbEnabled, getTargetedAds } from '@/lib/db/ads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/ads?interests=viagem,luxo&region=Brazil
export async function GET(req: NextRequest) {
  if (!isDbEnabled) {
    return NextResponse.json({ enabled: false, ads: [] });
  }

  const interestsParam = req.nextUrl.searchParams.get('interests') || '';
  const region = req.nextUrl.searchParams.get('region');
  const interests = interestsParam
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  try {
    const ads = await getTargetedAds({ interests, region });
    return NextResponse.json({ enabled: true, ads });
  } catch (err) {
    console.error('[api/ads GET] erro:', err);
    return NextResponse.json({ enabled: true, ads: [] }, { status: 500 });
  }
}
