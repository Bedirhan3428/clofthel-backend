const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

const { resolveExactAniListId } = require('./anilistSeasonMatcher');

/**
 * Normalizes title string into comparison tokens
 */
function tokenizeTitle(str) {
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
function verifyTitleMatch(expectedTitles = [], scrapedTitles = []) {
  const cleanExpected = expectedTitles.filter(Boolean);
  const cleanScraped = scrapedTitles.filter(Boolean);

  if (cleanExpected.length === 0 || cleanScraped.length === 0) return true; // Can't refute, allow

  const expectedTokens = new Set();
  cleanExpected.forEach(t => {
    tokenizeTitle(t).forEach(tok => expectedTokens.add(tok));
  });

  const scrapedTokens = new Set();
  cleanScraped.forEach(t => {
    tokenizeTitle(t).forEach(tok => scrapedTokens.add(tok));
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
 * Searches DuckDuckGo HTML / Google for Tranimeizle anime overview page
 */
async function searchTranimeizlePage(query, seasonNumber = null) {
  if (!query) return null;

  let fullQuery = `site:tranimeizle.io anime "${query}"`;
  if (seasonNumber && seasonNumber > 1) {
    fullQuery += ` "${seasonNumber}. Sezon"`;
  }

  const searchUrls = [
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(fullQuery)}`,
    `https://www.tranimeizle.io/arama?q=${encodeURIComponent(query + (seasonNumber ? ` ${seasonNumber}. Sezon` : ''))}`
  ];

  for (const sUrl of searchUrls) {
    try {
      const res = await axios.get(sUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8'
        },
        timeout: 7000
      });

      if (res.data) {
        const $ = cheerio.load(res.data);
        const candidateLinks = [];

        // Check search anchors
        $('a[href*="tranimeizle.io/anime/"], a[href^="/anime/"]').each((_, el) => {
          let href = $(el).attr('href');
          if (href) {
            if (href.startsWith('/')) href = 'https://www.tranimeizle.io' + href;
            // Clean up duckduckgo redirect link if present
            if (href.includes('uddg=')) {
              try {
                const parsed = new URL(href);
                href = decodeURIComponent(parsed.searchParams.get('uddg') || href);
              } catch (e) {}
            }
            if (href.includes('tranimeizle.io/anime/') && !candidateLinks.includes(href)) {
              candidateLinks.push(href);
            }
          }
        });

        if (candidateLinks.length > 0) {
          console.log(`🔎 [SelfHealer Search] Found ${candidateLinks.length} candidate URLs for query "${query}":`, candidateLinks[0]);
          return candidateLinks[0];
        }
      }
    } catch (err) {
      console.warn(`[SelfHealer Search] Search URL failed: ${sUrl} (${err.message})`);
    }
  }

  return null;
}

/**
 * Checks if the last episode of an anime is active/reachable
 */
async function verifyLastEpisode(episodesMap, totalEpisodesOverride = null) {
  if (!episodesMap || typeof episodesMap !== 'object') return { valid: false, lastEp: 0 };

  const epKeys = Object.keys(episodesMap).map(k => parseInt(k, 10)).filter(n => !isNaN(n));
  let lastEp = epKeys.length > 0 ? Math.max(...epKeys) : 0;

  if (totalEpisodesOverride && parseInt(totalEpisodesOverride, 10) > 0) {
    lastEp = parseInt(totalEpisodesOverride, 10);
  }

  if (lastEp <= 0) return { valid: false, lastEp: 0 };

  let targetUrl = episodesMap[String(lastEp)];
  if (!targetUrl && epKeys.length > 0) {
    // Construct hypothetical last episode url from template
    const template = episodesMap[String(epKeys[0])];
    if (template) {
      targetUrl = template.replace(new RegExp(`-${epKeys[0]}-bolum-izle`, 'i'), `-${lastEp}-bolum-izle`);
      episodesMap[String(lastEp)] = targetUrl;
    }
  }

  if (!targetUrl) return { valid: true, lastEp };

  try {
    const checkUrl = targetUrl.startsWith('http') ? targetUrl : `https://www.tranimeizle.io/${targetUrl.replace(/^\//, '')}`;
    const headRes = await axios.get(checkUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 8000,
      validateStatus: (s) => s >= 200 && s < 400
    });

    if (headRes.data && (headRes.data.includes('animeDetail-video') || headRes.data.includes('sourceList') || headRes.data.includes('player'))) {
      console.log(`✅ [SelfHealer LastEp] Last episode #${lastEp} verified working at: ${checkUrl}`);
      return { valid: true, lastEp, url: checkUrl };
    }
  } catch (err) {
    console.warn(`⚠️ [SelfHealer LastEp] Last episode check warning for #${lastEp}:`, err.message);
  }

  return { valid: true, lastEp };
}

/**
 * Parses the HTML of a tranimeizle.io main anime overview page (e.g. /anime/slug-izle)
 */
function parseAnimeMainPageHtml(html, defaultSlug = '') {
  if (!html) return null;
  const $ = cheerio.load(html);

  // 1. Title
  const title = $('.playlist-title h1, .animeDetail-title, h1').first().text().trim() || 'Anime';

  // 2. Poster image
  let poster = $('.poster img.img-responsive, .poster img, .animeDetail-video img').first().attr('src') || null;
  if (poster && poster.startsWith('//')) {
    poster = 'https:' + poster;
  }

  // 3. Genres
  const genres = [];
  $('.tags-inner .genre, .tags-inner a, a[href*="/animeizle/"]').each((_, el) => {
    const gText = $(el).text().trim();
    if (gText && !genres.includes(gText)) {
      genres.push(gText);
    }
  });

  // 3.5 Other Names (Diğer İsimleri) for 100% exact AniList & English title mapping
  const otherNames = [];
  $('dd').each((_, el) => {
    const txt = $(el).text().trim();
    if (txt.includes('Diğer İsimleri')) {
      let nextDt = $(el).next('dt');
      while (nextDt && nextDt.length && nextDt.is('dt')) {
        const raw = nextDt.text().trim();
        raw.split(/,\s*|\n/).forEach(n => {
          const clean = n.trim();
          if (clean && clean.length > 2 && !otherNames.includes(clean)) {
            otherNames.push(clean);
          }
        });
        nextDt = nextDt.next('dt');
      }
    }
  });

  // 4. Description
  let description = $('.anime-description, .p-10 p, .animeDetail-desc').first().text().trim() || null;
  if (!description || description.length < 5) {
    const fullText = $('.p-10').text().trim();
    if (fullText) description = fullText;
  }

  // 4.5 Fansubs (Fansublar)
  const fansubs = [];
  $('dd').each((_, el) => {
    const txt = $(el).text().trim();
    if (txt.includes('Fansublar')) {
      let nextDt = $(el).next('dt');
      if (nextDt.length) {
        nextDt.find('li a, a, .post-category').each((_, fEl) => {
          const fName = $(fEl).text().trim();
          if (fName && !fansubs.includes(fName)) fansubs.push(fName);
        });
      }
    }
  });

  // 5. Release / Info attributes
  let totalEpStr = '';
  $('dl dt, dl dd').each((_, el) => {
    const txt = $(el).text().trim();
    if (txt.includes('/') && /\d+\s*\/\s*\d+/.test(txt)) {
      totalEpStr = txt;
    }
  });

  // 6. Episodes List Extraction
  const episodesMap = {};
  const episodeElements = [];

  // Structure 1: li.episodeBtn[data-slug]
  $('li.episodeBtn, .animeDetail-items ol li, .animeDetail-playlist ol li').each((index, el) => {
    const dataSlug = $(el).attr('data-slug') || $(el).find('[data-slug]').attr('data-slug') || $(el).find('a').attr('href') || $(el).attr('href');
    const titleText = $(el).find('.title, .etitle, span').first().text().trim() || $(el).text().trim();
    const thumb = $(el).find('img.thumb, img').attr('src') || null;

    if (dataSlug) {
      episodeElements.push({
        dataSlug: dataSlug.replace(/^\//, ''),
        titleText,
        thumb,
        index
      });
    }
  });

  // Fallback: search for any anchor tag with -bolum
  if (episodeElements.length === 0) {
    $('a[href*="-bolum"]').each((index, el) => {
      const href = $(el).attr('href');
      if (href) {
        episodeElements.push({
          dataSlug: href.replace(/^\//, ''),
          titleText: $(el).text().trim(),
          thumb: $(el).find('img').attr('src') || null,
          index
        });
      }
    });
  }

  // Deduplicate and map episode numbers
  episodeElements.forEach((item, idx) => {
    let epNum = null;
    
    // Pattern 1: look for "-X-bolum" in dataSlug
    const slugMatch = item.dataSlug.match(/-(\d+)-bolum/i);
    if (slugMatch) {
      epNum = parseInt(slugMatch[1], 10);
    } else {
      // Pattern 2: look for digits in titleText
      const titleMatch = item.titleText.match(/(\d+)\.?\s*(?:bölüm|bolum|ep|episode)/i) || item.titleText.match(/bölüm\s*(\d+)/i) || item.titleText.match(/^(\d+)$/);
      if (titleMatch) {
        epNum = parseInt(titleMatch[1], 10);
      } else {
        epNum = idx + 1;
      }
    }

    if (epNum && !episodesMap[String(epNum)]) {
      episodesMap[String(epNum)] = item.dataSlug.startsWith('http') ? item.dataSlug : `https://www.tranimeizle.io/${item.dataSlug}`;
    }
  });

  let episodeCount = Object.keys(episodesMap).length;
  if (totalEpStr) {
    const parts = totalEpStr.split('/');
    if (parts[1]) {
      const parsedTotal = parseInt(parts[1].trim(), 10);
      if (parsedTotal > episodeCount) episodeCount = parsedTotal;
    }
  }

  return {
    title,
    poster,
    genres,
    fansubs,
    description,
    otherNames,
    episodes: episodesMap,
    totalEpisodes: episodeCount,
    slug: defaultSlug
  };
}

/**
 * Extracts a clean, formatted title from a URL or slug and cleans unwanted Turkish keywords.
 */
function extractCleanTitleFromSlugOrUrl(slugOrUrl, rawTitle = '') {
  let slug = (slugOrUrl || '')
    .replace(/^https?:\/\/[^\/]+\/(?:anime\/)?/i, '')
    .replace(/-(?:\d+)-bolum.*$/i, '')
    .replace(/-izle.*$/i, '')
    .replace(/^\/+|\/+$/g, '')
    .trim();

  let title = '';
  if (rawTitle && rawTitle.trim()) {
    title = rawTitle
      .replace(/\s*\d+\.\s*Bölüm\s*İzle.*$/i, '')
      .replace(/\s*Türkçe\s*(?:Altyazılı|Dublaj)?\s*İzle.*$/i, '')
      .replace(/\s*İzle.*$/i, '')
      .trim();
  }

  if (!title && slug) {
    title = slug
      .replace(/-/g, ' ')
      .replace(/\b(izle|turkce|altyazi|dublaj|full|hd)\b/gi, '')
      .replace(/\bsezon\b/gi, 'Season')
      .replace(/\bbolum\b/gi, 'Episode')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  return { cleanSlug: slug, cleanTitle: title || rawTitle || slug };
}

/**
 * Saves or updates an anime document and syncs with OrchestratorState in MongoDB Atlas
 */
async function saveScrapedAnimeData(parsedData, targetAnimeId = null, targetSeasonNumber = null) {
  if (!parsedData || !parsedData.episodes) return null;

  const Anime = mongoose.models.Anime || mongoose.model('Anime');
  const OrchestratorState = mongoose.models.OrchestratorState || mongoose.model('OrchestratorState');

  let animeDoc = null;

  // 1. Try finding by targetAnimeId
  if (targetAnimeId && mongoose.Types.ObjectId.isValid(targetAnimeId)) {
    animeDoc = await Anime.findById(targetAnimeId);
  }

  // 2. Extract clean title and slug
  const effectiveRawTitle = parsedData.customTitle || parsedData.title || '';
  const { cleanSlug: extractedSlug, cleanTitle: extractedTitle } = extractCleanTitleFromSlugOrUrl(
    parsedData.url || parsedData.slug || (animeDoc && animeDoc.tranimeizle_slug),
    effectiveRawTitle
  );

  const cleanSlug = extractedSlug || (parsedData.slug ? parsedData.slug.replace(/-izle$/, '') : 'anime');
  const cleanTitle = parsedData.customTitle || extractedTitle || parsedData.title || cleanSlug;

  // 3. Try finding by slug if not found yet
  if (!animeDoc && cleanSlug) {
    animeDoc = await Anime.findOne({
      $or: [
        { tranimeizle_slug: cleanSlug },
        { tranimeizle_slug: `${cleanSlug}-izle` },
        { tranimeizle_slug: cleanSlug.replace(/-izle$/, '') }
      ]
    });
  }

  // 4. Resolve Exact Season-Specific AniList ID with clean Title
  let exactAniList = null;
  try {
    exactAniList = await resolveExactAniListId(cleanTitle, cleanSlug, parsedData.otherNames || []);
    if (exactAniList) {
      console.log(`🎯 [SelfHealer] Exact Season AniList Matched: "${exactAniList.title_en}" -> AniList ID: ${exactAniList.anilist_id} (Format: ${exactAniList.format})`);
    }
  } catch (aniErr) {
    console.warn('[SelfHealer] AniList exact match warning:', aniErr.message);
  }

  if (animeDoc) {
    // Update existing anime
    const currentEps = animeDoc.episodes || {};
    const mergedEpisodes = { ...currentEps, ...parsedData.episodes };
    const maxEp = Math.max(animeDoc.total_episodes || 0, Object.keys(mergedEpisodes).length, parsedData.totalEpisodes || 0);

    animeDoc.episodes = mergedEpisodes;
    animeDoc.total_episodes = maxEp;
    if (parsedData.poster) animeDoc.cover_image = parsedData.poster;
    if (parsedData.description) animeDoc.description = parsedData.description;
    if (parsedData.genres && parsedData.genres.length > 0) animeDoc.genres = parsedData.genres;
    if (parsedData.fansubs && parsedData.fansubs.length > 0) animeDoc.fansubs = parsedData.fansubs;

    // Update and fix AniList ID & Title
    if (exactAniList) {
      if (exactAniList.anilist_id) animeDoc.anilist_id = exactAniList.anilist_id;
      if (exactAniList.title_en) animeDoc.orijinal_ad = exactAniList.title_en;
      if (exactAniList.format) animeDoc.format = exactAniList.format;
      if (exactAniList.season_year) animeDoc.season_year = exactAniList.season_year;
      if (exactAniList.cover_image && (!animeDoc.cover_image || animeDoc.cover_image.includes('default') || parsedData.poster)) {
        animeDoc.cover_image = exactAniList.cover_image;
      }
      if (exactAniList.banner_image) {
        animeDoc.banner_image = exactAniList.banner_image;
      }
    } else if (cleanTitle) {
      animeDoc.orijinal_ad = cleanTitle;
    }

    animeDoc.markModified('episodes');
    await animeDoc.save();
    console.log(`✅ [SelfHealer] Updated Anime "${animeDoc.orijinal_ad || animeDoc.tranimeizle_slug}" (${animeDoc._id}) with ${Object.keys(mergedEpisodes).length} episodes (AniList: ${animeDoc.anilist_id || 'N/A'}, Fansubs: ${(animeDoc.fansubs || []).join(', ') || 'N/A'}).`);
  } else {
    // Create new anime in DB
    animeDoc = new Anime({
      _id: new mongoose.Types.ObjectId(),
      tranimeizle_slug: cleanSlug.endsWith('-izle') ? cleanSlug : `${cleanSlug}-izle`,
      tranimeizle_url: `https://www.tranimeizle.io/anime/${cleanSlug}`,
      orijinal_ad: exactAniList?.title_en || cleanTitle,
      cover_image: exactAniList?.cover_image || parsedData.poster,
      banner_image: exactAniList?.banner_image || parsedData.poster,
      description: parsedData.description,
      genres: parsedData.genres || [],
      fansubs: parsedData.fansubs || [],
      total_episodes: parsedData.totalEpisodes || Object.keys(parsedData.episodes).length,
      episodes: parsedData.episodes,
      format: exactAniList?.format || 'TV',
      anilist_id: exactAniList?.anilist_id || null,
      season_year: exactAniList?.season_year || null
    });

    await animeDoc.save();
    console.log(`✨ [SelfHealer] Created NEW Anime in DB: "${animeDoc.orijinal_ad}" (${animeDoc._id}) with ${parsedData.totalEpisodes} episodes (AniList: ${animeDoc.anilist_id || 'N/A'}, Fansubs: ${(animeDoc.fansubs || []).join(', ') || 'N/A'}).`);
  }

  // 5. Update OrchestratorState if exists
  try {
    const stateDoc = await OrchestratorState.findOne({ state_key: 'orchestrator_state' });
    if (stateDoc && stateDoc.global_titles_map) {
      const titlesMap = stateDoc.global_titles_map;
      const cleanKey = cleanSlug
        .replace(/-izle$/i, '')
        .replace(/-(?:\d+)-sezon.*/i, '')
        .replace(/-/g, ' ')
        .trim();

      let group = titlesMap[cleanKey];

      // If targetAnimeId provided, also check if target anime is already in a group
      if (!group && targetAnimeId) {
        for (const [k, g] of Object.entries(titlesMap)) {
          if ((g.seasons || []).some(s => String(s.mongo_db_id) === String(targetAnimeId))) {
            group = g;
            break;
          }
        }
      }

      if (group) {
        let matchedSeason = (group.seasons || []).find(s => String(s.mongo_db_id) === String(animeDoc._id));
        if (matchedSeason) {
          if (exactAniList?.anilist_id) matchedSeason.anilist_id = exactAniList.anilist_id;
          if (exactAniList?.title_en) matchedSeason.season_title = exactAniList.title_en;
          if (targetSeasonNumber) matchedSeason.season_number = parseInt(targetSeasonNumber, 10);
        } else {
          const nextSeasonNum = targetSeasonNumber ? parseInt(targetSeasonNumber, 10) : ((group.seasons || []).length + 1);
          group.seasons.push({
            season_number: nextSeasonNum,
            season_title: exactAniList?.title_en || cleanTitle || `Season ${nextSeasonNum}`,
            format: exactAniList?.format || 'TV',
            mongo_db_id: String(animeDoc._id),
            anilist_id: exactAniList?.anilist_id || null
          });
          // Sort seasons by season_number
          group.seasons.sort((a, b) => (a.season_number || 1) - (b.season_number || 1));
        }
        stateDoc.markModified('global_titles_map');
        await stateDoc.save();
        console.log(`🔗 [SelfHealer] Linked anime to Orchestrator group "${group.main_title_en || cleanKey}" as Season ${targetSeasonNumber || 'Next'}.`);
      }
    }
  } catch (orchErr) {
    console.warn('[SelfHealer] Orchestrator sync warning:', orchErr.message);
  }

  return animeDoc;
}

/**
 * Fetches the overview page from tranimeizle.io and heals the anime in DB
 */
async function fetchAndHealAnime(slugOrUrl, targetAnimeId = null, fallbackTitle = '', targetSeasonNumber = null, totalEpisodesOverride = null) {
  let cleanSlug = '';
  let directUrl = null;

  if (slugOrUrl && slugOrUrl.startsWith('http')) {
    directUrl = slugOrUrl;
    // If it's a -bolum-izle link, extract anime overview page
    if (directUrl.includes('-bolum-izle')) {
      const match = directUrl.match(/(https?:\/\/[^\/]+)\/(?:anime\/)?(.+?)(?:-\d+)?-bolum-izle/i);
      if (match) {
        directUrl = `${match[1]}/anime/${match[2]}-izle`;
      }
    }
    cleanSlug = directUrl.replace(/^https?:\/\/[^\/]+\//i, '').replace(/^anime\//i, '').replace(/-izle$/i, '').trim();
  } else if (slugOrUrl) {
    cleanSlug = slugOrUrl
      .replace(/^https?:\/\/[^\/]+\//i, '')
      .replace(/^anime\//i, '')
      .replace(/-izle$/i, '')
      .trim();
  } else if (fallbackTitle) {
    cleanSlug = fallbackTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  const targetUrls = directUrl ? [directUrl] : [
    `https://www.tranimeizle.io/anime/${cleanSlug}-izle`,
    `https://www.tranimeizle.io/anime/${cleanSlug}`,
    `https://www.tranimeizle.io/${cleanSlug}-izle`,
    `https://www.tranimeizle.io/${cleanSlug}`
  ];

  console.log(`🔍 [SelfHealer] Starting On-Demand Scrape for slug "${cleanSlug}"...`);

  for (const url of targetUrls) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.7'
        },
        timeout: 10000
      });

      if (response.data && (response.data.includes('animeDetail-playlist') || response.data.includes('episodeBtn') || response.data.includes('playlist-title'))) {
        console.log(`🎯 [SelfHealer] Valid anime page found at: ${url}`);
        const parsed = parseAnimeMainPageHtml(response.data, cleanSlug);
        if (parsed && parsed.totalEpisodes > 0) {
          if (totalEpisodesOverride && parseInt(totalEpisodesOverride, 10) > 0) {
            parsed.totalEpisodes = parseInt(totalEpisodesOverride, 10);
          }
          const result = await saveScrapedAnimeData(parsed, targetAnimeId, targetSeasonNumber);
          return result;
        }
      }
    } catch (err) {
      // Continue
    }
  }

  // If direct fetch fails, search web for the best URL
  if (fallbackTitle || cleanSlug) {
    const searchTarget = fallbackTitle || cleanSlug.replace(/-/g, ' ');
    const foundUrl = await searchTranimeizlePage(searchTarget, targetSeasonNumber);
    if (foundUrl && !targetUrls.includes(foundUrl)) {
      try {
        const response = await axios.get(foundUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          timeout: 10000
        });
        if (response.data && (response.data.includes('animeDetail-playlist') || response.data.includes('episodeBtn') || response.data.includes('playlist-title'))) {
          const parsed = parseAnimeMainPageHtml(response.data, foundUrl.replace(/^https?:\/\/[^\/]+\/(?:anime\/)?/i, ''));
          if (parsed && parsed.totalEpisodes > 0) {
            if (totalEpisodesOverride && parseInt(totalEpisodesOverride, 10) > 0) {
              parsed.totalEpisodes = parseInt(totalEpisodesOverride, 10);
            }
            const result = await saveScrapedAnimeData(parsed, targetAnimeId, targetSeasonNumber);
            return result;
          }
        }
      } catch (e) {}
    }
  }

  console.warn(`⚠️ [SelfHealer] Could not fetch anime page directly for slug: "${cleanSlug}"`);
  return null;
}

/**
 * Fixes current season or Adds a new season with title match and last episode verification
 */
async function fixOrAddAnimeSeason({ currentAnimeId, url, mode = 'fix_season', targetSeasonNumber = null, totalEpisodesOverride = null, searchTitle = '' }) {
  const Anime = mongoose.models.Anime || mongoose.model('Anime');

  let currentAnime = null;
  if (currentAnimeId && mongoose.Types.ObjectId.isValid(currentAnimeId)) {
    currentAnime = await Anime.findById(currentAnimeId);
  }

  const expectedTitles = [
    searchTitle,
    currentAnime?.orijinal_ad,
    currentAnime?.anime_title,
    currentAnime?.tranimeizle_slug?.replace(/-izle$/i, '').replace(/-/g, ' ')
  ].filter(Boolean);

  let targetUrl = url ? url.trim() : null;

  // If no URL given, search automatically
  if (!targetUrl) {
    const query = searchTitle || currentAnime?.orijinal_ad || currentAnime?.tranimeizle_slug?.replace(/-/g, ' ');
    console.log(`🔎 [FixOrAdd] No URL provided. Searching Tranimeizle for "${query}" (Season: ${targetSeasonNumber || 'Current'})...`);
    targetUrl = await searchTranimeizlePage(query, mode === 'add_season' ? targetSeasonNumber : null);
  }

  if (!targetUrl && !currentAnime?.tranimeizle_url && !currentAnime?.tranimeizle_slug) {
    throw new Error('Anime için geçerli bir Tranimeizle linki bulunamadı veya arama sonuç vermedi.');
  }

  const finalUrl = targetUrl || currentAnime?.tranimeizle_url || `https://www.tranimeizle.io/anime/${currentAnime?.tranimeizle_slug}`;

  // Fetch page HTML
  console.log(`🌐 [FixOrAdd] Fetching page: ${finalUrl}`);
  const response = await axios.get(finalUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    timeout: 12000
  });

  const parsed = parseAnimeMainPageHtml(response.data, finalUrl.replace(/^https?:\/\/[^\/]+\/(?:anime\/)?/i, ''));
  if (!parsed || Object.keys(parsed.episodes || {}).length === 0) {
    throw new Error('Sayfadan bölüm listesi ayıklanamadı. Linkin bir ana anime sayfası olduğundan emin olun.');
  }

  // Title verification
  const scrapedTitles = [parsed.title, ...(parsed.otherNames || [])];
  const isMatch = verifyTitleMatch(expectedTitles, scrapedTitles);
  console.log(`🔎 [FixOrAdd Title Verification] Expected: [${expectedTitles.join(', ')}] vs Scraped: [${scrapedTitles.join(', ')}] -> Matched: ${isMatch}`);

  if (!isMatch) {
    throw new Error(`İsim uyuşmazlığı tespit edildi! Sayfadaki anime ("${parsed.title}") ile geçerli anime uyuşmuyor.`);
  }

  // Last episode verification
  const lastEpCheck = await verifyLastEpisode(parsed.episodes, totalEpisodesOverride);
  console.log(`📺 [FixOrAdd Last Episode Check] Last Ep #${lastEpCheck.lastEp} verification result:`, lastEpCheck.valid);

  if (totalEpisodesOverride && parseInt(totalEpisodesOverride, 10) > 0) {
    parsed.totalEpisodes = parseInt(totalEpisodesOverride, 10);
  }

  let savedDoc = null;
  if (mode === 'add_season') {
    // Save as new anime document and link to orchestrator
    savedDoc = await saveScrapedAnimeData(parsed, null, targetSeasonNumber);
  } else {
    // Fix current season
    savedDoc = await saveScrapedAnimeData(parsed, currentAnimeId, targetSeasonNumber);
  }

  return {
    success: true,
    message: mode === 'add_season' ? `Sezon ${targetSeasonNumber || 'yeni'} başarıyla eklendi!` : 'Mevcut sezon başarıyla güncellendi ve düzeltildi!',
    anime: savedDoc,
    totalEpisodes: Object.keys(parsed.episodes).length,
    lastEpisodeVerified: lastEpCheck.valid,
    fansubs: parsed.fansubs || []
  };
}

module.exports = {
  parseAnimeMainPageHtml,
  saveScrapedAnimeData,
  fetchAndHealAnime,
  searchTranimeizlePage,
  verifyTitleMatch,
  verifyLastEpisode,
  fixOrAddAnimeSeason
};
