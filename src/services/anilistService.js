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
        'Origin': 'https://anilist.co',
        'Referer': 'https://anilist.co/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
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
    startDate: media.startDate || null,
    startYear: media.startDate?.year || media.seasonYear || null,
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
          startDate { year month day }
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
          startDate { year month day }
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
          startDate { year month day }
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
          startDate { year month day }
          nextAiringEpisode { episode airingAt }
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
          startDate { year month day }
          nextAiringEpisode { episode airingAt }
        }
      }
    }
  `;

  const data = await fetchAniListGraphQL(query, { search: searchQuery.trim(), page, perPage });
  const mediaList = data?.Page?.media || [];
  return mediaList
    .map(formatAniListMedia)
    .filter(item => {
      if (!item) return false;
      const fmt = (item.format || '').toUpperCase();
      // KULLANICI KESİN KURALI: Sadece TV ve MOVIE (Film) kabul edilir. OVA, ONA, SPECIAL, MUSIC, TV_SHORT derhal elenir!
      if (!['TV', 'MOVIE'].includes(fmt)) return false;
      const titleStr = `${item.title || ''} ${item.title_romaji || ''} ${item.title_english || ''} ${item.title_native || ''}`.toLowerCase();
      if (/(?:özel|ozel|özet|offline|chibi|omake|picture drama|audio drama|drama cd|side story|tokubetsu|soushuuhen|parody|parodi|petit|puchi|bonus|extras|short anime|kısa anime|kisa anime|\b(?:ova|oad|ona|sp|special|specials|recap)\b)/i.test(titleStr)) {
        return false;
      }
      return true;
    });
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
        studios { nodes { name } }
        startDate { year month day }
        relations {
          edges {
            relationType
            node {
              id
              title { romaji english native }
              format
              season
              seasonYear
              episodes
              status
              bannerImage
              coverImage { extraLarge large }
              description
              startDate { year month day }
              nextAiringEpisode { episode airingAt }
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

function detectSeasonFromTitle(titleOrUrl, fallback = 1) {
  if (!titleOrUrl) return fallback;
  const raw = String(titleOrUrl).toLowerCase();

  // Classroom of the Elite franchise handling: "2-nensei" / "2. Sınıf" / "2nd Year" is Season 4!
  if (/youkoso|classroom\s*of\s*the\s*elite/i.test(raw)) {
    if (/4th\s*season|4\.\s*sezon|\bseason\s*4\b|\bsezon\s*4\b/i.test(raw)) return 4;
    if (/2-nensei|2\.\s*s[ıi]n[ıi]f|2nd\s*year|second\s*year/i.test(raw)) return 4;
    if (/3rd\s*season|3\.\s*sezon|\bseason\s*3\b|\bsezon\s*3\b/i.test(raw)) return 3;
    if (/2nd\s*season|2\.\s*sezon|\bseason\s*2\b|\bsezon\s*2\b/i.test(raw)) return 2;
    if (/1st\s*season|1\.\s*sezon|\bseason\s*1\b|\bsezon\s*1\b/i.test(raw)) return 1;
  }

  // 1. Prefix season numbers and ordinals: "4th Season", "4. Sezon", "4 Sezon", "4-sezon"
  const mPref = raw.match(/\b(\d+)\s*\.?\s*(?:st|nd|rd|th)?\s*(?:sezon|season)\b/i) ||
                raw.match(/[-_](\d+)(?:st|nd|rd|th)?[-_](?:sezon|season)/i) ||
                raw.match(/[-_]s(\d+)(?:[-_]|$)/i);
  if (mPref) return parseInt(mPref[1], 10);

  // 2. Suffix season numbers: "Season 4", "Sezon 4", ensuring NOT followed by grade/year/part/gakki:
  const mSuff = raw.match(/\b(?:sezon|season)\s*(\d+)(?!\s*\.?\s*(?:sinif|sınıf|nensei|grade|year|part|cour|kisim|kısım|gakki|semester))\b/i);
  if (mSuff) return parseInt(mSuff[1], 10);

  // 3. Ordinals and Roman Numerals (ensure NOT followed by part/year/grade/gakki)
  const notFollowedBySubUnit = '(?!\s*(?:part|cour|kisim|kısım|sinif|sınıf|nensei|grade|year|semester|gakki|stage|round|half))';

  if (new RegExp('\\b(?:x|10th)\\b' + notFollowedBySubUnit, 'i').test(raw) || /[-_]10(?:th)?[-_]season/i.test(raw)) return 10;
  if (new RegExp('\\b(?:ix|9th)\\b' + notFollowedBySubUnit, 'i').test(raw) || /[-_]9(?:th)?[-_]season/i.test(raw)) return 9;
  if (new RegExp('\\b(?:viii|8th)\\b' + notFollowedBySubUnit, 'i').test(raw) || /[-_]8(?:th)?[-_]season/i.test(raw)) return 8;
  if (new RegExp('\\b(?:vii|7th)\\b' + notFollowedBySubUnit, 'i').test(raw) || /[-_]7(?:th)?[-_]season/i.test(raw)) return 7;
  if (new RegExp('\\b(?:vi|6th)\\b' + notFollowedBySubUnit, 'i').test(raw) || /[-_]6(?:th)?[-_]season/i.test(raw)) return 6;
  if (new RegExp('\\b(?:v|5th)\\b' + notFollowedBySubUnit, 'i').test(raw) || /[-_]5(?:th)?[-_]season/i.test(raw)) return 5;
  if (new RegExp('\\b(?:iv|4th)\\b' + notFollowedBySubUnit, 'i').test(raw) || /[-_]4(?:th)?[-_]season/i.test(raw)) return 4;
  if (new RegExp('\\b(?:iii|3rd)\\b' + notFollowedBySubUnit, 'i').test(raw) || /[-_]3(?:rd)?[-_]season/i.test(raw)) return 3;
  if (new RegExp('\\b(?:ii|2nd)\\b' + notFollowedBySubUnit, 'i').test(raw) || /[-_]2(?:nd)?[-_]season/i.test(raw)) return 2;
  return fallback;
}

function tokenizeTitle(str) {
  if (!str) return [];
  const stopwords = ['the', 'no', 'kara', 'de', 'wa', 'ga', 'season', 'sezon', 'part', 'kisim', 'cour', 'movie', 'film', 'ova', 'ona', 'special', 'anime'];
  return (str || '')
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !stopwords.includes(t));
}

/**
 * Explores prequel/sequel relations to build a complete chronological season chain (1. Sezon, 2. Sezon, 3. Sezon...)
 * Specials, OVAs, ONAs, Recaps and Music are strictly excluded.
 */
export async function fetchFullSeasonChain(initialMedia) {
  if (!initialMedia) return [];
  const initialFmt = (initialMedia.format || '').toUpperCase();
  // Filmler ve TV dışındaki özel yapımlar TV sezon zinciri oluşturmaz
  if (['MOVIE', 'SPECIAL', 'OVA', 'ONA', 'MUSIC', 'TV_SHORT'].includes(initialFmt)) {
    return [];
  }

  let media = initialMedia;
  // If relations are missing or empty, fetch rich details first so we can explore prequel/sequel relations
  if (!Array.isArray(media.relations) || media.relations.length === 0) {
    const mId = media.id || media.anilist_id;
    if (mId) {
      try {
        const rich = await fetchAnimeDetails(parseInt(mId, 10));
        if (rich && Array.isArray(rich.relations) && rich.relations.length > 0) {
          media = rich;
        }
      } catch (e) {}
    }
  }

  const visitedIds = new Set();
  const allSeasonsMap = new Map();

  const baseFranchiseText = `${media.title || ''} ${media.title_romaji || ''} ${media.title_english || ''} ${(media.synonyms || []).join(' ')}`;
  const baseFranchiseTokens = tokenizeTitle(baseFranchiseText);

  function isEligibleSeason(node) {
    if (!node || !node.id) return false;
    const fmt = (node.format || '').toUpperCase();
    if (['SPECIAL', 'OVA', 'ONA', 'MUSIC', 'MOVIE', 'TV_SHORT'].includes(fmt)) return false;
    const titleStr = `${node.title || ''} ${node.title_romaji || ''} ${node.title_english || ''} ${node.orijinal_ad || ''}`.toLowerCase();

    const hasExplicitSeason = /\b(\d+)\s*\.?\s*(?:st|nd|rd|th)?\s*(?:sezon|season)\b/i.test(titleStr) ||
                              /\b(?:sezon|season)\s*\d+\b/i.test(titleStr);
    const isExplicitSpecialOrOva = /\b(?:özel\s*bölüm|ozel\s*bolum|special\s*episode)\b/i.test(titleStr) ||
                                   /\b(?:ova|oad|ona|recap|özet|ozet|offline|chibi|omake)\b/i.test(titleStr);

    if (isExplicitSpecialOrOva) return false;
    if (!hasExplicitSeason && /(?:özel|ozel|özet|\b(?:ova|oad|ona|sp|special|specials|recap|movie|film|filmi|gekijouban)\b)/i.test(titleStr)) return false;

    // Ensure candidate belongs to the same anime franchise
    if (baseFranchiseTokens.length > 0) {
      const nodeTokens = tokenizeTitle(`${node.title || ''} ${node.title_romaji || ''} ${node.title_english || ''} ${(node.synonyms || []).join(' ')}`);
      const matches = baseFranchiseTokens.some(t => nodeTokens.includes(t));
      if (!matches) return false;
    }

    return true;
  }

  const initialId = String(media.id || media.anilist_id || media._id);
  if (initialId && isEligibleSeason(media)) {
    visitedIds.add(initialId);
    allSeasonsMap.set(initialId, media);
  }

  // Direct relations
  const queue = [];
  if (Array.isArray(media.relations)) {
    for (const rel of media.relations) {
      if (rel && rel.node && ['SEQUEL', 'PREQUEL'].includes(rel.relationType) && isEligibleSeason(rel.node)) {
        const relId = String(rel.node.id);
        if (!visitedIds.has(relId)) {
          visitedIds.add(relId);
          allSeasonsMap.set(relId, rel.node);
          queue.push(rel.node);
        }
      }
    }
  }

  // Walk up to 6 depth for sequels/prequels (e.g. S1 -> S2 -> S3 -> S4)
  let depth = 0;
  while (queue.length > 0 && depth < 6 && visitedIds.size < 12) {
    depth++;
    const current = queue.shift();
    const currId = current.id || current.anilist_id;
    if (!currId) continue;

    try {
      const details = await fetchAnimeDetails(currId);
      if (details && Array.isArray(details.relations)) {
        for (const rel of details.relations) {
          if (rel && rel.node && ['SEQUEL', 'PREQUEL'].includes(rel.relationType) && isEligibleSeason(rel.node)) {
            const relId = String(rel.node.id);
            if (!visitedIds.has(relId)) {
              visitedIds.add(relId);
              allSeasonsMap.set(relId, rel.node);
              queue.push(rel.node);
            }
          }
        }
      }
    } catch (e) {
      // ignore fetch failures during chain walk
    }
  }

  const seasonList = Array.from(allSeasonsMap.values());

  // Sort chronologically
  seasonList.sort((a, b) => {
    const yearA = a.startDate?.year || a.startYear || a.seasonYear || 0;
    const yearB = b.startDate?.year || b.startYear || b.seasonYear || 0;
    if (yearA !== yearB && yearA > 0 && yearB > 0) return yearA - yearB;

    const monthA = a.startDate?.month || 0;
    const monthB = b.startDate?.month || 0;
    if (monthA !== monthB && monthA > 0 && monthB > 0) return monthA - monthB;

    const numA = detectSeasonFromTitle(a.title || a.title_romaji || a.orijinal_ad, 1);
    const numB = detectSeasonFromTitle(b.title || b.title_romaji || b.orijinal_ad, 1);
    if (numA !== numB) return numA - numB;

    return (parseInt(a.id || a.anilist_id, 10) || 0) - (parseInt(b.id || b.anilist_id, 10) || 0);
  });

  let currentSeasonCounter = 1;
  let prevSeasonNum = 1;

  return seasonList.map((item, idx) => {
    const rawTitle = item.title || item.title_romaji || item.title_english || item.orijinal_ad || '';
    const explicit = detectSeasonFromTitle(rawTitle, 0);
    const isPart2 = /\b(?:part|cour|kısım|kisim)\s*2\b/i.test(rawTitle) || /\b2nd\s*(?:part|cour)\b/i.test(rawTitle);
    const isPart3 = /\b(?:part|cour|kısım|kisim)\s*3\b/i.test(rawTitle) || /\b3rd\s*(?:part|cour)\b/i.test(rawTitle) || /kanketsu\s*hen|final\s*chapters/i.test(rawTitle);
    const isPart4 = /\b(?:part|cour|kısım|kisim)\s*4\b/i.test(rawTitle) || /\b4th\s*(?:part|cour)\b/i.test(rawTitle);
    const isFinal = /\b(?:the\s+)?final\s+(?:season|sezon)\b/i.test(rawTitle) || /the\s*final/i.test(rawTitle);

    let sNum;
    let label;

    if (explicit > 0) {
      sNum = explicit;
      currentSeasonCounter = Math.max(currentSeasonCounter, sNum);
    } else if (idx === 0) {
      sNum = 1;
      currentSeasonCounter = 1;
    } else if (isPart2 || isPart3 || isPart4) {
      sNum = prevSeasonNum;
    } else {
      currentSeasonCounter++;
      sNum = currentSeasonCounter;
    }

    prevSeasonNum = sNum;

    const partNum = isPart4 ? 4 : (isPart3 ? 3 : (isPart2 ? 2 : 1));

    if (isFinal) {
      if (partNum > 1) {
        label = `${sNum}. Sezon (Final) ${partNum}. Kısım`;
      } else {
        label = `${sNum}. Sezon (Final)`;
      }
    } else {
      if (partNum > 1) {
        label = `${sNum}. Sezon ${partNum}. Kısım`;
      } else {
        label = `${sNum}. Sezon`;
      }
    }

    const sId = String(item.id || item.anilist_id || item._id);
    return {
      _id: sId,
      anilist_id: item.id || item.anilist_id,
      season_number: sNum,
      part_number: partNum,
      is_final: isFinal,
      label: label,
      title: item.title || item.orijinal_ad,
      title_romaji: item.title_romaji || item.title || '',
      title_english: item.title_english || item.title || '',
      category: 'seasons',
      cover_image: item.coverImage || item.poster,
      banner_image: item.bannerImage || item.banner,
      episodes: item.total_episodes || item.episodes || 0,
      format: item.format || 'TV',
      status: item.status || 'FINISHED',
      startDate: item.startDate || null,
      nextAiringEpisode: item.nextAiringEpisode || null,
      season: item.season || null,
      seasonYear: item.seasonYear || null,
      node: item
    };
  });
}

/**
 * Helper to determine if an AniList date object is in the past
 * @param {{ year?: number, month?: number, day?: number }} d
 * @returns {boolean} true if date is strictly in the past
 */
function isDateInPast(d) {
  if (!d || !d.year) return false;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentDay = now.getDate(); // 1-31

  if (d.year < currentYear) return true;
  if (d.year > currentYear) return false;

  // Aynı yıl
  if (!d.month) return false;
  if (d.month < currentMonth) return true;
  if (d.month > currentMonth) return false;

  // Aynı yıl ve aynı ay
  if (!d.day) return false;
  if (d.day <= currentDay) return true;

  return false;
}

/**
 * Helper to determine if an AniList date object is strictly in the future
 * @param {{ year?: number, month?: number, day?: number }} d
 * @returns {boolean} true if date is strictly in the future
 */
function isDateInFuture(d) {
  if (!d || !d.year) return false;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  if (d.year > currentYear) return true;
  if (d.year < currentYear) return false;

  // Aynı yıl
  if (!d.month) return false;
  if (d.month > currentMonth) return true;
  if (d.month < currentMonth) return false;

  // Aynı yıl ve aynı ay
  if (!d.day) return false;
  if (d.day > currentDay) return true;

  return false;
}

/**
 * Checks whether an anime or season has not been released yet.
 * Source of truth: AniList release dates (startDate, nextAiringEpisode, seasonYear).
 * An anime whose release date is in the past is NEVER upcoming.
 */
export function isAnimeUpcoming(item) {
  if (!item) return false;

  const startDate = item.startDate || item.node?.startDate;
  const nextEp = item.nextAiringEpisode || item.node?.nextAiringEpisode;
  const seasonYear = item.seasonYear || item.node?.seasonYear;
  const status = (item.status || item.node?.status || '').toUpperCase();

  const now = new Date();
  const currentYear = now.getFullYear();

  // 1. KESİN GEÇMİŞ KONTROLÜ: Tarih zaten geçmişse (Örn: Temmuz 2025, bugün Eylül 2026),
  // AniList durumu ne olursa olsun (NOT_YET_RELEASED kalsa dahi) anime YAYINLANMIŞTIR!
  if (startDate && isDateInPast(startDate)) {
    return false;
  }
  if (!startDate && seasonYear && seasonYear < currentYear) {
    return false;
  }
  if (nextEp && nextEp.airingAt && nextEp.airingAt * 1000 <= Date.now()) {
    return false;
  }
  if (nextEp && nextEp.episode > 1) {
    // 1. bölümden sonrası çıkmışsa anime zaten yayınlanmaktadır
    return false;
  }

  // 2. KESİN GELECEK KONTROLÜ: Tarih gelecekteyse henüz çıkmamıştır
  if (startDate && isDateInFuture(startDate)) {
    return true;
  }
  if (!startDate && seasonYear && seasonYear > currentYear) {
    return true;
  }
  if (nextEp && nextEp.episode === 1 && nextEp.airingAt && nextEp.airingAt * 1000 > Date.now()) {
    return true;
  }

  // 3. Tarih bilgisi yok ama AniList durumu NOT_YET_RELEASED ise (TBA animeler)
  if (status === 'NOT_YET_RELEASED') {
    return true;
  }

  return false;
}

/**
 * Formats release date in Turkish
 */
export function formatReleaseDateTr(item) {
  if (!item) return 'Yakında';

  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  const startDate = item.startDate || item.node?.startDate;
  if (startDate && startDate.year) {
    if (startDate.month && startDate.day) {
      return `${startDate.day} ${months[startDate.month - 1]} ${startDate.year}`;
    }
    if (startDate.month) {
      return `${months[startDate.month - 1]} ${startDate.year}`;
    }
    return `${startDate.year}`;
  }

  const nextEp = item.nextAiringEpisode || item.node?.nextAiringEpisode;
  if (nextEp && nextEp.airingAt) {
    const d = new Date(nextEp.airingAt * 1000);
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  const season = item.season || item.node?.season;
  const seasonYear = item.seasonYear || item.node?.seasonYear;
  if (seasonYear) {
    const seasonMap = { WINTER: 'Kış', SPRING: 'İlkbahar', SUMMER: 'Yaz', FALL: 'Sonbahar' };
    const seasonTr = seasonMap[season] || '';
    return seasonTr ? `${seasonTr} ${seasonYear}` : `${seasonYear}`;
  }

  return 'Yakında';
}

