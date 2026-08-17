/**
 * Clofthel Termux Scraper Service (Pure Node.js - Zero External Dependencies)
 * Scrapes latest anime episodes from tranimeizle.io and syncs with Clofthel Backend Gateway.
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

const MAX_PAGES = parseInt(process.env.MAX_PAGES || '10', 10);
const BASE_URL = process.env.SCRAPER_BASE_URL || 'https://www.tranimeizle.io/listeler/yenibolum/sayfa-';
const BACKEND_URL = (process.env.BACKEND_URL || 'https://clofthel-backend.onrender.com').replace(/\/+$/, '');
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'K7x!v9P2#L5q*zR9_tM1$wF8&jY3@cB6-sX4%dG8_uH2';

/**
 * Robust HTTP GET with decompression and redirect follow
 */
function fetchUrl(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      return reject(new Error('Too many redirects'));
    }

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
      // Handle HTTP redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let nextUrl = res.headers.location;
        if (nextUrl.startsWith('/')) {
          nextUrl = `${parsed.protocol}//${parsed.hostname}${nextUrl}`;
        }
        return fetchUrl(nextUrl, redirectCount + 1).then(resolve).catch(reject);
      }

      // Handle decompression
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
      stream.on('end', () => {
        resolve({ status: res.statusCode, data });
      });
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
 * Extracts all potential episode and anime links from raw HTML using multiple patterns
 */
function parseLinks(html) {
  if (!html) return [];
  const links = new Set();

  // Pattern 1: data-href="..."
  const rDataHref = /data-href="([^"]+)"/gi;
  let m;
  while ((m = rDataHref.exec(html)) !== null) {
    if (m[1] && m[1].length > 3) links.add(m[1].trim());
  }

  // Pattern 2: data-url="..." or data-slug="..."
  const rDataUrl = /data-(?:url|slug)="([^"]+)"/gi;
  while ((m = rDataUrl.exec(html)) !== null) {
    if (m[1] && m[1].length > 3) links.add(m[1].trim());
  }

  // Pattern 3: standard <a href="..."> containing -bolum or -izle
  const rHref = /href="([^"]*(?:-bolum|-izle)[^"]*)"/gi;
  while ((m = rHref.exec(html)) !== null) {
    if (m[1]) {
      const clean = m[1].trim();
      if (!clean.startsWith('#') && !clean.startsWith('javascript:')) {
        links.add(clean);
      }
    }
  }

  return Array.from(links);
}

/**
 * Universal episode parser for any Tranimeizle link structure
 */
function parseEpisode(rawHref) {
  if (!rawHref) return null;

  // 1. Clean URL
  let clean = rawHref
    .replace(/^https?:\/\/[^\/]+/i, '')
    .replace(/^\/?anime\//i, '')
    .replace(/^\/+/, '')
    .replace(/[?#].*$/, '')
    .replace(/\.html$/i, '')
    .trim();

  if (!clean || clean.length < 3) return null;

  // Pattern 1: Standard "-X-bolum-izle" or "-X-bolum"
  // e.g. "re-zero-kara-hajimeru-isekai-seikatsu-2-sezon-1-bolum-izle"
  const m1 = clean.match(/^(.*?)-(\d+)-bolum(?:-izle)?$/i);
  if (m1) {
    const baseSlug = m1[1].replace(/-izle$/i, '');
    const epNum = parseInt(m1[2], 10);
    return {
      slug: `${baseSlug}-izle`,
      episode: epNum,
      url: `https://www.tranimeizle.io/${clean}`
    };
  }

  // Pattern 2: "-bolum-X"
  const m2 = clean.match(/^(.*?)-bolum-(\d+)(?:-izle)?$/i);
  if (m2) {
    const baseSlug = m2[1].replace(/-izle$/i, '');
    const epNum = parseInt(m2[2], 10);
    return {
      slug: `${baseSlug}-izle`,
      episode: epNum,
      url: `https://www.tranimeizle.io/${clean}`
    };
  }

  // Pattern 3: Single Movies / OVAs / Specials
  // e.g. "jujutsu-kaisen-0-movie-izle" or "kimetsu-no-yaiba-mugen-ressha-hen-film-izle"
  const m3 = clean.match(/^(.*?(?:movie|film|ova|ona|special|specials)(?:-\d+)?(?:-izle)?)$/i);
  if (m3) {
    const baseSlug = m3[1].replace(/-izle$/i, '');
    return {
      slug: `${baseSlug}-izle`,
      episode: 1,
      url: `https://www.tranimeizle.io/${clean}`
    };
  }

  // Pattern 4: General "-izle" links that are not list pages
  if (clean.endsWith('-izle') && !clean.includes('sayfa-') && !clean.includes('listeler') && !clean.includes('kategori')) {
    return {
      slug: clean,
      episode: 1,
      url: `https://www.tranimeizle.io/${clean}`
    };
  }

  return null;
}

/**
 * Main Scraper Execution Loop
 */
async function run() {
  console.log(`\n======================================================`);
  console.log(`🤖 [Clofthel Scraper] Başlatıldı: ${new Date().toLocaleString('tr-TR')}`);
  console.log(`🎯 Hedef: ${BASE_URL} (Maksimum ${MAX_PAGES} Sayfa)`);
  console.log(`📡 Backend Gateway: ${BACKEND_URL}`);
  console.log(`======================================================\n`);

  const allEpisodes = [];
  const seenUrls = new Set();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const pageUrl = `${BASE_URL}${page}`;
    console.log(`📄 [Sayfa ${page}/${MAX_PAGES}] Taranıyor: ${pageUrl}`);

    try {
      const res = await fetchUrl(pageUrl);

      if (res.status === 403 || res.status === 503) {
        console.warn(`⚠️ [Sayfa ${page}] Cloudflare / 403 engeli tespit edildi. 4 saniye beklenip devam ediliyor...`);
        await new Promise(r => setTimeout(r, 4000));
        continue;
      }

      if (res.status !== 200 || !res.data) {
        console.warn(`⚠️ [Sayfa ${page}] HTTP Durumu: ${res.status}, sayfa atlanıyor.`);
        break;
      }

      const extractedLinks = parseLinks(res.data);
      if (extractedLinks.length === 0) {
        console.log(`ℹ️ [Sayfa ${page}] Yeni link bulunamadı, tarama sonlandırılıyor.`);
        break;
      }

      let pageEpCount = 0;
      for (const rawHref of extractedLinks) {
        const parsedEp = parseEpisode(rawHref);
        if (parsedEp && !seenUrls.has(parsedEp.url)) {
          seenUrls.add(parsedEp.url);
          allEpisodes.push(parsedEp);
          pageEpCount++;
        }
      }

      console.log(`  ✅ ${extractedLinks.length} ham linkten ${pageEpCount} geçerli bölüm ayıklandı (Toplam: ${allEpisodes.length})`);
    } catch (err) {
      console.error(`❌ [Sayfa ${page}] Hata: ${err.message}`);
    }

    // Rate limiting delay between requests
    await new Promise(r => setTimeout(r, 1200));
  }

  console.log(`\n📊 Toplam ${allEpisodes.length} yeni/güncel anime bölümü ayıklandı.`);

  // Post to Backend Bulk Sync Gateway
  if (allEpisodes.length > 0) {
    console.log(`🚀 Backend Gateway'e gönderiliyor (${BACKEND_URL}/api/internal/bulk-episode-sync)...`);
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

  console.log(`\n✨ Scraper işlemi başarıyla tamamlandı. [${new Date().toLocaleString('tr-TR')}]\n`);
}

run().catch(err => {
  console.error('💥 FATAL ERROR:', err);
  process.exit(1);
});
