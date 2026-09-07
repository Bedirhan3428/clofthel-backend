/**
 * Clofthel Challenge Heartbeat & Universal Bot Protection Solver
 * 
 * Specifically designed to run continuously inside React Native WebView via injectJavaScript.
 * Solves:
 * 1. Cloudflare Turnstile & Question Challenge (/_aitr/network-challenge)
 * 2. IconCaptcha v2.5 (Bot Kontrol / /api/CaptchaChallenge)
 * 3. Mobile Touch Unblocker (Fixes IconCaptcha hoverDetection rejecting touchscreen taps)
 * 4. Automatic Byte-Size Outlier Solver
 * 5. Anime Episode Extractor & Navigation Bridge
 */

export const challengeHeartbeatJs = `
(function() {
  try {
    function postMsg(obj) {
      try {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify(obj));
        }
      } catch(e) {}
    }

    function log(msg, type) {
      postMsg({ type: type || 'log', message: msg });
    }

    var href = window.location.href || '';
    var path = window.location.pathname || '';
    var title = document.title || '';

    // =========================================================================
    // 🛡️ BÖLÜM 1: TURNSTILE & QUESTION CHALLENGE (/_aitr/network-challenge)
    // =========================================================================
    var questionImg = document.querySelector('img.question');
    var answerInput = document.querySelector('input[name="answer"], input#answer, input.answer');
    var isTurnstilePage = !!(questionImg || answerInput || path.indexOf('/_aitr/network-challenge') !== -1 || document.querySelector('.cf-turnstile'));

    if (isTurnstilePage) {
      var qText = questionImg ? (questionImg.getAttribute('alt') || '') : '';
      if (!window.__turnstile_pinged) {
        window.__turnstile_pinged = true;
        log('🛡️ Cloudflare Güvenlik Kontrolü: ' + (qText || title || 'Turnstile'), 'warn');
      }

      // Otomatik Soru Cevaplayıcı
      if (answerInput && (!answerInput.value || !answerInput.value.trim())) {
        var fullQ = (qText + ' ' + (document.body ? document.body.innerText : '')).toLowerCase();
        var ans = '';
        if (fullQ.indexOf('yoğun nüfus') !== -1 || fullQ.indexOf('en kalabalık il') !== -1 || fullQ.indexOf('nüfusa sahip') !== -1) ans = 'İstanbul';
        else if (fullQ.indexOf('başkent') !== -1) ans = 'Ankara';
        else if (fullQ.indexOf('yüzölçüm') !== -1 || fullQ.indexOf('en geniş') !== -1) ans = 'Konya';
        else if (fullQ.indexOf('en kalabalık ikinci') !== -1) ans = 'Ankara';
        else if (fullQ.indexOf('en kalabalık üçüncü') !== -1) ans = 'İzmir';
        else if (fullQ.indexOf('34 plaka') !== -1 || fullQ.indexOf('plaka kodu 34') !== -1) ans = 'İstanbul';
        else if (fullQ.indexOf('06 plaka') !== -1 || fullQ.indexOf('plaka kodu 06') !== -1) ans = 'Ankara';
        else if (fullQ.indexOf('35 plaka') !== -1 || fullQ.indexOf('plaka kodu 35') !== -1) ans = 'İzmir';
        else if (fullQ.indexOf('01 plaka') !== -1 || fullQ.indexOf('plaka kodu 01') !== -1) ans = 'Adana';

        if (ans) {
          answerInput.value = ans;
          answerInput.dispatchEvent(new Event('input', { bubbles: true }));
          answerInput.dispatchEvent(new Event('change', { bubbles: true }));
          log('🤖 Güvenlik sorusu otomatik cevaplandı: ' + ans, 'info');
        }
      }

      // Turnstile Token Kontrolü & Form Gönderimi
      var tsResp = document.querySelector('input[name="cf-turnstile-response"]') || document.querySelector('input[id*="cf-chl-widget"]');
      if (tsResp && tsResp.value && (!answerInput || answerInput.value.trim())) {
        if (!window.__turnstile_submitted) {
          window.__turnstile_submitted = true;
          log('✅ Turnstile onaylandı! Form otomatik gönderiliyor...', 'success');
          var btn = document.querySelector('button[type="submit"]') || document.querySelector('form button');
          if (btn) {
            setTimeout(function() { btn.click(); }, 300);
          }
        }
      }
      return;
    }

    // =========================================================================
    // 🧩 BÖLÜM 2: ICONCAPTCHA v2.5 (Bot Kontrol / /api/CaptchaChallenge)
    // =========================================================================
    var holder = document.querySelector('.captcha-holder');
    var isIconCaptchaPage = !!(holder || path.indexOf('/api/CaptchaChallenge') !== -1 || title.indexOf('Bot Kontrol') !== -1);

    if (isIconCaptchaPage) {
      // 1. DOKUNMATİK EKRAN KİLİDİNİ KALDIRMA:
      // IconCaptcha 'hoverDetection: true' sebebiyle touch ekranlarda 'q = false' kalır ve dokunuşları yutar.
      // Her kalp atışında 'mouseenter' tetikleyerek q = true olmasını sağlıyoruz!
      if (holder) {
        try {
          holder.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
          if (window.jQuery) window.jQuery(holder).trigger('mouseenter');
        } catch(e) {}
      }

      // 2. IconCaptcha'nın opacity ve loader engelini kaldırma
      var iconsCont = holder ? holder.querySelector('.captcha-modal__icons') : document.querySelector('.captcha-modal__icons');
      if (iconsCont) {
        iconsCont.classList.remove('captcha-opacity');
        var ldr = iconsCont.querySelector('.captcha-loader');
        if (ldr) ldr.remove();
      }
      if (window.jQuery && iconsCont) {
        window.jQuery(iconsCont).removeClass('captcha-opacity');
        window.jQuery(iconsCont).find('.captcha-loader').remove();
      }

      // 3. Kullanıcı Elle Dokunursa Anında API Onayı Gönderen Dinleyici (Capturing Touch Hook)
      if (!window.__manual_touch_hooked) {
        window.__manual_touch_hooked = true;
        function onManualTap(ev) {
          var target = ev.target;
          var imgEl = (target && target.classList && target.classList.contains('captcha-image')) ? target : (target && target.closest ? target.closest('.captcha-image') : null);
          if (imgEl) {
            var h = holder || imgEl.closest('.captcha-holder');
            if (h) {
              try {
                h.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
                if (window.jQuery) window.jQuery(h).trigger('mouseenter');
              } catch(e) {}
            }
            var hash = imgEl.getAttribute('icon-hash');
            var cid = h ? (h.getAttribute('data-captcha-id') || '0') : '0';
            if (hash) {
              log('👆 Kullanıcı görsele dokundu! Hash: ' + hash.substring(0, 8) + '... Doğrulanıyor...', 'info');
              submitCaptchaDirect(hash, cid);
            }
          }
        }
        document.addEventListener('touchstart', onManualTap, true);
        document.addEventListener('pointerdown', onManualTap, true);
        document.addEventListener('click', onManualTap, true);
      }

      // 4. Görsellerin yüklenme durumunu kontrol et
      var imgs = Array.from(document.querySelectorAll('.captcha-image'));
      var validImgs = imgs.filter(function(im) {
        var h = im.getAttribute('icon-hash');
        return h && h.length > 5;
      });

      if (validImgs.length < 5) {
        var nowTime = Date.now();
        if (!window.__last_waiting_log || (nowTime - window.__last_waiting_log > 3500)) {
          window.__last_waiting_log = nowTime;
          log('⏳ Bot Kontrolü: 5 ikonun yüklenmesi bekleniyor (' + validImgs.length + '/5)...', 'info');
        }
        return;
      }

      // 5. 5 GÖRSEL HAZIR: OTOMATİK BOYUT ANALİZİ & ÇÖZÜM
      if (!window.__icon_solving_now && !window.__captcha_solved_success) {
        window.__icon_solving_now = true;
        var cid = holder ? (holder.getAttribute('data-captcha-id') || '0') : '0';
        log('🛡️ 5 görsel hazır! Farklı olan görsel analiz ediliyor...', 'info');

        var iconItems = validImgs.map(function(el, idx) {
          var hash = el.getAttribute('icon-hash') || '';
          var bg = el.style.backgroundImage || window.getComputedStyle(el).backgroundImage || '';
          var src = '';
          if (bg && bg.indexOf('url(') !== -1) {
            src = bg.split('url(')[1].split(')')[0].replace(/['"]/g, '').trim();
          }
          if (!src && hash) {
            src = '/api/Captcha/?cid=' + cid + '&hash=' + hash;
          }
          if (src && src.indexOf('http') !== 0) {
            src = window.location.origin + (src.indexOf('/') === 0 ? '' : '/') + src;
          }
          return { element: el, hash: hash, src: src, index: idx };
        });

        Promise.all(iconItems.map(function(item) {
          return fetch(item.src, { credentials: 'include', cache: 'force-cache' })
            .then(function(r) { return r.arrayBuffer(); })
            .then(function(buf) {
              return { element: item.element, hash: item.hash, size: buf.byteLength, buffer: new Uint8Array(buf), index: item.index };
            })
            .catch(function(e) {
              return { element: item.element, hash: item.hash, size: 0, buffer: null, index: item.index };
            });
        })).then(function(results) {
          log('📊 Boyutlar: ' + results.map(function(r) { return '#' + (r.index + 1) + ': ' + r.size + 'B'; }).join(' | '), 'info');

          // Frekans Analizi (Tekil olanı bul)
          var sizeFreq = {};
          results.forEach(function(r) { if (r.size > 0) sizeFreq[r.size] = (sizeFreq[r.size] || 0) + 1; });
          var outlier = results.find(function(r) { return r.size > 0 && sizeFreq[r.size] === 1; });

          // Bayt Fark Matrisi (Eğer boyutlar eşitse piksel/bayt farkından bul)
          if (!outlier && results.some(function(r) { return r.buffer; })) {
            var maxDiff = -1;
            var outlierIdx = 0;
            for (var i = 0; i < results.length; i++) {
              var totalDiff = 0;
              for (var j = 0; j < results.length; j++) {
                if (i !== j && results[i].buffer && results[j].buffer) {
                  var len = Math.min(results[i].buffer.length, results[j].buffer.length);
                  for (var k = 0; k < len; k += 8) {
                    totalDiff += Math.abs(results[i].buffer[k] - results[j].buffer[k]);
                  }
                }
              }
              if (totalDiff > maxDiff) { maxDiff = totalDiff; outlierIdx = i; }
            }
            outlier = results[outlierIdx];
            log('🔬 Bayt fark matrisi ile farklı görsel bulundu: #' + (outlierIdx + 1), 'info');
          }

          if (!outlier) outlier = results[0];

          log('🎯 Farklı olan seçildi: #' + (outlier.index + 1) + ' (Hash: ' + (outlier.hash ? outlier.hash.substring(0, 8) : '') + '...)', 'success');

          // 1. Doğrudan HTTP API İle Doğrula
          submitCaptchaDirect(outlier.hash, cid);

          // 2. jQuery & DOM Tıklamasını Simüle Et
          if (holder) {
            try {
              holder.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
              if (window.jQuery) window.jQuery(holder).trigger('mouseenter');
            } catch(e) {}
          }
          if (window.jQuery) {
            try {
              var $el = window.jQuery(outlier.element);
              var off = $el.offset() || { left: 10, top: 10 };
              var fakeEv = window.jQuery.Event('click', {
                target: outlier.element,
                pageX: off.left + 22,
                pageY: off.top + 22,
                which: 1,
                bubbles: true
              });
              $el.trigger(fakeEv);
            } catch(jqErr) {}
          }
          try {
            outlier.element.click();
          } catch(cErr) {}

          // 5 saniye sonra hala geçilmediyse tekrar denenebilsin
          setTimeout(function() {
            if (!window.__captcha_solved_success) {
              window.__icon_solving_now = false;
            }
          }, 5000);

        }).catch(function(err) {
          log('Görsel analiz hatası: ' + err.message, 'error');
          window.__icon_solving_now = false;
        });
      }
      return;
    }

    // =========================================================================
    // ⚡ DOĞRUDAN API İLE CAPTCHA GÖNDERİCİ
    // =========================================================================
    function submitCaptchaDirect(hash, cid) {
      if (window.__captcha_solved_success) return;
      cid = cid || '0';
      var validationUrl = '/api/Captcha/';
      var fd = new URLSearchParams();
      fd.append('cID', cid);
      fd.append('pC', hash);
      fd.append('rT', '2');

      fetch(validationUrl, {
        method: 'POST',
        body: fd,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }).then(function(res) {
        log('📡 Doğrulama API yanıtı: HTTP ' + res.status, res.ok ? 'success' : 'warn');
        if (res.ok || res.status === 200) {
          window.__captcha_solved_success = true;
          log('🎉 Bot koruması BAŞARIYLA GEÇİLDİ! Yönlendiriliyor...', 'success');

          var h = document.querySelector('.captcha-holder');
          if (h) {
            h.classList.add('captcha-success');
            if (window.jQuery) {
              try {
                window.jQuery(h).trigger('success', [{ captcha_id: cid }]);
                window.jQuery(h).trigger('success.iconCaptcha', [cid]);
              } catch(e) {}
            }
          }

          // Hedef Anime Sayfası URL'sini Belirle
          var targetDest = '';
          if (path.indexOf('/api/CaptchaChallenge/') !== -1) {
            try {
              targetDest = decodeURIComponent(path.replace('/api/CaptchaChallenge/', ''));
            } catch(e) {
              targetDest = path.replace('/api/CaptchaChallenge/', '');
            }
          }
          if (targetDest) {
            if (targetDest.indexOf('/') !== 0 && targetDest.indexOf('http') !== 0) {
              targetDest = '/' + targetDest;
            }
            log('🚀 Anime sayfasına gidiliyor: ' + targetDest, 'info');
            setTimeout(function() {
              window.location.replace(targetDest);
            }, 400);
          }
        }
      }).catch(function(err) {
        log('Doğrulama istek hatası: ' + err.message, 'error');
      });
    }

    // =========================================================================
    // 📺 BÖLÜM 3: ANİME DETAY SAYFASI & BÖLÜM ÇIKARICI
    // =========================================================================
    if (path.indexOf('/anime/') !== -1 || path.indexOf('-izle') !== -1) {
      var items = document.querySelectorAll('.animeDetail-items li, .animeDetail-items .episode-li, .animeDetail-items a[href*="-bolum"], .episode-li, div[class*="animeDetail"] li, a[href*="-bolum-izle"], a[href*="-bolum"]');
      var eps = [];
      var seen = {};

      for (var i = 0; i < items.length; i++) {
        var el = items[i];
        var a = el.tagName === 'A' ? el : el.querySelector('a');
        if (!a && el.closest) a = el.closest('a');
        if (!a) continue;

        var rawHref = a.getAttribute('href') || '';
        var fullHref = a.href || rawHref;
        if (!fullHref || seen[fullHref] || fullHref.indexOf('/kategori') !== -1 || fullHref.indexOf('/arama') !== -1) continue;
        if (fullHref.indexOf('-bolum') === -1 && fullHref.indexOf('/bolum/') === -1 && fullHref.indexOf('bolum') === -1) continue;
        seen[fullHref] = true;

        var titleEl = el.querySelector('.etitle span, .etitle, h4, span') || a.querySelector('.etitle span, .etitle, h4, span');
        var imgEl = el.querySelector('.imgContainer img, img.thumb, img') || a.querySelector('.imgContainer img, img.thumb, img');
        var dateEl = el.querySelector('.etitle small.author, small.author, .author, small') || a.querySelector('.etitle small.author, small.author, .author, small');

        var epTitle = titleEl ? (titleEl.textContent || '').trim() : (a.textContent || '').trim();
        var epThumb = imgEl ? (imgEl.getAttribute('src') || imgEl.src || '') : '';
        var epDate = dateEl ? (dateEl.textContent || '').replace(/\\s+/g, ' ').trim() : '';

        // Geçersiz başlıkları temizle
        if (epTitle.length < 2 || /^[.\\s]+$/.test(epTitle)) {
          epTitle = '';
        }

        var epMatch = fullHref.match(/[-_](\\d+)[-_]bolum/i) ||
                      fullHref.match(/bolum[-_](\\d+)/i) ||
                      epTitle.match(/(\\d+)\\.\\s*Bölüm/i) ||
                      epTitle.match(/Bölüm\\s*(\\d+)/i);
        var epNum = epMatch ? parseInt(epMatch[1], 10) : (eps.length + 1);

        if (!epMatch && !epTitle) continue;

        eps.push({
          number: epNum,
          title: epTitle || (epNum + '. Bölüm'),
          url: fullHref,
          thumbnail: epThumb,
          release_date: epDate
        });
      }

      if (eps.length > 0 && !window.__episodes_sent) {
        window.__episodes_sent = true;
        eps.sort(function(x, y) { return x.number - y.number; });
        log('🎉 Sayfadan ' + eps.length + ' adet bölüm başarıyla çıkarıldı!', 'success');
        postMsg({
          type: 'episodes_extracted',
          episodes: eps,
          count: eps.length,
          url: href
        });
      }
    }

  } catch(outerErr) {
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'log',
          message: 'Heartbeat Hatası: ' + outerErr.message
        }));
      }
    } catch(e) {}
  }
})();
true;
`;
