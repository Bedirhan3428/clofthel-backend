const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Anime = require('../models/Anime');
const axios = require('axios');

// ── Orchestrator State Cache ───────────────────────────────────
const orchestratorStateSchema = new mongoose.Schema(
  {
    state_key: { type: String, index: true },
    processed_chunks: [Number],
    global_titles_map: mongoose.Schema.Types.Mixed,
    updatedAt: Date
  },
  { collection: 'orchestrator_state', versionKey: false }
);

const OrchestratorState = mongoose.models.OrchestratorState || mongoose.model('OrchestratorState', orchestratorStateSchema);

let orchestratorMap = {};
let mongoIdToGroupMap = {};
let animeCoversMap = {};

async function loadAnimeCovers() {
  try {
    const animes = await Anime.find({}, '_id cover_image banner_image').lean();
    const newMap = {};
    for (const anime of animes) {
      newMap[String(anime._id)] = {
        cover: anime.cover_image,
        banner: anime.banner_image
      };
    }
    animeCoversMap = newMap;
    console.log(`[Orchestrator Cache] Loaded ${Object.keys(animeCoversMap).length} anime cover/banner references.`);
  } catch (err) {
    console.error('[Orchestrator Cache] Error loading covers:', err.message);
  }
}

async function loadOrchestratorMap() {
  try {
    // 1. Load covers
    await loadAnimeCovers();

    // 2. Load global titles map
    const doc = await OrchestratorState.findOne({ state_key: 'orchestrator_state' }).lean();
    if (doc && doc.global_titles_map) {
      orchestratorMap = doc.global_titles_map;

      // Build reverse index mongo_db_id -> group
      const newReverseMap = {};
      for (const [key, item] of Object.entries(orchestratorMap)) {
        if (item.seasons) {
          for (const s of item.seasons) {
            if (s.mongo_db_id) newReverseMap[String(s.mongo_db_id)] = item;
          }
        }
        if (item.related_movies_or_ovas) {
          for (const m of item.related_movies_or_ovas) {
            if (m.mongo_db_id) newReverseMap[String(m.mongo_db_id)] = item;
          }
        }
      }
      mongoIdToGroupMap = newReverseMap;
      console.log(`[Orchestrator Cache] Loaded ${Object.keys(orchestratorMap).length} canonical titles and ${Object.keys(mongoIdToGroupMap).length} reverse mapping keys.`);
    }
  } catch (err) {
    console.error('[Orchestrator Cache] Load error:', err.message);
  }
}
// Load on file execute
loadOrchestratorMap();
// Reload every 10 minutes
setInterval(loadOrchestratorMap, 10 * 60 * 1000);

function getCanonicalInfoForDoc(doc) {
  if (!doc) return null;
  const searchIdStr = String(doc._id || doc.id);
  const group = mongoIdToGroupMap[searchIdStr];
  if (group) {
    const matchedSeason = (group.seasons || []).find(s => String(s.mongo_db_id) === searchIdStr);
    if (matchedSeason) {
      return { item: group, type: 'season', matchedSeason };
    }
    const matchedMovie = (group.related_movies_or_ovas || []).find(m => String(m.mongo_db_id) === searchIdStr);
    if (matchedMovie) {
      return { item: group, type: 'movie', matchedMovie };
    }
  }
  return null;
}
function parseIdParam(idParam) {
  if (!idParam) return null;
  // Validates standard 24-character hexadecimal ObjectId or a comma-separated list of them
  const isValid = /^[0-9a-fA-F]{24}(\s*,\s*[0-9a-fA-F]{24})*$/.test(idParam);
  if (!isValid) return null;
  return idParam.split(',').map(s => s.trim());
}

async function healMissingEpisodes(anime) {
  if (!anime || !anime.episodes) return;
  const epsMap = anime.episodes;
  const keys = Object.keys(epsMap).map(k => parseInt(k, 10)).filter(n => !isNaN(n));
  if (keys.length === 0) return;

  const maxEp = Math.max(...keys);
  // If it's a single episode or if we have all episodes, nothing to heal
  if (maxEp <= 1 || keys.length === maxEp) return;

  console.log(`[Healer] Anime ${anime.tranimeizle_slug} (${anime._id}) has missing episodes. Max ep: ${maxEp}, current count: ${keys.length}`);

  // Find a template URL from existing episodes to reconstruct missing ones
  let templateKey = keys[0];
  let templateUrl = epsMap[String(templateKey)];
  if (!templateUrl) return;

  const matchPattern = new RegExp(`-${templateKey}-bolum-izle`, 'i');
  if (!matchPattern.test(templateUrl)) {
    console.log(`[Healer] Template URL does not match standard pattern: ${templateUrl}`);
    return;
  }

  const updatedEpisodes = { ...epsMap };
  let healedAny = false;

  for (let i = 1; i <= maxEp; i++) {
    if (!updatedEpisodes[String(i)]) {
      const targetPattern = `-${i}-bolum-izle`;
      const healedUrl = templateUrl.replace(matchPattern, targetPattern);
      updatedEpisodes[String(i)] = healedUrl;
      healedAny = true;
    }
  }

  if (healedAny) {
    try {
      await Anime.updateOne(
        { _id: anime._id },
        { $set: { episodes: updatedEpisodes } }
      );
      console.log(`[Healer] Successfully healed and updated ${anime.tranimeizle_slug} in DB.`);
      anime.episodes = updatedEpisodes;
    } catch (err) {
      console.error(`[Healer] Failed to update healed episodes for ${anime.tranimeizle_slug}:`, err.message);
    }
  }
}
const { resolveSibnetId } = require('../utils/resolver');
const { apiKeyAuth, protect } = require('../middleware/authMiddleware');
const rateLimit = require('express-rate-limit');

// Rate limiter for search requests from the web app client
const webSearchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // max 5 searches per minute
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !req.isWebClient, // skip rate limit for mobile app client
  message: {
    success: false,
    error: 'Çok fazla arama yapıldı. Lütfen 1 dakika sonra tekrar deneyin.'
  }
});

// ── Basit TTL Cache (AniList verilerini tekrar çekmemek için) ──────────────
const memCache = {}; // { key: { data, expiresAt } }
function cacheGet(key) {
  const entry = memCache[key];
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { delete memCache[key]; return null; }
  return entry.data;
}
function cacheSet(key, data, ttlMs) {
  memCache[key] = { data, expiresAt: Date.now() + ttlMs };
}

// SSRF Koruması: Proxy endpointlerinde sadece izin verilen domainlere erişim
const ALLOWED_PROXY_DOMAINS = [
  'video.sibnet.ru',
  'optraco.top',
  'aitrvip.com',
  'cdn.aitrvip.com',
  'st.aitrvip.com'
];

function isUrlAllowed(urlStr) {
  try {
    const parsed = new URL(urlStr);
    // Sadece https ve http protokollerine izin ver
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    // Domain whitelist kontrolü
    return ALLOWED_PROXY_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

/**
 * Helper: format slug to title case
 * e.g., 'dragon-ball-z-movie-07-izle' -> 'Dragon Ball Z Movie 07'
 */
function formatSlugToTitle(slug) {
  if (!slug) return '';
  let title = slug.replace(/-izle$/, ''); // remove trailing "-izle"
  title = title.replace(/-/g, ' '); // replace hyphens with spaces
  
  // Strip Turkish SEO keywords that pollute the title
  title = title.replace(/\b(izle|turkce|dublaj|altyazi|full\s*hd|hd)\b/gi, '');
  
  // Convert Turkish type words to English
  title = title.replace(/\bsezon\b/gi, 'Season');
  title = title.replace(/\bbolum\b/gi, 'Episode');
  title = title.replace(/\bkisim\b/gi, 'Part');
  title = title.replace(/\bfinal\b/gi, 'Final');
  
  // Clean up multiple spaces and trim
  title = title.replace(/\s+/g, ' ').trim();
  
  return title.replace(/\b\w/g, c => c.toUpperCase()); // capitalize words
}

function getFranchiseKey(doc) {
  if (doc.comparable_base_slug) {
    return doc.comparable_base_slug;
  }
  if (doc.tranimeizle_slug) {
    return getComparableBaseSlug(doc.tranimeizle_slug);
  }
  if (doc.orijinal_ad) {
    return doc.orijinal_ad
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s:]+(?:season|sezon|part|cour|the final|final|movie|film|films|movies|ova|ona|special|specials)\s*\d*/gi, '')
      .replace(/\b\d+(st|nd|rd|th)?\b/g, '') // remove numbers
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }
  return String(doc._id || doc.id);
}

function getRepresentative(docs) {
  if (!docs || docs.length === 0) return null;
  if (docs.length === 1) return docs[0];

  return [...docs].sort((a, b) => {
    // 1. Prefer TV format over others (e.g. prioritize Season 1 TV over Movie sequel)
    const aFormat = (a.format || '').toUpperCase();
    const bFormat = (b.format || '').toUpperCase();
    if (aFormat === 'TV' && bFormat !== 'TV') return -1;
    if (aFormat !== 'TV' && bFormat === 'TV') return 1;

    // 2. Chronological order
    const aOrder = a.chronological_order || 1;
    const bOrder = b.chronological_order || 1;
    if (aOrder !== bOrder) return aOrder - bOrder;

    // 3. Season number
    const aInfo = getBaseSlugAndSeason(a.tranimeizle_slug);
    const bInfo = getBaseSlugAndSeason(b.tranimeizle_slug);
    if (aInfo.season !== bInfo.season) {
      return aInfo.season - bInfo.season;
    }

    // 4. Default fallback: more episodes or older ID
    return (b.total_episodes || 0) - (a.total_episodes || 0);
  })[0];
}

function isValidMatch(slug, titleRomaji, titleEnglish) {
  const slugTokens = (slug || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(x => x && x.length > 2);
  if (slugTokens.length === 0) return false;
  
  const romaji = (titleRomaji || '').toLowerCase();
  const english = (titleEnglish || '').toLowerCase();
  
  const stopwords = ['izle', 'movie', 'film', 'season', 'sezon', 'part', 'kisim', 'ova', 'ona', 'special', 'tv', 'dublaj', 'altyazi', 'hd', 'fullhd'];
  const keyTokens = slugTokens.filter(t => !stopwords.includes(t) && !/^\d+$/.test(t));
  if (keyTokens.length === 0) return true;
  
  const firstToken = keyTokens[0];
  const secondToken = keyTokens[1];
  
  const matchesFirst = romaji.includes(firstToken) || english.includes(firstToken);
  const matchesSecond = secondToken ? (romaji.includes(secondToken) || english.includes(secondToken)) : false;
  
  if (slug.includes('attack-on-titan') && (romaji.includes('shingeki') || english.includes('titan'))) return true;
  if (slug.includes('shingeki-no-kyojin') && (romaji.includes('shingeki') || english.includes('titan'))) return true;
  if (slug.includes('your-name') && (romaji.includes('kimi') || english.includes('name'))) return true;
  if (slug.includes('kimi-no-na-wa') && (romaji.includes('kimi') || english.includes('name'))) return true;
  
  return matchesFirst || matchesSecond;
}

/**
 * Helper: extract base slug and season info from slug
 * e.g., 'classroom-of-the-elite-2-sezon-izle' -> { baseSlug: 'classroom-of-the-elite', season: 2, type: 'Sezon' }
 */
function getBaseSlugAndSeason(slug) {
  if (!slug) return { baseSlug: '', season: 1, type: 'Sezon' };
  let cleaned = slug.replace(/-izle$/, '');

  // Detect Japanese sequel suffix "zoku" as Season 2
  const zokuMatch = cleaned.match(/[-]zoku(?:[-]|$)/i);
  if (zokuMatch) {
    const baseSlug = cleaned.replace(/[-]zoku/i, '');
    return { baseSlug, season: 2, type: 'Sezon' };
  }

  // PRIORITY 1: Complex patterns like "final-sezonu-3-kisim" or "the-final-sezonu-2-kisim"
  const finalSezonuMatch = cleaned.match(/[-](?:the-)?final[-]sezonu[-](\d+)[-]kisim/);
  if (finalSezonuMatch) {
    const part = parseInt(finalSezonuMatch[1]);
    let baseSlug = cleaned.replace(finalSezonuMatch[0], '');
    baseSlug = baseSlug.replace(/[-](final|the-final)$/i, '');
    return { baseSlug, season: 4 + part - 1, type: 'Kısım' }; // Final season = season 4+
  }

  // PRIORITY 2: Standard season/part patterns
  const seasonRegexes = [
    { regex: /[-](\d+)[-]sezon(?:u)?(?:[-].*)?$/, type: 'Sezon', strip: /[-]\d+[-]sezon(?:u)?(?:[-].*)?$/ },
    { regex: /[-]sezon(?:u)?[-](\d+)/, type: 'Sezon', strip: null },
    { regex: /[-](\d+)[-]season/, type: 'Sezon', strip: null },
    { regex: /[-]season[-](\d+)/, type: 'Sezon', strip: null },
  ];
  for (const item of seasonRegexes) {
    const match = cleaned.match(item.regex);
    if (match) {
      const seasonNum = parseInt(match[1]);
      let baseSlug;
      if (item.strip) {
        baseSlug = cleaned.replace(item.strip, '');
      } else {
        baseSlug = cleaned.replace(match[0], '');
      }
      // Strip trailing noise from baseSlug
      baseSlug = baseSlug.replace(/[-](final|the-final|the-last-attack|son)$/i, '');
      return { baseSlug, season: seasonNum, type: item.type };
    }
  }

  // PRIORITY 3: Part/kisim patterns (after season check to avoid conflicts)
  const partRegexes = [
    { regex: /[-](\d+)[-]kisim/, type: 'Kısım' },
    { regex: /[-]kisim[-](\d+)/, type: 'Kısım' },
    { regex: /[-](\d+)[-]part/, type: 'Part' },
    { regex: /[-]part[-](\d+)/, type: 'Part' }
  ];
  for (const item of partRegexes) {
    const match = cleaned.match(item.regex);
    if (match) {
      const seasonNum = parseInt(match[1]);
      let baseSlug = cleaned.replace(match[0], '');
      baseSlug = baseSlug.replace(/[-](final|the-final|the-last-attack|son)$/i, '');
      return { baseSlug, season: seasonNum, type: item.type };
    }
  }

  // Strip trailing noise even for season 1 entries
  let baseSlug = cleaned.replace(/[-](final|the-final|the-last-attack|son)$/i, '');
  return { baseSlug, season: 1, type: 'Sezon' };
}

function getComparableSlug(s) {
  if (!s) return '';
  let cleaned = s.toLowerCase()
    .replace(/attack[-]?on[-]?titan/g, 'shingeki-no-kyojin')
    .replace(/[-_]/g, '-');
  
  cleaned = cleaned
    .replace(/\b(the|no|izle|altyazi|dublaj|hd|fullhd)\b/g, '')
    .replace(/-+/g, '-');

  // Normalize season/part patterns
  cleaned = cleaned
    .replace(/sezon/g, 'season')
    .replace(/kisim/g, 'part');

  cleaned = cleaned.replace(/(\d+)-season-(\d+)-part/gi, 'season-$1-part-$2');
  cleaned = cleaned.replace(/\bseason-(\d+)-part-(\d+)\b/gi, 'TEMP_S_$1_P_$2');
  cleaned = cleaned.replace(/\b(\d+)-part-(\d+)\b/gi, 'TEMP_S_$1_P_$2');
  cleaned = cleaned.replace(/\b(\d+)-season-(\d+)\b/gi, 'TEMP_S_$1_P_$2');
  cleaned = cleaned.replace(/TEMP_S_(\d+)_P_(\d+)/gi, 'season-$1-part-$2');

  cleaned = cleaned.replace(/\bseason-(\d+)\b/gi, 'TEMP_S_$1');
  cleaned = cleaned.replace(/\b(\d+)-season\b/gi, 'TEMP_S_$1');
  cleaned = cleaned.replace(/TEMP_S_(\d+)/gi, 'season-$1');

  cleaned = cleaned.replace(/\bpart-(\d+)\b/gi, 'TEMP_P_$1');
  cleaned = cleaned.replace(/\b(\d+)-part\b/gi, 'TEMP_P_$1');
  cleaned = cleaned.replace(/TEMP_P_(\d+)/gi, 'part-$1');

  return cleaned
    .replace(/[-]/g, '')
    .replace(/specials/g, 'special')
    .replace(/movies/g, 'movie')
    .replace(/films/g, 'film')
    .replace(/ovas/g, 'ova');
}

function getComparableBaseSlug(slug) {
  const { baseSlug } = getBaseSlugAndSeason(slug);
  return getComparableSlug(baseSlug);
}

function getDescriptiveLabel(slug, format, originalAd) {
  if (!slug) return 'Season 1';
  let cleaned = slug.toLowerCase().replace(/-izle$/, '').replace(/_/g, '-');

  // Helper to capitalize words
  const capitalize = (str) => str.replace(/\b\w/g, c => c.toUpperCase());

  // 0. High-Confidence Specific Keyword Matches (resolves missing format metadata)
  if (cleaned.includes('lost-girls')) return 'OVA: Lost Girls';
  if (cleaned.includes('chronicle')) return 'Movie: Chronicle';
  if (cleaned.includes('last-attack')) return 'Movie: The Last Attack';

  // 1. Movie Detection
  const isMovie = (format && format.toUpperCase() === 'MOVIE') || 
                  /\b(?:movie|film)\b/i.test(cleaned) ||
                  (originalAd && /\b(?:movie|film)\b/i.test(originalAd));

  if (isMovie) {
    const movieNumMatch = cleaned.match(/\bmovie[-](\d+)\b/i) || 
                          cleaned.match(/\bfilm[-](\d+)\b/i) ||
                          cleaned.match(/[-](?:movie|film)[-](\d+)\b/i);
    if (movieNumMatch) {
      return `Movie ${parseInt(movieNumMatch[1])}`;
    }

    // Check if there is a specific name in the slug after "movie" or "film"
    const nameAfterMovie = cleaned.split(/[-](?:movie|film)[-]/i);
    if (nameAfterMovie.length > 1) {
      let movieTitle = nameAfterMovie[1].replace(/-/g, ' ');
      return `Movie: ${capitalize(movieTitle)}`;
    }
    
    return 'Movie';
  }

  // 2. OVA / ONA / Special Detection
  const isOva = (format && format.toUpperCase() === 'OVA') || /\bova\b/i.test(cleaned);
  if (isOva) {
    const ovaNum = cleaned.match(/\bova[-](\d+)\b/i);
    if (ovaNum) return `OVA ${parseInt(ovaNum[1])}`;
    if (cleaned.includes('lost-girls')) return 'OVA: Lost Girls';
    return 'OVA';
  }

  const isOna = (format && format.toUpperCase() === 'ONA') || /\bona\b/i.test(cleaned);
  if (isOna) {
    const onaNum = cleaned.match(/\bona[-](\d+)\b/i);
    if (onaNum) return `ONA ${parseInt(onaNum[1])}`;
    return 'ONA';
  }

  const isSpecial = (format && format.toUpperCase() === 'SPECIAL') || /\bspecial(?:s)?\b/i.test(cleaned);
  if (isSpecial) {
    const specNum = cleaned.match(/\bspecial[-](\d+)\b/i);
    if (specNum) return `Special ${parseInt(specNum[1])}`;
    return 'Special';
  }

  // 3. Complex Season + Part Detection (e.g. "3-part-2" or "3-kisim-2")
  const complexMatch = cleaned.match(/[-](\d+)[-](?:part|kisim)[-](\d+)/i) ||
                        cleaned.match(/[-](?:season|sezon)[-](\d+)[-](?:part|kisim)[-](\d+)/i);
  if (complexMatch) {
    const sNum = parseInt(complexMatch[1]);
    const pNum = parseInt(complexMatch[2]);
    return `Season ${sNum} Part ${pNum}`;
  }

  // 4. Final Season / Final Part Detection
  const isFinal = /\b(?:final|son)\b/i.test(cleaned) ||
                  (originalAd && /\b(?:final|son)\b/i.test(originalAd));
  
  if (isFinal) {
    const partMatch = cleaned.match(/[-](\d+)[-]kisim/i) || 
                      cleaned.match(/[-]kisim[-](\d+)/i) || 
                      cleaned.match(/[-](\d+)[-]part/i) || 
                      cleaned.match(/[-]part[-](\d+)/i);
    if (partMatch) {
      return `Final Season Part ${partMatch[1]}`;
    }
    return 'Final Season';
  }

  // 5. Standard Season & Part Detection
  const seasonMatch = cleaned.match(/[-](\d+)[-]sezon/i) || 
                      cleaned.match(/[-]sezon[-](\d+)/i) || 
                      cleaned.match(/[-](\d+)[-]season/i) || 
                      cleaned.match(/[-]season[-](\d+)/i);

  const partMatch = cleaned.match(/[-](\d+)[-]kisim/i) || 
                    cleaned.match(/[-]kisim[-](\d+)/i) || 
                    cleaned.match(/[-](\d+)[-]part/i) || 
                    cleaned.match(/[-]part[-](\d+)/i);

  if (seasonMatch) {
    const sNum = parseInt(seasonMatch[1]);
    if (partMatch) {
      const pNum = parseInt(partMatch[1]);
      return `Season ${sNum} Part ${pNum}`;
    }
    return `Season ${sNum}`;
  }

  if (partMatch) {
    const pNum = parseInt(partMatch[1]);
    return `Part ${pNum}`;
  }

  if (cleaned.includes('chuugakkou') || cleaned.includes('junior-high')) {
    return 'Spin-off: Junior High';
  }

  return 'Season 1';
}

function getLabelCategory(label) {
  const lower = label.toLowerCase();
  if (lower.includes('movie') || lower.includes('film')) return 'movies';
  if (lower.includes('ova') || lower.includes('ona') || lower.includes('special') || lower.includes('spin-off')) return 'ovas';
  return 'seasons';
}


/**
 * Helper: clean title for accent-insensitive and special character-insensitive comparisons
 */
function cleanTitleForCompare(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics/accents (e.g. Pokémon -> Pokemon)
    .replace(/[^a-z0-9\s]/g, '') // remove special characters
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Helper: parse season number from a title string
 */
function getSeasonFromTitle(title) {
  if (!title) return 1;
  const lower = title.toLowerCase();
  
  // Extract number from "season X", "X. sezon", "X. kısım", "part X"
  const seasonMatch = lower.match(/(?:season|sezon|kisim|part|second|third|fourth|fifth|2nd|3rd|4th|5th)\s*(\d+)?/i);
  if (seasonMatch) {
    if (seasonMatch[1]) return parseInt(seasonMatch[1]);
    
    // Suffix word check
    if (lower.includes('2nd') || lower.includes('ii') || lower.includes('two') || lower.includes('second') || lower.includes('zoku')) return 2;
    if (lower.includes('3rd') || lower.includes('iii') || lower.includes('three') || lower.includes('third') || lower.includes('kan')) return 3;
    if (lower.includes('4th') || lower.includes('iv') || lower.includes('four') || lower.includes('fourth')) return 4;
    if (lower.includes('5th') || lower.includes('v') || lower.includes('five') || lower.includes('fifth')) return 5;
  }
  
  // Standard Roman numeral checks at word boundaries
  if (/\bii\b/i.test(lower) || /\btoo\b/i.test(lower)) return 2;
  if (/\biii\b/i.test(lower)) return 3;
  if (/\biv\b/i.test(lower)) return 4;
  if (/\bv\b/i.test(lower)) return 5;

  return 1;
}

/**
 * Helper: compare database/slug title with AniList title to prevent generic overrides (e.g. Naruto Shippuden -> Naruto)
 */
function getBestTitle(dbTitle, anilistTitle) {
  if (!anilistTitle) return dbTitle;
  if (!dbTitle) return anilistTitle;

  const dbLower = dbTitle.toLowerCase();
  const aniLower = anilistTitle.toLowerCase();

  if (dbLower === aniLower) return anilistTitle;

  // Generic franchises checklist (normalized for comparisons)
  const genericFranchises = ['naruto', 'bleach', 'one piece', 'gintama', 'fairy tail', 'pokemon'];
  
  const cleanDb = cleanTitleForCompare(dbTitle);
  const cleanAni = cleanTitleForCompare(anilistTitle);

  const isGeneric = genericFranchises.some(f => cleanAni === f);

  // If the DB title is more detailed (e.g. contains "movie", "shippuden", "season", "sezon", etc.)
  // and the AniList title is just a prefix of it, keep the DB title.
  if (cleanDb.includes(cleanAni) && (dbTitle.length > anilistTitle.length + 3 || isGeneric)) {
    return dbTitle;
  }

  return anilistTitle;
}

/**
 * Helper: get custom display title based on orijinal_ad and slug details
 */
function getDisplayTitle(doc) {
  const slugTitle = formatSlugToTitle(doc.tranimeizle_slug);
  if (!doc.orijinal_ad) return slugTitle;
  
  const cleanOrig = cleanTitleForCompare(doc.orijinal_ad);
  
  // Generic franchise check: if AniList returned a generic name like "Naruto" or "Bleach",
  // but the slug contains more specific info (like "Naruto Shippuden Movie 6"), use the slug title.
  const genericFranchises = ['naruto', 'bleach', 'one piece', 'gintama', 'fairy tail', 'pokemon', 'dragon ball', 'attack on titan', 'shingeki no kyojin'];
  if (genericFranchises.some(f => cleanOrig === f) && slugTitle.length > doc.orijinal_ad.length) {
    return slugTitle;
  }
  
  // Always prefer the AniList English title (orijinal_ad) for consistency
  return doc.orijinal_ad;
}

/**
 * Helper: search titles on AniList to map English/Jap titles to local DB slugs
 */
async function searchAniListTitles(query) {
  const gqlQuery = `
    query ($search: String) {
      Page(page: 1, perPage: 5) {
        media(search: $search, type: ANIME, format_not: MUSIC) {
          id
          title {
            romaji
            english
          }
          format
        }
      }
    }
  `;
  try {
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: gqlQuery, variables: { search: query } }),
    });
    if (!response.ok) return [];
    const json = await response.json();
    return json?.data?.Page?.media || [];
  } catch (err) {
    console.error('[AniList Search Helper] Error:', err.message);
    return [];
  }
}

function getSlugSearchTerms(mediaList) {
  const terms = [];
  for (const m of mediaList) {
    if (m.title?.romaji) {
      let cleaned = m.title.romaji.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
      
      const parts = cleaned.split('-');
      if (parts.length >= 2) {
        terms.push(parts.slice(0, 3).join('-'));
        terms.push(parts.slice(0, 2).join('-'));
      } else if (parts.length === 1) {
        terms.push(parts[0]);
      }
    }
  }
  return [...new Set(terms)].filter(t => t && t.length > 3);
}


/**
 * Helper: Resolve missing anilist_id from sibling seasons in the local DB
 */
async function resolveSiblings(docs) {
  if (!Array.isArray(docs) || docs.length === 0) return docs;
  
  return await Promise.all(docs.map(async (doc) => {
    if (doc.orijinal_ad) return doc;
    
    try {
      const { baseSlug } = getBaseSlugAndSeason(doc.tranimeizle_slug);
      if (baseSlug) {
        const sibling = await Anime.findOne({
          tranimeizle_slug: { $regex: '^' + baseSlug, $options: 'i' },
          orijinal_ad: { $ne: null }
        }).select('orijinal_ad format').lean();
        
        if (sibling) {
          // Update DB in background
          Anime.updateOne(
            { _id: doc._id },
            { 
              $set: { 
                orijinal_ad: sibling.orijinal_ad
              } 
            }
          ).exec().catch(err => console.error('[resolveSiblings] Background update error:', err.message));
          
          doc.orijinal_ad = sibling.orijinal_ad;
        }
      }
    } catch (err) {
      console.error('[resolveSiblings] Error:', err.message);
    }
    return doc;
  }));
}

// ── Caching & Optimization ──────────────────────────────────────
const failedAnilistSlugs = new Set();
const genreCache = {};
const GENRE_CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

const { resolveExactAniListId } = require('../utils/anilistSeasonMatcher');

/**
 * Helper: Lazily resolve missing anilist_id from AniList API in the background with season precision
 */
function lazyResolveAnilistInfo(docs) {
  if (!Array.isArray(docs) || docs.length === 0) return;
  
  // Non-blocking background promise
  Promise.resolve().then(async () => {
    for (const doc of docs) {
      if (doc.anilist_id) continue;
      
      try {
        const slugTitle = formatSlugToTitle(doc.tranimeizle_slug);
        
        if (slugTitle && slugTitle.length > 2) {
          if (failedAnilistSlugs.has(slugTitle)) continue;

          // Wait 300ms to respect API rate limits
          await new Promise(resolve => setTimeout(resolve, 300));
          
          const exactMatch = await resolveExactAniListId(doc.orijinal_ad || slugTitle, doc.tranimeizle_slug);
          
          if (exactMatch && exactMatch.anilist_id) {
            await Anime.updateOne(
              { _id: doc._id },
              { 
                $set: { 
                  anilist_id: exactMatch.anilist_id, 
                  orijinal_ad: exactMatch.title_en || doc.orijinal_ad,
                  format: exactMatch.format || doc.format || 'TV',
                  season_year: exactMatch.season_year || doc.season_year
                } 
              }
            );
            console.log(`[Lazy Resolver] Resolved ${doc.tranimeizle_slug} -> Exact Season AniList ID: ${exactMatch.anilist_id}, English Name: ${exactMatch.title_en}`);
          } else {
            failedAnilistSlugs.add(slugTitle);
          }
        }
      } catch (err) {
        console.error(`[Lazy Resolver] Error for ${doc.tranimeizle_slug}:`, err.message);
      }
    }
  }).catch(err => console.error('[Lazy Resolver] Root promise error:', err.message));
}

/**
 * Format document for response
 */
function formatAnimeDoc(doc) {
  if (!doc) return null;
  
  // Resolve canonical title from orchestrator state if matched
  const canonical = getCanonicalInfoForDoc(doc);
  let anime_title = getDisplayTitle(doc);
  if (canonical) {
    anime_title = canonical.item.main_title_en;
  }
  
  let playableEpisodesCount = doc.episodes ? Object.keys(doc.episodes).length : 0;
  if (playableEpisodesCount === 0 && doc.tranimeizle_url) {
    // Only treat as 1-episode if it's genuinely a movie/OVA/special, not a root series page
    const slug = (doc.tranimeizle_slug || '').toLowerCase();
    const singleContentFormats = ['MOVIE', 'OVA', 'ONA', 'SPECIAL'];
    const hasSingleContentKeyword = /\b(?:movie|film|ova|ona|special)\b/i.test(slug);
    const isSingleContentFormat = singleContentFormats.includes((doc.format || '').toUpperCase());
    
    if (hasSingleContentKeyword || isSingleContentFormat) {
      playableEpisodesCount = 1;
    }
    // Otherwise leave at 0 — this is likely a root series page with unmapped episodes
  }
  return {
    _id: doc._id,
    anime_title: anime_title,
    anilist_id: doc.anilist_id,
    total_episodes: playableEpisodesCount,
    tranimeizle_slug: doc.tranimeizle_slug,
    tranimeizle_url: doc.tranimeizle_url,
    format: doc.format,
    status: 'Yayınlandı',
    genres: Array.isArray(doc.genres)
      ? doc.genres
      : (typeof doc.genres === 'string' ? doc.genres.split(',').map(g => g.trim()).filter(Boolean) : []),
    cover_image: doc.cover_image || null,
    banner_image: doc.banner_image || null,
    description: doc.description || null,
    average_score: doc.average_score || null,
    season_year: doc.season_year || null,
    fansubs: doc.fansubs || [],
  };
}

/**
 * Helper: Check if a DB document is a "ghost entry" (root series page with no episodes)
 * Ghost entries have 0 mapped episodes and are NOT movies/OVAs/specials.
 * These should be excluded from search results and listings.
 */
function isGhostEntry(doc) {
  if (!doc) return true;
  const episodeCount = doc.episodes ? Object.keys(doc.episodes).length : 0;
  if (episodeCount > 0) return false; // Has episodes, not a ghost
  
  // Check if it's a legitimate single-content entry (movie/OVA/special)
  const slug = (doc.tranimeizle_slug || '').toLowerCase();
  const singleContentFormats = ['MOVIE', 'OVA', 'ONA', 'SPECIAL'];
  const hasSingleContentKeyword = /\b(?:movie|film|ova|ona|special)\b/i.test(slug);
  const isSingleContentFormat = singleContentFormats.includes((doc.format || '').toUpperCase());
  
  if (hasSingleContentKeyword || isSingleContentFormat) return false; // Legitimate single content
  
  return true; // Ghost entry: 0 episodes, not a movie/OVA/special
}

/**
 * GET /api/animes/search
 * Arama sorgusuna göre anime listeler (orijinal_ad veya tranimeizle_slug üzerinden).
 * Query params:
 *   - q (arama kelimesi)
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/search', webSearchLimiter, async (req, res) => {
  try {
    const queryStr = (req.query.q || '').trim();
    if (!queryStr) {
      return res.json({ success: true, data: [] });
    }

    const tokens = queryStr.split(/\s+/).filter(Boolean).map(escapeRegExp);
    if (tokens.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // 1. Standart yerel arama sorgusu - Token bazlı cross-field eşleşme
    const orConditions = [
      {
        $and: tokens.map(t => ({
          $or: [
            { orijinal_ad: { $regex: t, $options: 'i' } },
            { tranimeizle_slug: { $regex: t, $options: 'i' } }
          ]
        }))
      }
    ];

    // 2. İngilizce/Romaji eşleşmeleri için AniList araması
    const mediaList = await searchAniListTitles(queryStr);
    if (mediaList.length > 0) {
      // AniList ID'leri eşleşiyorsa ekle
      const anilistIds = mediaList.map(m => m.id).filter(Boolean);
      if (anilistIds.length > 0) {
        orConditions.push({ anilist_id: { $in: anilistIds } });
      }

      // Romaji başlıklarını slug formatına sokup yerel sluglarla eşleştir
      const terms = getSlugSearchTerms(mediaList);
      for (const term of terms) {
        orConditions.push({ tranimeizle_slug: { $regex: term, $options: 'i' } });
      }
    }

    const animes = await Anime.find({ $or: orConditions })
      .limit(100)
      .lean();

    // Resolve sibling info (copies orijinal_ad from siblings if missing)
    const resolvedAnimes = await resolveSiblings(animes);
    lazyResolveAnilistInfo(resolvedAnimes);

    // Group by franchise key
    const groups = new Map();
    for (const doc of resolvedAnimes) {
      const key = getFranchiseKey(doc);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(doc);
    }

    // For each group, pick the lowest season number as representative
    const uniqueAnimes = [];
    for (const docs of groups.values()) {
      uniqueAnimes.push(getRepresentative(docs));
    }

      // Filter out ghost entries and MUSIC formats
      let validAnimes = uniqueAnimes.filter(doc => !isGhostEntry(doc) && (doc.format || '').toUpperCase() !== 'MUSIC');

      // Sort by relevance (exact matches and prefix matches first)
      const lowerQuery = queryStr.toLowerCase();
      validAnimes.sort((a, b) => {
        const aTitle = (a.orijinal_ad || a.anime_title || '').toLowerCase();
        const bTitle = (b.orijinal_ad || b.anime_title || '').toLowerCase();
        const aSlug = (a.tranimeizle_slug || '').toLowerCase();
        const bSlug = (b.tranimeizle_slug || '').toLowerCase();

        // Exact matches
        const aExact = aTitle === lowerQuery || aSlug === lowerQuery;
        const bExact = bTitle === lowerQuery || bSlug === lowerQuery;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        // Starts with
        const aStarts = aTitle.startsWith(lowerQuery) || aSlug.startsWith(lowerQuery);
        const bStarts = bTitle.startsWith(lowerQuery) || bSlug.startsWith(lowerQuery);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        // Includes (earlier occurrence in string is better)
        const aIndex = Math.min(
          aTitle.indexOf(lowerQuery) > -1 ? aTitle.indexOf(lowerQuery) : 999,
          aSlug.indexOf(lowerQuery) > -1 ? aSlug.indexOf(lowerQuery) : 999
        );
        const bIndex = Math.min(
          bTitle.indexOf(lowerQuery) > -1 ? bTitle.indexOf(lowerQuery) : 999,
          bSlug.indexOf(lowerQuery) > -1 ? bSlug.indexOf(lowerQuery) : 999
        );
        if (aIndex !== bIndex) return aIndex - bIndex;

        // If AniList ID matches, prioritize it slightly
        if (a.anilist_id && !b.anilist_id) return -1;
        if (!a.anilist_id && b.anilist_id) return 1;

        return 0; // maintain original chronological order from group sorting
      });

      const searchLimit = req.isWebClient ? 5 : 30;
      const limitedAnimes = validAnimes.slice(0, searchLimit);

    const formattedAnimes = limitedAnimes.map(doc => {
      const formatted = formatAnimeDoc(doc);
      
      // AniList arama sonuçlarından eşleşen medyayı bul
      const matchedMedia = mediaList.find(m => {
        if (doc.anilist_id && doc.anilist_id === m.id) return true;
        
        // Safeguard: Ensure season matches
        const docSeason = getBaseSlugAndSeason(doc.tranimeizle_slug).season;
        const mTitle = m.title?.english || m.title?.romaji;
        const mSeason = getSeasonFromTitle(mTitle);
        if (docSeason !== mSeason) return false;
        
        // Stricter token match check
        if (!isValidMatch(doc.tranimeizle_slug, m.title?.romaji, m.title?.english)) {
          return false;
        }
        
        if (m.title?.romaji) {
          let cleanedRomaji = m.title.romaji.toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');
          
          const parts = cleanedRomaji.split('-');
          const prefix = parts.slice(0, 3).join('-');
          if (prefix && doc.tranimeizle_slug.includes(prefix)) return true;
        }
        return false;
      });

      if (matchedMedia) {
        // Öncelikli olarak İngilizce başlığı eşleştir
        const englishTitle = matchedMedia.title?.english || matchedMedia.title?.romaji || formatted.anime_title;
        formatted.anime_title = getBestTitle(formatted.anime_title, englishTitle);
        
        // Eğer veritabanında anilist_id null ise, eşleşen id'yi ekle ve DB güncelle
        if (!doc.anilist_id) {
          formatted.anilist_id = matchedMedia.id;
          Anime.updateOne(
            { _id: doc._id },
            { 
              $set: { 
                anilist_id: matchedMedia.id, 
                orijinal_ad: englishTitle,
                format: matchedMedia.format || doc.format || 'TV'
              } 
            }
          ).exec().catch(err => console.error('[Search Route] Background update failed:', err.message));
        }
      }
      
      return formatted;
    });

    res.json({ success: true, data: formattedAnimes });
  } catch (error) {
    console.error('[GET /api/animes/search] Error:', error.message);
    res.status(500).json({ success: false, error: 'Arama sırasında hata oluştu.' });
  }
});

/**
 * GET /api/animes
 * Sayfalanmış anime listesi.
 * Query params:
 *   - page (default: 1)
 *   - limit (default: 20)
 */
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    let [animes, total] = await Promise.all([
      Anime.find()
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Anime.countDocuments(),
    ]);

    animes = await resolveSiblings(animes);
    lazyResolveAnilistInfo(animes);

    // Filter out ghost entries and MUSIC formats
    animes = animes.filter(doc => !isGhostEntry(doc) && (doc.format || '').toUpperCase() !== 'MUSIC');

    res.json({
      success: true,
      data: animes.map(formatAnimeDoc),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    });
  } catch (error) {
    console.error('[GET /api/animes] Error:', error.message);
    res.status(500).json({ success: false, error: 'Anime listesi alınamadı.' });
  }
});

/**
 * GET /api/animes/recent
 * Son eklenen animeler (sıralama _id desc, limit 20)
 */
router.get('/recent', async (req, res) => {
  try {
    const defaultLimit = req.isWebClient ? 10 : 20;
    const limit = Math.min(req.isWebClient ? 10 : 30, parseInt(req.query.limit) || defaultLimit);
    
    // Fetch more items to allow quality-based filtering and deduplication
    let animes = await Anime.find()
      .sort({ _id: -1 })
      .limit(120)
      .lean();

    animes = await resolveSiblings(animes);
    lazyResolveAnilistInfo(animes);

    // Filter out ghost entries, music formats, and entries without covers/descriptions or very low rating
    let filtered = animes.filter(doc => {
      if (isGhostEntry(doc)) return false;
      if ((doc.format || '').toUpperCase() === 'MUSIC') return false;
      if (!doc.cover_image && !doc.coverImage) return false;
      if (!doc.description) return false;
      if (doc.average_score !== undefined && doc.average_score !== null && doc.average_score < 45) {
        return false;
      }
      return true;
    });

    // Group by franchise key to prevent duplicate seasons in recent additions
    const groups = new Map();
    for (const doc of filtered) {
      const key = getFranchiseKey(doc);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(doc);
    }

    const dedupedAnimes = [];
    for (const docs of groups.values()) {
      dedupedAnimes.push(getRepresentative(docs));
    }

    // Sort by recent _id descending to keep chronological order intact
    dedupedAnimes.sort((a, b) => b._id.toString().localeCompare(a._id.toString()));

    const finalData = dedupedAnimes.slice(0, limit);
    res.json({ success: true, data: finalData.map(formatAnimeDoc) });
  } catch (error) {
    console.error('[GET /api/animes/recent] Error:', error.message);
    res.status(500).json({ success: false, error: 'Son eklenenler alınamadı.' });
  }
});

/**
 * GET /api/animes/trending
 * AniList üzerinden gerçek trend/popüler animeleri getirir, 
 * DB'deki eşleşen kayıtları döner (yeni animeler önde görünür).
 */
router.get('/trending', async (req, res) => {
  try {
    const defaultLimit = req.isWebClient ? 10 : 20;
    const limit = Math.min(req.isWebClient ? 10 : 30, parseInt(req.query.limit) || defaultLimit);

    // 1. AniList'ten trend + popüler animeleri çek
    const anilistQuery = `
      query {
        trending: Page(page: 1, perPage: 30) {
          media(type: ANIME, sort: TRENDING_DESC, status_not: NOT_YET_RELEASED) {
            id
            title { romaji english native }
            averageScore
            popularity
          }
        }
        popular: Page(page: 1, perPage: 30) {
          media(type: ANIME, sort: POPULARITY_DESC, status_not: NOT_YET_RELEASED) {
            id
            title { romaji english native }
            averageScore
            popularity
          }
        }
      }
    `;

    let anilistIds = cacheGet('trending_anilist_ids') || [];

    if (anilistIds.length === 0) {
      try {
        const aniRes = await axios.post('https://graphql.anilist.co', 
          { query: anilistQuery },
          { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, timeout: 5000 }
        );
        const trendingMedia = aniRes.data?.data?.trending?.media || [];
        const popularMedia  = aniRes.data?.data?.popular?.media  || [];
        // Birleştir ve tekrarları kaldır
        const combined = [...trendingMedia, ...popularMedia];
        const seen = new Set();
        for (const m of combined) {
          if (!seen.has(m.id)) { seen.add(m.id); anilistIds.push(m.id); }
        }
        // Sadece ilk 20 ID'yi tut — RAM tasarrufu için
        anilistIds = anilistIds.slice(0, 20);
        // 1 saat cache'le (yaklaşık ~160 byte)
        cacheSet('trending_anilist_ids', anilistIds, 60 * 60 * 1000);
        console.log('[trending] AniList verisi çekildi, 1 saat cache\'lendi.');
      } catch (e) {
        console.warn('[trending] AniList çekilemedi, DB fallback kullanılıyor:', e.message);
      }
    } else {
      console.log('[trending] Cache\'den AniList verisi kullanıldı.');
    }

    let animes = [];

    if (anilistIds.length > 0) {
      // 2a. AniList ID'leriyle DB'de eşleş (sıralamayı koru)
      const found = await Anime.find({ anilist_id: { $in: anilistIds } }).lean();
      const idxMap = Object.fromEntries(anilistIds.map((id, i) => [id, i]));
      found.sort((a, b) => (idxMap[a.anilist_id] ?? 999) - (idxMap[b.anilist_id] ?? 999));
      animes = found;
    }

    // 2b. Yeterli yoksa DB fallback
    if (animes.length < 10) {
      const fallback = await Anime.find({ anilist_id: { $ne: null } })
        .sort({ anilist_id: -1 })
        .limit(limit * 3)
        .lean();
      const existingIds = new Set(animes.map(a => String(a._id)));
      for (const a of fallback) {
        if (!existingIds.has(String(a._id))) animes.push(a);
      }
    }

    // Group by franchise key
    const groups = new Map();
    for (const doc of animes) {
      const key = getFranchiseKey(doc);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(doc);
    }

    const dedupedAnimes = [];
    for (const docs of groups.values()) {
      dedupedAnimes.push(getRepresentative(docs));
    }

    // Sort to maintain AniList order or fallback ID order
    const idxMap = Object.fromEntries(anilistIds.map((id, i) => [id, i]));
    dedupedAnimes.sort((a, b) => {
      const aIdx = a.anilist_id ? idxMap[a.anilist_id] : undefined;
      const bIdx = b.anilist_id ? idxMap[b.anilist_id] : undefined;
      if (aIdx !== undefined && bIdx !== undefined) return aIdx - bIdx;
      if (aIdx !== undefined) return -1;
      if (bIdx !== undefined) return 1;
      return b._id.toString().localeCompare(a._id.toString());
    });

    animes = dedupedAnimes.slice(0, limit);

    animes = await resolveSiblings(animes);
    lazyResolveAnilistInfo(animes);
    animes = animes.filter(doc => !isGhostEntry(doc) && (doc.format || '').toUpperCase() !== 'MUSIC');

    // Cloudflare CDN ve tarayıcılar 1 saat cache'lesin (s-maxage = CDN, max-age = tarayıcı)
    res.set('Cache-Control', 'public, max-age=1800, s-maxage=3600');
    res.set('Vary', 'Accept-Encoding');
    res.json({ success: true, data: animes.map(formatAnimeDoc) });
  } catch (error) {
    console.error('[GET /api/animes/trending] Error:', error.message);
    res.status(500).json({ success: false, error: 'Trend seriler alınamadı.' });
  }
});

/**
 * GET /api/animes/by-anilist/:anilist_id
 * AniList ID'siyle veritabanında eşleşen animeyi bulur.
 * Detay sayfasının DB'deki bölüm listesine ulaşması için kullanılır.
 */
router.get('/by-anilist/:anilist_id', async (req, res) => {
  try {
    const anilistId = parseInt(req.params.anilist_id, 10);
    if (isNaN(anilistId)) {
      return res.status(400).json({ success: false, error: 'Geçersiz AniList ID.' });
    }
    const animes = await Anime.find({ anilist_id: anilistId }).lean();
    if (!animes || animes.length === 0) {
      return res.status(404).json({ success: false, error: 'Bu anime veritabanında bulunamadı.' });
    }
    const primary = animes.sort((a, b) => (b.total_episodes || 0) - (a.total_episodes || 0))[0];
    res.set('Cache-Control', 'public, max-age=600, s-maxage=1800');
    res.json({
      success: true,
      data: formatAnimeDoc(primary),
      variants: animes.map(formatAnimeDoc),
    });
  } catch (error) {
    console.error('[GET /api/animes/by-anilist] Error:', error.message);
    res.status(500).json({ success: false, error: 'Anime bulunamadı.' });
  }
});

/**
 * GET /api/animes/genre/:genre

 * Fetches popular anime from AniList by genre, then lists matching items from our DB.
 */
router.get('/genre/:genre', async (req, res) => {
  try {
    const genre = req.params.genre;
    if (!genre) {
      return res.status(400).json({ success: false, error: 'Genre is required.' });
    }

    const genreMap = {
      'aksiyon': 'Action',
      'action': 'Action',
      'macera': 'Adventure',
      'adventure': 'Adventure',
      'komedi': 'Comedy',
      'comedy': 'Comedy',
      'fantastik': 'Fantasy',
      'fantasy': 'Fantasy',
      'drama': 'Drama',
      'romantik': 'Romance',
      'romance': 'Romance',
      'bilim kurgu': 'Sci-Fi',
      'sci-fi': 'Sci-Fi',
      'sci fic': 'Sci-Fi',
      'sci-fic': 'Sci-Fi',
      'science fiction': 'Sci-Fi',
      'gizem': 'Mystery',
      'mystery': 'Mystery',
      'korku': 'Horror',
      'horror': 'Horror',
      'doğaüstü': 'Supernatural',
      'supernatural': 'Supernatural',
      'psikolojik': 'Psychological',
      'psychological': 'Psychological',
      'slice of life': 'Slice of Life',
      'yaşamdan kesitler': 'Slice of Life',
      'mecha': 'Mecha',
      'sports': 'Sports',
      'spor': 'Sports'
    };
    
    let searchGenre = genreMap[genre.toLowerCase()] || genre;

    // Cache Check
    if (genreCache[searchGenre] && Date.now() - genreCache[searchGenre].timestamp < GENRE_CACHE_TTL) {
      console.log(`[Genre Cache] Serving ${searchGenre} from cache`);
      return res.json({ success: true, data: genreCache[searchGenre].data });
    }

    // 1. Fetch top 50 anime from AniList by genre
    const gqlQuery = `
      query ($genre: String) {
        Page(page: 1, perPage: 50) {
          media(genre_in: [$genre], type: ANIME, format_not: MUSIC, sort: POPULARITY_DESC) {
            id
            title { romaji english }
            format
          }
        }
      }
    `;

    let mediaList = [];
    let isFallback = false;

    try {
      const response = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: gqlQuery, variables: { genre: searchGenre } }),
      });

      if (response.ok) {
        const json = await response.json();
        mediaList = json?.data?.Page?.media || [];
      } else {
        console.warn(`[Genre Route] AniList API returned status ${response.status}. Falling back to MongoDB.`);
        isFallback = true;
      }
    } catch (err) {
      console.warn(`[Genre Route] AniList API fetch failed: ${err.message}. Falling back to MongoDB.`);
      isFallback = true;
    }

    // 2. Query Local MongoDB
    let animes = [];
    if (isFallback || mediaList.length === 0) {
      // Accent-insensitive, case-insensitive direct match for local genres fallback
      const searchReg = new RegExp(genre, 'i');
      const searchRegEn = new RegExp(searchGenre, 'i');
      animes = await Anime.find({
        $or: [
          { genres: { $regex: searchReg } },
          { genres: { $regex: searchRegEn } },
          { enrichedGenres: { $regex: searchReg } },
          { enrichedGenres: { $regex: searchRegEn } }
        ]
      }).limit(100).lean();
    } else {
      const anilistIds = mediaList.map(m => m.id).filter(Boolean);
      const orConditions = [{ anilist_id: { $in: anilistIds } }];

      // Add slug matches
      const terms = getSlugSearchTerms(mediaList);
      for (const term of terms) {
        orConditions.push({ tranimeizle_slug: { $regex: term, $options: 'i' } });
      }

      // Fallback: also match our local genres array directly
      orConditions.push({
        $or: [
          { genres: { $regex: genre, $options: 'i' } },
          { genres: { $regex: searchGenre, $options: 'i' } },
          { enrichedGenres: { $regex: genre, $options: 'i' } },
          { enrichedGenres: { $regex: searchGenre, $options: 'i' } }
        ]
      });

      animes = await Anime.find({ $or: orConditions }).limit(100).lean();
    }
    animes = await resolveSiblings(animes);
    lazyResolveAnilistInfo(animes);

    // Filter ghost entries and MUSIC formats
    let validAnimes = animes.filter(doc => !isGhostEntry(doc) && (doc.format || '').toUpperCase() !== 'MUSIC');

    // Group by franchise key
    const groups = new Map();
    for (const doc of validAnimes) {
      const key = getFranchiseKey(doc);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(doc);
    }

    const uniqueAnimes = [];
    for (const docs of groups.values()) {
      uniqueAnimes.push(getRepresentative(docs));
    }

    // Map AniList order
    const aniListOrderMap = new Map();
    mediaList.forEach((m, index) => {
      aniListOrderMap.set(m.id, index);
    });

    // Resolve matching and sort
    const formattedAnimes = [];

    for (const doc of uniqueAnimes) {
      let sortIndex = 999;
      const matchedMedia = mediaList.find(m => {
        if (doc.anilist_id && doc.anilist_id === m.id) return true;
        
        // Stricter token match check
        if (!isValidMatch(doc.tranimeizle_slug, m.title?.romaji, m.title?.english)) {
          return false;
        }
        
        // slug match fallback
        if (m.title?.romaji) {
          const cleanedRomaji = m.title.romaji.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
          const prefix = cleanedRomaji.split('-').slice(0, 3).join('-');
          if (prefix && doc.tranimeizle_slug.includes(prefix)) return true;
        }
        return false;
      });

      if (matchedMedia) {
        sortIndex = aniListOrderMap.get(matchedMedia.id);
        if (!doc.anilist_id) {
          doc.anilist_id = matchedMedia.id;
          const englishTitle = matchedMedia.title?.english || matchedMedia.title?.romaji;
          doc.orijinal_ad = englishTitle;
          Anime.updateOne(
            { _id: doc._id },
            { $set: { anilist_id: matchedMedia.id, orijinal_ad: englishTitle } }
          ).exec().catch(() => {});
        }
      } else {
        // If it was found purely by DB genre match, sort by average score (higher first)
        sortIndex = 1000 - (doc.average_score || 0);
      }
      
      const formatted = formatAnimeDoc(doc);
      if (matchedMedia) {
        const englishTitle = matchedMedia.title?.english || matchedMedia.title?.romaji;
        formatted.anime_title = getBestTitle(formatted.anime_title, englishTitle);
      }
      formatted._sortIndex = sortIndex;
      formattedAnimes.push(formatted);
    }

    formattedAnimes.sort((a, b) => a._sortIndex - b._sortIndex);
    
    // Cleanup sort index
    formattedAnimes.forEach(a => delete a._sortIndex);

    const finalData = formattedAnimes.slice(0, 30);
    
    // Set Cache
    genreCache[searchGenre] = {
      data: finalData,
      timestamp: Date.now()
    };

    res.json({ success: true, data: finalData });
  } catch (error) {
    console.error('[GET /api/animes/genre/:genre] Error:', error.message);
    res.status(500).json({ success: false, error: 'Kategori serileri alınamadı.' });
  }
});

// Sibnet .mp4 videolarını doğru Referer ile maskleyen proxy tüneli
router.get('/sibnet-proxy', async (req, res) => {
    let { url, sibnetId } = req.query;
    if (!url && !sibnetId) return res.status(400).send('url veya sibnetId parametresi gerekli!');

    try {
        if (sibnetId) {
            // Sibnet ID doğrudan sayı olmalı (injection koruması)
            if (!/^\d+$/.test(sibnetId)) {
              return res.status(400).json({ success: false, error: 'Geçersiz Sibnet ID formatı.' });
            }
            console.log(`[Proxy] Sibnet ID çözülüyor: ${sibnetId}`);
            url = await resolveSibnetId(sibnetId);
        }

        // SSRF Koruması: URL whitelist kontrolü
        if (!isUrlAllowed(url)) {
          return res.status(403).json({ success: false, error: 'Bu URL\'ye proxy erişimi izin verilmiyor.' });
        }

        const range = req.headers.range;
        const headers = {
            'Referer': 'https://video.sibnet.ru/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        if (range) {
            headers['Range'] = range;
        }

        const response = await axios({
            method: 'get',
            url: url,
            headers: headers,
            responseType: 'stream',
            validateStatus: (status) => (status >= 200 && status < 300) || status === 206
        });

        // Set caching headers for successful response (200 and 206)
        if (response.status === 200 || response.status === 206) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }

        // Copy critical response headers
        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        }
        if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
        }
        if (response.headers['content-range']) {
            res.setHeader('Content-Range', response.headers['content-range']);
        }
        if (response.headers['accept-ranges']) {
            res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(response.status);
        response.data.pipe(res);
    } catch (err) {
        console.error('[Sibnet Proxy Error]:', err.message);
        res.status(500).json({ success: false, error: 'Video akışı çekilemedi.' });
    }
});

/**
 * GET /api/animes/:id
 * Tek anime detayı
 */
router.get('/:id', async (req, res, next) => {
  const { id } = req.params;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return next();
  }

  try {
    const anime = await Anime.findById(id).lean();
    const activeId = id;

    if (!anime) {
      return res.status(404).json({ success: false, error: 'Anime bulunamadı.' });
    }

    // Synchronously resolve exact AniList ID if missing
    if (!anime.anilist_id) {
      try {
        const slugTitle = formatSlugToTitle(anime.tranimeizle_slug);
        const exactMatch = await resolveExactAniListId(anime.orijinal_ad || slugTitle, anime.tranimeizle_slug);
        if (exactMatch && exactMatch.anilist_id) {
          anime.anilist_id = exactMatch.anilist_id;
          anime.orijinal_ad = exactMatch.title_en || anime.orijinal_ad;
          anime.format = exactMatch.format || anime.format || 'TV';
          anime.season_year = exactMatch.season_year || anime.season_year;
          Anime.updateOne(
            { _id: anime._id },
            { 
              $set: { 
                anilist_id: exactMatch.anilist_id, 
                orijinal_ad: exactMatch.title_en || anime.orijinal_ad,
                format: exactMatch.format || anime.format || 'TV',
                season_year: exactMatch.season_year || anime.season_year
              } 
            }
          ).exec().catch(() => {});
          console.log(`🎯 [Detail Route] Synchronously resolved exact AniList ID: ${exactMatch.anilist_id} for ${anime.tranimeizle_slug}`);
        }
      } catch (err) {
        console.warn('[Detail Route] Exact match warning:', err.message);
      }
    }

    // 2. Use high-performance memory cache map to resolve orchestrator group
    const searchIdStr = String(activeId);
    const orchestratorEntry = mongoIdToGroupMap[searchIdStr];

    let seasons = [];
    let relatedMoviesOvas = [];
    let formattedTitle = getDisplayTitle(anime);

    if (orchestratorEntry) {
      // We found the orchestrator entry! Use its title, seasons and movies
      formattedTitle = orchestratorEntry.main_title_en;
      
      seasons = (orchestratorEntry.seasons || []).map(s => ({
        _id: s.mongo_db_id,
        season_number: s.season_number,
        label: s.season_title,
        category: 'seasons',
        cover_image: anime.cover_image, // Fallback to current cover
        banner_image: anime.banner_image
      }));

      relatedMoviesOvas = (orchestratorEntry.related_movies_or_ovas || []).map(m => ({
        _id: m.mongo_db_id,
        title: m.title,
        format: m.format,
        category: 'movies'
      }));
    }

    // Fallback if not found in orchestrator
    if (seasons.length === 0) {
      seasons = [{
        _id: anime._id,
        season_number: 1,
        label: 'Season 1',
        category: 'seasons',
        cover_image: anime.cover_image,
        banner_image: anime.banner_image
      }];
    }

    res.set('Cache-Control', 'public, max-age=1800, s-maxage=3600');
    res.json({
      success: true,
      data: {
        ...formatAnimeDoc(anime),
        anime_title: formattedTitle,
        seasons: seasons,
        related_movies_or_ovas: relatedMoviesOvas
      }
    });
  } catch (error) {
    console.error('[GET /api/animes/:id] Error:', error.message);
    res.status(500).json({ success: false, error: 'Anime detayı alınamadı.' });
  }
});

/**
 * GET /api/animes/:id/episodes
 * Anime'nin tüm bölümleri (episodes objesinden parse edilir, episode_number sıralı)
 */
router.get('/:id/episodes', async (req, res, next) => {
  const { id } = req.params;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return next();

  try {
    const anime = await Anime.findById(id).select('episodes tranimeizle_url format tranimeizle_slug').lean();

    if (!anime) {
      return res.status(404).json({ success: false, error: 'Anime bulunamadı.' });
    }

    // Automatically heal missing episodes dynamically in DB and response
    await healMissingEpisodes(anime);

    const epsMap = anime.episodes || {};
    let formattedEpisodes = Object.keys(epsMap).map(key => ({
      _id: `${anime._id}_${key}`,
      episode_number: parseInt(key) || 1,
      episode_title: `Bölüm ${key}`,
      source_url: epsMap[key],
    })).sort((a, b) => a.episode_number - b.episode_number);

    // If 0 episodes found, trigger On-Demand Self-Healing to scrape main anime overview page
    if (formattedEpisodes.length === 0) {
      console.log(`[Episodes Route] 0 episodes found for ${anime.tranimeizle_slug}. Triggering On-Demand Self-Healing...`);
      const healed = await fetchAndHealAnime(anime.tranimeizle_slug || anime.tranimeizle_url, anime._id, anime.orijinal_ad);
      if (healed && healed.episodes) {
        const healedMap = healed.episodes;
        formattedEpisodes = Object.keys(healedMap).map(key => ({
          _id: `${healed._id}_${key}`,
          episode_number: parseInt(key) || 1,
          episode_title: `Bölüm ${key}`,
          source_url: healedMap[key],
        })).sort((a, b) => a.episode_number - b.episode_number);
      }
    }

    // If it's a Movie or Single-episode content with no parsed episodes map, return a single episode pointing to the main url
    // BUT only for genuinely single-content entries (movies, OVAs, specials), NOT root series pages
    if (formattedEpisodes.length === 0 && anime.tranimeizle_url) {
      const singleContentFormats = ['MOVIE', 'OVA', 'ONA', 'SPECIAL'];
      const isSingleContentFormat = singleContentFormats.includes((anime.format || '').toUpperCase());
      
      if (isSingleContentFormat) {
        formattedEpisodes = [{
          _id: `${anime._id}_1`,
          episode_number: 1,
          episode_title: anime.format === 'MOVIE' ? 'Filmi İzle' : 'Bölüm 1 (İzle)',
          source_url: anime.tranimeizle_url,
        }];
      }
    }

    res.set('Cache-Control', 'public, max-age=600, s-maxage=1800');
    res.json({
      success: true,
      data: formattedEpisodes,
      total: formattedEpisodes.length,
    });
  } catch (error) {
    console.error('[GET /api/animes/:id/episodes] Error:', error.message);
    res.status(500).json({ success: false, error: 'Bölüm listesi alınamadı.' });
  }
});

/**
 * GET /api/animes/:id/episodes/:episode_number/video-url
 * Bölümün doğrudan .m3u8 oynatma linkini döner. (Sadece DB'den)
 */
router.get('/:id/episodes/:episode_number/video-url', async (req, res, next) => {
  const { id } = req.params;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return next();
  const { episode_number } = req.params;
  
  try {
    const anime = await Anime.findById(id);
    const activeId = id;
    if (!anime) {
      return res.status(404).json({ success: false, error: 'Anime bulunamadı.' });
    }
    
    const { force } = req.query;
    // Check if the link exists in the DB cache
    const cached = (!force && anime.episodes_cache) ? anime.episodes_cache[episode_number] : null;
    if (cached) {
      const type = cached.type || (typeof cached === 'string' ? (cached.includes('.m3u8') ? 'aitrvip' : 'sibnet') : 'aitrvip');
      const resolvedAt = typeof cached === 'string' ? 0 : (cached.resolvedAt || 0);
      const ageMs = Date.now() - resolvedAt;
      const maxAgeMs = type === 'aitrvip' ? 7 * 24 * 60 * 60 * 1000 : 3 * 60 * 60 * 1000; // aitrvip links cached for 7 days, others for 3 hours

      if (type === 'aitrvip' || type === 'sibnet-direct') {
        const videoUrl = typeof cached === 'string' ? cached : cached.videoUrl;
        const isAitrVip = type === 'aitrvip';
        
        if (typeof cached !== 'string' && ageMs < maxAgeMs) {
          console.log(`[SUCCESS] Doğrudan akış linki (${type}) DB'de bulundu. Dönülüyor.`);
          
          return res.json({
            success: true,
            videoUrl: videoUrl,
            cached: true
          });
        if (typeof cached !== 'string' && ageMs < maxAgeMs) {
          console.log(`[SUCCESS] Doğrudan akış linki (${type}) DB'de bulundu (Fansub: ${cached.fansub || 'N/A'}). Dönülüyor.`);
          
          return res.json({
            success: true,
            videoUrl: videoUrl,
            fansub: cached.fansub || null,
            cached: true
          });
        } else {
          console.log(`[INFO] Doğrudan akış linki DB'de bulundu ama süresi dolmuş (${Math.round(ageMs / 1000 / 60)} dk geçmiş). Yeniden çözülecek.`);
        }
      } else if (type === 'sibnet') {
        const sibnetId = cached.sibnetId || (typeof cached === 'object' ? cached.sibnetId : null) || (typeof cached === 'string' ? (cached.match(/\/(\d+)\.mp4/i) || [])[1] : null);
        if (sibnetId) {
          try {
            // Fast resolve via Sibnet shell.php
            const directMp4Url = await resolveSibnetId(sibnetId);
            console.log(`[SUCCESS] Sibnet Video ID'si ile hızlıca güncel link çözüldü.`);
            return res.json({
              success: true,
              videoUrl: directMp4Url,
              fansub: cached.fansub || null,
              cached: true
            });
          } catch (sibnetErr) {
            console.error(`[WARNING] Sibnet ID hızlı çözümü başarısız oldu, tarayıcıyla denenecek: ${sibnetErr.message}`);
          }
        }
      }
    }
    
    // Cache miss or expired/failed: Return episode URL for client-side resolution
    // Tüm tarayıcı otomasyonu (captcha çözme, kaynak tıklama) istemcide WebView ile yapılır.
    let episodeUrl = null;
    if (anime.episodes && anime.episodes[episode_number]) {
      episodeUrl = anime.episodes[episode_number];
    } else if (episode_number === '1' && (anime.tranime_url || anime.tranimeizle_url)) {
      episodeUrl = anime.tranimeizle_url || anime.tranime_url;
    }
    
    if (!episodeUrl) {
      console.log(`[ERROR] Bölüm adresi bulunamadı. ID: ${activeId}, Bölüm: ${episode_number}`);
      return res.status(400).json({ success: false, error: 'Bölüm adresi bulunamadı.' });
    }

    console.log(`[INFO] Link DB'de yok veya süresi dolmuş. İstemci çözümüne yönlendiriliyor: ${episodeUrl}`);
    
    // Return NOT_CACHED so the client handles resolution via WebView
    return res.json({
      success: false,
      code: 'NOT_CACHED',
      episodeUrl: episodeUrl
    });
    
  } catch (error) {
    console.error(`[ERROR] [GET /api/animes/:id/episodes/:episode_number/video-url]: ${error.message}`);
    res.status(500).json({ success: false, error: 'Video adresi çözülemedi.' });
  }
});

/**
 * POST /api/animes/:id/episodes/:episode_number/video-url
 * Çözümlenen .m3u8 oynatma linkini DB'ye kaydeder.
 */
router.post('/:id/episodes/:episode_number/video-url', protect, async (req, res, next) => {
  const { id } = req.params;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return next();
  const { episode_number } = req.params;
  const { videoUrl, fansub } = req.body;
  
  if (!videoUrl) {
    return res.status(400).json({ success: false, error: 'videoUrl parametresi gerekli.' });
  }
  
  try {
    const anime = await Anime.findById(id);
    if (!anime) {
      return res.status(404).json({ success: false, error: 'Anime bulunamadı.' });
    }
    
    if (!anime.episodes_cache) {
      anime.episodes_cache = {};
    }
    
    // Parse if it is a client-resolved Sibnet ID or Direct Link
    if (videoUrl.startsWith('sibnet-direct:')) {
      const pureUrl = videoUrl.replace('sibnet-direct:', '');
      anime.episodes_cache[episode_number] = {
        type: 'sibnet-direct',
        videoUrl: pureUrl,
        fansub: fansub || null,
        resolvedAt: Date.now()
      };
      console.log(`[SUCCESS] Saf Sibnet linki (.mp4) veritabanına kaydedildi. (Fansub: ${fansub || 'N/A'})`);
    } else if (videoUrl.startsWith('sibnet:')) {
      const sibnetId = videoUrl.replace('sibnet:', '');
      anime.episodes_cache[episode_number] = {
        type: 'sibnet',
        sibnetId: sibnetId,
        fansub: fansub || null,
        resolvedAt: Date.now()
      };
      console.log(`[SUCCESS] Sibnet Video ID'si veritabanına kaydedildi: ${sibnetId} (Fansub: ${fansub || 'N/A'})`);
    } else {
      anime.episodes_cache[episode_number] = {
        type: 'aitrvip',
        videoUrl: videoUrl,
        fansub: fansub || null,
        resolvedAt: Date.now()
      };
      console.log(`[SUCCESS] AitrVip linki veritabanına kaydedildi. (Fansub: ${fansub || 'N/A'})`);
    }
    anime.markModified('episodes_cache');
    await anime.save();
    console.log(`[SUCCESS] Saf link veritabanına başarıyla kaydedildi.`);
    res.json({ success: true, message: 'Video adresi önbelleğe kaydedildi.' });
    
  } catch (error) {
    console.error(`[ERROR] [POST /api/animes/:id/episodes/:episode_number/video-url]: ${error.message}`);
    res.status(500).json({ success: false, error: 'Sunucu hatası oluştu.' });
  }
});

/**
 * POST /api/animes/resolve-source
 * TrAnimeIzle bölüm URL'sinden AitrVip/optraco ham m3u8 linkini çıkarır.
 *
 * Body: { episodeUrl: "https://www.tranimeizle.io/bölüm-slug" }
 * Response: { success: true, m3u8Url: "https://optraco.top/plateau/UUID/HASH.m3u8", explorerUrl: "..." }
 */
router.post('/resolve-source', async (req, res) => {
  // episodeUrl: TrAnimeIzle bölüm sayfası URL'si
  // dataId: AitrVip data-id değeri (HTML'den önceden ayıklanmışsa direkt gönder)
  const { episodeUrl, dataId: directDataId } = req.body;

  if (!episodeUrl && !directDataId) {
    return res.status(400).json({ success: false, error: 'episodeUrl veya dataId gerekli.' });
  }

  try {
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    let dataId = directDataId;

    // data-id bilinmiyorsa bölüm sayfasından çek
    if (!dataId && episodeUrl) {
      const pageRes = await axios.get(episodeUrl, {
        headers: {
          'User-Agent': UA,
          'Referer': 'https://www.tranimeizle.io/',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 10000,
      });

      const html = pageRes.data;

      // AitrVip butonunu bul: data-id="{id}" ... AitrVip
      const aitrVipMatch = html.match(
        /data-id=["'](\d+)["'][^>]*data-eid=["']\d+["'][^>]*>[\s\S]{0,300}?AitrVip/i
      ) || html.match(
        /AitrVip[\s\S]{0,300}?data-id=["'](\d+)["']/i
      );

      if (!aitrVipMatch) {
        return res.status(404).json({ success: false, error: 'AitrVip kaynağı bu bölümde bulunamadı.' });
      }
      dataId = aitrVipMatch[1];
    }

    console.log(`[resolve-source] sourcePlayer isteği → data-id=${dataId}`);

    // Doğrudan sourcePlayer API'sini çağır
    const sourceRes = await axios.get(
      `https://www.tranimeizle.io/api/sourcePlayer/${dataId}`,
      {
        headers: {
          'User-Agent': UA,
          'Referer': episodeUrl || 'https://www.tranimeizle.io/',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 8000,
      }
    );

    const sourceData = sourceRes.data;

    // iframe src'den optraco URL'sini ayıkla
    const rawSource = sourceData?.source || (typeof sourceData === 'string' ? sourceData : '');
    const iframeSrc = rawSource.match(/src=["']([^"']*optraco[^"']*)["']/i)?.[1];

    if (!iframeSrc) {
      return res.status(502).json({ success: false, error: 'optraco iframe URL ayıklanamadı.', raw: sourceData });
    }

    // explorer → plateau + .m3u8
    const m3u8Url = iframeSrc.replace('/explorer/', '/plateau/') + '.m3u8';
    console.log(`[resolve-source] ✅ m3u8: ${m3u8Url}`);

    res.json({ success: true, explorerUrl: iframeSrc, m3u8Url, dataId });
  } catch (err) {
    console.error('[resolve-source] Hata:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});


const getOptracoHeaders = (targetUrl, queryReferer) => {
    const isAitrVip = targetUrl && targetUrl.includes('aitrvip.com');
    const baseOrigin = isAitrVip ? 'https://aitrvip.com' : 'https://optraco.top';
    let referer = `${baseOrigin}/`;

    if (queryReferer) {
        referer = queryReferer;
    } else if (targetUrl) {
        try {
            const urlObj = new URL(targetUrl);
            const parts = urlObj.pathname.split('/'); // ['', 'plateau', 'dad2c63e...', '...']
            if (parts.length >= 4) {
                const id1 = parts[2];
                let id2 = parts[3].replace('.m3u8', '').replace('.ts', '');

                // Optraco video kimlikleri (SHA1 hash) her zaman tam 40 karakterdir.
                if (id2.length > 40) {
                    id2 = id2.substring(0, 40);
                }
                referer = `${baseOrigin}/explorer/${id1}/${id2}`;
            }
        } catch (e) {
            console.error('Referer ayıklama hatası:', e.message);
        }
    }

    return {
        'Referer': referer,
        'Origin': baseOrigin,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
};



// Ana ve Alt .m3u8 dosyalarını tünelden geçiren pürüzsüz proxy
router.get('/stream.m3u8', async (req, res) => {
    const { url, referer: queryReferer } = req.query;
    if (!url) return res.status(400).send('m3u8 linki eksik!');

    // SSRF Koruması
    if (!isUrlAllowed(url)) {
      return res.status(403).json({ success: false, error: 'Bu URL\'ye proxy erişimi izin verilmiyor.' });
    }

    try {
        const headers = getOptracoHeaders(url, queryReferer);
        const response = await axios.get(url, { headers });
        let m3u8Content = response.data;

        const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
        const lines = m3u8Content.split('\n');

        const currentReferer = headers['Referer'];

        const updatedLines = lines.map(line => {
            const trimmedLine = line.trim();

            if (trimmedLine === '' || trimmedLine.startsWith('#')) {
                return line;
            }

            const absoluteUrl = trimmedLine.startsWith('http') ? trimmedLine : `${baseUrl}${trimmedLine}`;

            if (trimmedLine.includes('.m3u8')) {
                return `http://${req.headers.host}/api/animes/stream.m3u8?url=${encodeURIComponent(absoluteUrl)}&referer=${encodeURIComponent(currentReferer)}`;
            } else {
                return `http://${req.headers.host}/api/animes/chunk.ts?url=${encodeURIComponent(absoluteUrl)}&referer=${encodeURIComponent(currentReferer)}`;
            }
        });

        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(updatedLines.join('\n'));
    } catch (err) {
        res.status(500).send('Hata: .m3u8 dosyası çekilemedi: ' + err.message);
    }
});

// Video segmentlerini (.ts) doğru Referer ile maskleyen endpoint
router.get('/chunk.ts', async (req, res) => {
    const { url, referer: queryReferer } = req.query;
    if (!url) return res.status(400).send('ts parçası eksik!');

    // SSRF Koruması
    if (!isUrlAllowed(url)) {
      return res.status(403).json({ success: false, error: 'Bu URL\'ye proxy erişimi izin verilmiyor.' });
    }

    try {
        const headers = getOptracoHeaders(url, queryReferer);
        const response = await axios.get(url, {
            headers,
            responseType: 'stream'
        });

        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('Content-Type', 'video/MP2T');
        res.setHeader('Access-Control-Allow-Origin', '*');
        response.data.pipe(res);
    } catch (err) {
        res.status(500).send('Parça çekilemedi.');
    }
});

/**
 * POST /api/animes/:id/anilist-id
 * Update anilist_id manually
 */
router.post('/:id/anilist-id', apiKeyAuth, async (req, res) => {
    try {
        const { anilist_id, cover_image, banner_image, orijinal_ad, format } = req.body;
        
        const updateData = { anilist_id: anilist_id };
        if (cover_image) updateData.cover_image = cover_image;
        if (banner_image) updateData.banner_image = banner_image;
        if (orijinal_ad) updateData.orijinal_ad = orijinal_ad;
        if (format) updateData.format = format;

        await Anime.updateOne(
            { _id: req.params.id }, 
            { $set: updateData }
        );
        res.json({ success: true });
    } catch (err) {
        console.error('[POST /api/animes/:id/anilist-id] Error:', err);
        res.status(500).json({ success: false, error: 'Could not update anilist_id' });
    }
});

/**
 * POST /api/animes/:id/reset-anilist
 * Set anilist_id to null so it forces a refetch by title
 */
router.post('/:id/reset-anilist', apiKeyAuth, async (req, res) => {
    try {
        await Anime.updateOne(
            { _id: req.params.id }, 
            { $set: { anilist_id: null } }
        );
        res.json({ success: true });
    } catch (err) {
        console.error('[POST /api/animes/:id/reset-anilist] Error:', err);
        res.status(500).json({ success: false, error: 'Could not reset anilist_id' });
    }
});

// ── Orchestrator Directory Endpoint ───────────────────────────
// Serves the compiled anime directory (from orchestrator_state collection) to mobile app.
// Used by AnimeDirectoryContext for local Fuse.js search.

/**
 * GET /api/animes/directory
 * Returns the full orchestrator global_titles_map as a JSON array for local search.
 */
router.get('/directory', async (req, res) => {
  try {
    const doc = await OrchestratorState.findOne({ state_key: 'orchestrator_state' }).lean();

    if (!doc || !doc.global_titles_map) {
      return res.status(404).json({ success: false, error: 'Orchestrator directory not found.' });
    }

    // Convert the object map to an array with the key included, and attach cover/banner from animeCoversMap
    const directoryArray = Object.entries(doc.global_titles_map).map(([key, value]) => {
      const repSeasonId = value.seasons?.[0]?.mongo_db_id || value.related_movies_or_ovas?.[0]?.mongo_db_id;
      const covers = repSeasonId ? animeCoversMap[String(repSeasonId)] : null;
      return {
        _key: key,
        ...value,
        cover_image: covers?.cover || null,
        banner_image: covers?.banner || null
      };
    });

    res.json({
      success: true,
      count: directoryArray.length,
      data: directoryArray,
      updated_at: doc.updatedAt || null
    });
  } catch (err) {
    console.error('[GET /api/animes/directory] Error:', err);
    res.status(500).json({ success: false, error: 'Could not load anime directory.' });
  }
});

/**
 * GET /api/animes/:id/stream-data
 * Returns only the episodes map + imagery for a given mongo_db_id.
 * Optimized for the dual-core DetailScreen lazy loading.
 */
router.get('/:id/stream-data', async (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next();
  }

  try {
    const anime = await Anime.findById(id)
      .select('episodes cover_image banner_image anilist_id description genres average_score total_episodes orijinal_ad format')
      .lean();

    if (!anime) {
      return res.status(404).json({ success: false, error: 'Anime not found.' });
    }

    res.json({
      success: true,
      data: {
        _id: anime._id,
        episodes: anime.episodes || {},
        cover_image: anime.cover_image || null,
        banner_image: anime.banner_image || null,
        anilist_id: anime.anilist_id || null,
        description: anime.description || null,
        genres: anime.genres || [],
        average_score: anime.average_score || null,
        total_episodes: anime.total_episodes || 0,
        orijinal_ad: anime.orijinal_ad || null,
        format: anime.format || null
      }
    });
  } catch (err) {
    console.error('[GET /api/animes/:id/stream-data] Error:', err);
    res.status(500).json({ success: false, error: 'Could not load stream data.' });
  }
});

/**
 * POST /api/animes/reload-orchestrator
 * Reloads the orchestrator state from MongoDB into the server's cache immediately.
 */
/**
 * POST /api/animes/self-heal
 * Triggers on-demand background scrape and sync of main anime overview page
 */
const { fetchAndHealAnime, saveScrapedAnimeData, parseAnimeMainPageHtml, fixOrAddAnimeSeason } = require('../utils/animeSelfHealer');

router.post('/self-heal', async (req, res) => {
  try {
    const { animeId, slug, title, url } = req.body;
    console.log(`[POST /api/animes/self-heal] Request for animeId: ${animeId}, slug: ${slug}, title: ${title}`);

    let healedDoc = await fetchAndHealAnime(slug || url, animeId, title);

    if (healedDoc) {
      await loadOrchestratorMap();
      return res.json({
        success: true,
        message: 'Anime başarıyla tarandı ve veritabanına kaydedildi.',
        data: healedDoc
      });
    }

    res.status(404).json({ success: false, message: 'Anime ana sayfası taranamadı veya bulunamadı.' });
  } catch (err) {
    console.error('[POST /api/animes/self-heal] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/animes/:id/fix-season
 * Allows user to Fix Current Season or Add a New Season with title verification and last episode check
 */
router.post('/:id/fix-season', async (req, res) => {
  try {
    const { id } = req.params;
    const { url, mode, targetSeasonNumber, totalEpisodes, searchTitle } = req.body;

    console.log(`[POST /api/animes/:id/fix-season] Action on Anime ${id} | Mode: ${mode || 'fix_season'} | Target Season: ${targetSeasonNumber || 'N/A'}`);

    const result = await fixOrAddAnimeSeason({
      currentAnimeId: id,
      url: url || null,
      mode: mode || 'fix_season',
      targetSeasonNumber: targetSeasonNumber ? parseInt(targetSeasonNumber, 10) : null,
      totalEpisodesOverride: totalEpisodes ? parseInt(totalEpisodes, 10) : null,
      searchTitle: searchTitle || ''
    });

    await loadOrchestratorMap();

    res.json(result);
  } catch (err) {
    console.error(`[POST /api/animes/:id/fix-season] Error:`, err.message);
    res.status(400).json({
      success: false,
      error: err.message || 'Anime sezon işlemi tamamlanamadı.'
    });
  }
});

/**
 * GET /api/animes/check-exists
 * Checks if an anime exists in database by slug, URL, or title
 */
router.get('/check-exists', async (req, res) => {
  try {
    const { slug, title, url } = req.query;
    let cleanSlug = '';

    if (url) {
      cleanSlug = url.replace(/^https?:\/\/[^\/]+\/(?:anime\/)?/i, '').replace(/-izle$/i, '').trim();
    } else if (slug) {
      cleanSlug = slug.replace(/^anime\//i, '').replace(/-izle$/i, '').trim();
    }

    const queryConditions = [];
    if (cleanSlug) {
      queryConditions.push({ tranimeizle_slug: cleanSlug });
      queryConditions.push({ tranimeizle_slug: `${cleanSlug}-izle` });
    }
    if (title) {
      queryConditions.push({ orijinal_ad: new RegExp(`^${title.trim()}$`, 'i') });
      queryConditions.push({ anime_title: new RegExp(`^${title.trim()}$`, 'i') });
    }

    if (queryConditions.length === 0) {
      return res.json({ exists: false });
    }

    const found = await Anime.findOne({ $or: queryConditions }).lean();
    if (found) {
      return res.json({
        exists: true,
        anime: {
          _id: found._id,
          title: found.orijinal_ad || found.anime_title || formatSlugToTitle(found.tranimeizle_slug),
          total_episodes: found.total_episodes || (found.episodes ? Object.keys(found.episodes).length : 0),
          format: found.format,
          tranimeizle_slug: found.tranimeizle_slug,
          cover_image: found.cover_image
        }
      });
    }

    res.json({ exists: false });
  } catch (err) {
    console.error('[GET /api/animes/check-exists] Error:', err.message);
    res.status(500).json({ exists: false, error: err.message });
  }
});

/**
 * POST /api/animes/client-add-anime
 * Receives completely client-scraped structured anime data and persists to MongoDB Atlas & Orchestrator
 */
router.post('/client-add-anime', async (req, res) => {
  try {
    const { parsedData, mode, targetAnimeId, targetSeasonNumber, totalEpisodesOverride } = req.body;
    if (!parsedData || !parsedData.episodes || Object.keys(parsedData.episodes).length === 0) {
      return res.status(400).json({ success: false, error: 'Geçerli bölüm verisi bulunamadı.' });
    }

    console.log(`[POST /api/animes/client-add-anime] Saving client-scraped anime "${parsedData.title}" (Mode: ${mode || 'new_anime'}, Season: ${targetSeasonNumber || '1'})`);

    if (totalEpisodesOverride && parseInt(totalEpisodesOverride, 10) > 0) {
      parsedData.totalEpisodes = parseInt(totalEpisodesOverride, 10);
    }

    const savedDoc = await saveScrapedAnimeData(
      parsedData,
      mode === 'fix_season' ? targetAnimeId : null,
      targetSeasonNumber
    );

    await loadOrchestratorMap();

    res.json({
      success: true,
      message: mode === 'add_season'
        ? `Sezon ${targetSeasonNumber || 'yeni'} başarıyla kaydedildi!`
        : (mode === 'fix_season' ? 'Anime sezonu başarıyla güncellendi!' : 'Yeni anime başarıyla veritabanına eklendi!'),
      totalEpisodes: Object.keys(parsedData.episodes).length,
      data: savedDoc
    });
  } catch (err) {
    console.error('[POST /api/animes/client-add-anime] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/animes/sync-scraped-page
 * Receives raw HTML of anime overview page from client-side WebView scraper and saves to DB & Orchestrator
 */
router.post('/sync-scraped-page', async (req, res) => {
  try {
    const { html, url, slug, animeId } = req.body;
    if (!html) {
      return res.status(400).json({ success: false, error: 'HTML içeriği gerekli.' });
    }

    console.log(`[POST /api/animes/sync-scraped-page] Parsing scraped HTML for animeId: ${animeId}, slug: ${slug}`);
    const parsed = parseAnimeMainPageHtml(html, slug || '');

    if (!parsed || Object.keys(parsed.episodes || {}).length === 0) {
      return res.status(422).json({ success: false, error: 'HTML içinden bölüm listesi ayıklanamadı.' });
    }

    const savedDoc = await saveScrapedAnimeData(parsed, animeId);
    await loadOrchestratorMap();

    res.json({
      success: true,
      message: 'Bölümler ve anime bilgisi başarıyla veritabanına ve orkestraya kaydedildi.',
      totalEpisodes: Object.keys(parsed.episodes).length,
      data: savedDoc
    });
  } catch (err) {
    console.error('[POST /api/animes/sync-scraped-page] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.loadOrchestratorMap = loadOrchestratorMap;
module.exports = router;

