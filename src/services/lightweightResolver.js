/**
 * Lightweight On-Demand Tranimeizle Resolver & Stream Extractor
 * Pure JavaScript, zero-overhead, runs directly in React Native (Hermes).
 * No heavy Node.js server, no synthetic .click() scripts.
 */

/**
 * Normalizes title string into comparison tokens
 */
export function tokenizeTitleClient(str) {
  if (!str) return [];
  const stopwords = ['izle', 'turkce', 'altyazi', 'dublaj', 'full', 'hd', 'anime', 'the', 'no', 'kara', 'de', 'wa', 'ga', 'season', 'sezon', 'part', 'kisim', 'cour', 'movie', 'film', 'ova', 'ona', 'special'];
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !stopwords.includes(t));
}

export const BASE_URL = 'https://www.tranimeizle.io';

export const MOBILE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Upgrade-Insecure-Requests': '1',
};

/**
 * Robust HTTP GET with timeout
 */
export async function fetchHtml(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: MOBILE_HEADERS,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const status = res.status;
    const html = await res.text();

    return { status, html, size: html.length, ok: res.ok };
  } catch (err) {
    clearTimeout(timer);
    return { status: 0, html: '', size: 0, error: err.message, ok: false };
  }
}

/**
 * Checks whether the response is a Bot Control / Challenge page or a real page
 */
export function isBotBlocked(html, size = 0) {
  if (!html || html.length < 300) return true;

  const lower = html.toLowerCase();
  if (
    lower.includes('<title>bot kontrol') ||
    lower.includes('<title>bağlantı doğrulaması') ||
    lower.includes('captcha-holder') ||
    lower.includes('icon-captcha') ||
    lower.includes('cf-turnstile') ||
    lower.includes('just a moment...') ||
    lower.includes('ddos-guard')
  ) {
    return true;
  }

  return false;
}

/**
 * Transforms an internal /explorer/ player URL to a direct .m3u8 stream URL
 * e.g. /explorer/UUID/HASH -> /plateau/UUID/HASH.m3u8
 */
export function transformExplorerToM3u8(url) {
  if (!url || typeof url !== 'string' || !url.includes('/explorer/')) return null;

  try {
    const match = url.match(/\/explorer\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/);
    if (match) {
      const uuid = match[1];
      const hash = match[2];
      const originMatch = url.match(/^(https?:\/\/[^\/]+)/);
      const origin = originMatch ? originMatch[1] : BASE_URL;
      return `${origin}/plateau/${uuid}/${hash}.m3u8`;
    }
  } catch (e) {
    console.warn('[Resolver] Failed to transform explorer URL:', e.message);
  }
  return null;
}

/**
 * 1. Search Tranimeizle and pick the best matching anime overview URL
 */
export async function searchTranimeizleMatch(animeInfo) {
  const queriesToTry = [];

  // Construct queries: Romaji, English, and synonyms
  if (animeInfo.title_romaji) queriesToTry.push(animeInfo.title_romaji);
  if (animeInfo.title_english && animeInfo.title_english !== animeInfo.title_romaji) {
    queriesToTry.push(animeInfo.title_english);
  }
  if (animeInfo.orijinal_ad && !queriesToTry.includes(animeInfo.orijinal_ad)) {
    queriesToTry.push(animeInfo.orijinal_ad);
  }
  if (Array.isArray(animeInfo.synonyms)) {
    animeInfo.synonyms.slice(0, 2).forEach(s => {
      if (s && !queriesToTry.includes(s)) queriesToTry.push(s);
    });
  }

  const seasonSuffix = animeInfo.seasonYear && animeInfo.season
    ? (animeInfo.seasonNumber > 1 ? ` ${animeInfo.seasonNumber}. Sezon` : '')
    : '';

  for (const rawQuery of queriesToTry) {
    const query = `${rawQuery}${seasonSuffix}`.trim();
    // Try both search endpoints used by tranimeizle
    const searchUrls = [
      `${BASE_URL}/arama/${encodeURIComponent(query)}`,
      `${BASE_URL}/arama?q=${encodeURIComponent(query)}`,
    ];

    for (const searchUrl of searchUrls) {
      try {
        const { html, size, ok } = await fetchHtml(searchUrl);
        if (!ok || isBotBlocked(html, size)) {
          continue;
        }

        // Parse anime links from search results
        const candidateLinks = parseSearchResultsHtml(html);
        if (candidateLinks.length > 0) {
          // Score candidates against expected titles
          const bestMatch = pickBestCandidate(candidateLinks, queriesToTry);
          if (bestMatch) {
            return bestMatch;
          }
        }
      } catch (err) {
        console.warn(`[Resolver] Search error for "${query}":`, err.message);
      }
    }
  }

  return null;
}

/**
 * Extracts candidate anime overview links from search HTML
 */
export function parseSearchResultsHtml(html) {
  const candidates = [];
  const seen = new Set();

  // Pattern 1: All <a href="..."> tags
  const aRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = aRegex.exec(html)) !== null) {
    let href = match[1].trim();
    const content = match[2];

    if (
      !href ||
      href.startsWith('#') ||
      href.startsWith('javascript:') ||
      href.includes('/arama') ||
      href.includes('/kategori') ||
      href.includes('/iletisim') ||
      href.includes('/login') ||
      href.includes('/kayit') ||
      href.includes('/api/') ||
      href.includes('/dmca') ||
      href.includes('/profil') ||
      href.includes('-bolum') || // skip individual episodes
      href === '/'
    ) {
      continue;
    }

    if (href.startsWith('/')) {
      href = `${BASE_URL}${href}`;
    }

    if (seen.has(href)) continue;

    const titleMatch = content.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i) ||
                       content.match(/class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i) ||
                       content.match(/alt=["']([^"']+)["']/i);

    let title = '';
    if (titleMatch) {
      title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
    } else {
      title = content.replace(/<[^>]*>/g, '').trim();
    }

    if (title && title.length > 1 && !title.toLowerCase().includes('izle full hd') && title.length < 150) {
      seen.add(href);
      candidates.push({ url: href, title });
    }
  }

  // Pattern 2: flx-block cards
  const blockRegex = /<div[^>]*class=["'][^"']*flx-block[^"']*["'][^>]*data-href=["']([^"']+)["']([\s\S]*?)<\/div>/gi;
  while ((match = blockRegex.exec(html)) !== null) {
    let href = match[1].trim();
    if (href.startsWith('/')) href = `${BASE_URL}${href}`;
    if (!seen.has(href) && !href.includes('-bolum')) {
      seen.add(href);
      const titleMatch = match[2].match(/<h4>([^<]+)<\/h4>/i);
      candidates.push({
        url: href,
        title: titleMatch ? titleMatch[1].trim() : '',
      });
    }
  }

  return candidates;
}

/**
 * Matches candidates against expected titles using token overlap
 */
function pickBestCandidate(candidates, expectedTitles) {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].url;

  const expectedTokens = new Set();
  expectedTitles.forEach(t => {
    tokenizeTitleClient(t).forEach(tok => expectedTokens.add(tok));
  });

  let bestScore = -1;
  let bestCandidate = candidates[0].url;

  candidates.forEach(cand => {
    const candTokens = tokenizeTitleClient(cand.title || cand.url);
    let overlap = 0;
    candTokens.forEach(t => {
      if (expectedTokens.has(t)) overlap++;
    });

    if (overlap > bestScore) {
      bestScore = overlap;
      bestCandidate = cand.url;
    }
  });

  return bestCandidate;
}

/**
 * Cleans anime title for optimal Tranimeizle search results
 * Strips season markers, roman numerals, and subtitles so search returns all seasons
 */
export function getCleanSearchQuery(title) {
  if (!title) return '';
  let clean = title
    .replace(/\b(?:season|sezon)\s*\d+\b/gi, '')
    .replace(/\b\d+\s*\.?\s*(?:season|sezon)\b/gi, '')
    .replace(/\b(?:1st|2nd|3rd|4th|5th)\s*season\b/gi, '')
    .replace(/\b(?:part|kisim|cour)\s*\d+\b/gi, '')
    .replace(/\b(?:the\s+)?final\s*season\b/gi, '')
    .replace(/\b(?:II|III|IV|V|VI)\b/g, '')
    .replace(/[\(\[\{].*?[\)\]\}]/g, '')
    .trim();

  // If there's a colon or dash, and the prefix is at least 3 characters, keep the primary franchise title
  const colonParts = clean.split(/[:\-–—]/);
  if (colonParts.length > 1 && colonParts[0].trim().length >= 3) {
    clean = colonParts[0].trim();
  }

  clean = clean.replace(/\s+/g, ' ').trim();
  return clean || title;
}

/**
 * Extracts season number from title or metadata
 */
export function detectSeasonNumber(title, fallback = 1) {
  if (!title) return fallback;
  const raw = title.toLowerCase();
  if (raw.includes('final season')) return 4;
  const m = raw.match(/(\d+)\s*\.?\s*sezon/i) ||
            raw.match(/season\s*(\d+)/i) ||
            raw.match(/(\d+)(?:st|nd|rd|th)\s*season/i);
  if (m) return parseInt(m[1], 10);
  if (/\b(?:iv|4th)\b/i.test(raw)) return 4;
  if (/\b(?:iii|3rd)\b/i.test(raw)) return 3;
  if (/\b(?:ii|2nd)\b/i.test(raw)) return 2;
  return fallback;
}

/**
 * Generates direct candidate overview -izle URLs directly from anime title and season
 */
export function buildAnimeOverviewUrls(title, seasonNumber = 1) {
  if (!title) return [];
  const targetSeason = parseInt(seasonNumber, 10) || 1;

  const clean = title
    .replace(/\b(?:season|sezon)\s*\d+\b/gi, '')
    .replace(/\b\d+\s*\.?\s*(?:season|sezon)\b/gi, '')
    .replace(/\b(?:1st|2nd|3rd|4th|5th)\s*season\b/gi, '')
    .replace(/\b(?:part|kisim|cour)\s*\d+\b/gi, '')
    .replace(/\b(?:the\s+)?final\s*season\b/gi, '')
    .replace(/\b(?:II|III|IV|V|VI)\b/g, '')
    .replace(/[\(\[\{].*?[\)\]\}]/g, '')
    .trim();

  const toSlug = (str) =>
    str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');

  const baseSlug = toSlug(clean);
  const seasonSuffix = targetSeason > 1 ? `-${targetSeason}-sezon` : '';

  const urls = [
    `${BASE_URL}/anime/${baseSlug}${seasonSuffix}-izle`,
    `${BASE_URL}/anime/${baseSlug}${seasonSuffix}`,
    `${BASE_URL}/${baseSlug}${seasonSuffix}-izle`,
    `${BASE_URL}/${baseSlug}${seasonSuffix}`,
  ];

  const shortTitle = clean.split(/[:\-–—]/)[0].trim();
  if (shortTitle && shortTitle !== clean && shortTitle.length >= 3) {
    const shortSlug = toSlug(shortTitle);
    urls.push(`${BASE_URL}/anime/${shortSlug}${seasonSuffix}-izle`);
    urls.push(`${BASE_URL}/anime/${shortSlug}${seasonSuffix}`);
    urls.push(`${BASE_URL}/${shortSlug}${seasonSuffix}-izle`);
    urls.push(`${BASE_URL}/${shortSlug}${seasonSuffix}`);
  }

  return urls;
}

/**
 * Intelligently matches candidates against a specific season number
 * e.g. Season 1 gets the base anime page, Season 2 gets 2. Sezon, Season 3 gets 3. Sezon
 */
export function matchCandidateForSeason(candidates, seasonNumber = 1, baseTitle = '') {
  if (!candidates || candidates.length === 0) return null;
  const targetSeason = parseInt(seasonNumber, 10) || 1;
  if (candidates.length === 1 && targetSeason === 1) return candidates[0].url;

  const expectedTokens = new Set();
  if (baseTitle) {
    tokenizeTitleClient(baseTitle).forEach(tok => expectedTokens.add(tok));
  }

  let bestScore = -9999;
  let bestCandidate = candidates[0].url;

  candidates.forEach(cand => {
    const raw = `${cand.title || ''} ${cand.url || ''}`.toLowerCase();
    let score = 0;

    // Detect season number in candidate
    let candSeason = 1;
    const seasonMatch = raw.match(/(\d+)\s*\.?\s*sezon/i) || raw.match(/sezon\s*(\d+)/i) || raw.match(/season\s*(\d+)/i);
    if (seasonMatch) {
      candSeason = parseInt(seasonMatch[1], 10);
    } else if (raw.includes('2nd-season') || raw.includes('2nd season') || raw.includes('-2-sezon')) {
      candSeason = 2;
    } else if (raw.includes('3rd-season') || raw.includes('3rd season') || raw.includes('-3-sezon')) {
      candSeason = 3;
    } else if (raw.includes('4th-season') || raw.includes('4th season') || raw.includes('-4-sezon')) {
      candSeason = 4;
    } else {
      candSeason = 1;
    }

    // Exact season match gives high priority
    if (candSeason === targetSeason) {
      score += 100;
    } else {
      score -= 50; // Wrong season penalty
    }

    // Token overlap with base title
    const candTokens = tokenizeTitleClient(cand.title || cand.url);
    let overlap = 0;
    candTokens.forEach(t => {
      if (expectedTokens.has(t)) overlap++;
    });
    score += overlap * 10;

    // Penalize movies/specials when seeking TV seasons
    if (raw.includes('movie') || raw.includes('filmi') || raw.includes('ova') || raw.includes('shugo-jutsushi')) {
      score -= 30;
    }

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = cand.url;
    }
  });

  if (bestCandidate && bestCandidate.startsWith('/')) {
    bestCandidate = `${BASE_URL}${bestCandidate}`;
  }

  return bestCandidate;
}

/**
 * Extracts distinct season pills from Tranimeizle candidates
 */
export function extractSeasonsFromCandidates(candidates, baseAnimeId = 'anime') {
  if (!candidates || candidates.length <= 1) return [];

  const seasonsMap = new Map();

  candidates.forEach(cand => {
    const raw = `${cand.title || ''} ${cand.url || ''}`.toLowerCase();

    // Skip movies/OVAs/specials for the main season pills
    if (raw.includes('movie') || raw.includes('filmi') || raw.includes('ova') || raw.includes('special')) {
      return;
    }

    let seasonNum = 1;
    const m = raw.match(/(\d+)\s*\.?\s*sezon/i) || raw.match(/season\s*(\d+)/i);
    if (m) {
      seasonNum = parseInt(m[1], 10);
    } else if (raw.includes('2nd-season') || raw.includes('2nd season') || raw.includes('-2-sezon')) {
      seasonNum = 2;
    } else if (raw.includes('3rd-season') || raw.includes('3rd season') || raw.includes('-3-sezon')) {
      seasonNum = 3;
    } else if (raw.includes('4th-season') || raw.includes('4th season') || raw.includes('-4-sezon')) {
      seasonNum = 4;
    }

    // Keep primary entry for each season
    if (!seasonsMap.has(seasonNum)) {
      seasonsMap.set(seasonNum, {
        _id: `${baseAnimeId}_s${seasonNum}`,
        season_number: seasonNum,
        label: `${seasonNum}. Sezon`,
        title: cand.title,
        url: cand.url,
        category: 'seasons'
      });
    }
  });

  if (seasonsMap.size <= 1) return [];

  return Array.from(seasonsMap.values()).sort((a, b) => a.season_number - b.season_number);
}

/**
 * Parses episode links from anime detail HTML
 * Supports .animeDetail-items li (Tranimeizle standard), flx-block, and <a> lists
 */
export function parseEpisodesHtml(html) {
  if (!html) return [];

  const episodes = [];
  const seenUrls = new Set();

  // Pattern 0: .animeDetail-items li episode cards (Tranimeizle detail list)
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch;
  while ((liMatch = liRegex.exec(html)) !== null) {
    const liContent = liMatch[1];
    const aMatch = liContent.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!aMatch) continue;

    let href = aMatch[1].trim();
    if (href.startsWith('/')) href = `${BASE_URL}${href}`;
    if (!seenUrls.has(href) && (href.includes('-bolum') || href.includes('-bolum-izle') || href.includes('/bolum/'))) {
      seenUrls.add(href);
      const content = aMatch[2];

      // Thumbnail
      const imgMatch = content.match(/<img[^>]+src="([^"]+)"/i) || liContent.match(/<img[^>]+src="([^"]+)"/i);
      const thumb = imgMatch ? imgMatch[1] : '';

      // Title
      const titleSpanMatch = content.match(/<div class="etitle"[^>]*>[\s\S]*?<span>([^<]+)<\/span>/i) ||
                             content.match(/<span[^>]*>([^<]*bolum[^<]*)<\/span>/i);
      const altMatch = content.match(/alt="([^"]+)"/i) || liContent.match(/alt="([^"]+)"/i);
      let title = titleSpanMatch ? titleSpanMatch[1].trim() : (altMatch ? altMatch[1].trim() : '');

      // Release date
      const dateMatch = content.match(/<small[^>]*class="[^"]*author[^"]*"[^>]*>([\s\S]*?)<\/small>/i) ||
                        content.match(/<small[^>]*>([\s\S]*?)<\/small>/i) ||
                        liContent.match(/<small[^>]*class="[^"]*author[^"]*"[^>]*>([\s\S]*?)<\/small>/i);
      let releaseDate = '';
      if (dateMatch) {
        releaseDate = dateMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      }

      // Episode number from href or title
      const epMatch = href.match(/[-_](\d+)[-_]bolum/i) ||
                      href.match(/bolum[-_](\d+)/i) ||
                      title.match(/(\d+)\.\s*Bölüm/i) ||
                      title.match(/Bölüm\s*(\d+)/i);
      const epNum = epMatch ? parseInt(epMatch[1], 10) : (episodes.length + 1);

      episodes.push({
        number: epNum,
        title: title || `${epNum}. Bölüm`,
        url: href,
        thumbnail: thumb,
        release_date: releaseDate,
      });
    }
  }

  // Pattern 1: flx-block episode cards
  if (episodes.length === 0) {
    let match;
    const blockRegex = /<div[^>]*class="[^"]*flx-block[^"]*"[^>]*data-href="([^"]+)"([\s\S]*?)<\/div>/gi;
    while ((match = blockRegex.exec(html)) !== null) {
      let href = match[1].trim();
      if (href.startsWith('/')) href = `${BASE_URL}${href}`;
      if (!seenUrls.has(href)) {
        seenUrls.add(href);
        const content = match[2];
        const titleMatch = content.match(/<h4>([^<]+)<\/h4>/i);
        const epMatch = href.match(/[-_](\d+)[-_]bolum/i) || (titleMatch ? titleMatch[1].match(/(\d+)\.\s*Bölüm/i) : null);
        const epNum = epMatch ? parseInt(epMatch[1], 10) : episodes.length + 1;

        episodes.push({
          number: epNum,
          title: titleMatch ? titleMatch[1].trim() : `${epNum}. Bölüm`,
          url: href,
        });
      }
    }
  }

  // Pattern 2: Standard episode link list <a href="...-bolum-izle...">
  if (episodes.length === 0) {
    let match;
    const linkRegex = /<a[^>]+href="((?:https?:\/\/[^\/]+)?\/[^"]+?-(\d+)-bolum-izle[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = linkRegex.exec(html)) !== null) {
      let href = match[1].trim();
      if (href.startsWith('/')) href = `${BASE_URL}${href}`;
      if (!seenUrls.has(href)) {
        seenUrls.add(href);
        const epNum = parseInt(match[2], 10);
        const text = match[3].replace(/<[^>]*>/g, '').trim();
        episodes.push({
          number: epNum,
          title: text || `${epNum}. Bölüm`,
          url: href,
        });
      }
    }
  }

  // Sort episodes by number ascending
  episodes.sort((a, b) => a.number - b.number);
  return episodes;
}

/**
 * 2. Fetches anime overview page and extracts all episodes
 */
export async function fetchEpisodesForAnime(animeOverviewUrl) {
  if (!animeOverviewUrl) return [];

  const { html, size, ok } = await fetchHtml(animeOverviewUrl);
  if (!ok || isBotBlocked(html, size)) {
    console.warn('[Resolver] Overview page blocked or empty:', animeOverviewUrl);
    return [];
  }

  return parseEpisodesHtml(html);
}

/**
 * Kullanıcı Talebi: Arama yapacaksın -> ilk çıkan sonucun içindeki linke gideceksin -> ordan linkleri çekip listeleyeceksin!
 */
export async function searchAndExtractEpisodes(animeTitle, seasonNum = 1) {
  const cleanTitle = getCleanSearchQuery(animeTitle);
  const searchUrl = `${BASE_URL}/arama/${encodeURIComponent(cleanTitle)}`;

  try {
    // 1. Arama yap
    const searchRes = await fetchHtml(searchUrl, 10000);
    if (!searchRes.ok || isBotBlocked(searchRes.html, searchRes.size)) {
      return { success: false, blocked: true, searchUrl };
    }

    // 2. İlk çıkan sonucun içindeki linke git
    const candidates = parseSearchResultsHtml(searchRes.html);
    const targetUrl = matchCandidateForSeason(candidates, seasonNum, cleanTitle) || (candidates[0] ? candidates[0].url : null);

    if (!targetUrl) {
      return { success: false, empty: true, searchUrl };
    }

    // 3. Oradan linkleri çek
    const animePageRes = await fetchHtml(targetUrl, 12000);
    if (!animePageRes.ok || isBotBlocked(animePageRes.html, animePageRes.size)) {
      return { success: false, blocked: true, targetUrl, searchUrl };
    }

    const episodes = parseEpisodesHtml(animePageRes.html);
    return {
      success: episodes.length > 0,
      targetUrl,
      episodes,
      candidates
    };
  } catch (err) {
    return { success: false, error: err.message, searchUrl };
  }
}

/**
 * 3. Resolves stream URL for a specific episode page
 * Extracts /explorer/ m3u8, Sibnet ID, or direct video
 */
export async function resolveEpisodeStream(episodeUrl) {
  if (!episodeUrl) return null;

  const { html, size, ok } = await fetchHtml(episodeUrl);
  if (!ok || isBotBlocked(html, size)) {
    console.warn('[Resolver] Episode page blocked or unreadable:', episodeUrl);
    return null;
  }

  // 1. Check for /explorer/ URLs in iframes, scripts, or data attributes
  const explorerMatch = html.match(/(https?:\/\/[^\/"'\s]+)?\/explorer\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+[^\s"']*/i);
  if (explorerMatch) {
    const explorerUrl = explorerMatch[0].startsWith('http')
      ? explorerMatch[0]
      : `${BASE_URL}${explorerMatch[0]}`;
    const m3u8Url = transformExplorerToM3u8(explorerUrl);
    if (m3u8Url) {
      return {
        streamUrl: m3u8Url,
        format: 'hls',
        sourceType: 'tranimeizle_native',
      };
    }
  }

  // 2. Check for Sibnet player iframes
  const sibnetMatch = html.match(/video\.sibnet\.ru\/(?:shell\.php\?videoid=|v\/|video)(\d+)/i);
  if (sibnetMatch) {
    const sibnetId = sibnetMatch[1];
    return {
      streamUrl: `sibnet:${sibnetId}`,
      sibnetId,
      format: 'sibnet',
      sourceType: 'sibnet',
    };
  }

  // 3. Check for general iframe src
  const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (iframeMatch) {
    const iframeSrc = iframeMatch[1];
    if (iframeSrc.includes('/explorer/')) {
      const fullUrl = iframeSrc.startsWith('http') ? iframeSrc : `${BASE_URL}${iframeSrc}`;
      const m3u8 = transformExplorerToM3u8(fullUrl);
      if (m3u8) {
        return { streamUrl: m3u8, format: 'hls', sourceType: 'tranimeizle_native' };
      }
    }
    return {
      streamUrl: iframeSrc,
      format: 'iframe',
      sourceType: 'external_iframe',
    };
  }

  return null;
}
