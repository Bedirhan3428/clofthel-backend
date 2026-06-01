const axios = require('axios');

/**
 * Fast Sibnet ID Resolver
 * Resolves a Sibnet video ID into a fresh, token-authorized direct .mp4 streaming URL in milliseconds.
 * Uses direct GET request and 302 redirect tracking.
 * 
 * NOT: Bu fonksiyon Playwright veya tarayıcı KULLANMAZ. Sadece HTTP GET isteği yapar.
 * Tüm tarayıcı otomasyonu (captcha çözme, kaynak butonları tıklama) istemci tarafında
 * react-native-webview ile gerçekleştirilir.
 */
async function resolveSibnetId(sibnetId) {
  const shellUrl = `https://video.sibnet.ru/shell.php?videoid=${sibnetId}`;
  console.log(`[INFO] Hızlı Sibnet çözücü başlatıldı: ID = ${sibnetId}`);
  
  const res = await axios.get(shellUrl, {
    headers: {
      'Referer': 'https://tranimeizle.io/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    timeout: 6000
  });

  const match = res.data.match(/player\.src\(\s*\[\s*\{\s*src\s*:\s*["']([^"']+)["']/i) ||
                res.data.match(/src\s*:\s*["'](\/v\/[^"']+)["']/i);
                
  if (!match) {
    throw new Error('Sibnet HTML içinden video kaynağı ayıklanamadı.');
  }

  const relativeUrl = match[1];
  const absoluteUrl = `https://video.sibnet.ru${relativeUrl}`;

  try {
    const redirectRes = await axios.get(absoluteUrl, {
      headers: {
        'Referer': shellUrl,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400,
      timeout: 6000
    });

    if (redirectRes.status === 302 || redirectRes.status === 301) {
      let location = redirectRes.headers['location'];
      if (location && location.startsWith('//')) {
        location = 'https:' + location;
      }
      console.log(`[REDIRECT] Hızlı çözücü 302 yönlendirmesi yakaladı. Yeni konum: ${location}`);
      return location;
    }
    return absoluteUrl.startsWith('//') ? 'https:' + absoluteUrl : absoluteUrl;
  } catch (err) {
    if (err.response && (err.response.status === 302 || err.response.status === 301)) {
      let location = err.response.headers['location'];
      if (location && location.startsWith('//')) {
        location = 'https:' + location;
      }
      console.log(`[REDIRECT] Hızlı çözücü 302 yönlendirmesi yakaladı (hata içinden). Yeni konum: ${location}`);
      return location;
    }
    throw err;
  }
}

module.exports = {
  resolveSibnetId
};
