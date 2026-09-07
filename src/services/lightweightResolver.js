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
  'User-Agent': 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36',
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
 * Normalizes title string for high-precision comparisons
 */
export function normalizeAnimeTitle(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\bthe\s+final\s+season\b/gi, 'season 4')
    .replace(/\bfinal\s+season\b/gi, 'season 4')
    .replace(/\b(?:season|sezon)\s*iii\b/gi, 'sezon 3')
    .replace(/\b(?:season|sezon)\s*ii\b/gi, 'sezon 2')
    .replace(/\b(?:season|sezon)\s*iv\b/gi, 'sezon 4')
    .replace(/\b(?:season|sezon)\s*v\b/gi, 'sezon 5')
    .replace(/\b(?:season|sezon)\s*vi\b/gi, 'sezon 6')
    .replace(/\biii\b/gi, '3')
    .replace(/\bii\b/gi, '2')
    .replace(/\biv\b/gi, '4')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Classifies anime format dynamically into 'MOVIE', 'SPECIAL', or 'TV'
 * Works with AniList metadata objects, format strings, Tranimeizle candidates or titles
 */
export function classifyAnimeFormat(item) {
  if (!item) return 'TV';
  let raw = '';
  if (typeof item === 'object' && item !== null) {
    if (item.format) {
      const f = String(item.format).toUpperCase();
      if (['SPECIAL', 'OVA', 'ONA', 'MUSIC'].includes(f)) return 'SPECIAL';
      if (f === 'MOVIE') return 'MOVIE';
      if (['TV', 'TV_SHORT'].includes(f)) return 'TV';
    }
    raw = `${item.title || ''} ${item.title_romaji || ''} ${item.title_english || ''} ${item.url || ''} ${item.label || ''}`;
  } else {
    raw = String(item);
  }
  const low = normalizeTurkish(raw).toLowerCase();

  // Explicit Special / OVA markers that ALWAYS qualify as SPECIAL
  const isExplicitSpecial = /\bozel\s*bolum\b/i.test(low) ||
                            /\bspecial\s*episode\b/i.test(low) ||
                            /\b(?:ova|oad|ona)\b/i.test(low) ||
                            /[-_](?:ova|oad|ona|recap|offline|chibi|omake)[-_]/i.test(low) ||
                            low.includes('offline') ||
                            low.includes('omake') ||
                            low.includes('chibi') ||
                            low.includes('picture drama') ||
                            low.includes('audio drama') ||
                            low.includes('drama cd') ||
                            low.includes('recap') ||
                            low.includes('ozet') ||
                            low.includes('soushuuhen') ||
                            low.includes('parody') ||
                            low.includes('parodi') ||
                            low.includes('extra edition');

  if (isExplicitSpecial) {
    return 'SPECIAL';
  }

  // If item has explicit TV season marker, it is CANON TV, not a special
  const hasExplicitSeason = /\b(\d+)\s*\.?\s*(?:st|nd|rd|th)?\s*(?:sezon|season)\b/i.test(low) ||
                            /\b(?:sezon|season)\s*\d+\b/i.test(low) ||
                            /\bs\d{1,2}\b/i.test(low);
  if (hasExplicitSeason) {
    return 'TV';
  }

  // Check Movie patterns
  if (
    low.includes('movie') ||
    low.includes('filmi') ||
    low.includes('filmler') ||
    low.includes('film-izle') ||
    low.includes('filmi-izle') ||
    low.includes('gekijouban') ||
    /\bfilm\b/i.test(low)
  ) {
    return 'MOVIE';
  }

  // Contextual check: "özel sınav" (special exam) or "özel ders" is NOT a special anime format
  const isSpecialContextOnly = /\bozel\s*(?:sinav|ders|guc|kuvvet|harekat|tim|operasyon)\b/i.test(low) ||
                               /\bspecial\s*(?:exam|ops|operations|forces|force|power|powers|lesson|class|assignment)\b/i.test(low);

  if (!isSpecialContextOnly) {
    if (
      low.includes('special') ||
      low.includes('specials') ||
      low.includes('ozel') ||
      low.includes('side story') ||
      low.includes('tokubetsu') ||
      low.includes('petit') ||
      low.includes('puchi') ||
      low.includes('bonus') ||
      low.includes('extras') ||
      low.includes('short anime') ||
      low.includes('kisa anime') ||
      /\bsp\b/i.test(low) ||
      /[-_](?:sp|special|ozel)[-_]/i.test(low)
    ) {
      return 'SPECIAL';
    }
  }

  return 'TV';
}

/**
 * Checks if item represents a special, OVA, OAD, ONA, or recap
 */
export function isSpecial(item) {
  if (!item) return false;
  return classifyAnimeFormat(item) === 'SPECIAL';
}

/**
 * Checks if item represents a full anime movie
 */
export function isMovie(item) {
  if (!item) return false;
  return classifyAnimeFormat(item) === 'MOVIE';
}

/**
 * Checks if title or URL represents a movie (Specials are strictly excluded!)
 */
export function isMovieOrOva(titleOrUrl) {
  if (!titleOrUrl) return false;
  return isMovie(titleOrUrl);
}

function levenshteinDistance(s1, s2) {
  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;
  const v0 = new Array(s2.length + 1);
  const v1 = new Array(s2.length + 1);
  for (let i = 0; i < s2.length + 1; i++) v0[i] = i;
  for (let i = 0; i < s1.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < s2.length; j++) {
      const cost = s1[i] === s2[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= s2.length; j++) v0[j] = v1[j];
  }
  return v1[s2.length];
}

function stringSimilarityRatio(str1, str2) {
  const s1 = (str1 || '').replace(/\s+/g, '');
  const s2 = (str2 || '').replace(/\s+/g, '');
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(s1, s2);
  return Math.max(0, (maxLen - dist) / maxLen);
}

/**
/**
 * Extracts subtitle tokens that differentiate seasons (e.g. Shiratorizawa, To the Top)
 */
export function getSubtitleTokens(title, franchiseTitle = '') {
  const fullNorm = normalizeAnimeTitle(title);
  const franNorm = normalizeAnimeTitle(franchiseTitle);
  const franSet = new Set(franNorm.split(' '));
  return fullNorm.split(' ').filter(t => t.length > 1 && !franSet.has(t) && !/^(season|sezon|izle|anime|bitti|devam|tv|ediyor)$/i.test(t));
}

/**
 * Normalizes Turkish characters to their ASCII equivalents
 */
export function normalizeTurkish(str) {
  if (!str) return '';
  return str
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'c');
}

/**
 * Extracts season number from title, slug or metadata with Roman numeral and final season support
 */
export function detectSeasonNumber(titleOrUrl, fallback = 1) {
  if (!titleOrUrl) return fallback;
  const raw = String(titleOrUrl);
  const full = normalizeTurkish(raw).toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

  // Classroom of the Elite franchise handling: "2-nensei" / "2. Sınıf" / "2nd Year" is Season 4!
  if (/youkoso|classroom\s*of\s*the\s*elite/i.test(full)) {
    if (/4th\s*season|4\s*sezon|\bseason\s*4\b|\bsezon\s*4\b/i.test(full)) return 4;
    if (/2\s*nensei|2\s*sinif|2nd\s*year|second\s*year/i.test(full)) return 4;
    if (/3rd\s*season|3\s*sezon|\bseason\s*3\b|\bsezon\s*3\b/i.test(full)) return 3;
    if (/2nd\s*season|2\s*sezon|\bseason\s*2\b|\bsezon\s*2\b/i.test(full)) return 2;
    if (/1st\s*season|1\s*sezon|\bseason\s*1\b|\bsezon\s*1\b/i.test(full)) return 1;
  }

  // 1. Explicit prefix season markers (e.g. 4. Sezon, 4th Season, 4 Sezon)
  const mPref = full.match(/\b(\d+)(?:st|nd|rd|th)?\s*(?:sezon|season)\b/) || full.match(/\bs(\d{1,2})\b/);
  if (mPref) return parseInt(mPref[1], 10);

  // 2. Explicit suffix season markers (e.g. Sezon 4, Season 4)
  const mSuff = full.match(/\b(?:season|sezon)\s*(\d+)(?!\s*(?:sinif|nensei|grade|year|part|cour|kisim|gakki))\b/);
  if (mSuff) return parseInt(mSuff[1], 10);

  // 3. Ordinals and Roman Numerals (ensure NOT followed by part/year/grade/gakki)
  const notFollowedBySubUnit = '(?!\s*(?:part|cour|kisim|sinif|nensei|grade|year|semester|gakki|stage|round|half))';

  if (new RegExp('\\b(?:x|10th)\\b' + notFollowedBySubUnit, 'i').test(full)) return 10;
  if (new RegExp('\\b(?:ix|9th)\\b' + notFollowedBySubUnit, 'i').test(full)) return 9;
  if (new RegExp('\\b(?:viii|8th)\\b' + notFollowedBySubUnit, 'i').test(full)) return 8;
  if (new RegExp('\\b(?:vii|7th)\\b' + notFollowedBySubUnit, 'i').test(full)) return 7;
  if (new RegExp('\\b(?:vi|6th)\\b' + notFollowedBySubUnit, 'i').test(full)) return 6;
  if (new RegExp('\\b(?:v|5th)\\b' + notFollowedBySubUnit, 'i').test(full)) return 5;
  if (new RegExp('\\b(?:iv|4th)\\b' + notFollowedBySubUnit, 'i').test(full)) return 4;
  if (new RegExp('\\b(?:iii|3rd)\\b' + notFollowedBySubUnit, 'i').test(full)) return 3;
  if (new RegExp('\\b(?:ii|2nd)\\b' + notFollowedBySubUnit, 'i').test(full)) return 2;

  return fallback;
}

/**
 * High-precision season detection for candidate cards (Zero-Tolerance: only explicit season markers)
 */
export function detectCandidateSeason(candTitle, candUrl, fallback = 1) {
  const raw = `${candTitle || ''} ${candUrl || ''}`;
  const full = normalizeTurkish(raw).toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

  // Classroom of the Elite franchise handling: "2-nensei" / "2. Sınıf" / "2nd Year" is Season 4!
  if (/youkoso|classroom\s*of\s*the\s*elite/i.test(full)) {
    if (/4th\s*season|4\s*sezon|\bseason\s*4\b|\bsezon\s*4\b/i.test(full)) return 4;
    if (/2\s*nensei|2\s*sinif|2nd\s*year|second\s*year/i.test(full)) return 4;
    if (/3rd\s*season|3\s*sezon|\bseason\s*3\b|\bsezon\s*3\b/i.test(full)) return 3;
    if (/2nd\s*season|2\s*sezon|\bseason\s*2\b|\bsezon\s*2\b/i.test(full)) return 2;
    if (/1st\s*season|1\s*sezon|\bseason\s*1\b|\bsezon\s*1\b/i.test(full)) return 1;
  }

  // 1. Explicit prefix season markers (e.g. 4. Sezon, 4th Season, 4 Sezon)
  const mPref = full.match(/\b(\d+)(?:st|nd|rd|th)?\s*(?:sezon|season)\b/) || full.match(/\bs(\d{1,2})\b/);
  if (mPref) return parseInt(mPref[1], 10);

  // 2. Explicit suffix season markers (e.g. Sezon 4, Season 4)
  const mSuff = full.match(/\b(?:season|sezon)\s*(\d+)(?!\s*(?:sinif|nensei|grade|year|part|cour|kisim|gakki))\b/);
  if (mSuff) return parseInt(mSuff[1], 10);

  // 3. Ordinals and Roman Numerals (ensure NOT followed by part/year/grade/gakki)
  const notFollowedBySubUnit = '(?!\s*(?:part|cour|kisim|sinif|nensei|grade|year|semester|gakki|stage|round|half))';

  if (new RegExp('\\b(?:x|10th)\\b' + notFollowedBySubUnit, 'i').test(full)) return 10;
  if (new RegExp('\\b(?:ix|9th)\\b' + notFollowedBySubUnit, 'i').test(full)) return 9;
  if (new RegExp('\\b(?:viii|8th)\\b' + notFollowedBySubUnit, 'i').test(full)) return 8;
  if (new RegExp('\\b(?:vii|7th)\\b' + notFollowedBySubUnit, 'i').test(full)) return 7;
  if (new RegExp('\\b(?:vi|6th)\\b' + notFollowedBySubUnit, 'i').test(full)) return 6;
  if (new RegExp('\\b(?:v|5th)\\b' + notFollowedBySubUnit, 'i').test(full)) return 5;
  if (new RegExp('\\b(?:iv|4th)\\b' + notFollowedBySubUnit, 'i').test(full)) return 4;
  if (new RegExp('\\b(?:iii|3rd)\\b' + notFollowedBySubUnit, 'i').test(full)) return 3;
  if (new RegExp('\\b(?:ii|2nd)\\b' + notFollowedBySubUnit, 'i').test(full)) return 2;

  // No explicit season marker
  return fallback;
}

/**
 * Extracts part/kısım/cour number (e.g. 2. Kısım, Part 2, Cour 2, Kanketsu-hen)
 */
export function detectPartNumber(titleOrUrl, fallback = 1) {
  if (!titleOrUrl) return fallback;
  const full = normalizeTurkish(String(titleOrUrl)).toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

  // Kanketsu-hen / Final Chapters is Part 3
  if (full.includes('kanketsu hen') || full.includes('final chapters')) return 3;

  if (/\b(?:2nd|second)\s*(?:part|cour|kisim)\b/.test(full)) return 2;
  if (/\b(?:3rd|third)\s*(?:part|cour|kisim)\b/.test(full)) return 3;
  if (/\b(?:4th|fourth)\s*(?:part|cour|kisim)\b/.test(full)) return 4;

  const m = full.match(/\b(?:part|cour|kisim)\s*(\d+)\b/) ||
            full.match(/\b(\d+)\s*(?:kisim|part|cour)\b/);
  if (m) {
    return parseInt(m[1], 10);
  }

  return fallback;
}

/**
 * High-precision candidate scoring against AniList metadata (Romaji, English, synonyms, season, format)
 */
export function scoreCandidateAgainstAniList(candidate, animeInput, targetSeason = 1) {
  const animeInfo = typeof animeInput === 'object' && animeInput !== null
    ? animeInput
    : { title: String(animeInput || ''), title_romaji: String(animeInput || '') };

  const candTitle = candidate.title || '';
  const candUrl = candidate.url || '';
  const candText = `${candTitle} ${candUrl}`;
  const candNorm = normalizeAnimeTitle(candText);
  const candTokens = tokenizeTitleClient(candText);

  // Collect all expected title variants from AniList
  const expectedTitles = [];
  if (animeInfo.title_romaji) expectedTitles.push(animeInfo.title_romaji);
  if (animeInfo.title_english) expectedTitles.push(animeInfo.title_english);
  if (animeInfo.title && !expectedTitles.includes(animeInfo.title)) expectedTitles.push(animeInfo.title);
  if (animeInfo.orijinal_ad && !expectedTitles.includes(animeInfo.orijinal_ad)) expectedTitles.push(animeInfo.orijinal_ad);
  if (Array.isArray(animeInfo.synonyms)) {
    animeInfo.synonyms.slice(0, 10).forEach(s => {
      if (s && !expectedTitles.includes(s)) expectedTitles.push(s);
    });
  }

  // Format classification
  const candFormat = classifyAnimeFormat(candidate);
  const targetFormat = classifyAnimeFormat(animeInfo);

  // STRICT RULE: If candidate is a special, strictly eliminate it (-999999) - specials are never wanted!
  if (candFormat === 'SPECIAL' || isSpecial(candidate)) {
    return -999999;
  }

  const hasExplicitTvSeason = /[-_](\d+)[-_](?:sezon|season)/i.test(candText) ||
                              /(\d+)\s*\.?\s*(?:sezon|season)/i.test(candText) ||
                              /(?:sezon|season)\s*(\d+)/i.test(candText) ||
                              /\b(?:2nd|3rd|4th|5th|6th|7th|8th)\s*season\b/i.test(candText) ||
                              /[-_](?:2nd|3rd|4th|5th|6th|7th|8th)[-_]season/i.test(candText);

  if (targetFormat === 'TV' && (candFormat === 'MOVIE' || isMovie(candidate))) {
    return -999999;
  }
  if (targetFormat === 'MOVIE' && hasExplicitTvSeason) {
    return -999999;
  }

  const targetPart = animeInfo.part_number || detectPartNumber(animeInfo.title || animeInfo.season_title, 1);
  const isTargetFinal = Boolean(animeInfo.is_final || /\bfinal\b/i.test(animeInfo.title || animeInfo.season_title));

  const candExplicitSeason = detectCandidateSeason(candTitle, candUrl, 0);
  const candPart = detectPartNumber(`${candTitle} ${candUrl}`, 1);
  const candIsFinal = /\b(?:the\s+)?final(?:\s+sezon|\s+season)?\b/i.test(`${candTitle} ${candUrl}`) ||
                      /[-_]final[-_]/i.test(candUrl) ||
                      candTitle.toLowerCase().includes('final');

  let candSeason = candExplicitSeason;
  if (candSeason === 0) {
    if (candIsFinal && isTargetFinal) {
      candSeason = targetSeason; // Candidate is the final season of the franchise!
    } else {
      candSeason = 1;
    }
  }

  // STRICT ZERO-TOLERANCE SEASON & PART CHECK FOR TV SERIES:
  let seasonScore = 0;
  if (targetFormat === 'TV') {
    if (candSeason !== targetSeason) {
      return -999999; // Strict Zero Tolerance: Disqualify any candidate whose season does not match target!
    }

    // Strict Zero Tolerance for Multi-Part / Kısım:
    if (targetPart > 1 && candPart !== targetPart) {
      return -999999; // Target is Part 2+, candidate is not matching part!
    }
    if (targetPart === 1 && candPart > 1) {
      return -999999; // Target is Part 1, candidate explicitly specifies Part 2+!
    }

    seasonScore += 2500;

    // Final Season matching bonus / penalty
    if (isTargetFinal && candIsFinal) {
      seasonScore += 1200;
    } else if (!isTargetFinal && candIsFinal) {
      seasonScore -= 800;
    }
  } else if (targetFormat === 'MOVIE') {
    if (candFormat === 'MOVIE' || isMovie(candidate) || !hasExplicitTvSeason) {
      seasonScore += 2500;
    } else {
      return -999999;
    }
  }

  // Multi-Language Franchise verification across ALL AniList title variants (Romaji, English, Synonyms)
  let franchiseMatched = false;
  for (const exp of expectedTitles) {
    const expClean = getCleanSearchQuery(exp);
    const expNorm = normalizeAnimeTitle(expClean);
    const expTokens = tokenizeTitleClient(expNorm);
    if (expTokens.length > 0) {
      const matched = expTokens.filter(t => candNorm.includes(t));
      if (matched.length > 0) {
        franchiseMatched = true;
        break;
      }
    }
  }
  if (!franchiseMatched && expectedTitles.length > 0) {
    return -99999; // Doesn't match any title variant of the franchise
  }

  // Compare with all AniList title variants
  let bestTitleScore = 0;
  for (const expected of expectedTitles) {
    const expNorm = normalizeAnimeTitle(expected);
    const expTokens = tokenizeTitleClient(expected);
    if (expTokens.length === 0) continue;

    const cleanCandTitle = candTitle && candTitle.length >= 2 ? candTitle : candUrl;
    const candTitleNorm = normalizeAnimeTitle(cleanCandTitle);
    const candTitleTokens = tokenizeTitleClient(cleanCandTitle);

    const sim = stringSimilarityRatio(candTitleNorm, expNorm);
    let titleScore = sim * 500;

    // Exact Title Match Bonus: If candidate title is identical to target title, massive priority!
    if (candTitleNorm === expNorm) {
      titleScore += 1000;
    }

    let overlapCount = 0;
    const expSet = new Set(expTokens);
    const matchedTokens = new Set();
    candTitleTokens.forEach(t => {
      if (expSet.has(t) && !matchedTokens.has(t)) {
        matchedTokens.add(t);
        overlapCount++;
      }
    });

    const recall = overlapCount / expTokens.length;
    const precision = candTitleTokens.length > 0 ? (overlapCount / candTitleTokens.length) : 0;
    const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    titleScore += f1 * 500;

    if (candTitleNorm.includes(expNorm) || expNorm.includes(candTitleNorm)) {
      titleScore += 250;
    }

    // Extra subtitle / token penalty if candidate has extra tokens not in expected
    if (candTitleTokens.length > expTokens.length) {
      const extraTokens = candTitleTokens.filter(t => !expSet.has(t));
      titleScore -= extraTokens.length * 100;
    }

    if (titleScore > bestTitleScore) {
      bestTitleScore = titleScore;
    }
  }

  return seasonScore + bestTitleScore;
}

/**
 * Matches candidates against expected titles using comprehensive AniList scoring
 */
export function pickBestCandidate(candidates, expectedTitles) {
  if (!candidates || candidates.length === 0) return null;

  const animeInfo = Array.isArray(expectedTitles)
    ? { title_romaji: expectedTitles[0] || '', title_english: expectedTitles[1] || '', synonyms: expectedTitles.slice(2) }
    : (typeof expectedTitles === 'object' ? expectedTitles : { title: String(expectedTitles) });

  return matchCandidateForSeason(candidates, 1, animeInfo);
}

/**
 * Cleans anime title for optimal Tranimeizle search results
 * Strips season markers, roman numerals, and subtitles so search returns all seasons
 */
export function getCleanSearchQuery(title) {
  if (!title) return '';
  let clean = title;

  // 1. Remove bracketed text first: [1080p], (TV), etc.
  clean = clean.replace(/[\(\[\{].*?[\)\]\}]/g, ' ');

  // 2. Remove full season phrases
  clean = clean.replace(/\b(?:the\s+)?final\s*(?:season|sezon)\b/gi, ' ');
  clean = clean.replace(/\b\d+\s*\.?\s*(?:season|sezon)\b/gi, ' ');
  clean = clean.replace(/\b(?:season|sezon)\s*\d+\b/gi, ' ');
  clean = clean.replace(/\b\d+(?:st|nd|rd|th)\s*season\b/gi, ' ');

  // 3. Remove standalone ordinals like "4th", "2nd", "3rd"
  clean = clean.replace(/\b\d+(?:st|nd|rd|th)\b/gi, ' ');

  // 4. Remove school grade / year arcs (e.g. "2. Sınıf", "2-nensei-hen", "2nd Year")
  clean = clean.replace(/\b\d+\s*\.?\s*s[ıi]n[ıi]f\b/gi, ' ');
  clean = clean.replace(/\b\d+-nensei(?:-hen)?\b/gi, ' ');
  clean = clean.replace(/\b(?:first|second|third|1st|2nd|3rd)\s*year\b/gi, ' ');

  // 5. Remove part / cour / term indicators (e.g. "1. Kısım", "Part 2", "1-gakki")
  clean = clean.replace(/\b(?:part|cour|kisim|k[ıi]s[ıi]m)\s*\d+\b/gi, ' ');
  clean = clean.replace(/\b\d+\s*\.?\s*(?:part|cour|kisim|k[ıi]s[ıi]m)\b/gi, ' ');
  clean = clean.replace(/\b\d+-gakki\b/gi, ' ');
  clean = clean.replace(/\b(?:ichi|ni|san)\s*gakki\b/gi, ' ');

  // 6. Remove Roman numerals (e.g. II, III, IV)
  clean = clean.replace(/\b(?:II|III|IV|V|VI|VII|VIII|IX|X)\b/g, ' ');

  // 7. If there's a colon or dash, keep primary franchise title if length >= 3
  const colonParts = clean.split(/[:\-–—]/);
  if (colonParts.length > 1 && colonParts[0].trim().length >= 3) {
    clean = colonParts[0].trim();
  }

  // 8. Strip lingering punctuation and extra spaces
  clean = clean.replace(/[.,\-_]/g, ' ').replace(/\s+/g, ' ').trim();
  return clean || title;
}

/**
 * Arama sayfasında listelenen animelerden ilk çıkan sonucun içindeki linki alır
 */
export function getFirstAnimeLinkFromSearch(html) {
  if (!html) return null;

  // 1. .flx-block with data-href
  const blockMatch = html.match(/<div[^>]*class=["'][^"']*flx-block[^"']*["'][^>]*data-href=["']([^"']+)["']/i);
  if (blockMatch && blockMatch[1]) {
    let href = blockMatch[1].trim();
    return href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
  }

  // 2. <a href="/anime/...">
  const animeLinkMatch = html.match(/<a[^>]+href=["']((?:https?:\/\/[^\/]+)?\/anime\/[^"']+)["']/i);
  if (animeLinkMatch && animeLinkMatch[1]) {
    let href = animeLinkMatch[1].trim();
    if (!href.includes('-bolum') && !href.includes('/arama') && !href.includes('/kategori')) {
      return href.startsWith('http') ? href : `${BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`;
    }
  }

  // 3. parseSearchResultsHtml ilk eleman
  const candidates = parseSearchResultsHtml(html);
  if (candidates.length > 0) {
    return candidates[0].url;
  }

  return null;
}

/**
 * Intelligently matches candidates against AniList title and specific season number
 * Avoids movies, OVAs, wrong seasons, and uses F1 + Levenshtein accuracy
 */
export function matchCandidateForSeason(candidates, seasonNumber = 1, animeInput = '') {
  if (!candidates || candidates.length === 0) return null;
  const targetSeason = parseInt(seasonNumber, 10) || 1;
  const animeInfo = typeof animeInput === 'object' && animeInput !== null
    ? animeInput
    : { title: String(animeInput || ''), title_romaji: String(animeInput || '') };

  const targetFormat = classifyAnimeFormat(animeInfo);

  // STRICT RULE: Filter out all specials completely — specials are never wanted!
  let pool = candidates.filter(c => !isSpecial(c));
  if (targetFormat === 'TV') {
    pool = pool.filter(c => !isMovie(c));
  }
  if (pool.length === 0) pool = candidates;

  let bestScore = -999999;
  let bestCandidate = null;

  pool.forEach(cand => {
    const score = scoreCandidateAgainstAniList(cand, animeInfo, targetSeason);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = cand.url;
    }
  });

  // If even best score is negative, NO valid candidate matched this season!
  if (bestScore < 0) {
    return null;
  }

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
    // STRICT RULE: Skip specials/OVAs and movies from season pills completely
    if (isSpecial(cand) || isMovie(cand)) {
      return;
    }

    const seasonNum = detectCandidateSeason(cand.title, cand.url, 1);

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
 * Supports .animeDetail-items li (both .episodeBtn data-slug and a[href]), flx-block, and <a> lists
 */
export function parseEpisodesHtml(html, currentUrl = '') {
  if (!html) return [];

  const seenUrls = new Set();
  const epsByNumber = new Map();

  // Pattern 0: All <li episode items (handles both episodeBtn data-slug and standard <a>)
  const liRegex = /<li([^>]*)>([\s\S]*?)<\/li>/gi;
  let liMatch;
  while ((liMatch = liRegex.exec(html)) !== null) {
    const liAttrs = liMatch[1];
    const liContent = liMatch[2];

    // Check data-slug / data-href on li attributes or inside liContent
    const slugMatch = liAttrs.match(/data-slug=["']([^"']+)["']/i) ||
                      liAttrs.match(/data-href=["']([^"']+)["']/i) ||
                      liContent.match(/data-slug=["']([^"']+)["']/i) ||
                      liContent.match(/data-href=["']([^"']+)["']/i);

    const aMatch = liContent.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);

    let href = '';
    if (aMatch) {
      href = aMatch[1].trim();
    } else if (slugMatch) {
      href = slugMatch[1].trim();
      if (!href.startsWith('/')) href = '/' + href;
    }

    if (!href) continue;
    if (href.startsWith('/')) href = `${BASE_URL}${href}`;
    if (seenUrls.has(href)) continue;

    // Filter out non-episode URLs
    if (href.includes('/kategori') || href.includes('/arama') || href.includes('/tag')) continue;

    // Check if it is a movie or episode link
    const isMovieLink = href.includes('filmi-izle') ||
                        href.includes('film-izle') ||
                        href.includes('movie-izle') ||
                        href.includes('tek-parca') ||
                        href.endsWith('-filmi') ||
                        href.includes('-filmi/');
    const isBolumLink = href.includes('-bolum') || href.includes('/bolum/') || href.includes('bolum');

    if (!isBolumLink && !isMovieLink) continue;

    // Thumbnail
    const imgMatch = liContent.match(/<img[^>]+src=["']([^"']+)["']/i);
    const thumb = imgMatch ? imgMatch[1].trim() : '';

    // Title (Supports .title span, .etitle span, alt, etc.)
    const titleSpanMatch = liContent.match(/<p[^>]*class=["'][^"']*title[^"']*["'][^>]*>[\s\S]*?<span>([^<]+)<\/span>/i) ||
                           liContent.match(/<div[^>]*class=["'][^"']*etitle[^"']*["'][^>]*>[\s\S]*?<span>([^<]+)<\/span>/i) ||
                           liContent.match(/<span[^>]*>([^<]*bolum[^<]*)<\/span>/i);
    const altMatch = liContent.match(/alt=["']([^"']+)["']/i);
    let title = titleSpanMatch ? titleSpanMatch[1].trim() : (altMatch ? altMatch[1].trim() : '');

    // Release date
    const dateMatch = liContent.match(/<small[^>]*class=["'][^"']*author[^"']*["'][^>]*>([\s\S]*?)<\/small>/i) ||
                      liContent.match(/<small[^>]*>([\s\S]*?)<\/small>/i);
    let releaseDate = '';
    if (dateMatch) {
      releaseDate = dateMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // SADECE NOKTA (.), BOŞLUK, VEYA GEÇERSİZ / BUTON METİNLERİNİ KESİNLİKLE FİLTRELE
    if (!title || title === '.' || /^[.\s,;:!?•·…\-_]+$/.test(title) || title.length < 2) {
      title = '';
    }

    const lower = title.toLowerCase();
    const lowerHref = href.toLowerCase();
    if (
      lower === 'hemen izle' ||
      lower === 'ilk bölüm' ||
      lower === 'ilk bolum' ||
      lower === 'fragman' ||
      lower === 'tanıtım' ||
      lower.includes('özel') ||
      lower.includes('ozel') ||
      lower.includes('özet') ||
      /\b(?:ova|oad|ona|sp|special|specials|recap)\b/i.test(lower) ||
      lowerHref.includes('ozel-bolum') ||
      lowerHref.includes('special') ||
      /[-_](?:ova|oad|ona|sp|recap)[-_]/i.test(lowerHref)
    ) {
      continue;
    }

    // Episode number from href, slug or title
    let epNum = null;
    const epMatch = href.match(/[-_](\d+)[-_]bolum/i) ||
                    href.match(/bolum[-_](\d+)/i) ||
                    title.match(/(\d+)\.\s*Bölüm/i) ||
                    title.match(/Bölüm\s*(\d+)/i);
    if (epMatch) {
      epNum = parseInt(epMatch[1], 10);
    } else if (isMovieLink || isMovie(href) || isMovie(title) || isMovie(currentUrl)) {
      epNum = 1;
    }

    if (!epNum || isNaN(epNum) || epNum <= 0) continue;

    if (!title && epNum === 1 && (isMovieLink || isMovie(href) || isMovie(currentUrl))) {
      title = 'Film';
    }

    seenUrls.add(href);

    const epObj = {
      number: epNum,
      title: title || `${epNum}. Bölüm`,
      url: href,
      thumbnail: thumb,
      release_date: releaseDate,
    };

    if (epsByNumber.has(epNum)) {
      const existing = epsByNumber.get(epNum);
      const newHasThumb = Boolean(thumb);
      const oldHasThumb = Boolean(existing.thumbnail);
      const newTitleLen = (epObj.title || '').length;
      const oldTitleLen = (existing.title || '').length;

      if ((!oldHasThumb && newHasThumb) || (newTitleLen > oldTitleLen)) {
        epsByNumber.set(epNum, epObj);
      }
    } else {
      epsByNumber.set(epNum, epObj);
    }
  }

  // Pattern 1: flx-block episode cards
  if (epsByNumber.size === 0) {
    let match;
    const blockRegex = /<div[^>]*class="[^"]*flx-block[^"]*"[^>]*data-href="([^"]+)"([\s\S]*?)<\/div>/gi;
    while ((match = blockRegex.exec(html)) !== null) {
      let href = match[1].trim();
      if (href.startsWith('/')) href = `${BASE_URL}${href}`;
      if (!seenUrls.has(href)) {
        seenUrls.add(href);
        const content = match[2];
        const titleMatch = content.match(/<h4>([^<]+)<\/h4>/i);
        let bTitle = titleMatch ? titleMatch[1].trim() : '';
        if (!bTitle || bTitle === '.' || /^[.\s,;:!?•·…\-_]+$/.test(bTitle)) {
          bTitle = '';
        }

        const lowerBTitle = bTitle.toLowerCase();
        const lowerBHref = href.toLowerCase();
        if (
          lowerBTitle.includes('özel') ||
          lowerBTitle.includes('ozel') ||
          lowerBTitle.includes('özet') ||
          /\b(?:ova|oad|ona|sp|special|specials|recap)\b/i.test(lowerBTitle) ||
          lowerBHref.includes('ozel-bolum') ||
          lowerBHref.includes('special') ||
          /[-_](?:ova|oad|ona|sp|recap)[-_]/i.test(lowerBHref)
        ) {
          continue;
        }

        const isMovieLink = href.includes('filmi-izle') || href.includes('film-izle') || href.includes('tek-parca') || href.includes('-filmi');
        const epMatch = href.match(/[-_](\d+)[-_]bolum/i) || (bTitle ? bTitle.match(/(\d+)\.\s*Bölüm/i) : null);
        let epNum = epMatch ? parseInt(epMatch[1], 10) : (isMovieLink ? 1 : null);
        if (!epNum || isNaN(epNum) || epNum <= 0) continue;

        const epObj = {
          number: epNum,
          title: bTitle || `${epNum}. Bölüm`,
          url: href,
        };

        if (!epsByNumber.has(epNum)) {
          epsByNumber.set(epNum, epObj);
        }
      }
    }
  }

  // Pattern 2: Single-episode movie or embedded video player fallback
  if (epsByNumber.size === 0 && html && currentUrl) {
    const isSpecialContent = isSpecial(currentUrl) || isSpecial(html.slice(0, 3000));
    if (!isSpecialContent) {
      const hasPlayer = html.includes('animeDetail-video-player') ||
                        html.includes('explorer/') ||
                        html.includes('sibnet') ||
                        html.includes('<iframe') ||
                        html.includes('video-player');
      const isMovieContent = isMovie(currentUrl) || isMovie(html.slice(0, 3000));
      if (hasPlayer || isMovieContent) {
        const titleMatch = html.match(/<div[^>]*class=["'][^"']*playlist-title[^"']*["'][^>]*>[\s\S]*?<h1>([\s\S]*?)<\/h1>/i) ||
                           html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        const filmTitle = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : 'Film';
        const posterMatch = html.match(/<div[^>]*class=["'][^"']*poster[^"']*["'][\s\S]*?<img[^>]+src=["']([^"']+)["']/i);
        const filmThumb = posterMatch ? posterMatch[1].trim() : '';

        epsByNumber.set(1, {
          number: 1,
          title: filmTitle || 'Film',
          url: currentUrl.startsWith('http') ? currentUrl : `${BASE_URL}${currentUrl.startsWith('/') ? '' : '/'}${currentUrl}`,
          thumbnail: filmThumb,
          release_date: ''
        });
      }
    }
  }

  // Sort episodes by number ascending
  const episodes = Array.from(epsByNumber.values()).sort((a, b) => a.number - b.number);
  return episodes;
}

/**
 * Parses full anime metadata, synopsis, details, and episodes from anime detail HTML
 */
export function parseAnimeDetailsHtml(html) {
  if (!html) return null;

  const result = {};

  // 1. Title
  const titleMatch = html.match(/<div[^>]*class=["'][^"']*playlist-title[^"']*["'][^>]*>[\s\S]*?<h1>([\s\S]*?)<\/h1>/i) ||
                     html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  result.title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : '';

  // 2. Poster
  const posterMatch = html.match(/<div[^>]*class=["'][^"']*poster[^"']*["'][\s\S]*?<img[^>]+src=["']([^"']+)["']/i);
  result.poster = posterMatch ? posterMatch[1].trim() : '';

  // 3. Diğer İsimleri (Alternative Titles)
  const altNames = [];
  const altSectionMatch = html.match(/<dd[^>]*>\s*Diğer İsimleri\s*<\/dd>([\s\S]*?)<dd/i);
  if (altSectionMatch) {
    const dtRegex = /<dt[^>]*>([\s\S]*?)<\/dt>/gi;
    let dtM;
    while ((dtM = dtRegex.exec(altSectionMatch[1])) !== null) {
      const txt = dtM[1].replace(/<[^>]*>/g, '').trim();
      if (txt) {
        txt.split(/,\s*/).forEach(n => {
          const trimmed = n.trim();
          if (trimmed && !altNames.includes(trimmed)) altNames.push(trimmed);
        });
      }
    }
  }
  result.alternative_names = altNames;

  // 4. Genres (Anime Türü)
  const genres = [];
  const genreRegex = /<a[^>]*class=["'][^"']*genre[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let gM;
  while ((gM = genreRegex.exec(html)) !== null) {
    const g = gM[1].replace(/<[^>]*>/g, '').trim();
    if (g && !genres.includes(g)) genres.push(g);
  }
  result.genres = genres;

  // 5. Details (Anime Tipi, Bölüm Sayısı, Başlangıç Tarihi, Eklenme Tarihi, Puanlama, Bölüm Süresi, Yapım Yılı)
  const dlPairs = {};
  const ddDtRegex = /<dd[^>]*>([\s\S]*?)<\/dd>\s*<dt[^>]*>([\s\S]*?)<\/dt>/gi;
  let pairM;
  while ((pairM = ddDtRegex.exec(html)) !== null) {
    const key = pairM[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    const val = pairM[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (key) dlPairs[key] = val;
  }
  result.details = dlPairs;

  // Puanlama / Oy hesabı
  const starsMatch = html.match(/<dd[^>]*>\s*Puanlama\s*\(\s*OY\s*:\s*(\d+)\s*\)\s*<\/dd>[\s\S]*?<dt[^>]*>([\s\S]*?)<\/dt>/i);
  if (starsMatch) {
    const votes = parseInt(starsMatch[1], 10) || 0;
    const starBlock = starsMatch[2];
    const fullStars = (starBlock.match(/fa-star(?!\-o)\b/g) || []).length;
    result.rating = {
      score_5: fullStars,
      score_10: fullStars * 2,
      votes: votes
    };
  }

  // Fansublar
  const fansubs = [];
  const fansubRegex = /<a[^>]*class=["'][^"']*post-category[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let fM;
  while ((fM = fansubRegex.exec(html)) !== null) {
    const f = fM[1].replace(/<[^>]*>/g, '').trim();
    if (f && !fansubs.includes(f)) fansubs.push(f);
  }
  result.fansubs = fansubs;

  // 6. Anime Konusu (Synopsis)
  const descMatch = html.match(/<span[^>]*class=["'][^"']*headerSized[^"']*["'][^>]*>\s*Anime Konusu\s*<\/span>([\s\S]*?)<\/div>/i);
  if (descMatch) {
    let cleanDesc = descMatch[1]
      .replace(/<p><\/p>/g, '')
      .replace(/<p><strong>[\s\S]*?<\/strong><\/p>/gi, '')
      .replace(/<[^>]*>/g, '\n')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .join('\n\n');
    result.synopsis = cleanDesc.trim();
  }

  // 7. Episodes
  result.episodes = parseEpisodesHtml(html);
  result.total_episodes = result.episodes.length;

  return result;
}

/**
 * Detects and extracts pagination links from anime overview page HTML
 * Supports <ul class="pagination">, a[href*="sayfa="], a[href*="page="], /anime/.../2, etc.
 */
export function extractPaginationLinks(html, currentUrl = '') {
  if (!html) return [];
  const links = [];
  const seen = new Set();
  if (currentUrl) seen.add(currentUrl);

  const aRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = aRegex.exec(html)) !== null) {
    let href = match[1].trim();
    const content = match[2];
    const text = content.replace(/<[^>]*>/g, '').trim();

    const isPageNum = /^\d+$/.test(text);
    const hasPageParam = href.includes('sayfa=') || href.includes('page=') || /\/\d+$/.test(href);

    if ((isPageNum || hasPageParam) && !href.includes('/arama') && !href.includes('/kategori') && !href.includes('-bolum')) {
      if (href.startsWith('/')) href = `${BASE_URL}${href}`;
      if (!seen.has(href)) {
        seen.add(href);
        links.push(href);
      }
    }
  }

  return links;
}

/**
 * Intelligently extrapolates missing episodes using the anime's detected slug pattern.
 * e.g. If episodes 1 to 10 are extracted (/haikyuu-1-bolum-izle) and targetTotal is 25,
 * generates missing episodes 11 to 25 (/haikyuu-11-bolum-izle) so no episodes are cut off.
 */
export function completeMissingEpisodes(extractedEpisodes, targetTotal = 0, animeTitle = '', defaultThumb = '') {
  if (!Array.isArray(extractedEpisodes) || extractedEpisodes.length === 0) return extractedEpisodes || [];
  const total = parseInt(targetTotal, 10);
  if (!total || total <= extractedEpisodes.length) return extractedEpisodes;

  const epsByNum = new Map();
  extractedEpisodes.forEach(ep => {
    const num = parseInt(ep.number || ep.episode_number, 10);
    if (!isNaN(num) && num > 0) epsByNum.set(num, ep);
  });

  // Detect URL pattern
  let sampleEp = null;
  let urlPattern = null;

  for (const ep of extractedEpisodes) {
    const url = ep.url || '';
    const m = url.match(/^(https?:\/\/[^\/]+.*\/|.*?)([a-zA-Z0-9_-]+[-_])(\d+)([-_]bolum(?:-izle)?.*)$/i) ||
              url.match(/^(.*\/)([a-zA-Z0-9_-]+[-_])(\d+)([-_]bolum.*)$/i) ||
              url.match(/^(.*[-_])(\d+)([-_]bolum.*)$/i);
    if (m) {
      sampleEp = ep;
      urlPattern = {
        fullPrefix: m[1] + (m[2] || ''),
        suffix: m[4] || m[3]
      };
      break;
    }
  }

  if (!urlPattern) return extractedEpisodes;

  // Title pattern
  let titlePrefix = animeTitle ? `${animeTitle} ` : '';
  let titleSuffix = '. Bölüm';
  if (sampleEp && (sampleEp.title || sampleEp.episode_title)) {
    const epTitle = sampleEp.title || sampleEp.episode_title;
    const tMatch = epTitle.match(/^(.*?)(\d+)(\.?\s*Bölüm.*)$/i);
    if (tMatch) {
      titlePrefix = tMatch[1];
      titleSuffix = tMatch[3];
    }
  }

  const thumb = (sampleEp && sampleEp.thumbnail) || defaultThumb || '';

  for (let num = 1; num <= total; num++) {
    if (!epsByNum.has(num)) {
      const generatedUrl = `${urlPattern.fullPrefix}${num}${urlPattern.suffix}`;
      const generatedTitle = `${titlePrefix}${num}${titleSuffix}`;
      epsByNum.set(num, {
        number: num,
        episode_number: num,
        title: generatedTitle,
        episode_title: generatedTitle,
        url: generatedUrl,
        thumbnail: thumb,
        release_date: null,
        is_deduced: true
      });
    }
  }

  return Array.from(epsByNum.values()).sort((a, b) => (a.number || a.episode_number) - (b.number || b.episode_number));
}

/**
 * 2. Fetches anime overview page and extracts all episodes
 * Traverses pagination pages if total > 10/12, and extrapolates missing episodes
 */
export async function fetchEpisodesForAnime(animeOverviewUrl, targetTotal = 0, animeTitle = '', targetFormat = '') {
  if (!animeOverviewUrl) return [];

  const { html, size, ok } = await fetchHtml(animeOverviewUrl);
  if (!ok || isBotBlocked(html, size)) {
    console.warn('[Resolver] Overview page blocked or empty:', animeOverviewUrl);
    return [];
  }

  let episodes = parseEpisodesHtml(html, animeOverviewUrl);

  // Read Toplam count from page if targetTotal not provided
  let totalCount = parseInt(targetTotal, 10) || 0;
  if (!totalCount) {
    const totalMatch = html.match(/<p[^>]*class=["'][^"']*animeDetail-desc[^"']*["'][^>]*>[\s\S]*?Toplam\s*<span>(\d+)<\/span>/i) ||
                       html.match(/Toplam\s*<span>(\d+)<\/span>/i) ||
                       html.match(/Toplam\s*(\d+)/i);
    if (totalMatch) {
      totalCount = parseInt(totalMatch[1], 10) || 0;
    }
  }

  // Check and traverse pagination pages if episodes are incomplete
  const paginationLinks = extractPaginationLinks(html, animeOverviewUrl);
  if (paginationLinks.length > 0 && (totalCount === 0 || episodes.length < totalCount)) {
    const seenUrls = new Set(episodes.map(e => e.url));
    const epsByNum = new Map(episodes.map(e => [e.number, e]));

    for (const pageUrl of paginationLinks.slice(0, 10)) {
      try {
        const pageRes = await fetchHtml(pageUrl, 8000);
        if (pageRes.ok && !isBotBlocked(pageRes.html, pageRes.size)) {
          const pageEps = parseEpisodesHtml(pageRes.html, pageUrl);
          pageEps.forEach(ep => {
            if (!seenUrls.has(ep.url) && !epsByNum.has(ep.number)) {
              seenUrls.add(ep.url);
              epsByNum.set(ep.number, ep);
            }
          });
        }
      } catch (pErr) {
        console.warn('[Resolver] Pagination fetch error:', pErr.message);
      }
    }
    episodes = Array.from(epsByNum.values()).sort((a, b) => a.number - b.number);
  }

  // Single-episode movie or 1-episode anime fallback if episodes is empty (Specials are strictly excluded)
  if (episodes.length === 0 && !isSpecial(animeOverviewUrl) && (targetFormat === 'MOVIE' || totalCount === 1 || targetTotal === 1 || isMovie(animeOverviewUrl))) {
    const titleMatch = html.match(/<div[^>]*class=["'][^"']*playlist-title[^"']*["'][^>]*>[\s\S]*?<h1>([\s\S]*?)<\/h1>/i) ||
                       html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const filmTitle = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : (animeTitle || 'Film');
    const posterMatch = html.match(/<div[^>]*class=["'][^"']*poster[^"']*["'][\s\S]*?<img[^>]+src=["']([^"']+)["']/i);
    const filmThumb = posterMatch ? posterMatch[1].trim() : '';
    episodes = [{
      number: 1,
      title: filmTitle || 'Film',
      url: animeOverviewUrl,
      thumbnail: filmThumb,
      release_date: ''
    }];
  }

  // KULLANICI KESİN KURALI: Olmayan / henüz çıkmamış bölümleri asla sahte olarak listeleme!
  // Sadece sitede gerçekten yayınlanmış ve bulunan bölümleri listele.
  return episodes;
}

/**
 * Kullanıcı Talebi: Arama yapacaksın -> ilk çıkan sonucun içindeki linke gideceksin -> ordan linkleri çekip listeleyeceksin!
 * Supports both string animeTitle and animeInfo object { title_romaji, title_english, title, synonyms, episodes, format }
 */
export async function searchAndExtractEpisodes(animeInput, seasonNum = 1, targetTotalInput = 0, targetFormatInput = '') {
  const targetSeason = parseInt(seasonNum, 10) || 1;
  const animeInfo = typeof animeInput === 'object' && animeInput !== null
    ? animeInput
    : { title: String(animeInput || ''), title_romaji: String(animeInput || '') };

  const targetTotal = parseInt(animeInfo.episodes || animeInfo.total_episodes || targetTotalInput, 10) || 0;
  const targetFormat = animeInfo.format || targetFormatInput || classifyAnimeFormat(animeInfo);
  animeInfo.format = targetFormat;
  const primaryTitle = animeInfo.title_romaji || animeInfo.title || '';

  const targetPart = animeInfo.part_number || detectPartNumber(animeInfo.title || animeInfo.season_title, 1);
  const isTargetFinal = Boolean(animeInfo.is_final || /\bfinal\b/i.test(animeInfo.title || animeInfo.season_title));

  const queriesToTry = [];

  // 1. If multi-part (e.g. Part 2, 2. Kısım), final season, or targetSeason > 1, try direct queries first
  const baseTitles = [animeInfo.title_romaji, animeInfo.title_english, animeInfo.title].filter(Boolean);
  if (targetPart > 1 || isTargetFinal || targetSeason > 1) {
    for (const bt of baseTitles) {
      const cleanBt = getCleanSearchQuery(bt);
      if (cleanBt && cleanBt.length >= 3 && !/^\d+[\s.]*(sezon|season)?$/i.test(cleanBt)) {
        if (isTargetFinal && targetPart > 1) {
          const q1 = `${cleanBt} Final Sezon ${targetPart}. Kısım`;
          const q2 = `${cleanBt} ${targetSeason}. Sezon ${targetPart}. Kısım`;
          const q3 = `${cleanBt} Final Sezon Part ${targetPart}`;
          if (!queriesToTry.includes(q1)) queriesToTry.push(q1);
          if (!queriesToTry.includes(q2)) queriesToTry.push(q2);
          if (!queriesToTry.includes(q3)) queriesToTry.push(q3);
        } else if (targetPart > 1) {
          const q1 = `${cleanBt} ${targetSeason}. Sezon ${targetPart}. Kısım`;
          const q2 = `${cleanBt} ${targetSeason}. Sezon Part ${targetPart}`;
          const q3 = `${cleanBt} ${targetPart}. Kısım`;
          if (!queriesToTry.includes(q1)) queriesToTry.push(q1);
          if (!queriesToTry.includes(q2)) queriesToTry.push(q2);
          if (!queriesToTry.includes(q3)) queriesToTry.push(q3);
        } else if (isTargetFinal) {
          const q1 = `${cleanBt} Final Sezon`;
          const q2 = `${cleanBt} ${targetSeason}. Sezon Final`;
          const q3 = `${cleanBt} The Final Season`;
          if (!queriesToTry.includes(q1)) queriesToTry.push(q1);
          if (!queriesToTry.includes(q2)) queriesToTry.push(q2);
          if (!queriesToTry.includes(q3)) queriesToTry.push(q3);
        } else if (targetSeason > 1) {
          const seasonSuffixes = [
            targetSeason === 2 ? '2nd Season' : targetSeason === 3 ? '3rd Season' : `${targetSeason}th Season`,
            `${targetSeason}. Sezon`,
            targetSeason === 2 ? 'II' : targetSeason === 3 ? 'III' : targetSeason === 4 ? 'IV' : ''
          ].filter(Boolean);
          for (const suff of seasonSuffixes) {
            const sq = `${cleanBt} ${suff}`.trim();
            if (!queriesToTry.includes(sq)) queriesToTry.push(sq);
          }
        }
      }
    }
  }

  // 2. Base franchise queries (Romaji, English, Standard, Synonyms)
  if (animeInfo.title_romaji) {
    const q = getCleanSearchQuery(animeInfo.title_romaji);
    if (q && !queriesToTry.includes(q)) queriesToTry.push(q);
  }
  if (animeInfo.title_english) {
    const q = getCleanSearchQuery(animeInfo.title_english);
    if (q && !queriesToTry.includes(q)) queriesToTry.push(q);
  }
  if (animeInfo.title) {
    const q = getCleanSearchQuery(animeInfo.title);
    if (q && !queriesToTry.includes(q)) queriesToTry.push(q);
  }
  if (Array.isArray(animeInfo.synonyms)) {
    animeInfo.synonyms.slice(0, 3).forEach(s => {
      if (s) {
        const q = getCleanSearchQuery(s);
        if (q && !queriesToTry.includes(q)) queriesToTry.push(q);
      }
    });
  }
  if (queriesToTry.length === 0 && animeInfo.orijinal_ad) {
    const q = getCleanSearchQuery(animeInfo.orijinal_ad);
    if (q) queriesToTry.push(q);
  }

  const primarySearchQuery = queriesToTry[0] || (typeof animeInput === 'string' ? animeInput : 'anime');
  let lastSearchUrl = `${BASE_URL}/arama/${encodeURIComponent(primarySearchQuery)}`;
  let allCandidates = [];
  let isBlocked = false;

  for (const rawQuery of queriesToTry) {
    const searchUrl = `${BASE_URL}/arama/${encodeURIComponent(rawQuery)}`;
    lastSearchUrl = searchUrl;

    try {
      const searchRes = await fetchHtml(searchUrl, 10000);
      if (!searchRes.ok || isBotBlocked(searchRes.html, searchRes.size)) {
        isBlocked = true;
        break; // Cloudflare bot protection is active — immediately fallback to WebView solver!
      }

      const candidates = parseSearchResultsHtml(searchRes.html);
      if (candidates.length > 0) {
        allCandidates = candidates;
        const targetUrl = matchCandidateForSeason(candidates, targetSeason, animeInfo);
        if (targetUrl) {
          const episodes = await fetchEpisodesForAnime(targetUrl, targetTotal, primaryTitle, targetFormat);
          if (episodes.length > 0) {
            return {
              success: true,
              targetUrl,
              episodes,
              candidates,
              bestSearchQuery: rawQuery,
              searchUrl,
              total: episodes.length
            };
          }
        }
      }
    } catch (err) {
      console.warn(`[Resolver] searchAndExtract error for "${rawQuery}":`, err.message);
    }
  }

  return {
    success: false,
    blocked: isBlocked,
    empty: allCandidates.length === 0,
    searchUrl: lastSearchUrl,
    bestSearchQuery: primarySearchQuery,
    candidates: allCandidates
  };
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

  // Detect fansub from HTML if available
  let detectedFansub = null;
  const fansubMatch = html.match(/class=["'][^"']*fansubSelector[^"']*active[^"']*["'][^>]*data-fad=["']([^"']+)["']/i) ||
                      html.match(/class=["'][^"']*fansubSelector[^"']*["'][^>]*data-fad=["']([^"']+)["']/i) ||
                      html.match(/id=["']fansubInfoLink["'][^>]*>([^<]+)<\/a>/i);
  if (fansubMatch) {
    detectedFansub = fansubMatch[1].trim();
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
        fansub: detectedFansub,
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
      fansub: detectedFansub,
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
        return {
          streamUrl: m3u8,
          format: 'hls',
          sourceType: 'tranimeizle_native',
          fansub: detectedFansub,
        };
      }
    }
    return {
      streamUrl: iframeSrc,
      format: 'iframe',
      sourceType: 'external_iframe',
      fansub: detectedFansub,
    };
  }

  return null;
}
