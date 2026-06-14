import { NextResponse } from 'next/server';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 saat
let cache: { data: unknown; expiresAt: number } | null = null;

const ANILIST_QUERY = `
  query {
    trending: Page(page: 1, perPage: 20) {
      media(type: ANIME, sort: TRENDING_DESC, status_not: NOT_YET_RELEASED) {
        id
        title { romaji english native }
        coverImage { large extraLarge }
        bannerImage
        averageScore
        episodes
        format
        status
        genres
      }
    }
  }
`;

export async function GET() {
  // Cache kontrolü
  if (cache && Date.now() < cache.expiresAt) {
    return NextResponse.json(cache.data, {
      headers: {
        'Cache-Control': 'public, max-age=1800, s-maxage=3600',
        'X-Cache': 'HIT',
      },
    });
  }

  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: ANILIST_QUERY }),
      next: { revalidate: 3600 },
    });

    if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);

    const json = await res.json();
    const media = json?.data?.trending?.media ?? [];

    // Formatla ve döndür
    const data = media.map((m: any) => ({
      id: m.id,
      title: m.title.english || m.title.romaji || m.title.native || 'Bilinmeyen',
      titleRomaji: m.title.romaji,
      cover: m.coverImage?.extraLarge || m.coverImage?.large || '',
      banner: m.bannerImage || null,
      score: m.averageScore ? (m.averageScore / 10).toFixed(1) : 'N/A',
      episodes: m.episodes || null,
      format: m.format || 'TV',
      status: m.status || 'UNKNOWN',
      genres: m.genres?.slice(0, 3) || [],
    }));

    // Belleğe cache'le
    cache = { data: { success: true, data }, expiresAt: Date.now() + CACHE_TTL_MS };

    return NextResponse.json({ success: true, data }, {
      headers: {
        'Cache-Control': 'public, max-age=1800, s-maxage=3600',
        'X-Cache': 'MISS',
      },
    });
  } catch (err: any) {
    console.error('[/api/trending] AniList error:', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
