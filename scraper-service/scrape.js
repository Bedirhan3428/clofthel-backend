/**
 * Clofthel Termux Scraper Service (Pure Node.js - Zero External Dependencies)
 * Specifically tuned for https://www.tranimeizle.io/listeler/yenibolum/sayfa-[PAGE]
 */
const https = require('https');
const http = require('http');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env if present
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let val = (match[2] || '').trim().replace(/(^['"]|['"]$)/g, '');
      process.env[match[1]] = val;
    }
  });
}

const MAX_PAGES = parseInt(process.env.MAX_PAGES || '5', 10);
const BASE_URL = (process.env.SCRAPER_BASE_URL || 'https://www.tranimeizle.io/listeler/yenibolum/sayfa-').replace(/\/+$/, '') + '/';
const BACKEND_URL = (process.env.BACKEND_URL || 'https://clofthel-backend.onrender.com').replace(/\/+$/, '');
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'K7x!v9P2#L5q*zR9_tM1$wF8&jY3@cB6-sX4%dG8_uH2';

/**
 * Robust HTTP GET with decompression and redirect follow
 */
function fetchUrl(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error('Too many redirects'));

    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none'
      }
    };

    const req = mod.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let nextUrl = res.headers.location;
        if (nextUrl.startsWith('/')) {
          nextUrl = `${parsed.protocol}//${parsed.hostname}${nextUrl}`;
        }
        return fetchUrl(nextUrl, redirectCount + 1).then(resolve).catch(reject);
      }

      let stream = res;
      const encoding = res.headers['content-encoding'];
      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      }

      let data = '';
      stream.setEncoding('utf8');
      stream.on('data', chunk => { data += chunk; });
      stream.on('end', () => resolve({ status: res.statusCode, data }));
      stream.on('error', err => reject(err));
    });

    req.on('error', reject);
    req.setTimeout(20000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

/**
 * Posts JSON payload to backend gateway
 */
function postJSON(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const postData = JSON.stringify(body);

    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...headers,
      }
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(35000, () => {
      req.destroy();
      reject(new Error('Post timeout'));
    });
    req.write(postData);
    req.end();
  });
}

/**
 * Parses exact Tranimeizle flx-block structure from https://www.tranimeizle.io/listeler/yenibolum/sayfa-X
 * 
 * HTML Structure:
 * <div class="flx-block" data-href="/magilumiere-magical-girls-inc-2-sezon-7-bolum-izle">
 *     <a class="news-image" href="/magilumiere-magical-girls-inc-2-sezon-7-bolum-izle">
 *         <img alt="" class="img-responsive" src="https://static.tranimeizle.top/animes/5486/medium.jpeg">
 *     </a>
 *     <div class="bar">
 *         <h4>Magilumiere Magical Girls Inc. 2. Sezon 7. Bölüm İzle</h4>
 *         <span class="info-chip">BÖL 7 / 12</span>
 *     </div>
 * </div>
 */
function parseYenibolumPage(html) {
  if (!html) return [];
  const episodes = [];
  const seenUrls = new Set();

  // Regex to match each flx-block
  const blockRegex = /<div[^>]*class="[^"]*flx-block[^"]*"[^>]*data-href="([^"]+)"([\s\S]*?)(?=<div[^>]*class="[^"]*flx-block[^"]*"|<\/div>\s*<\/div>\s*<\/div>)/gi;
  let match;

  while ((match = blockRegex.exec(html)) !== null) {
    const dataHref = match[1].trim();
    const blockContent = match[2];

    // 1. Poster Image
    let poster = null;
    const imgMatch = blockContent.match(/<img[^>]*src="([^"]+)"/i);
    if (imgMatch) {
      poster = imgMatch[1].trim();
    }

    // 2. Title from <h4>...</h4>
    let fullTitle = '';
    const h4Match = blockContent.match(/<h4>([^<]+)<\/h4>/i);
    if (h4Match) {
      fullTitle = h4Match[1].trim();
    }

    // 3. Chip info (e.g. "BÖL 7 / 12" or "BÖL 7 / 0")
    let currentEpNum = null;
    let totalEpNum = null;
    const chipMatch = blockContent.match(/BÖL\s*(\d+)\s*\/\s*(\d+)/i);
    if (chipMatch) {
      currentEpNum = parseInt(chipMatch[1], 10);
      const chipTotal = parseInt(chipMatch[2], 10);
      if (chipTotal > 0) totalEpNum = chipTotal;
    }

    // 4. Derive Slug & Episode Number from href
    let cleanHref = dataHref
      .replace(/^https?:\/\/[^\/]+/i, '')
      .replace(/^\/?anime\//i, '')
      .replace(/^\/+/, '')
      .replace(/[?#].*$/, '')
      .trim();

    // Episode regex patterns:
    // e.g. "magilumiere-magical-girls-inc-2-sezon-7-bolum-izle"
    // e.g. "bleach-sennen-kessen-hen-4-kisim-final-4-bolum-izle-1"
    let baseSlug = null;
    let episodeNumber = currentEpNum;

    const epMatch = cleanHref.match(/^(.*?)-(\d+)-bolum(?:-izle(?:-\d+)?)?$/i);
    if (epMatch) {
      baseSlug = epMatch[1].replace(/-izle$/i, '');
      if (!episodeNumber) episodeNumber = parseInt(epMatch[2], 10);
    } else {
      const epMatch2 = cleanHref.match(/^(.*?)-bolum-(\d+)(?:-izle(?:-\d+)?)?$/i);
      if (epMatch2) {
        baseSlug = epMatch2[1].replace(/-izle$/i, '');
        if (!episodeNumber) episodeNumber = parseInt(epMatch2[2], 10);
      }
    }

    if (!baseSlug) {
      baseSlug = cleanHref.replace(/-izle.*$/i, '').replace(/-\d+$/, '');
      if (!episodeNumber) episodeNumber = 1;
    }

    const finalSlug = `${baseSlug}-izle`;
    const finalUrl = `https://www.tranimeizle.io/${cleanHref}`;

    if (!seenUrls.has(finalUrl) && episodeNumber) {
      seenUrls.add(finalUrl);

      // Clean Anime Title from full title (e.g. "Magilumiere... 7. Bölüm İzle" -> "Magilumiere...")
      let animeTitle = fullTitle
        ? fullTitle.replace(/\s*\d+\.\s*Bölüm\s*İzle.*$/i, '').replace(/\s*İzle$/i, '').trim()
        : baseSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

      episodes.push({
        slug: finalSlug,
        episode: episodeNumber,
        url: finalUrl,
        title: fullTitle || `${episodeNumber}. Bölüm`,
        anime_title: animeTitle,
        poster: poster,
        total_episodes: totalEpNum || (episodeNumber > 0 ? episodeNumber : null)
      });
    }
  }

  return episodes;
}

/**
 * Main Scraper Execution Loop
 */
async function run() {
  console.log(`\n======================================================`);
  console.log(`🤖 [Clofthel Termux Scraper] Başlatıldı: ${new Date().toLocaleString('tr-TR')}`);
  console.log(`🎯 Hedef URL: https://www.tranimeizle.io/listeler/yenibolum/sayfa-[1..${MAX_PAGES}]`);
  console.log(`📡 Backend Gateway: ${BACKEND_URL}/api/internal/bulk-episode-sync`);
  console.log(`======================================================\n`);

  const allEpisodes = [];
  const seenEpisodeKeys = new Set();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const pageUrl = `https://www.tranimeizle.io/listeler/yenibolum/sayfa-${page}`;
    console.log(`📄 [Sayfa ${page}/${MAX_PAGES}] Taranıyor: ${pageUrl}`);

    try {
      const res = await fetchUrl(pageUrl);

      if (res.status === 403 || res.status === 503) {
        console.warn(`⚠️ [Sayfa ${page}] Cloudflare engeli tespit edildi. 4 saniye bekleniyor...`);
        await new Promise(r => setTimeout(r, 4000));
        continue;
      }

      if (res.status !== 200 || !res.data) {
        console.warn(`⚠️ [Sayfa ${page}] HTTP Durumu: ${res.status}, sayfa atlanıyor.`);
        break;
      }

      const parsedItems = parseYenibolumPage(res.data);
      if (parsedItems.length === 0) {
        console.log(`ℹ️ [Sayfa ${page}] Blok bulunamadı, tarama sonlandırılıyor.`);
        break;
      }

      let newCount = 0;
      for (const item of parsedItems) {
        const key = `${item.slug}_ep${item.episode}`;
        if (!seenEpisodeKeys.has(key)) {
          seenEpisodeKeys.add(key);
          allEpisodes.push(item);
          newCount++;
        }
      }

      console.log(`  ✅ ${parsedItems.length} flx-block'tan ${newCount} yeni bölüm ayıklandı (Toplam: ${allEpisodes.length})`);
    } catch (err) {
      console.error(`❌ [Sayfa ${page}] Hata: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 1200));
  }

  console.log(`\n📊 Toplam ${allEpisodes.length} yeni anime bölümü toplandı.`);

  if (allEpisodes.length > 0) {
    console.log(`🚀 Backend Gateway'e gönderiliyor...`);
    try {
      const result = await postJSON(`${BACKEND_URL}/api/internal/bulk-episode-sync`, {
        episodes: allEpisodes
      }, {
        'x-internal-api-key': INTERNAL_API_KEY
      });

      console.log(`\n🎉 [Backend Yanıtı]:`, JSON.stringify(result, null, 2));
    } catch (err) {
      console.error(`❌ Backend Gönderim Hatası:`, err.message);
    }
  } else {
    console.log(`ℹ️ Gönderilecek yeni bölüm bulunamadı.`);
  }

  console.log(`\n✨ Scraper tamamlandı. [${new Date().toLocaleString('tr-TR')}]\n`);
}

run().catch(err => {
  console.error('💥 FATAL ERROR:', err);
  process.exit(1);
});
