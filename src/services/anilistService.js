/**
 * AniList GraphQL Client & Service
 * Fast, lightweight, zero-dependency catalog provider for Clofthel.
 * Primary source of truth for Anime metadata, seasons, trending, and search.
 */

const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';

// In-memory cache to prevent redundant network calls and rate limiting (90 req/min)
const memoryCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCached(key) {
  const item = memoryCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key, data, ttlMs = CACHE_TTL_MS) {
  memoryCache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Standard AniList GraphQL request
 */
async function fetchAniListGraphQL(query, variables = {}) {
  const cacheKey = JSON.stringify({ query, variables });
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(ANILIST_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'ClofthelApp/2.0 (Mobile Android; Lightweight Client)',
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[AniList] HTTP error ${res.status}: ${res.statusText}`);
      return null;
    }

    const json = await res.json();
    if (json.errors) {
      console.warn('[AniList] GraphQL errors:', json.errors);
      return null;
    }

    const data = json.data;
    setCache(cacheKey, data);
    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    console.error('[AniList] Request failed:', err.message);
    return null;
  }
}

/**
 * Normalizes AniList media object into Clofthel's UI model
 */
export function formatAniListMedia(media) {
  if (!media) return null;

  const displayTitle = media.title?.romaji || media.title?.english || media.title?.native || 'Bilinmeyen Anime';
  const cleanDescription = media.description
    ? media.description.replace(/<[^>]*>?/gm, '').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').trim()
    : 'Açıklama bulunamadı.';

  const scoreFormatted = media.averageScore ? (media.averageScore / 10).toFixed(1) : null;

  return {
    _id: String(media.id),
    id: media.id,
    anilist_id: media.id,
    orijinal_ad: displayTitle,
    title: displayTitle,
    title_romaji: media.title?.romaji || '',
    title_english: media.title?.english || '',
    title_native: media.title?.native || '',
    coverImage: media.coverImage?.extraLarge || media.coverImage?.large || '',
    poster: media.coverImage?.extraLarge || media.coverImage?.large || '',
    bannerImage: media.bannerImage || media.coverImage?.extraLarge || media.coverImage?.large || '',
    banner: media.bannerImage || media.coverImage?.extraLarge || media.coverImage?.large || '',
    rating: scoreFormatted || '8.2',
    averageScore: media.averageScore,
    total_episodes: media.episodes || null,
    totalEpisodes: media.episodes || null,
    episodes_count: media.episodes || null,
    format: media.format || 'TV',
    status: media.status || 'FINISHED',
    season: media.season || null,
    seasonYear: media.seasonYear || null,
    genres: media.genres || [],
    synopsis: cleanDescription,
    description: cleanDescription,
    synonyms: media.synonyms || [],
    nextAiringEpisode: media.nextAiringEpisode || null,
    studios: media.studios?.nodes?.map(s => s.name) || [],
    relations: media.relations?.edges?.map(e => ({
      relationType: e.relationType,
      node: formatAniListMedia(e.node),
    })) || [],
  };
}

/**
 * Computes current season and year based on date
 */
export function getCurrentSeason() {
  const date = new Date();
  const month = date.getMonth() + 1; // 1-12
  const year = date.getFullYear();

  let season = 'WINTER';
  if (month >= 3 && month <= 5) season = 'SPRING';
  else if (month >= 6 && month <= 8) season = 'SUMMER';
  else if (month >= 9 && month <= 11) season = 'FALL';
  else season = 'WINTER';

  return { season, year };
}

/**
 * 1. Fetch Trending Animes
 */
export async function fetchTrendingAnimes(page = 1, perPage = 20) {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: TRENDING_DESC, format_not: MUSIC) {
          id
          title { romaji english native }
          format
          season
          seasonYear
          episodes
          status
          genres
          averageScore
          bannerImage
          coverImage { extraLarge large }
          description
          nextAiringEpisode { episode airingAt }
        }
      }
    }
  `;

  const data = await fetchAniListGraphQL(query, { page, perPage });
  const mediaList = data?.Page?.media || [];
  return mediaList.map(formatAniListMedia);
}

/**
 * 2. Fetch Seasonal Animes (e.g. Winter 2025, Spring 2025)
 */
export async function fetchSeasonalAnimes(season = null, year = null, page = 1, perPage = 20) {
  const current = getCurrentSeason();
  const targetSeason = season || current.season;
  const targetYear = year || current.year;

  const query = `
    query ($season: MediaSeason, $seasonYear: Int, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, season: $season, seasonYear: $seasonYear, sort: POPULARITY_DESC, format_not: MUSIC) {
          id
          title { romaji english native }
          format
          season
          seasonYear
          episodes
          status
          genres
          averageScore
          bannerImage
          coverImage { extraLarge large }
          description
          nextAiringEpisode { episode airingAt }
        }
      }
    }
  `;

  const data = await fetchAniListGraphQL(query, {
    season: targetSeason,
    seasonYear: targetYear,
    page,
    perPage,
  });

  const mediaList = data?.Page?.media || [];
  return mediaList.map(formatAniListMedia);
}

/**
 * 3. Fetch Top Rated / Popular All-Time
 */
export async function fetchPopularAnimes(page = 1, perPage = 20) {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: POPULARITY_DESC, format_not: MUSIC) {
          id
          title { romaji english native }
          format
          season
          seasonYear
          episodes
          status
          genres
          averageScore
          bannerImage
          coverImage { extraLarge large }
          description
        }
      }
    }
  `;

  const data = await fetchAniListGraphQL(query, { page, perPage });
  const mediaList = data?.Page?.media || [];
  return mediaList.map(formatAniListMedia);
}

/**
 * 4. Fetch Animes by Genre (Action, Romance, Comedy, Fantasy, etc.)
 */
export async function fetchAnimesByGenre(genre, page = 1, perPage = 20) {
  const query = `
    query ($genre: String, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, genre: $genre, sort: POPULARITY_DESC, format_not: MUSIC) {
          id
          title { romaji english native }
          format
          season
          seasonYear
          episodes
          status
          genres
          averageScore
          bannerImage
          coverImage { extraLarge large }
          description
        }
      }
    }
  `;

  const data = await fetchAniListGraphQL(query, { genre, page, perPage });
  const mediaList = data?.Page?.media || [];
  return mediaList.map(formatAniListMedia);
}

/**
 * 5. Search Animes by Query
 */
export async function searchAnimes(searchQuery, page = 1, perPage = 20) {
  if (!searchQuery || searchQuery.trim().length < 2) return [];

  const query = `
    query ($search: String, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, search: $search, sort: SEARCH_MATCH, format_not: MUSIC) {
          id
          title { romaji english native }
          format
          season
          seasonYear
          episodes
          status
          genres
          averageScore
          bannerImage
          coverImage { extraLarge large }
          description
          synonyms
        }
      }
    }
  `;

  const data = await fetchAniListGraphQL(query, { search: searchQuery.trim(), page, perPage });
  const mediaList = data?.Page?.media || [];
  return mediaList.map(formatAniListMedia);
}

/**
 * 6. Fetch Full Anime Details by AniList ID
 */
export async function fetchAnimeDetails(anilistId) {
  if (!anilistId) return null;

  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        title { romaji english native }
        format
        season
        seasonYear
        episodes
        status
        genres
        averageScore
        bannerImage
        coverImage { extraLarge large }
        description
        synonyms
        nextAiringEpisode { episode airingAt }
        studios(isMain: true) {
          nodes { id name }
        }
        relations {
          edges {
            relationType
            node {
              id
              title { romaji english native }
              format
              episodes
              coverImage { large }
            }
          }
        }
      }
    }
  `;

  const data = await fetchAniListGraphQL(query, { id: parseInt(anilistId, 10) });
  if (!data?.Media) return null;
  return formatAniListMedia(data.Media);
}
