#!/bin/bash
# ============================================
# Clofthel Scraper - Termux Auto Setup
# ============================================
# Kullanım: Bu scripti Termux'ta çalıştır
#   curl -sL https://raw.githubusercontent.com/Bedirhan3428/clofthel-backend/main/scraper-service/termux_setup.sh | bash
# ============================================

echo "🚀 Clofthel Scraper Termux Kurulumu Başlıyor..."

# 1. Gerekli paketleri kur
pkg update -y
pkg install -y nodejs cronie termux-services

# 2. Scraper klasörü oluştur
SCRAPER_DIR="$HOME/clofthel-scraper"
mkdir -p "$SCRAPER_DIR"

# 3. Scraper script'ini oluştur
cat > "$SCRAPER_DIR/scrape.js" << 'SCRIPT_EOF'
const https = require('https');
const http = require('http');

const MONGO_URI = process.env.MONGO_URI;
const MAX_PAGES = 30;
const BASE_URL = 'https://www.tranimeizle.io/listeler/yenibolum/sayfa-';
// Render backend URL - scraper sonuçlarını buraya gönderir
const BACKEND_URL = process.env.BACKEND_URL || 'https://clofthel-backend.onrender.com';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

function fetch(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.7',
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function postJSON(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const postData = JSON.stringify(body);
    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...headers,
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(postData);
    req.end();
  });
}

function parseLinks(html) {
  const links = [];
  const regex = /data-href="([^"]+)"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    links.push(match[1]);
  }
  return links;
}

function parseEpisode(href) {
  const epMatch = href.match(/^\/(.*?)-(\d+)-bolum(?:-izle)?$/i);
  if (epMatch) {
    return { slug: epMatch[1] + '-izle', episode: parseInt(epMatch[2]), url: `https://www.tranimeizle.io${href}` };
  }
  const movieMatch = href.match(/^\/(.*?-izle)$/i);
  if (movieMatch) {
    return { slug: movieMatch[1], episode: 1, url: `https://www.tranimeizle.io${href}` };
  }
  return null;
}

async function run() {
  console.log(`[${new Date().toLocaleString('tr-TR')}] Scraper başlatılıyor...`);
  
  const allEpisodes = [];
  const seen = new Set();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${BASE_URL}${page}`;
    console.log(`[SAYFA ${page}] ${url}`);
    
    try {
      const res = await fetch(url);
      if (res.status === 403) {
        console.log(`[SAYFA ${page}] 403 hatası, atlanıyor...`);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      if (res.status !== 200) {
        console.log(`[SAYFA ${page}] HTTP ${res.status}, durduruluyor.`);
        break;
      }

      const links = parseLinks(res.data);
      if (links.length === 0) {
        console.log(`[SAYFA ${page}] Link bulunamadı, durduruluyor.`);
        break;
      }

      for (const href of links) {
        if (seen.has(href)) continue;
        seen.add(href);
        const ep = parseEpisode(href);
        if (ep) allEpisodes.push(ep);
      }

      console.log(`  → ${links.length} link bulundu (toplam: ${allEpisodes.length})`);
    } catch (err) {
      console.error(`[SAYFA ${page}] Hata: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 1200));
  }

  console.log(`\nToplam ${allEpisodes.length} bölüm bulundu. Backend'e gönderiliyor...`);

  // Backend'e toplu gönder
  if (allEpisodes.length > 0) {
    try {
      const result = await postJSON(`${BACKEND_URL}/api/internal/bulk-episode-sync`, {
        episodes: allEpisodes
      }, {
        'x-internal-api-key': INTERNAL_API_KEY
      });
      console.log('Backend yanıtı:', JSON.stringify(result));
    } catch (err) {
      console.error('Backend gönderim hatası:', err.message);
    }
  }

  console.log(`\n✅ Scraper tamamlandı. ${allEpisodes.length} bölüm işlendi.`);
}

run().catch(err => { console.error('FATAL:', err); process.exit(1); });
SCRIPT_EOF

# 4. .env dosyasını oluştur
cat > "$SCRAPER_DIR/.env" << ENV_EOF
MONGO_URI=mongodb://Bedirhan:IWVAR7SF4sX03iPxm8cAsxLpUcplC2oL@ac-gvpimdi-shard-00-00.ng7xf3i.mongodb.net:27017,ac-gvpimdi-shard-00-01.ng7xf3i.mongodb.net:27017,ac-gvpimdi-shard-00-02.ng7xf3i.mongodb.net:27017/clofthel_db?ssl=true&replicaSet=atlas-4w6yvn-shard-0&authSource=admin&retryWrites=true&w=majority
BACKEND_URL=https://clofthel-backend.onrender.com
INTERNAL_API_KEY=K7x!v9P2#L5q*zR9_tM1\$wF8&jY3@cB6-sX4%dG8_uH2
ENV_EOF

# 5. Runner script oluştur
cat > "$SCRAPER_DIR/run.sh" << 'RUN_EOF'
#!/bin/bash
export $(grep -v '^#' ~/clofthel-scraper/.env | xargs)
node ~/clofthel-scraper/scrape.js >> ~/clofthel-scraper/scraper.log 2>&1
RUN_EOF
chmod +x "$SCRAPER_DIR/run.sh"

# 6. Cron job kur (her 4 saatte bir)
sv-enable crond 2>/dev/null || true
(crontab -l 2>/dev/null | grep -v clofthel-scraper; echo "0 */4 * * * $SCRAPER_DIR/run.sh") | crontab -

echo ""
echo "✅ Kurulum tamamlandı!"
echo ""
echo "📁 Scraper klasörü: $SCRAPER_DIR"
echo "⏰ Cron: Her 4 saatte bir otomatik çalışacak"
echo ""
echo "📌 Manuel çalıştırmak için:"
echo "   bash ~/clofthel-scraper/run.sh"
echo ""
echo "📋 Logları görmek için:"
echo "   cat ~/clofthel-scraper/scraper.log"
echo ""
