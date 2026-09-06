/**
 * Clofthel — Node.js IconCaptcha Solver
 * 
 * Cheerio ile HTML parse edilir, 5 adet ikon görselinin bayt boyutları çekilip
 * karşılaştırılır (4 aynı görsel, 1 farklı görsel tespit edilir).
 * JNI veya parmak simülasyonu yerine, tarayıcının gönderdiği HTTP POST
 * doğrulama isteğini (/api/Captcha/) doğrudan Node.js üzerinden ateşler.
 */
const cheerio = require('cheerio');
const axios = require('axios');

const DEFAULT_BASE_URL = 'https://www.tranimeizle.io';

/**
 * HTML içindeki IconCaptcha'yı parse edip çözer
 * @param {string} html - Captcha içeren form HTML'i
 * @param {string|string[]} cookies - Mevcut oturum çerezleri
 * @param {string} baseUrl - Hedef site URL'i
 * @returns {Promise<{ success: boolean, outlierHash: string, captchaId: string, formHtml?: string, error?: string }>}
 */
async function solveIconCaptchaFromHtml(html, cookies = '', baseUrl = DEFAULT_BASE_URL) {
  try {
    if (!html) throw new Error('HTML içeriği boş.');

    const $ = cheerio.load(html);
    const holder = $('.captcha-holder');
    if (holder.length === 0) {
      return { success: false, error: 'HTML içinde .captcha-holder bulunamadı.' };
    }

    const captchaId = holder.attr('data-captcha-id') || '0';
    const form = holder.closest('form');
    let formAction = form.attr('action') || '#';
    if (formAction && !formAction.startsWith('http') && formAction !== '#') {
      formAction = `${baseUrl}${formAction.startsWith('/') ? '' : '/'}${formAction}`;
    }

    // 1. İkon hashlerini ve resim URL'lerini topla
    const icons = [];
    $('.captcha-image').each((index, el) => {
      const hash = $(el).attr('icon-hash');
      const style = $(el).attr('style') || '';
      const match = style.match(/url\(['"]?([^'"]+?)['"]?\)/i);
      let imgUrl = match ? match[1] : '';

      if (!imgUrl && hash) {
        imgUrl = `${baseUrl}/api/Captcha/?cid=${captchaId}&hash=${hash}`;
      } else if (imgUrl && imgUrl.startsWith('/')) {
        imgUrl = `${baseUrl}${imgUrl}`;
      }

      if (hash) {
        icons.push({ index, hash, imgUrl });
      }
    });

    if (icons.length !== 5) {
      return { 
        success: false, 
        error: `Beklenen 5 ikon yerine ${icons.length} ikon bulundu.` 
      };
    }

    const cookieHeader = Array.isArray(cookies) ? cookies.join('; ') : cookies;

    // 2. 5 görselin verilerini çek ve bayt boyutlarını karşılaştır
    const imageFetches = icons.map(async (item) => {
      try {
        const res = await axios.get(item.imgUrl, {
          responseType: 'arraybuffer',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
            'Referer': baseUrl,
            'Cookie': cookieHeader
          },
          timeout: 8000
        });
        const buf = Buffer.from(res.data);
        return { ...item, byteLength: buf.length, buffer: buf };
      } catch (err) {
        return { ...item, byteLength: 0, buffer: null, error: err.message };
      }
    });

    const results = await Promise.all(imageFetches);

    // 3. Frekans analizi ile tekil (outlier) görseli bul
    const freq = {};
    results.forEach(r => {
      freq[r.byteLength] = (freq[r.byteLength] || 0) + 1;
    });

    let outlier = results.find(r => freq[r.byteLength] === 1);

    // Eğer tüm boyutlar aynıysa, bayt farkı matrisi ile en yüksek farka sahip olanı seç
    if (!outlier) {
      let maxDiff = -1;
      let outlierIndex = 0;
      for (let i = 0; i < results.length; i++) {
        let totalDiff = 0;
        for (let j = 0; j < results.length; j++) {
          if (i !== j && results[i].buffer && results[j].buffer) {
            const len = Math.min(results[i].buffer.length, results[j].buffer.length);
            for (let k = 0; k < len; k += 4) {
              totalDiff += Math.abs(results[i].buffer[k] - results[j].buffer[k]);
            }
          }
        }
        if (totalDiff > maxDiff) {
          maxDiff = totalDiff;
          outlierIndex = i;
        }
      }
      outlier = results[outlierIndex];
    }

    if (!outlier || !outlier.hash) {
      throw new Error('Farklı olan görsel tespit edilemedi.');
    }

    const correctHash = outlier.hash;

    // 4. Doğrulama İsteği (Tıklama Eventinin HTTP Karşılığı)
    // IconCaptcha kütüphanesinin g(b) fonksiyonu bu POST isteğini gönderir
    const validationUrl = `${baseUrl}/api/Captcha/`;
    const verifyPayload = new URLSearchParams();
    verifyPayload.append('cID', captchaId);
    verifyPayload.append('pC', correctHash);
    verifyPayload.append('rT', '2'); // rT: 2 = doğrulama kontrolü

    const verifyRes = await axios.post(validationUrl, verifyPayload.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': baseUrl,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
        'Cookie': cookieHeader
      },
      timeout: 8000
    });

    const newCookies = verifyRes.headers['set-cookie'] || [];
    const combinedCookies = [cookieHeader, ...newCookies].filter(Boolean).join('; ');

    // 5. Eğer form action mevcutsa formu gönder
    let formResponseHtml = null;
    if (formAction && formAction !== '#') {
      const formPayload = new URLSearchParams();
      // Formdaki diğer hidden inputları ekle
      form.find('input[type="hidden"]').each((_, input) => {
        const name = $(input).attr('name');
        const val = $(input).attr('value') || '';
        if (name && name !== 'captcha-hf' && name !== 'captcha-idhf') {
          formPayload.append(name, val);
        }
      });
      formPayload.append('captcha-hf', correctHash);
      formPayload.append('captcha-idhf', captchaId);

      const formRes = await axios.post(formAction, formPayload.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': baseUrl,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
          'Cookie': combinedCookies
        },
        timeout: 10000
      });

      formResponseHtml = formRes.data;
    }

    return {
      success: true,
      outlierHash: correctHash,
      captchaId,
      outlierIndex: outlier.index,
      outlierSize: outlier.byteLength,
      cookies: combinedCookies,
      formResponseHtml
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

module.exports = {
  solveIconCaptchaFromHtml
};
