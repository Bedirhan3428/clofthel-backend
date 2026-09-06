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

const BASE_URL = 'https://www.tranimeizle.io';

const MOBILE_HEADERS = {
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
async function fetchHtml(url, timeoutMs = 8000) {
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
  if (!html || size < 10000) return true;

  const lower = html.toLowerCase();
  if (
    lower.includes('<title>bot kontrol') ||
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
function parseSearchResultsHtml(html) {
  const candidates = [];
  const seen = new Set();

  // Pattern 1: <a href="/anime/slug-izle"> or href="https://.../anime/slug-izle"
  const regex1 = /<a[^>]+href="((?:https?:\/\/[^\/]+)?\/(?:anime\/)?[^"]+-izle)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex1.exec(html)) !== null) {
    let href = match[1];
    if (href.startsWith('/')) href = `${BASE_URL}${href}`;
    if (!seen.has(href) && !href.includes('/arama') && !href.includes('/kategori')) {
      seen.add(href);
      // Clean inner text
      const innerText = match[2].replace(/<[^>]*>/g, '').trim();
      candidates.push({ url: href, title: innerText });
    }
  }

  // Pattern 2: flx-block cards
  const blockRegex = /<div[^>]*class="[^"]*flx-block[^"]*"[^>]*data-href="([^"]+)"([\s\S]*?)<\/div>/gi;
  while ((match = blockRegex.exec(html)) !== null) {
    let href = match[1];
    if (href.startsWith('/')) href = `${BASE_URL}${href}`;
    if (!seen.has(href)) {
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
 * 2. Fetches anime overview page and extracts all episodes
 */
export async function fetchEpisodesForAnime(animeOverviewUrl) {
  if (!animeOverviewUrl) return [];

  const { html, size, ok } = await fetchHtml(animeOverviewUrl);
  if (!ok || isBotBlocked(html, size)) {
    console.warn('[Resolver] Overview page blocked or empty:', animeOverviewUrl);
    return [];
  }

  const episodes = [];
  const seenUrls = new Set();

  // Pattern 1: flx-block episode cards
  const blockRegex = /<div[^>]*class="[^"]*flx-block[^"]*"[^>]*data-href="([^"]+)"([\s\S]*?)<\/div>/gi;
  let match;
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

  // Pattern 2: Standard episode link list <a href="...-bolum-izle...">
  if (episodes.length === 0) {
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
