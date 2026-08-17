const axios = require('axios');

/**
 * Searches AniList with full media metadata
 */
async function queryAniList(searchQuery) {
  if (!searchQuery || searchQuery.trim().length < 2) return [];
  
  const query = `
    query ($search: String) {
      Page(page: 1, perPage: 10) {
        media(search: $search, type: ANIME, format_not: MUSIC) {
          id
          title {
            romaji
            english
            native
          }
          format
          seasonYear
          episodes
          status
          genres
          averageScore
          coverImage {
            large
            extraLarge
          }
          bannerImage
          description
          synonyms
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      'https://graphql.anilist.co',
      { query, variables: { search: searchQuery.trim() } },
      { headers: { 'Content-Type': 'application/json', 'User-Agent': 'ClofthelApp/1.3' }, timeout: 6000 }
    );
    return response?.data?.data?.Page?.media || [];
  } catch (err) {
    return [];
  }
}

/**
 * Fallback to Kitsu API for mapping
 */
async function queryKitsu(searchQuery) {
  if (!searchQuery || searchQuery.trim().length < 2) return [];
  try {
    const response = await axios.get(
      `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(searchQuery.trim())}&page[limit]=5`,
      { headers: { 'Accept': 'application/vnd.api+json' }, timeout: 6000 }
    );
    const data = response.data?.data || [];
    return data.map(item => {
      const attrs = item.attributes || {};
      return {
        id: item.id,
        title: {
          romaji: attrs.canonicalTitle || attrs.titles?.ja_jp || attrs.titles?.en_jp,
          english: attrs.titles?.en || attrs.titles?.en_us || attrs.canonicalTitle,
          native: attrs.titles?.ja_jp
        },
        format: (attrs.subtype || 'TV').toUpperCase(),
        seasonYear: attrs.startDate ? parseInt(attrs.startDate.split('-')[0], 10) : null,
        episodes: attrs.episodeCount,
        synonyms: attrs.abbreviatedTitles || []
      };
    });
  } catch (err) {
    return [];
  }
}

/**
 * Extracts season and part info from title or slug
 */
function extractSeasonAndPart(text) {
  if (!text) return { season: 1, part: 1, isMovie: false, isOva: false };

  const lower = text.toLowerCase();
  const isMovie = lower.includes('movie') || lower.includes('film') || lower.includes('the movie');
  const isOva = lower.includes('ova') || lower.includes('ona') || lower.includes('special');

  let season = 1;
  let part = 1;

  // Season detection: "2. Sezon", "Season 2", "2nd Season", "s2", "s3"
  const seasonMatch = lower.match(/(?:(\d+)(?:\.|st|nd|rd|th)?\s*(?:sezon|season)|season\s*(\d+)|s(\d+))/i);
  if (seasonMatch) {
    season = parseInt(seasonMatch[1] || seasonMatch[2] || seasonMatch[3], 10);
  }

  // Part / Kısım detection: "2. Kısım", "Part 2", "Cour 2"
  const partMatch = lower.match(/(?:(\d+)(?:\.|st|nd|rd|th)?\s*(?:kısım|kisim|part|cour)|part\s*(\d+)|cour\s*(\d+))/i);
  if (partMatch) {
    part = parseInt(partMatch[1] || partMatch[2] || partMatch[3], 10);
  }

  return { season, part, isMovie, isOva };
}

/**
 * Scores AniList media candidates to find the EXACT season/part match
 */
function scoreAniListMedia(media, targetInfo, targetTitle, otherNames = []) {
  let score = 0;
  const romaji = (media.title?.romaji || '').toLowerCase();
  const english = (media.title?.english || '').toLowerCase();
  const synonyms = (media.synonyms || []).map(s => s.toLowerCase());
  const allMediaNames = [romaji, english, ...synonyms].filter(Boolean);

  const mediaSeasonInfo = extractSeasonAndPart(`${romaji} ${english} ${synonyms.join(' ')}`);

  // 1. Exact match with otherNames (from tranimeizle metadata)
  for (const on of otherNames) {
    const onLower = on.toLowerCase();
    if (allMediaNames.some(name => name === onLower || name.includes(onLower) || onLower.includes(name))) {
      score += 100;
    }
  }

  // 2. Format Match
  if (targetInfo.isMovie) {
    if (media.format === 'MOVIE') score += 50;
    else score -= 40;
  } else if (targetInfo.isOva) {
    if (['OVA', 'ONA', 'SPECIAL'].includes(media.format)) score += 40;
  } else {
    if (media.format === 'TV' || media.format === 'TV_SHORT') score += 20;
    else if (media.format === 'MOVIE') score -= 30;
  }

  // 3. Season Number Match
  if (targetInfo.season > 1) {
    if (mediaSeasonInfo.season === targetInfo.season) {
      score += 60;
    } else if (mediaSeasonInfo.season === 1) {
      score -= 30; // Penalize Season 1 candidate if we are looking for Season 2+
    }
  } else if (targetInfo.season === 1 && !targetInfo.isMovie && !targetInfo.isOva) {
    if (mediaSeasonInfo.season === 1) {
      score += 30;
    } else {
      score -= 40; // Penalize Season 2/3 candidate if we want Season 1
    }
  }

  // 4. Part / Kısım Match
  if (targetInfo.part > 1) {
    if (mediaSeasonInfo.part === targetInfo.part || romaji.includes(`part ${targetInfo.part}`) || english.includes(`part ${targetInfo.part}`) || synonyms.some(s => s.includes(`part ${targetInfo.part}`))) {
      score += 80;
    } else {
      score -= 20;
    }
  }

  return score;
}

/**
 * Resolves the EXACT season/movie AniList ID for a given anime
 */
async function resolveExactAniListId(title, slug = '', otherNames = []) {
  const targetInfo = extractSeasonAndPart(`${title} ${slug}`);
  let candidates = [];

  // Search 1: Use otherNames from tranimeizle (e.g. "Re:Zero kara Hajimeru Isekai Seikatsu 2nd Season Part 2")
  for (const name of otherNames) {
    if (name && name.length > 3) {
      let results = await queryAniList(name);
      if (results.length === 0) results = await queryKitsu(name);
      if (results.length > 0) {
        candidates.push(...results);
        break;
      }
    }
  }

  // Search 2: Use title with translated season terms
  if (candidates.length === 0) {
    let cleanQuery = title
      .replace(/\s*izle$/i, '')
      .replace(/(\d+)\.\s*Sezon/i, 'Season $1')
      .replace(/(\d+)\.\s*Kısım/i, 'Part $1')
      .trim();

    let results = await queryAniList(cleanQuery);
    if (results.length === 0) results = await queryKitsu(cleanQuery);
    if (results.length > 0) candidates.push(...results);
  }

  // Search 3: Fallback without Season suffix
  if (candidates.length === 0) {
    let baseQuery = title
      .replace(/\s*izle$/i, '')
      .replace(/\s*\d+[\s.]*(?:sezon|kisim|part|season).*$/i, '')
      .trim();
    let results = await queryAniList(baseQuery);
    if (results.length === 0) results = await queryKitsu(baseQuery);
    if (results.length > 0) candidates.push(...results);
  }

  if (candidates.length === 0) return null;

  // Deduplicate candidates by ID
  const uniqueMap = new Map();
  for (const c of candidates) {
    if (!uniqueMap.has(c.id)) uniqueMap.set(c.id, c);
  }
  const uniqueCandidates = Array.from(uniqueMap.values());

  // Score each candidate
  let bestCandidate = null;
  let highestScore = -Infinity;

  for (const cand of uniqueCandidates) {
    const score = scoreAniListMedia(cand, targetInfo, title, otherNames);
    if (score > highestScore) {
      highestScore = score;
      bestCandidate = cand;
    }
  }

  if (bestCandidate) {
    return {
      anilist_id: typeof bestCandidate.id === 'number' ? bestCandidate.id : parseInt(bestCandidate.id, 10) || null,
      title_en: bestCandidate.title?.english || bestCandidate.title?.romaji,
      title_romaji: bestCandidate.title?.romaji,
      format: bestCandidate.format,
      genres: Array.isArray(bestCandidate.genres) ? bestCandidate.genres : [],
      cover_image: bestCandidate.coverImage?.extraLarge || bestCandidate.coverImage?.large || null,
      banner_image: bestCandidate.bannerImage || null,
      description: bestCandidate.description || null,
      average_score: bestCandidate.averageScore || null,
      season_year: bestCandidate.seasonYear,
      total_episodes: bestCandidate.episodes
    };
  }

  return null;
}

module.exports = {
  resolveExactAniListId,
  extractSeasonAndPart,
  scoreAniListMedia,
  queryAniList
};
