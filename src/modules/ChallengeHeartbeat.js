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

    function normText(s) {
      return (s || '')
        .replace(/İ/g, 'i').replace(/I/g, 'i')
        .toLowerCase()
        .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
        .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\\s+/g, ' ')
        .trim();
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
    // 🔍 BÖLÜM 2.5: 404 KONTROLÜ & ARAMA SAYFASI ADAY ÇIKARICI
    // =========================================================================
    var pageTitle = (document.title || '').toLowerCase();
    var bodyText = document.body ? (document.body.innerText || '').substring(0, 500).toLowerCase() : '';
    var is404 = (pageTitle.indexOf('sayfa bulunamad') !== -1 || pageTitle.indexOf('not found') !== -1 || pageTitle.indexOf('404') !== -1 ||
                 bodyText.indexOf('sayfa bulunamad') !== -1 || bodyText.indexOf('aradığınız sayfa') !== -1);

    if (is404 && path.indexOf('/arama') === -1 && !window.__404_redirected) {
      window.__404_redirected = true;
      var q = window.__TARGET_TITLE || '';
      if (q) {
        log('⚠️ [404] Sayfa bulunamadı! Arama sayfasına yönlendiriliyor: ' + q, 'warn');
        window.location.replace(window.location.origin + '/arama/' + encodeURIComponent(q));
        return;
      }
    }

    // Arama Sayfası (/arama/... veya ?q=...)
    if (path.indexOf('/arama') !== -1 || href.indexOf('/arama') !== -1) {
      var allCards = document.querySelectorAll(
        '.flx-block[data-href], .flx-block a, a[href*="/anime/"], .anime-card, .anime-card a, ' +
        '.video-block a, .film-item a, .movie-item a, .search-result a, a[href$="-izle"], a[href*="-izle-"]'
      );
      if (!allCards || allCards.length === 0) {
        allCards = document.querySelectorAll('a[href]');
      }

      var candidates = [];
      var seenCandUrls = {};

      for (var ci = 0; ci < allCards.length; ci++) {
        var cEl = allCards[ci];
        var rawUrl = cEl.getAttribute('data-href') || cEl.getAttribute('href') || '';
        if (!rawUrl || rawUrl.indexOf('#') === 0 || rawUrl.indexOf('javascript:') === 0) continue;
        if (rawUrl.indexOf('/arama') !== -1 || rawUrl.indexOf('/kategori') !== -1 || rawUrl === '/') continue;
        if (rawUrl.indexOf('/iletisim') !== -1 || rawUrl.indexOf('/dmca') !== -1 || rawUrl.indexOf('/login') !== -1 || rawUrl.indexOf('/kayit') !== -1) continue;
        if (rawUrl.indexOf('-bolum') !== -1 || rawUrl.indexOf('/bolum/') !== -1) continue;

        var fullUrl = rawUrl.indexOf('http') === 0 ? rawUrl : (window.location.origin || 'https://www.tranimeizle.io') + (rawUrl.indexOf('/') === 0 ? '' : '/') + rawUrl;
        if (seenCandUrls[fullUrl]) continue;
        seenCandUrls[fullUrl] = true;

        var titleNode = cEl.querySelector('h1, h2, h3, h4, .title, p.title, .etitle, span.title');
        if (!titleNode && cEl.closest) {
          var cardParent = cEl.closest('.flx-block, .film-item, .video-block, .anime-card, .movie-item, .search-result');
          if (cardParent) {
            titleNode = cardParent.querySelector('h1, h2, h3, h4, .title, p.title, .etitle, span.title');
          }
        }
        var candTitle = titleNode ? (titleNode.textContent || '').trim() : '';
        if (!candTitle || candTitle.length < 2) {
          var imgAlt = cEl.querySelector('img') ? (cEl.querySelector('img').getAttribute('alt') || '') : '';
          candTitle = (cEl.getAttribute('title') || imgAlt || cEl.textContent || '').trim();
        }
        var lines = candTitle.split('\\n').map(function(s) { return s.trim(); }).filter(function(s) {
          return s.length >= 2 && !/^(tv|film|movie|ova|ona|sp|bitti|devam ediyor)$/i.test(s);
        });
        candTitle = lines[0] || candTitle;
        if (!candTitle || candTitle.length < 2) continue;

        var candLower = normText(candTitle + ' ' + fullUrl);

        // Explicit Special / OVA markers that ALWAYS qualify as SPECIAL
        var isExplicitSpecial = (
          /\\bozel\\s*bolum\\b/i.test(candLower) ||
          /\\bspecial\\s*episode\\b/i.test(candLower) ||
          /\\b(?:ova|oad|ona)\\b/i.test(candLower) ||
          /[-_](?:ova|oad|ona|recap|offline|chibi|omake)[-_]/i.test(candLower) ||
          candLower.indexOf('offline') !== -1 ||
          candLower.indexOf('omake') !== -1 ||
          candLower.indexOf('chibi') !== -1 ||
          candLower.indexOf('picture drama') !== -1 ||
          candLower.indexOf('audio drama') !== -1 ||
          candLower.indexOf('drama cd') !== -1 ||
          candLower.indexOf('recap') !== -1 ||
          candLower.indexOf('ozet') !== -1 ||
          candLower.indexOf('soushuuhen') !== -1 ||
          candLower.indexOf('parody') !== -1 ||
          candLower.indexOf('parodi') !== -1 ||
          candLower.indexOf('extra edition') !== -1
        );

        // If candidate has an explicit season marker, it is a regular TV season, not a special
        var hasExplicitSeason = /\\b(\\d+)\\s*\\.?\\s*(?:st|nd|rd|th)?\\s*(?:sezon|season)\\b/i.test(candLower) ||
                                /\\b(?:season|sezon)\\s*\\d+\\b/i.test(candLower) ||
                                /\\bs\\d{1,2}\\b/i.test(candLower);

        var isSpecialContextOnly = /\\bozel\\s*(?:sinav|ders|guc|kuvvet|harekat|tim|operasyon)\\b/i.test(candLower) ||
                                   /\\bspecial\\s*(?:exam|ops|operations|forces|force|power|powers|lesson|class|assignment)\\b/i.test(candLower);

        var isSpecialCand = false;
        if (isExplicitSpecial) {
          isSpecialCand = true;
        } else if (hasExplicitSeason) {
          isSpecialCand = false;
        } else if (!isSpecialContextOnly) {
          isSpecialCand = (
            candLower.indexOf('special') !== -1 ||
            candLower.indexOf('specials') !== -1 ||
            candLower.indexOf('ozel') !== -1 ||
            candLower.indexOf('side story') !== -1 ||
            candLower.indexOf('tokubetsu') !== -1 ||
            candLower.indexOf('petit') !== -1 ||
            candLower.indexOf('puchi') !== -1 ||
            candLower.indexOf('bonus') !== -1 ||
            candLower.indexOf('extras') !== -1 ||
            candLower.indexOf('short anime') !== -1 ||
            candLower.indexOf('kisa anime') !== -1 ||
            /\\bsp\\b/i.test(candLower) ||
            /[-_](?:sp|special|ozel)[-_]/i.test(candLower)
          );
        }

        candidates.push({
          url: fullUrl,
          title: candTitle,
          element: cEl,
          isSpecial: isSpecialCand
        });
      }

      if (candidates.length > 0) {
        var targetFormat = window.__TARGET_FORMAT || 'TV';
        var nonSpecials = candidates.filter(function(c) { return !c.isSpecial; });
        var pool = (targetFormat === 'TV' || targetFormat === 'MOVIE')
          ? (nonSpecials.length > 0 ? nonSpecials : [])
          : (nonSpecials.length > 0 ? nonSpecials : candidates);

        var targetSeason = window.__TARGET_SEASON || 1;
        var targetPart = window.__TARGET_PART || 1;
        var targetIsFinal = Boolean(window.__TARGET_IS_FINAL || (window.__TARGET_SEASON_TITLE && window.__TARGET_SEASON_TITLE.toLowerCase().indexOf('final') !== -1) || (window.__TARGET_TITLE && window.__TARGET_TITLE.toLowerCase().indexOf('final') !== -1));
        var targetFormat = window.__TARGET_FORMAT || 'TV';
        var franchiseTitle = (window.__TARGET_TITLE || '').toLowerCase();
        var targetSeasonTitle = (window.__TARGET_SEASON_TITLE || '').toLowerCase();
        var targetSynonyms = Array.isArray(window.__TARGET_SYNONYMS) ? window.__TARGET_SYNONYMS : [];

        var franNorm = normText(franchiseTitle);

        // 1. Collect all base franchise tokens from all title variants (English, Romaji, etc.)
        var baseFranchiseTokenSet = {};
        var baseTitleVariants = [
          window.__TARGET_TITLE,
          window.__TARGET_TITLE_ROMAJI,
          window.__TARGET_TITLE_EN
        ].filter(Boolean);

        for (var bvi = 0; bvi < baseTitleVariants.length; bvi++) {
          var bNorm = normText(baseTitleVariants[bvi]);
          var bParts = bNorm.split(' ');
          for (var bpi = 0; bpi < bParts.length; bpi++) {
            var bt = bParts[bpi];
            if (bt.length > 1) {
              baseFranchiseTokenSet[bt] = true;
            }
          }
        }

        // Multi-Language franchise token pools (Romaji, English, Synonyms)
        var allTitleVariants = [
          window.__TARGET_TITLE,
          window.__TARGET_SEASON_TITLE,
          window.__TARGET_TITLE_ROMAJI,
          window.__TARGET_TITLE_EN
        ].concat(targetSynonyms).filter(Boolean);

        var allFranTokenLists = [];
        for (var vi = 0; vi < allTitleVariants.length; vi++) {
          var vNorm = normText(allTitleVariants[vi]);
          var vTokens = vNorm.split(' ').filter(function(t) { return t.length >= 3; });
          if (vTokens.length > 0) {
            allFranTokenLists.push(vTokens);
          }
        }

        // AniList target title variants for similarity ranking
        var normTargetVariants = allTitleVariants.map(function(v) { return normText(v); }).filter(Boolean);

        function extractSeasonNumber(title, url, tgtSeason, tgtIsFinal) {
          var full = normText((title || '') + ' ' + (url || ''));

          // Classroom of the Elite franchise handling: "2-nensei" / "2. Sınıf" / "2nd Year" is Season 4!
          if (/youkoso|classroom\\s*of\\s*the\\s*elite/i.test(full) || /youkoso|classroom\\s*of\\s*the\\s*elite/i.test(normTargetVariants.join(' '))) {
            if (/4th\\s*season|4\\s*sezon|\\bseason\\s*4\\b|\\bsezon\\s*4\\b/i.test(full)) return 4;
            if (/2\\s*nensei|2\\s*sinif|2nd\\s*year|second\\s*year/i.test(full)) return 4;
            if (/3rd\\s*season|3\\s*sezon|\\bseason\\s*3\\b|\\bsezon\\s*3\\b/i.test(full)) return 3;
            if (/2nd\\s*season|2\\s*sezon|\\bseason\\s*2\\b|\\bsezon\\s*2\\b/i.test(full)) return 2;
            if (/1st\\s*season|1\\s*sezon|\\bseason\\s*1\\b|\\bsezon\\s*1\\b/i.test(full)) return 1;
          }

          // 1. Explicit prefix season markers
          var mPref = full.match(/\\b(\\d+)(?:st|nd|rd|th)?\\s*(?:sezon|season)\\b/) || full.match(/\\bs(\\d{1,2})\\b/);
          if (mPref) return parseInt(mPref[1], 10);

          // 2. Explicit suffix season markers
          var mSuff = full.match(/\\b(?:season|sezon)\\s*(\\d+)(?!\\s*(?:sinif|nensei|grade|year|part|cour|kisim|gakki))\\b/);
          if (mSuff) return parseInt(mSuff[1], 10);

          // 3. Ordinals and Roman Numerals
          var notFollowedBySubUnit = '(?!\\\\s*(?:part|cour|kisim|sinif|nensei|grade|year|semester|gakki|stage|round|half))';

          if (new RegExp('\\\\b(?:x|10th)\\\\b' + notFollowedBySubUnit, 'i').test(full)) return 10;
          if (new RegExp('\\\\b(?:ix|9th)\\\\b' + notFollowedBySubUnit, 'i').test(full)) return 9;
          if (new RegExp('\\\\b(?:viii|8th)\\\\b' + notFollowedBySubUnit, 'i').test(full)) return 8;
          if (new RegExp('\\\\b(?:vii|7th)\\\\b' + notFollowedBySubUnit, 'i').test(full)) return 7;
          if (new RegExp('\\\\b(?:vi|6th)\\\\b' + notFollowedBySubUnit, 'i').test(full)) return 6;
          if (new RegExp('\\\\b(?:v|5th)\\\\b' + notFollowedBySubUnit, 'i').test(full)) return 5;
          if (new RegExp('\\\\b(?:iv|4th)\\\\b' + notFollowedBySubUnit, 'i').test(full)) return 4;
          if (new RegExp('\\\\b(?:iii|3rd)\\\\b' + notFollowedBySubUnit, 'i').test(full)) return 3;
          if (new RegExp('\\\\b(?:ii|2nd)\\\\b' + notFollowedBySubUnit, 'i').test(full)) return 2;

          if (tgtIsFinal && (full.indexOf('final season') !== -1 || full.indexOf('the final') !== -1 || full.indexOf('final sezon') !== -1 || full.indexOf('son sezon') !== -1)) {
            return tgtSeason;
          }
          return 1;
        }

        function extractPartNumber(title, url) {
          var full = normText((title || '') + ' ' + (url || ''));
          if (full.indexOf('kanketsu hen') !== -1 || full.indexOf('final chapters') !== -1) return 3;
          if (/\\b(?:2nd|second)\\s*(?:part|cour|kisim)\\b/.test(full)) return 2;
          if (/\\b(?:3rd|third)\\s*(?:part|cour|kisim)\\b/.test(full)) return 3;
          if (/\\b(?:4th|fourth)\\s*(?:part|cour|kisim)\\b/.test(full)) return 4;
          var m = full.match(/\\b(?:part|cour|kisim)\\s*(\\d+)\\b/) || full.match(/\\b(\\d+)\\s*(?:kisim|part|cour)\\b/);
          if (m) return parseInt(m[1], 10);
          return 1;
        }

        function calcCandSimilarity(candText, targetVariants) {
          var candTokens = candText.split(' ').filter(function(w) { return w.length >= 2; });
          var bestSim = 0;
          for (var ti = 0; ti < targetVariants.length; ti++) {
            var tgt = targetVariants[ti];
            var tgtTokens = tgt.split(' ').filter(function(w) { return w.length >= 2; });
            if (tgtTokens.length === 0) continue;
            var overlap = 0;
            var usedTokens = {};
            for (var oi = 0; oi < candTokens.length; oi++) {
              var ct = candTokens[oi];
              if (tgtTokens.indexOf(ct) !== -1 && !usedTokens[ct]) {
                usedTokens[ct] = true;
                overlap++;
              }
            }
            var f1 = (candTokens.length + tgtTokens.length > 0) ? (2 * overlap) / (candTokens.length + tgtTokens.length) : 0;
            var subBonus = 0;
            if (candText === tgt) {
              subBonus += 0.8; // Exact title match massive bonus
            } else if (candText.indexOf(tgt) !== -1 || tgt.indexOf(candText) !== -1) {
              subBonus += 0.3;
            }
            var extraPenalty = (candTokens.length > tgtTokens.length) ? (candTokens.length - tgtTokens.length) * 0.05 : 0;
            var sim = f1 + subBonus - extraPenalty;
            if (sim > bestSim) bestSim = sim;
          }
          return bestSim;
        }

        var chosenCand = null;
        var bestScore = -999999;

        for (var si = 0; si < pool.length; si++) {
          var cand = pool[si];
          var candTitleNorm = normText(cand.title);
          var candUrlNorm = normText(cand.url);
          var candFull = candTitleNorm + ' ' + candUrlNorm;

          // 1. Format filter
          if (cand.isSpecial) continue;
          var isMovieCand = (candFull.indexOf('film') !== -1 || candFull.indexOf('movie') !== -1 || candFull.indexOf('tek parca') !== -1 || candFull.indexOf('sinema') !== -1);
          var hasExplicitOtherSeasonInCand = /(\d+)\s*\.?\s*(?:sezon|season)/i.test(candFull) ||
                                            /(?:sezon|season)\s*(\d+)/i.test(candFull) ||
                                            /\b(?:2nd|3rd|4th|5th|6th|7th|8th)\s*season\b/i.test(candFull);

          if (targetFormat === 'TV' && isMovieCand) continue;
          if (targetFormat === 'MOVIE' && hasExplicitOtherSeasonInCand) continue;

          // 2. Multi-Language Franchise title check
          if (allFranTokenLists.length > 0) {
            var hasFran = false;
            for (var fti = 0; fti < allFranTokenLists.length; fti++) {
              var tokens = allFranTokenLists[fti];
              if (tokens.some(function(t) { return candTitleNorm.indexOf(t) !== -1 || candUrlNorm.indexOf(t) !== -1; })) {
                hasFran = true;
                break;
              }
            }
            if (!hasFran) continue;
          }

          // 3. ZERO-TOLERANCE SEASON & PART FILTER
          var cSeason = extractSeasonNumber(cand.title, cand.url, targetSeason, targetIsFinal);
          if (targetFormat === 'TV') {
            if (cSeason !== targetSeason) {
              continue; // STRICT ZERO TOLERANCE: Any other season is completely disqualified!
            }

            var cPart = extractPartNumber(cand.title, cand.url);
            if (targetPart > 1 && cPart !== targetPart) {
              continue; // STRICT ZERO TOLERANCE: Target is Part 2+, candidate is not!
            }
            if (targetPart === 1 && cPart > 1) {
              continue; // STRICT ZERO TOLERANCE: Target is Part 1, candidate is Part 2+!
            }
          }

          // 4. AniList Similarity Ranking + Final Season Bonus
          var isCandFinal = (candFull.indexOf('final') !== -1);
          var finalBonus = 0;
          if (targetIsFinal && isCandFinal) finalBonus = 500;
          else if (!targetIsFinal && isCandFinal) finalBonus = -300;

          var simScore = calcCandSimilarity(candTitleNorm, normTargetVariants);
          var currentCandScore = 2500 + Math.round(simScore * 1000) + finalBonus;

          if (currentCandScore > bestScore) {
            bestScore = currentCandScore;
            chosenCand = cand;
          }
        }

        // Otomatik İkinci Arama (Eğer Sezon/Kısım kartı genel aramada çıkmadıysa doğrudan hedefe özel arama yap)
        if (!chosenCand && (targetSeason > 1 || targetPart > 1 || targetIsFinal) && !window.__has_retried_season_search) {
          window.__has_retried_season_search = true;
          var retryBaseTitle = window.__TARGET_TITLE || window.__TARGET_TITLE_ROMAJI || window.__TARGET_TITLE_EN || '';
          var retryQuery = '';
          if (targetIsFinal && targetPart > 1) {
            retryQuery = retryBaseTitle + ' Final Sezon ' + targetPart + '. Kısım';
          } else if (targetPart > 1) {
            retryQuery = retryBaseTitle + ' ' + targetSeason + '. Sezon ' + targetPart + '. Kısım';
          } else if (targetIsFinal) {
            retryQuery = retryBaseTitle + ' Final Sezon';
          } else {
            retryQuery = retryBaseTitle + ' ' + targetSeason + '. Sezon';
          }
          log('🔄 [ARAMA YENİLENİYOR] Hedef sezon/kısım ilk sayfada çıkmadı, doğrudan aranıyor: ' + retryQuery, 'info');
          try {
            var origin = window.location.origin || 'https://www.tranimeizle.io';
            var retryUrl = origin + '/arama/' + encodeURIComponent(retryQuery);
            window.location.replace(retryUrl);
            return;
          } catch(e) {}
        }

        var nowSearchTime = Date.now();
        if (!window.__last_candidates_sent || (nowSearchTime - window.__last_candidates_sent > 2500)) {
          window.__last_candidates_sent = nowSearchTime;
          if (chosenCand) {
            log('🔍 Arama sayfasında ' + pool.length + ' aday arasından Sezon ' + targetSeason + (targetPart > 1 ? ' (' + targetPart + '. Kısım)' : '') + ' için "' + chosenCand.title + '" seçildi!', 'info');
          } else {
            log('⚠️ Arama sayfasında ' + pool.length + ' aday bulundu ancak Sezon ' + targetSeason + ' ile tam eşleşen aday yok!', 'warn');
          }
          postMsg({
            type: 'candidates_extracted',
            candidates: pool.map(function(c) { return { url: c.url, title: c.title }; }),
            chosen: chosenCand ? { url: chosenCand.url, title: chosenCand.title } : null,
            targetSeason: targetSeason,
            targetPart: targetPart
          });
        }

        // DOĞRUDAN ANİME DETAY SAYFASINA GİT (YALNIZCA VE YALNIZCA DOĞRU SEZON BULUNDUYSA!)
        if (chosenCand) {
          var nowNav = Date.now();
          if (!window.__last_candidate_nav_time || (nowNav - window.__last_candidate_nav_time > 2000)) {
            window.__last_candidate_nav_time = nowNav;
            log('🎯 [OTOMATİK SEÇİM] Doğru Sezon ' + targetSeason + ' sayfasına gidiliyor: ' + chosenCand.title + ' ➔ ' + chosenCand.url, 'success');
            if (chosenCand.element) {
              try {
                chosenCand.element.click();
                var innerA = chosenCand.element.tagName === 'A' ? chosenCand.element : chosenCand.element.querySelector('a');
                if (innerA) innerA.click();
              } catch(e) {}
            }
            try {
              window.location.replace(chosenCand.url);
            } catch(e) {
              window.location.href = chosenCand.url;
            }
          }
        }
      }
      return;
    }

    // =========================================================================
    // 📺 BÖLÜM 3: ANİME DETAY SAYFASI & ÇOKLU SAYFALAMA / BÖLÜM ÇIKARICI
    // =========================================================================
    var isAnimeDetailPage = (
      path.indexOf('/anime/') !== -1 ||
      path.indexOf('-izle') !== -1 ||
      !!document.querySelector('.animeDetail-items, .episode-li, .playlist-title, #episodes, .flx-block[data-href*="bolum"], a[href*="-bolum"]')
    );

    if (isAnimeDetailPage && path.indexOf('/arama') === -1) {
      window.__all_extracted_episodes = window.__all_extracted_episodes || {};
      var targetFormat = window.__TARGET_FORMAT || 'TV';

      // 1. DOM Üzerindeki Görünür Bölümleri Çıkar (.animeDetail-items, .episode-li, li.episodeBtn)
      var items = document.querySelectorAll(
        '.animeDetail-items li, .episode-li, li.episodeBtn, li[data-slug], ' +
        '.flx-block[data-href], .flx-block a, a[href*="-bolum"], a[href*="/bolum/"], ' +
        '.episodes li, .episodes a, #episodes li, #episodes a, .playlist li, .playlist a'
      );
      if (!items || items.length === 0) {
        var detailContainer = document.querySelector('.animeDetail-items, #episodes, .episodes, .playlist');
        if (detailContainer) {
          items = detailContainer.querySelectorAll('ol li, ul li, li, a');
        }
      }

      for (var i = 0; i < items.length; i++) {
        var el = items[i];
        var a = el.tagName === 'A' ? el : el.querySelector('a');
        var rawHref = '';
        if (a) {
          rawHref = a.getAttribute('href') || a.href || '';
        } else {
          var slug = el.getAttribute('data-slug') || el.getAttribute('data-href');
          if (slug) {
            rawHref = slug.indexOf('/') === 0 ? slug : ('/' + slug);
          }
        }

        if (!rawHref) continue;
        var fullHref = rawHref.indexOf('http') === 0 ? rawHref : (window.location.origin || 'https://www.tranimeizle.io') + (rawHref.indexOf('/') === 0 ? '' : '/') + rawHref;
        if (fullHref.indexOf('/kategori') !== -1 || fullHref.indexOf('/arama') !== -1 || fullHref.indexOf('/tag') !== -1) continue;

        var isMovieLink = fullHref.indexOf('filmi-izle') !== -1 ||
                          fullHref.indexOf('film-izle') !== -1 ||
                          fullHref.indexOf('movie-izle') !== -1 ||
                          fullHref.indexOf('tek-parca') !== -1 ||
                          fullHref.indexOf('-filmi') !== -1;
        var isBolumLink = fullHref.indexOf('-bolum') !== -1 || fullHref.indexOf('/bolum/') !== -1 || fullHref.indexOf('bolum') !== -1;
        if (!isBolumLink && !isMovieLink) continue;

        var titleEl = el.querySelector('.etitle span, p.title span, .title span, .etitle, p.title, .title, h4, span') || (a ? a.querySelector('.etitle span, p.title span, .title span, .etitle, p.title, .title, h4, span') : null);
        var imgEl = el.querySelector('.imgContainer img, img.thumb, img') || (a ? a.querySelector('.imgContainer img, img.thumb, img') : null);
        var dateEl = el.querySelector('.etitle small.author, p.title small.author, small.author, .author') || (a ? a.querySelector('.etitle small.author, p.title small.author, small.author, .author') : null);

        var epTitle = titleEl ? (titleEl.textContent || '').trim() : (a ? (a.textContent || '').trim() : (el.textContent || '').trim());
        var epThumb = imgEl ? (imgEl.getAttribute('src') || imgEl.src || '') : '';
        var epDate = dateEl ? (dateEl.textContent || '').replace(/\\s+/g, ' ').trim() : '';

        // SADECE NOKTA (.), BOŞLUK, VEYA GEÇERSİZ / BUTON METİNLERİNİ KESİNLİKLE FİLTRELE
        if (!epTitle || epTitle === '.' || /^[.\\s,;:!?•·…\\-_]+$/.test(epTitle) || epTitle.length < 2) {
          epTitle = '';
        }

        var lowerTitle = epTitle.toLowerCase();
        var lowerFullHref = fullHref.toLowerCase();
        if (
          lowerTitle === 'hemen izle' ||
          lowerTitle === 'ilk bölüm' ||
          lowerTitle === 'ilk bolum' ||
          lowerTitle === 'fragman' ||
          lowerTitle === 'tanıtım' ||
          lowerTitle.indexOf('özel') !== -1 ||
          lowerTitle.indexOf('ozel') !== -1 ||
          lowerTitle.indexOf('özet') !== -1 ||
          /\\b(?:ova|oad|ona|sp|special|specials|recap)\\b/i.test(lowerTitle) ||
          lowerFullHref.indexOf('ozel-bolum') !== -1 ||
          lowerFullHref.indexOf('special') !== -1 ||
          /[-_](?:ova|oad|ona|sp|recap)[-_]/i.test(lowerFullHref)
        ) {
          continue;
        }

        var epMatch = fullHref.match(/[-_](\\d+)[-_]bolum/i) ||
                      fullHref.match(/bolum[-_](\\d+)/i) ||
                      fullHref.match(/[-_](\\d+)-bolum-izle/i) ||
                      epTitle.match(/(\\d+)\\.\\s*Bölüm/i) ||
                      epTitle.match(/Bölüm\\s*(\\d+)/i);
        var epNum = epMatch ? parseInt(epMatch[1], 10) : (isMovieLink || targetFormat === 'MOVIE' ? 1 : null);
        if (!epNum || isNaN(epNum) || epNum <= 0) continue;

        if (!epTitle && epNum === 1 && (isMovieLink || targetFormat === 'MOVIE')) {
          epTitle = 'Film';
        }

        var epObj = {
          number: epNum,
          title: epTitle || (epNum + '. Bölüm'),
          url: fullHref,
          thumbnail: epThumb,
          release_date: epDate
        };

        if (window.__all_extracted_episodes[epNum]) {
          var existing = window.__all_extracted_episodes[epNum];
          var newHasThumb = Boolean(epThumb);
          var oldHasThumb = Boolean(existing.thumbnail);
          var newTitleLen = (epObj.title || '').length;
          var oldTitleLen = (existing.title || '').length;
          if ((!oldHasThumb && newHasThumb) || (newTitleLen > oldTitleLen)) {
            window.__all_extracted_episodes[epNum] = epObj;
          }
        } else {
          window.__all_extracted_episodes[epNum] = epObj;
        }
      }

      // 1.5. Tek Bölümlük Film Fallback: Eğer hiç bölüm bulunamadıysa ve video player veya film formatı varsa (Özel bölümler kesinlikle hariç!)
      var extractedCount = Object.keys(window.__all_extracted_episodes).length;
      var curTitleLow = (document.title || '').toLowerCase();
      var isPageSpecial = curTitleLow.indexOf('özel') !== -1 ||
                          curTitleLow.indexOf('ozel') !== -1 ||
                          curTitleLow.indexOf('special') !== -1 ||
                          curTitleLow.indexOf('özet') !== -1 ||
                          /\\b(?:ova|oad|ona|sp)\\b/i.test(curTitleLow) ||
                          href.indexOf('special') !== -1 ||
                          href.indexOf('ozel') !== -1;
      if (!isPageSpecial && extractedCount === 0 && (targetFormat === 'MOVIE' || (window.__TARGET_TOTAL_EPISODES === 1) || href.indexOf('film') !== -1)) {
        var playerEl = document.querySelector('.animeDetail-video-player, #video-player, iframe[src*="explorer"], iframe[src*="sibnet"], iframe');
        var pageTitleEl = document.querySelector('.playlist-title h1, h1, .anime-title');
        if (playerEl || targetFormat === 'MOVIE') {
          var fTitle = pageTitleEl ? (pageTitleEl.textContent || '').trim() : (window.__TARGET_TITLE || 'Film');
          var posterEl = document.querySelector('.poster img, img.poster');
          var fThumb = posterEl ? (posterEl.getAttribute('src') || posterEl.src || '') : '';
          window.__all_extracted_episodes[1] = {
            number: 1,
            title: fTitle || 'Film',
            url: window.location.href,
            thumbnail: fThumb,
            release_date: ''
          };
        }
      }

      // 2. Toplam Beklenen Bölüm Sayısını Belirle
      var totalEl = document.querySelector('.animeDetail-desc span, .animeDetail-desc, .playlist-title p');
      var totalMatch = totalEl ? (totalEl.textContent || '').match(/(\\d+)/) : null;
      var pageTotal = totalMatch ? parseInt(totalMatch[1], 10) : 0;
      var targetTotal = Math.max(pageTotal, window.__TARGET_TOTAL_EPISODES || 0);

      // 3. Aralık / Sekme Butonlarını Sırayla Tıkla (1-12, 13-24, 11-20, 21-25 vb.)
      window.__clicked_range_tabs = window.__clicked_range_tabs || {};
      var tabBtns = document.querySelectorAll(
        '.episode-range button, .episode-range a, [data-range], [data-part], ' +
        '.range-btn, .episode-tabs button, .episode-tabs a, .nav-tabs li a, ' +
        'ul.pagination li a, .pagination a, .page-link, button[data-page], .tab-btn'
      );
      for (var ti = 0; ti < tabBtns.length; ti++) {
        var tBtn = tabBtns[ti];
        var tText = (tBtn.textContent || '').trim();
        var tKey = tText + '_' + (tBtn.getAttribute('data-range') || tBtn.getAttribute('data-page') || tBtn.getAttribute('href') || ti);
        if ((/^\\d+[\\s\\-_]+\\d+$/.test(tText) || /^\\d+$/.test(tText)) && !window.__clicked_range_tabs[tKey]) {
          window.__clicked_range_tabs[tKey] = true;
          try {
            tBtn.click();
            if (window.jQuery) window.jQuery(tBtn).trigger('click');
          } catch(e) {}
        }
      }

      // 4. Sayfalama Linklerini Oturum İçi fetch() ile Çek (.pagination, ?sayfa=2 vb.)
      window.__fetched_pagination_urls = window.__fetched_pagination_urls || {};
      var pageAnchors = document.querySelectorAll('ul.pagination li a, .pagination a, .page-link, a[href*="sayfa="], a[href*="page="]');
      for (var pi = 0; pi < pageAnchors.length; pi++) {
        var pA = pageAnchors[pi];
        var pHref = pA.getAttribute('href') || pA.href || '';
        if (pHref && pHref.indexOf('http') !== 0) {
          pHref = (window.location.origin || '') + (pHref.indexOf('/') === 0 ? '' : '/') + pHref;
        }
        if (pHref && !window.__fetched_pagination_urls[pHref] && pHref !== window.location.href) {
          window.__fetched_pagination_urls[pHref] = true;
          fetch(pHref, { credentials: 'include' })
            .then(function(r) { return r.text(); })
            .then(function(pgHtml) {
              var liRe = /<li([^>]*)>([\\s\\S]*?)<\\/li>/gi;
              var m;
              while ((m = liRe.exec(pgHtml)) !== null) {
                var lAttrs = m[1];
                var lContent = m[2];
                var sM = lAttrs.match(/data-slug=["']([^"']+)["']/i) || lContent.match(/data-slug=["']([^"']+)["']/i);
                var aM = lContent.match(/<a[^>]+href=["']([^"']+)["']/i);
                var h = aM ? aM[1].trim() : (sM ? sM[1].trim() : '');
                if (!h) continue;
                if (h.indexOf('/') === 0) h = (window.location.origin || '') + h;
                var numM = h.match(/[-_](\\d+)[-_]bolum/i) || lContent.match(/(\\d+)\\.\\s*Bölüm/i);
                if (!numM) continue;
                var n = parseInt(numM[1], 10);
                if (isNaN(n) || n <= 0) continue;
                var tM = lContent.match(/<span>([^<]+)<\\/span>/i) || lContent.match(/alt=["']([^"']+)["']/i);
                var imM = lContent.match(/<img[^>]+src=["']([^"']+)["']/i);
                var t = tM ? tM[1].trim() : (n + '. Bölüm');
                var th = imM ? imM[1].trim() : '';
                if (!window.__all_extracted_episodes[n]) {
                  window.__all_extracted_episodes[n] = {
                    number: n,
                    title: t,
                    url: h,
                    thumbnail: th,
                    release_date: ''
                  };
                }
              }
            })
            .catch(function() {});
        }
      }

      // 5. Akıllı Örüntü Tamamlama (10 veya 12'de kesilen 24-25 bölümlük Haikyuu vb. için)
      var currentCount = Object.keys(window.__all_extracted_episodes).length;
      if (targetTotal > currentCount && currentCount > 0) {
        var sampleEp = null;
        for (var k in window.__all_extracted_episodes) {
          var candEp = window.__all_extracted_episodes[k];
          if (candEp && candEp.url && candEp.url.match(/[-_](\\d+)[-_]bolum/i)) {
            sampleEp = candEp;
            break;
          }
        }
        if (sampleEp) {
          var uMatch = sampleEp.url.match(/^(https?:\\/\\/[^\\/]+.*\\/|.*?)([a-zA-Z0-9_-]+[-_])(\\d+)([-_]bolum(?:-izle)?.*)$/i) ||
                       sampleEp.url.match(/^(.*\\/)([a-zA-Z0-9_-]+[-_])(\\d+)([-_]bolum.*)$/i) ||
                       sampleEp.url.match(/^(.*[-_])(\\d+)([-_]bolum.*)$/i);
          if (uMatch) {
            var fullPfx = uMatch[1] + (uMatch[2] || '');
            var sfx = uMatch[4] || uMatch[3];
            var tPfx = window.__TARGET_TITLE ? (window.__TARGET_TITLE + ' ') : '';
            var tSfx = '. Bölüm';
            if (sampleEp.title) {
              var tMat = sampleEp.title.match(/^(.*?)(\\d+)(\\.?\\s*Bölüm.*)$/i);
              if (tMat) { tPfx = tMat[1]; tSfx = tMat[3]; }
            }
            var smpThumb = sampleEp.thumbnail || '';
            for (var fillN = 1; fillN <= targetTotal; fillN++) {
              if (!window.__all_extracted_episodes[fillN]) {
                window.__all_extracted_episodes[fillN] = {
                  number: fillN,
                  title: tPfx ? (tPfx + fillN + tSfx) : (fillN + '. Bölüm'),
                  url: fullPfx + fillN + sfx,
                  thumbnail: smpThumb,
                  release_date: '',
                  is_deduced: true
                };
              }
            }
          }
        }
      }

      // 6. Bölüm Listesini Topla ve Sırala
      var eps = [];
      for (var numKey in window.__all_extracted_episodes) {
        if (window.__all_extracted_episodes.hasOwnProperty(numKey)) {
          eps.push(window.__all_extracted_episodes[numKey]);
        }
      }

      var pageHref = window.location.href || href || '';
      if (eps.length > 0 && (!window.__episodes_sent_url || window.__episodes_sent_url !== pageHref || window.__episodes_sent_count !== eps.length)) {
        window.__episodes_sent_url = pageHref;
        window.__episodes_sent_count = eps.length;
        window.__episodes_sent = true;
        eps.sort(function(x, y) { return x.number - y.number; });
        log('🎉 Sayfadan ' + eps.length + ' adet bölüm başarıyla çıkarıldı!', 'success');
        postMsg({
          type: 'episodes_extracted',
          episodes: eps,
          count: eps.length,
          url: pageHref
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
