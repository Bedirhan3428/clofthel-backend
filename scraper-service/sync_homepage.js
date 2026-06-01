/**
 * sync_homepage.js
 * 
 * tranimeizle.io ana sayfasındaki güncel bölümleri çekip,
 * MongoDB veritabanımıza senkronize eden betik.
 * 
 * Kullanım: node sync_homepage.js
 */

const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
require('dotenv').config();
const Anime = require('./models/Anime');

// Her çalışmada kaç sayfa taranacağını belirler (İlk 10 sayfa)
const MAX_PAGES_TO_SCRAPE = 10;

async function notifyMainBackend(animeId, episodeNum) {
  try {
    const mainBackendUrl = process.env.MAIN_BACKEND_URL || 'http://localhost:5000';
    const internalApiKey = process.env.INTERNAL_API_KEY || 'clofthel_internal_secret_key_2026';
    
    await axios.post(`${mainBackendUrl}/api/internal/notify-new-episode`, {
      animeId,
      episodeData: {
        bolum_no: episodeNum,
        bolum_adi: `${episodeNum}. Bölüm`
      }
    }, {
      headers: {
        'x-internal-api-key': internalApiKey
      }
    });
  } catch (err) {
    console.error(`[NOTIFY MAIN BACKEND ERROR] ${err.message}`);
  }
}

async function scrapePage(pageNumber) {
  const url = `https://www.tranimeizle.io/listeler/yenibolum/sayfa-${pageNumber}`;
  console.log(`[SCRAPER] Fetching ${url} ...`);
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(response.data);
    const links = [];
    
    $('.flx-block[data-href]').each((i, el) => {
      const href = $(el).attr('data-href');
      if (href) {
        links.push(href);
      }
    });
    
    return links;
  } catch (err) {
    console.error(`[SCRAPER] Error fetching page ${pageNumber}: ${err.message}`);
    return [];
  }
}

async function run() {
  let totalNewAnime = 0;
  let totalNewEpisodes = 0;
  
  // Aynı linkin farklı sayfalarda denk gelme ihtimaline karşı filtre
  const processedHrefs = new Set();

  for (let page = 1; page <= MAX_PAGES_TO_SCRAPE; page++) {
    const links = await scrapePage(page);
    if (links.length === 0) {
      console.log(`[SCRAPER] No links found on page ${page}. Stopping pagination.`);
      break; 
    }
    
    for (const href of links) {
      if (processedHrefs.has(href)) continue;
      processedHrefs.add(href);

      // Örnek: /the-outcast-6-sezon-22-bolum-izle
      const epMatch = href.match(/^\/(.*?)-(\d+)-bolum(?:-izle)?$/i);
      
      let baseSlug = null;
      let episodeNum = null;
      
      if (epMatch) {
        baseSlug = epMatch[1];
        episodeNum = parseInt(epMatch[2]);
      } else {
        // Film veya OVA formatı: /dragon-ball-z-movie-07-izle
        const movieMatch = href.match(/^\/(.*?-izle)$/i);
        if (movieMatch) {
          baseSlug = movieMatch[1].replace(/-izle$/, '');
          episodeNum = 1; // Filmleri tekil 1. bölüm olarak kabul ediyoruz
        } else {
          console.warn(`[WARN] Unknown href format ignored: ${href}`);
          continue;
        }
      }

      // tranimeizle_slug genellikle -izle ile biter
      const animeSlug = `${baseSlug}-izle`;
      const fullEpisodeUrl = `https://www.tranimeizle.io${href}`;
      const animeTrUrl = `https://www.tranimeizle.io/${animeSlug}`;

      let anime = await Anime.findOne({ tranimeizle_slug: animeSlug });

      if (anime) {
        // Anime var, bölüm numarasını kontrol et
        const episodes = anime.episodes || {};
        if (!episodes[episodeNum]) {
          episodes[episodeNum] = fullEpisodeUrl;
          
          anime.episodes = episodes;
          anime.total_episodes = Math.max(anime.total_episodes || 0, episodeNum);
          
          // Mixed type olduğu için mongoose'a değiştiğini bildiriyoruz
          anime.markModified('episodes');
          await anime.save();
          
          console.log(`[UPDATE] Added Episode ${episodeNum} to ${animeSlug}`);
          totalNewEpisodes++;
          
          // Send Notifications
          await notifyMainBackend(anime._id, episodeNum);
        }
      } else {
        // Anime hiç yok, sıfırdan oluştur
        const newEpisodes = {};
        newEpisodes[episodeNum] = fullEpisodeUrl;
        
        anime = new Anime({
          tranimeizle_slug: animeSlug,
          tranimeizle_url: animeTrUrl,
          total_episodes: episodeNum, // Maksimum bölüm sayısı şu anki bölüm
          episodes: newEpisodes
        });
        
        await anime.save();
        console.log(`[NEW] Created new Anime: ${animeSlug} with Episode ${episodeNum}`);
        totalNewAnime++;
        totalNewEpisodes++;
        
        // Send Notifications (though unlikely for a brand new anime to have followers)
        await notifyMainBackend(anime._id, episodeNum);
      }
    }
    
    // Cloudflare/Sunucu block yememek için sayfalar arası çok ufak bekleme
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n--- SUMMARY ---');
  console.log(`New Anime Created: ${totalNewAnime}`);
  console.log(`New Episodes Added: ${totalNewEpisodes}`);
  console.log('✨ Sync complete!\n');
  
  return { newAnime: totalNewAnime, newEpisodes: totalNewEpisodes };
}

module.exports = {
  runScraper: run
};
