const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

const { resolveExactAniListId } = require('./anilistSeasonMatcher');

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
    
    // Check title text for "X. Bölüm"
    const titleMatch = item.titleText.match(/(\d+)\.\s*Bölüm/i);
    if (titleMatch) {
      epNum = parseInt(titleMatch[1], 10);
    } else {
      // Check slug for "-X-bolum" or "bolum-X"
      const slugMatch = item.dataSlug.match(/-(\d+)-bolum/i) || item.dataSlug.match(/bolum-(\d+)/i);
      if (slugMatch) {
        epNum = parseInt(slugMatch[1], 10);
      }
    }

    if (!epNum || isNaN(epNum)) {
      epNum = idx + 1;
    }

    const fullUrl = item.dataSlug.startsWith('http') 
      ? item.dataSlug 
      : `https://www.tranimeizle.io/${item.dataSlug}`;

    episodesMap[String(epNum)] = fullUrl;
  });

  const episodeCount = Object.keys(episodesMap).length;

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
 * Saves or updates an anime document and syncs with OrchestratorState in MongoDB Atlas
 */
async function saveScrapedAnimeData(parsedData, targetAnimeId = null) {
  if (!parsedData || !parsedData.episodes) return null;

  const Anime = mongoose.models.Anime || mongoose.model('Anime');
  const OrchestratorState = mongoose.models.OrchestratorState || mongoose.model('OrchestratorState');

  let animeDoc = null;

  // 1. Try finding by targetAnimeId
  if (targetAnimeId && mongoose.Types.ObjectId.isValid(targetAnimeId)) {
    animeDoc = await Anime.findById(targetAnimeId);
  }

  // 2. Try finding by slug
  if (!animeDoc && parsedData.slug) {
    animeDoc = await Anime.findOne({
      $or: [
        { tranimeizle_slug: parsedData.slug },
        { tranimeizle_slug: `${parsedData.slug}-izle` },
        { tranimeizle_slug: parsedData.slug.replace(/-izle$/, '') }
      ]
    });
  }

  const cleanSlug = (parsedData.slug || (animeDoc && animeDoc.tranimeizle_slug) || parsedData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')).replace(/^-|-$/g, '');

  // 0. Resolve Exact Season-Specific AniList ID
  let exactAniList = null;
  try {
    exactAniList = await resolveExactAniListId(parsedData.title, cleanSlug, parsedData.otherNames || []);
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
    if (parsedData.poster && !animeDoc.cover_image) animeDoc.cover_image = parsedData.poster;
    if (parsedData.description && !animeDoc.description) animeDoc.description = parsedData.description;
    if (parsedData.genres && (!animeDoc.genres || animeDoc.genres.length === 0)) animeDoc.genres = parsedData.genres;
    if (parsedData.fansubs && parsedData.fansubs.length > 0) animeDoc.fansubs = parsedData.fansubs;
    if (exactAniList) {
      if (exactAniList.anilist_id) animeDoc.anilist_id = exactAniList.anilist_id;
      if (exactAniList.title_en) animeDoc.orijinal_ad = exactAniList.title_en;
      if (exactAniList.format) animeDoc.format = exactAniList.format;
      if (exactAniList.season_year) animeDoc.season_year = exactAniList.season_year;
    } else if (parsedData.title && !animeDoc.orijinal_ad) {
      animeDoc.orijinal_ad = parsedData.title;
    }

    animeDoc.markModified('episodes');
    await animeDoc.save();
    console.log(`✅ [SelfHealer] Updated Anime "${animeDoc.orijinal_ad || animeDoc.tranimeizle_slug}" (${animeDoc._id}) with ${Object.keys(mergedEpisodes).length} episodes (AniList: ${animeDoc.anilist_id || 'N/A'}, Fansubs: ${(animeDoc.fansubs || []).join(', ') || 'N/A'}).`);
  } else {
    // Create new anime in DB
    animeDoc = new Anime({
      _id: (targetAnimeId && mongoose.Types.ObjectId.isValid(targetAnimeId)) ? new mongoose.Types.ObjectId(targetAnimeId) : new mongoose.Types.ObjectId(),
      tranimeizle_slug: cleanSlug.endsWith('-izle') ? cleanSlug : `${cleanSlug}-izle`,
      tranimeizle_url: `https://www.tranimeizle.io/anime/${cleanSlug}`,
      orijinal_ad: exactAniList?.title_en || parsedData.title,
      cover_image: parsedData.poster,
      banner_image: parsedData.poster,
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

  // 3. Update OrchestratorState if exists
  try {
    const stateDoc = await OrchestratorState.findOne({ state_key: 'orchestrator_state' });
    if (stateDoc && stateDoc.global_titles_map) {
      const titlesMap = stateDoc.global_titles_map;
      const cleanKey = cleanSlug
        .replace(/-izle$/i, '')
        .replace(/-(?:\d+)-sezon.*/i, '')
        .replace(/-/g, ' ')
        .trim();

      const group = titlesMap[cleanKey];
      if (group) {
        let matchedSeason = (group.seasons || []).find(s => String(s.mongo_db_id) === String(animeDoc._id));
        if (matchedSeason) {
          if (exactAniList?.anilist_id) matchedSeason.anilist_id = exactAniList.anilist_id;
        } else {
          const nextSeasonNum = (group.seasons || []).length + 1;
          group.seasons.push({
            season_number: nextSeasonNum,
            season_title: parsedData.title || `Season ${nextSeasonNum}`,
            format: exactAniList?.format || 'TV',
            mongo_db_id: String(animeDoc._id),
            anilist_id: exactAniList?.anilist_id || null
          });
        }
        stateDoc.markModified('global_titles_map');
        await stateDoc.save();
        console.log(`🔗 [SelfHealer] Linked new anime to Orchestrator group "${cleanKey}".`);
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
async function fetchAndHealAnime(slugOrUrl, targetAnimeId = null, fallbackTitle = '') {
  if (!slugOrUrl && !fallbackTitle) return null;

  let cleanSlug = '';
  if (slugOrUrl) {
    cleanSlug = slugOrUrl
      .replace(/^https?:\/\/[^\/]+\//i, '')
      .replace(/^anime\//i, '')
      .replace(/-izle$/i, '')
      .trim();
  } else if (fallbackTitle) {
    cleanSlug = fallbackTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  const targetUrls = [
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
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.7'
        },
        timeout: 10000
      });

      if (response.data && (response.data.includes('animeDetail-playlist') || response.data.includes('episodeBtn') || response.data.includes('playlist-title'))) {
        console.log(`🎯 [SelfHealer] Valid anime page found at: ${url}`);
        const parsed = parseAnimeMainPageHtml(response.data, cleanSlug);
        if (parsed && parsed.totalEpisodes > 0) {
          const result = await saveScrapedAnimeData(parsed, targetAnimeId);
          return result;
        }
      }
    } catch (err) {
      // Continue to next URL pattern
    }
  }

  console.warn(`⚠️ [SelfHealer] Could not fetch anime page directly for slug: "${cleanSlug}"`);
  return null;
}

module.exports = {
  parseAnimeMainPageHtml,
  saveScrapedAnimeData,
  fetchAndHealAnime
};
