/**
 * Client-Side Anime Healing and Validation Helpers
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

/**
 * Checks if scraped title matches expected anime title (supports Japanese, English, Romaji, Synonyms)
 */
export function verifyTitleMatchClient(expectedTitles = [], scrapedTitles = []) {
  const cleanExpected = expectedTitles.filter(Boolean);
  const cleanScraped = scrapedTitles.filter(Boolean);

  if (cleanExpected.length === 0 || cleanScraped.length === 0) return true;

  const expectedTokens = new Set();
  cleanExpected.forEach(t => {
    tokenizeTitleClient(t).forEach(tok => expectedTokens.add(tok));
  });

  const scrapedTokens = new Set();
  cleanScraped.forEach(t => {
    tokenizeTitleClient(t).forEach(tok => scrapedTokens.add(tok));
  });

  if (expectedTokens.size === 0 || scrapedTokens.size === 0) return true;

  // Check token intersection
  let matchCount = 0;
  for (const token of expectedTokens) {
    if (scrapedTokens.has(token)) {
      matchCount++;
    }
  }

  // Also check substring contains
  for (const exp of cleanExpected) {
    const expClean = exp.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const scr of cleanScraped) {
      const scrClean = scr.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (expClean.length > 4 && scrClean.length > 4) {
        if (expClean.includes(scrClean) || scrClean.includes(expClean)) {
          return true;
        }
      }
    }
  }

  return matchCount > 0;
}

/**
 * Formats a clean Tranimeizle search or overview URL from raw input
 */
export function resolveTargetTranimeizleUrl(input, seasonNumber = null) {
  if (!input) return null;
  const trimmed = input.trim();

  // If already a full URL
  if (trimmed.startsWith('http')) {
    // If it's a -bolum-izle link, convert to overview page
    if (trimmed.includes('-bolum-izle')) {
      const match = trimmed.match(/(https?:\/\/[^\/]+)\/(?:anime\/)?(.+?)(?:-\d+)?-bolum-izle/i);
      if (match) {
        return `${match[1]}/anime/${match[2]}-izle`;
      }
    }
    return trimmed;
  }

  // If it's a slug
  if (trimmed.includes('-')) {
    const cleanSlug = trimmed.replace(/^anime\//i, '').replace(/-izle$/i, '');
    return `https://www.tranimeizle.io/anime/${cleanSlug}-izle`;
  }

  // If it's a plain search query
  let q = trimmed;
  if (seasonNumber && seasonNumber > 1) {
    q += ` ${seasonNumber}. Sezon`;
  }
  return `https://www.tranimeizle.io/arama?q=${encodeURIComponent(q)}`;
}
