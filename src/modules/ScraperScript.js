/**
 * Shared Scraper Script for resolving tranimeizle.io video streams.
 * Includes canvas-based pixel comparison captcha solver and hover/click event simulation.
 * Includes Touch-Unblocking Shield: Neutralizes IconCaptcha hoverDetection/clickDelay and destroys ad clickjackers.
 */
export const scraperInjectedJs = `
    try {
      (function() {
        if (window.__scraper_initialized) return;
        window.__scraper_initialized = true;

        // --- GÜVENLİK (BOT) KORUMASI ATLATMA (PROXY SPOOFING) & REKLAM ENGELLEME ---
        // --- GÜVENLİK (BOT) KORUMASI & REKLAM ENGELLEME ---
        try {
          // window.open override ederek yeni sekmede reklam açılmasını engelliyoruz
          window.open = function(url) {
            sendToNative({ type: 'log', message: '🚫 window.open (Reklam) engellendi: ' + url });
            return null;
          };
          var _origReplace = window.location.replace;
          window.location.replace = function(url) {
            if (typeof url === 'string') {
              if (url.indexOf('%2F') !== -1) {
                try { url = decodeURIComponent(url); } catch(e) {}
              }
              if (!url.startsWith('/') && !url.startsWith('http')) {
                url = '/' + url;
              }
              sendToNative({ type: 'log', message: '🚀 Güvenli sayfa yönlendirmesi: ' + url });
            }
            return _origReplace.call(window.location, url);
          };
        } catch(e) {}
        // --------------------------------------------------------

        var messageQueue = [];

        // Sürekli Kuyruk Boşaltıcı (React Native Köprüsü hazır olduğunda tüm logları iletir)
        setInterval(function() {
          try {
            if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage && messageQueue.length > 0) {
              while (messageQueue.length > 0) {
                window.ReactNativeWebView.postMessage(JSON.stringify(messageQueue.shift()));
              }
            }
          } catch(e) {}
        }, 100);

        // Canlı Ekran Debug Konsolu (Kullanıcının ve geliştiricinin anlık görmesi için)
        var debugDiv = document.createElement('div');
        debugDiv.id = '__scraper_debug';
        debugDiv.style.position = 'fixed';
        debugDiv.style.top = '0';
        debugDiv.style.left = '0';
        debugDiv.style.width = '100%';
        debugDiv.style.maxHeight = '140px';
        debugDiv.style.backgroundColor = 'rgba(10, 15, 26, 0.95)';
        debugDiv.style.borderBottom = '2px solid #00E5FF';
        debugDiv.style.color = '#00E5FF';
        debugDiv.style.zIndex = '2147483645';
        debugDiv.style.fontSize = '10px';
        debugDiv.style.fontFamily = 'monospace';
        debugDiv.style.padding = '4px 6px';
        debugDiv.style.boxShadow = '0 4px 12px rgba(0,0,0,0.6)';
        debugDiv.style.boxSizing = 'border-box';
        debugDiv.style.display = 'block';

        debugDiv.innerHTML = [
          '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(0,229,255,0.3);padding-bottom:2px;margin-bottom:3px;pointer-events:auto;">',
          '  <span style="color:#FFF;font-weight:bold;display:flex;align-items:center;gap:4px;">',
          '    <span style="width:7px;height:7px;border-radius:50%;background:#00E5FF;display:inline-block;"></span>',
          '    CLOFTHEL BOT LOG EKRANI',
          '  </span>',
          '  <span id="__scraper_debug_toggle" style="cursor:pointer;color:#FFB86C;font-size:10px;padding:2px 4px;background:rgba(255,184,108,0.15);border-radius:4px;">[Gizle / Göster]</span>',
          '</div>',
          '<div id="__scraper_debug_content" style="overflow-y:auto;max-height:105px;pointer-events:auto;"></div>'
        ].join('');

        if (document.documentElement) {
          document.documentElement.appendChild(debugDiv);
        } else {
          document.addEventListener('DOMContentLoaded', function() {
            if (document.documentElement) document.documentElement.appendChild(debugDiv);
          });
        }

        var isDebugCollapsed = false;
        setTimeout(function() {
          var tBtn = document.getElementById('__scraper_debug_toggle');
          var cDiv = document.getElementById('__scraper_debug_content');
          if (tBtn && cDiv) {
            tBtn.addEventListener('click', function(e) {
              if (e.stopPropagation) e.stopPropagation();
              isDebugCollapsed = !isDebugCollapsed;
              cDiv.style.display = isDebugCollapsed ? 'none' : 'block';
              debugDiv.style.maxHeight = isDebugCollapsed ? '24px' : '140px';
            });
          }
        }, 300);

        function logToScreen(msg) {
          try {
            if (!debugDiv.parentNode && document.documentElement) {
              document.documentElement.appendChild(debugDiv);
            }
            var cDiv = document.getElementById('__scraper_debug_content') || debugDiv;
            var p = document.createElement('div');
            p.style.lineHeight = '14px';
            p.style.marginBottom = '2px';
            p.style.wordBreak = 'break-all';

            var str = String(msg || '');
            if (str.indexOf('🎉') !== -1 || str.indexOf('✅') !== -1 || str.indexOf('ONAYLANDI') !== -1) {
              p.style.color = '#50FA7B';
            } else if (str.indexOf('❌') !== -1 || str.indexOf('Hata') !== -1 || str.indexOf('hatası') !== -1) {
              p.style.color = '#FF5555';
            } else if (str.indexOf('⚠️') !== -1 || str.indexOf('🛡️') !== -1) {
              p.style.color = '#FFB86C';
            } else {
              p.style.color = '#8BE9FD';
            }

            var now = new Date();
            var timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');
            p.innerText = '[' + timeStr + '] ' + str;
            cDiv.appendChild(p);
            cDiv.scrollTop = cDiv.scrollHeight;
          } catch(e) {}
        }

        function sendToNative(obj) {
          if (obj.type === 'log' || obj.type === 'error') {
            logToScreen(obj.message);
          }
          try {
            if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
              while (messageQueue.length > 0) {
                window.ReactNativeWebView.postMessage(JSON.stringify(messageQueue.shift()));
              }
              window.ReactNativeWebView.postMessage(JSON.stringify(obj));
            } else {
              messageQueue.push(obj);
            }
          } catch(e) {
            logToScreen("PostMessage Error: " + e.message);
          }
        }
        
        try {
          var originalLog = console.log;
          console.log = function() {
            var args = Array.prototype.slice.call(arguments);
            sendToNative({ type: 'log', message: '[Console.log] ' + args.join(' ') });
            if (originalLog) originalLog.apply(console, arguments);
          };
          
          var originalError = console.error;
          console.error = function() {
            var args = Array.prototype.slice.call(arguments);
            sendToNative({ type: 'log', message: '[Console.error] ' + args.join(' ') });
            if (originalError) originalError.apply(console, arguments);
          };

          window.onerror = function(message, source, lineno, colno, error) {
            sendToNative({ type: 'log', message: '[Window.onerror] ' + message + ' at ' + source + ':' + lineno + ':' + colno });
            return false;
          };
        } catch (e) {
          logToScreen("Console override error: " + e.message);
        }

        // =========================================================================
        // 🛡️ DOKUNUŞ KİLİDİ AÇICI (TOUCH UNBLOCKER) & REKLAM İMHA KALKANI
        // =========================================================================

        // 1. Anti-Ad & High-Priority UI CSS Enjeksiyonu
        try {
          var injectTouchUnblockStyle = function() {
            if (document.getElementById('__touch_unblock_style')) return;
            var css = [
              'ins, [class*="kesem"], [id*="ad-container"], [class*="video-ad"], [class*="banner"], [class*="sponsor"], iframe[src*="ad"]:not([src*="cloudflare"]):not([src*="turnstile"]):not([id*="cf"]), iframe[src*="track"]:not([src*="cloudflare"]):not([src*="turnstile"]), iframe[src="about:blank"]:not([id*="cf"]), div[style*="z-index: 214748364"]:not(#__scraper_debug):not(.cf-turnstile), div[style*="z-index: 999999"]:not(#__scraper_debug):not(.cf-turnstile), div[style*="z-index: 99999"]:not(#__scraper_debug):not(.cf-turnstile) {',
              '  display: none !important;',
              '  pointer-events: none !important;',
              '  width: 0 !important;',
              '  height: 0 !important;',
              '  opacity: 0 !important;',
              '  visibility: hidden !important;',
              '}',
              '.captcha-holder, .captcha-modal, .captcha-modal__header, .captcha-modal__icons, .captcha-image, .captcha-modal__icons > div, button, a, input, select, .flx-block, .sourceBtn, .fansubBtn, .video-sources, #sourceList, .play-btn {',
              '  pointer-events: auto !important;',
              '  cursor: pointer !important;',
              '  user-select: auto !important;',
              '  touch-action: manipulation !important;',
              '  position: relative !important;',
              '  z-index: 2147483640 !important;',
              '}',
              '.cf-turnstile, iframe[src*="cloudflare"], iframe[src*="turnstile"], div[id*="cf-chl-widget"], form[action*="network-challenge"], form[action*="verify"], input#answer, input.answer, button[type="submit"] {',
              '  display: block !important;',
              '  pointer-events: auto !important;',
              '  opacity: 1 !important;',
              '  visibility: visible !important;',
              '  position: relative !important;',
              '  z-index: 2147483640 !important;',
              '}',
              'img.question {',
              '  max-width: 100% !important;',
              '  height: auto !important;',
              '  border-radius: 12px !important;',
              '  display: block !important;',
              '}',
              '.captcha-image {',
              '  cursor: pointer !important;',
              '  min-width: 44px !important;',
              '  min-height: 44px !important;',
              '  display: inline-block !important;',
              '}'
            ].join('\n');
            var styleEl = document.createElement('style');
            styleEl.id = '__touch_unblock_style';
            styleEl.type = 'text/css';
            styleEl.appendChild(document.createTextNode(css));
            (document.head || document.documentElement).appendChild(styleEl);
          };
          if (document.head || document.documentElement) {
            injectTouchUnblockStyle();
          } else {
            document.addEventListener('DOMContentLoaded', injectTouchUnblockStyle);
          }
        } catch(e) {}

        // 2. Reklam Scriptlerinin Tıklamayı Çalmasını Önleme (stopImmediatePropagation Koruması)
        try {
          var origStopImmediate = Event.prototype.stopImmediatePropagation;
          Event.prototype.stopImmediatePropagation = function() {
            var t = this.target;
            if (t && t.closest && (
              t.closest('.captcha-holder') || 
              t.closest('.captcha-image') || 
              t.closest('.flx-block') || 
              t.closest('.sourceBtn') || 
              t.closest('a') || 
              t.closest('button')
            )) {
              return;
            }
            return origStopImmediate.apply(this, arguments);
          };

          var origStopPropagation = Event.prototype.stopPropagation;
          Event.prototype.stopPropagation = function() {
            var t = this.target;
            if (t && t.closest && (
              t.closest('.captcha-holder') || 
              t.closest('.captcha-image') || 
              t.closest('.flx-block') || 
              t.closest('.sourceBtn') || 
              t.closest('a') || 
              t.closest('button')
            )) {
              return;
            }
            return origStopPropagation.apply(this, arguments);
          };
        } catch(e) {}

        // 3. Şeffaf Reklam Katmanlarını Gerçek Zamanlı İmha Eden MutationObserver
        try {
          var checkAndKillOverlay = function(node) {
            if (!node || node.nodeType !== 1) return;
            if (node.id === '__scraper_debug' || (debugDiv && (node === debugDiv || (node.contains && node.contains(debugDiv))))) return;
            var tag = node.tagName;
            if (tag === 'HTML' || tag === 'BODY' || tag === 'STYLE' || tag === 'SCRIPT') return;

            var s = window.getComputedStyle(node);
            if (
              (s.position === 'fixed' || s.position === 'absolute') &&
              parseInt(s.zIndex || '0') > 50 &&
              (parseFloat(s.width || '0') >= window.innerWidth * 0.7 || node.offsetWidth >= window.innerWidth * 0.7) &&
              (parseFloat(s.height || '0') >= window.innerHeight * 0.7 || node.offsetHeight >= window.innerHeight * 0.7) &&
              (s.opacity === '0' || parseFloat(s.opacity || '1') < 0.1 || s.backgroundColor === 'transparent' || s.backgroundColor === 'rgba(0, 0, 0, 0)')
            ) {
              if (!node.querySelector('.captcha-holder, .video-player, video, #sourceList')) {
                node.style.pointerEvents = 'none';
                node.style.display = 'none';
                if (node.parentNode) node.parentNode.removeChild(node);
                sendToNative({ type: 'log', message: '🛡️ Şeffaf reklam perdesi imha edildi: ' + tag });
              }
            }
          };

          var overlayObserver = new MutationObserver(function(mutations) {
            for (var m = 0; m < mutations.length; m++) {
              var added = mutations[m].addedNodes;
              for (var a = 0; a < added.length; a++) {
                checkAndKillOverlay(added[a]);
              }
            }
          });

          if (document.documentElement) {
            overlayObserver.observe(document.documentElement, { childList: true, subtree: true });
          } else {
            document.addEventListener('DOMContentLoaded', function() {
              overlayObserver.observe(document.documentElement, { childList: true, subtree: true });
            });
          }
        } catch(e) {}

        // 4. JQUERY & ICONCAPTCHA HOOK — DOKUNUŞ KİLİDİNİ KALDIRMA
        try {
          var hookJQueryForCaptcha = function(jq) {
            if (!jq || !jq.fn || jq.fn.__iconCaptchaHooked) return;
            jq.fn.__iconCaptchaHooked = true;
            sendToNative({ type: 'log', message: '🔓 jQuery tespit edildi, IconCaptcha dokunuş kilidi kaldırılıyor...' });

            var origExtend = jq.fn.extend;
            jq.fn.extend = function(obj) {
              if (obj && obj.iconCaptcha) {
                var origIconCaptcha = obj.iconCaptcha;
                obj.iconCaptcha = function(options) {
                  options = options || {};
                  if (options.validationPath) window.__iconCaptchaValidationPath = options.validationPath;
                  options.hoverDetection = false;
                  options.captchaHoverDetection = false;
                  options.clickDelay = 0;
                  options.captchaClickDelay = 0;
                  options.requestIconsDelay = 0;
                  options.enableLoadingAnimation = false;
                  sendToNative({ type: 'log', message: '🎯 IconCaptcha dokunuş kilidi kaldırıldı (hoverDetection=false, clickDelay=0)!' });
                  return origIconCaptcha.call(this, options);
                };
              }
              return origExtend.apply(this, arguments);
            };

            if (jq.fn.iconCaptcha) {
              var origIconCaptcha = jq.fn.iconCaptcha;
              jq.fn.iconCaptcha = function(options) {
                options = options || {};
                if (options.validationPath) window.__iconCaptchaValidationPath = options.validationPath;
                options.hoverDetection = false;
                options.captchaHoverDetection = false;
                options.clickDelay = 0;
                options.captchaClickDelay = 0;
                options.requestIconsDelay = 0;
                options.enableLoadingAnimation = false;
                sendToNative({ type: 'log', message: '🎯 IconCaptcha dokunuş kilidi kaldırıldı (hoverDetection=false, clickDelay=0)!' });
                return origIconCaptcha.call(this, options);
              };
            }

            // jQuery click listener sarmalama (pageX & pageY koordinat garantisi)
            var origOn = jq.fn.on;
            jq.fn.on = function(types, selector, data, fn) {
              if (typeof selector === 'string' && selector.indexOf('captcha-image') !== -1) {
                var handler = fn || data;
                if (typeof handler === 'function') {
                  var wrappedHandler = function(event) {
                    if (event) {
                      var el = event.target || this;
                      var offset = jq(el).offset() || { left: 10, top: 10 };
                      if (!event.pageX || isNaN(event.pageX)) event.pageX = offset.left + 20;
                      if (!event.pageY || isNaN(event.pageY)) event.pageY = offset.top + 20;
                    }
                    return handler.apply(this, arguments);
                  };
                  if (fn) {
                    return origOn.call(this, types, selector, data, wrappedHandler);
                  } else {
                    return origOn.call(this, types, selector, wrappedHandler);
                  }
                }
              }
              return origOn.apply(this, arguments);
            };
          };

          if (window.jQuery) hookJQueryForCaptcha(window.jQuery);
          var _jqRef = window.jQuery;
          Object.defineProperty(window, 'jQuery', {
            configurable: true,
            enumerable: true,
            get: function() { return _jqRef; },
            set: function(val) {
              _jqRef = val;
              hookJQueryForCaptcha(_jqRef);
            }
          });

          if (window.$) hookJQueryForCaptcha(window.$);
          var _dollarRef = window.$;
          Object.defineProperty(window, '$', {
            configurable: true,
            enumerable: true,
            get: function() { return _dollarRef; },
            set: function(val) {
              _dollarRef = val;
              hookJQueryForCaptcha(_dollarRef);
            }
          });
        } catch(e) {}

        // --- REKLAM VE ENGELLEYİCİ ŞEFFAF KATMANLARI İMHA EDİCİ ---
        function purgeClickBlockingOverlays() {
          try {
            // 1. Bilinen reklam ve izleme iframe/container'larını DOM'dan tamamen sil
            var adSelectors = [
              'ins.604c7625',
              'ins[class*="604c"]',
              '[id*="ad-container"]',
              '.video-ad-container',
              '[class*="video-ad"]',
              'iframe[src*="ad"]',
              'iframe[src*="track"]',
              'iframe[src*="wargamings"]',
              'iframe[src*="maxihalisaha"]',
              'div[style*="z-index: 214748364"]:not(.captcha-holder):not(.captcha-modal):not(.captcha-image):not(#__scraper_debug)',
              'div[style*="z-index: 999999"]:not(.captcha-holder):not(.captcha-modal):not(.captcha-image):not(#__scraper_debug)'
            ];
            adSelectors.forEach(function(sel) {
              var els = document.querySelectorAll(sel);
              for (var i = 0; i < els.length; i++) {
                var el = els[i];
                if (el && !el.closest('.captcha-holder') && !el.closest('.captcha-modal')) {
                  el.remove();
                }
              }
            });

            // 2. Ekranı kaplayan şeffaf overlay veya tıklama yutucu şeffaf elementleri temizle
            var allFixed = document.querySelectorAll('div, a, span');
            for (var j = 0; j < allFixed.length; j++) {
              var item = allFixed[j];
              if (!item || item.id === '__scraper_debug' || item.closest('.captcha-holder') || item.closest('.captcha-modal')) continue;
              var style = window.getComputedStyle(item);
              if (style.position === 'fixed' || style.position === 'absolute') {
                var z = parseInt(style.zIndex, 10) || 0;
                if (z > 50) {
                  var rect = item.getBoundingClientRect();
                  if ((rect.width > window.innerWidth * 0.7 && rect.height > window.innerHeight * 0.5) || parseFloat(style.opacity || '1') < 0.1) {
                    item.style.pointerEvents = 'none';
                    item.style.display = 'none';
                    if (item.parentNode) item.parentNode.removeChild(item);
                  }
                }
              }
            }

            // 3. Captcha elementlerinin tıklanabilirliğini garanti et
            var captchaEls = document.querySelectorAll('.captcha-holder, .captcha-modal, .captcha-modal__icons, .captcha-image');
            for (var k = 0; k < captchaEls.length; k++) {
              var cEl = captchaEls[k];
              cEl.style.setProperty('pointer-events', 'auto', 'important');
              cEl.style.setProperty('z-index', '2147483640', 'important');
              cEl.style.setProperty('cursor', 'pointer', 'important');
              cEl.style.setProperty('touch-action', 'manipulation', 'important');
            }
          } catch(e) {}
        }

        // --- POST-CAPTCHA YÖNLENDİRME & VİDEO AÇMA MERKEZİ ---
        function handlePostCaptchaSuccess(hash, cid) {
          if (window.__captcha_solved_success) return;
          window.__captcha_solved_success = true;

          sendToNative({ 
            type: 'log', 
            message: '🎉 Captcha BAŞARIYLA GEÇİLDİ!' 
          });
          sendToNative({
            type: 'captcha_solved',
            hash: hash || '',
            captchaId: cid || '0'
          });

          var holder = document.querySelector('.captcha-holder');
          if (holder) {
            holder.classList.add('captcha-success');
            var icons = holder.querySelector('.captcha-modal__icons');
            if (icons) {
              icons.innerHTML = '<div class="captcha-modal__icons-title">İyi seyirler!</div><div class="captcha-modal__icons-subtitle">Doğrulamanız için teşekkürler.</div>';
            }
            if (window.jQuery) {
              var $h = window.jQuery(holder);
              $h.trigger('success', [{ captcha_id: cid || '0' }]);
              $h.trigger('success.iconCaptcha', [cid || '0']);
              $h.trigger('selected', [{ captcha_id: cid || '0' }]);
            }
            try {
              holder.dispatchEvent(new CustomEvent('success', { detail: { captcha_id: cid || '0' }, bubbles: true }));
            } catch(e) {}

            var form = holder.closest('form');
            if (form) {
              var hfInput = form.querySelector('input[name="captcha-hf"]');
              if (hfInput && hash) hfInput.value = hash;
              var idhfInput = form.querySelector('input[name="captcha-idhf"]');
              if (idhfInput) idhfInput.value = cid || '0';
            }
          }

          // 1. CaptchaChallenge sayfasındaysak anime detayına yönlendir
          var pathname = window.location.pathname || '';
          var targetPath = '';

          if (pathname.indexOf('/api/CaptchaChallenge/') !== -1) {
            var raw = pathname.replace('/api/CaptchaChallenge/', '');
            try {
              targetPath = decodeURIComponent(raw);
            } catch(e) {
              targetPath = raw;
            }
          } else if (window.__targetOverviewUrl) {
            targetPath = window.__targetOverviewUrl;
          }

          if (targetPath) {
            if (!targetPath.startsWith('/') && !targetPath.startsWith('http')) {
              targetPath = '/' + targetPath;
            }
            sendToNative({ type: 'log', message: '🚀 Captcha onaylandı! Hedef anime sayfasına gidiliyor: ' + targetPath });
            setTimeout(function() {
              window.location.replace(targetPath);
            }, 300);
            return;
          }

          // 2. Sayfa içi form action yönlendirmesi
          if (holder) {
            var f = holder.closest('form');
            if (f) {
              var act = f.getAttribute('action') || '';
              if (act && act !== '#' && !act.endsWith('#') && act !== pathname && act !== window.location.href) {
                sendToNative({ type: 'log', message: '📄 Form action tetikleniyor: ' + act });
                f.submit();
                return;
              } else {
                var sBtn = f.querySelector('button[type="submit"], input[type="submit"]');
                if (sBtn) {
                  sendToNative({ type: 'log', message: '🔘 Form submit butonu tetikleniyor...' });
                  sBtn.click();
                  return;
                }
              }
            }
          }

          // 3. İzleme sayfasında video kaynaklarını aç
          sendToNative({ type: 'log', message: '✨ Captcha onaylandı! Video kaynakları aranıyor...' });
          setTimeout(function() {
            checkPageForExplorerUrls();
            checkPageForSibnetUrls();
          }, 300);
        }

        // Yedek HTTP Doğrulama İsteği (İstek taklidi)
        function submitCaptchaDirectly(hash, cid) {
          cid = cid || '0';
          if (!hash || window.__captcha_solved_success) return;
          
          var validationUrl = window.__iconCaptchaValidationPath || '/api/Captcha/';
          sendToNative({ type: 'log', message: '⚡ Yedek HTTP isteği gönderiliyor (POST ' + validationUrl + ' | Hash: ' + hash.substring(0, 8) + '...)' });

          if (window.jQuery) {
            window.jQuery('input[name="captcha-hf"]').val(hash);
            window.jQuery('input[name="captcha-idhf"]').val(cid);
            window.jQuery.ajax({
              url: validationUrl,
              type: 'POST',
              data: { cID: cid, pC: hash, rT: 2 },
              headers: { 'X-Requested-With': 'XMLHttpRequest' },
              success: function(res) {
                handlePostCaptchaSuccess(hash, cid);
              },
              error: function(err) {
                if (err && err.status === 200) {
                  handlePostCaptchaSuccess(hash, cid);
                } else {
                  sendToNative({ type: 'log', message: 'Yedek HTTP API yanıtı: ' + (err.statusText || err.status || 'Hata') });
                }
              }
            });
          } else {
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
              if (res.ok || res.status === 200) {
                handlePostCaptchaSuccess(hash, cid);
              }
            }).catch(function(e) {});
          }
        }

        // 5. Kalıcı Hover Kalp Atışı (Heartbeat) & Tıklama Engelleyici Kalkan
        try {
          setInterval(function() {
            var holders = document.querySelectorAll('.captcha-holder');
            for (var i = 0; i < holders.length; i++) {
              var h = holders[i];
              try {
                h.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
                if (window.jQuery) window.jQuery(h).trigger('mouseenter');
              } catch(e) {}
            }
          }, 150);

          var handleDirectCaptchaTap = function(e) {
            var target = e.target;
            if (!target) return;
            var imgEl = (target.classList && target.classList.contains('captcha-image')) ? target : (target.closest ? target.closest('.captcha-image') : null);
            if (!imgEl) return;

            // Reklam scriptlerinin tıklamayı yutmasını önle
            if (e.stopPropagation) e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();

            var hash = imgEl.getAttribute('icon-hash');
            var holder = imgEl.closest('.captcha-holder') || document.querySelector('.captcha-holder');
            var cid = holder ? (holder.getAttribute('data-captcha-id') || '0') : '0';

            if (!hash) return;

            sendToNative({ type: 'log', message: '👆 Kullanıcı görsele dokundu (Hash: ' + hash.substring(0, 8) + '...)' });
            purgeClickBlockingOverlays();
            simulateIconCaptchaClick(imgEl, cid);
            submitCaptchaDirectly(hash, cid);
          };

          document.addEventListener('click', handleDirectCaptchaTap, true);
          document.addEventListener('touchend', handleDirectCaptchaTap, true);
          document.addEventListener('pointerup', handleDirectCaptchaTap, true);
        } catch(e) {}

        // =========================================================================

        function getCleanUrl(bgStyle) {
          if (!bgStyle || bgStyle === 'none') return '';
          var match = bgStyle.match(/url\(['"]?([^'"]+?)['"]?\)/i);
          return match ? match[1] : '';
        }

        // 🎯 KUSURSUZ ÇOK KATMANLI CAPTCHA TIKLAMA SİMÜLATÖRÜ
        function simulateIconCaptchaClick(el, cid) {
          if (!el) return;
          if (window.__captcha_solved_success) return;
          var successEl = document.querySelector('.captcha-success');
          if (successEl) {
            handlePostCaptchaSuccess(el.getAttribute('icon-hash'), cid);
            return;
          }

          try {
            var holder = el.closest ? el.closest('.captcha-holder') : document.querySelector('.captcha-holder');
            var iconsContainer = holder ? holder.querySelector('.captcha-modal__icons') : null;

            // 1. Reklam ve engelleyici şeffaf katmanları temizle
            purgeClickBlockingOverlays();

            // 2. IconCaptcha guardrail: captcha-opacity ve loader'ı kaldır
            if (iconsContainer) {
              iconsContainer.classList.remove('captcha-opacity');
              var loader = iconsContainer.querySelector('.captcha-loader');
              if (loader) loader.remove();
            }
            if (window.jQuery && iconsContainer) {
              window.jQuery(iconsContainer).removeClass('captcha-opacity');
              window.jQuery(iconsContainer).find('.captcha-loader').remove();
            }

            // 3. IconCaptcha guardrail: mouseenter tetikle (q = true olması için)
            if (holder) {
              try {
                holder.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
                if (window.jQuery) window.jQuery(holder).trigger('mouseenter');
              } catch(e) {}
            }
            try {
              el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
              if (window.jQuery) window.jQuery(el).trigger('mouseenter');
            } catch(e) {}

            // 4. Koordinatları tam piksel merkezine göre hesapla
            var rect = el.getBoundingClientRect();
            var x = Math.round(rect.left + (rect.width > 0 ? rect.width / 2 : 22));
            var y = Math.round(rect.top + (rect.height > 0 ? rect.height / 2 : 22));
            var pageX = Math.round((window.pageXOffset || document.documentElement.scrollLeft || 0) + x);
            var pageY = Math.round((window.pageYOffset || document.documentElement.scrollTop || 0) + y);

            var hash = el.getAttribute('icon-hash') || '';
            sendToNative({ 
              type: 'log', 
              message: '👆 Tıklanıyor: Hash ' + (hash ? hash.substring(0, 8) : 'yok') + '... (X:' + x + ' Y:' + y + ' | PageX:' + pageX + ' PageY:' + pageY + ')' 
            });

            // ── KATMAN 1: jQuery Dahili Handler'ını Doğrudan Çağırma (jQuery._data) ──
            var directHandlerExecuted = false;
            if (window.jQuery && holder) {
              try {
                var events = window.jQuery._data(holder, "events");
                if (events && events.click && events.click.length > 0) {
                  for (var k = 0; k < events.click.length; k++) {
                    var hObj = events.click[k];
                    if (hObj && (!hObj.selector || hObj.selector.indexOf('captcha-image') !== -1)) {
                      var fakeEv = window.jQuery.Event('click', {
                        target: el,
                        currentTarget: el,
                        srcElement: el,
                        pageX: pageX,
                        pageY: pageY,
                        clientX: x,
                        clientY: y,
                        which: 1,
                        button: 0,
                        bubbles: true
                      });
                      hObj.handler.call(el, fakeEv);
                      directHandlerExecuted = true;
                      sendToNative({ type: 'log', message: '⚡ IconCaptcha jQuery dahili dinleyicisi doğrudan çalıştırıldı!' });
                    }
                  }
                }
              } catch(jErr) {
                sendToNative({ type: 'log', message: 'jQuery dahili çağrı notu: ' + jErr.message });
              }
            }

            // ── KATMAN 2: jQuery Event Triggering ($el.trigger & $holder.trigger) ──
            if (window.jQuery) {
              try {
                var $el = window.jQuery(el);
                var $holder = holder ? window.jQuery(holder) : $el;
                var offset = $el.offset() || { left: pageX - 22, top: pageY - 22 };
                var jqEvent = window.jQuery.Event('click', {
                  target: el,
                  currentTarget: el,
                  srcElement: el,
                  pageX: offset.left + Math.max(10, Math.floor(rect.width / 2) || 20),
                  pageY: offset.top + Math.max(10, Math.floor(rect.height / 2) || 20),
                  clientX: x,
                  clientY: y,
                  which: 1,
                  button: 0,
                  bubbles: true
                });
                $el.trigger(jqEvent);
                if ($holder[0] !== $el[0]) {
                  $holder.trigger(jqEvent);
                }
              } catch(jqTrigErr) {}
            }

            // ── KATMAN 3: Gerçekçi DOM Dokunmatik & Fare Event Zinciri ──
            var touchObj = null;
            try {
              if (typeof Touch !== 'undefined') {
                touchObj = new Touch({
                  identifier: Date.now(),
                  target: el,
                  clientX: x,
                  clientY: y,
                  screenX: x,
                  screenY: y,
                  pageX: pageX,
                  pageY: pageY
                });
              }
            } catch(tErr) {}

            try {
              el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
              el.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false, cancelable: false, view: window, clientX: x, clientY: y }));
              el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1 }));
            } catch(pe) {}

            if (touchObj) {
              try {
                el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, view: window, touches: [touchObj], targetTouches: [touchObj], changedTouches: [touchObj] }));
              } catch(te) {}
            }

            try {
              el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, pointerType: 'touch', isPrimary: true, button: 0 }));
            } catch(pe) {}

            if (touchObj) {
              try {
                el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, view: window, touches: [], targetTouches: [], changedTouches: [touchObj] }));
              } catch(te) {}
            }

            ['mouseover', 'mouseenter', 'mousemove', 'mousedown', 'mouseup', 'click'].forEach(function(evName) {
              try {
                var ev = new MouseEvent(evName, {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  clientX: x,
                  clientY: y,
                  screenX: x,
                  screenY: y,
                  pageX: pageX,
                  pageY: pageY,
                  button: 0,
                  buttons: (evName === 'mousedown' ? 1 : 0),
                  which: 1
                });
                el.dispatchEvent(ev);
              } catch(me) {}
            });

            try {
              el.click();
            } catch(ce) {}

            // Native Touch Mesajı (React Native köprüsüne koordinat ilet)
            sendToNative({
              type: 'native_touch',
              x: x,
              y: y,
              hash: hash
            });

          } catch(err) {
            sendToNative({ type: 'log', message: 'Tıklama simülasyon hatası: ' + err.message });
          }
        }

        function detectCurrentFansub() {
          try {
            var activeBtn = document.querySelector('.fansubSelector.active, .fansubSelector[style*="background"], .fansubBtn.active, .sourceBtn.active, .selected-fansub, .selected-source, .source.active, .btn-primary');
            if (activeBtn) {
              var txt = (activeBtn.getAttribute('data-fad') || activeBtn.textContent || activeBtn.innerText || '').trim();
              if (txt) return txt;
            }
            var anyFs = document.querySelector('.fansubSelector[data-fad]');
            if (anyFs) {
              return anyFs.getAttribute('data-fad') || anyFs.textContent.trim();
            }
            if (clickedBtnText) return clickedBtnText;
            
            var fansubEl = document.querySelector('.fansub-name, .fansub-title, .anime-fansub, .post-category');
            if (fansubEl) {
              return (fansubEl.textContent || fansubEl.innerText || '').trim();
            }
          } catch(e) {}
          return null;
        }

        var _resolved = false;
        function sendResolved(videoUrl) {
          if (_resolved) return;
          _resolved = true;
          var detectedFansub = detectCurrentFansub();
          sendToNative({ 
            type: 'resolved', 
            videoUrl: videoUrl,
            fansub: detectedFansub
          });
        }

        sendToNative({ type: 'log', message: 'Scraper baslatildi (JS yuklendi)...' });

        function handleExplorerUrl(url) {
          if (_resolved) return;
          if (!url || typeof url !== 'string' || !url.includes('/explorer/')) return;
          try {
            var parts = url.split('/explorer/');
            var baseUrl = parts[0];
            var remaining = parts[1].split('/');
            var uuid = remaining[0];
            var hash = remaining[1] ? remaining[1].split('?')[0] : '';
            if (uuid && hash) {
              var transformed = baseUrl + '/plateau/' + uuid + '/' + hash + '.m3u8';
              sendResolved(transformed);
            }
          } catch (e) {
            sendToNative({ type: 'log', message: 'URL donusturulemedi: ' + e.message });
          }
        }

        try {
          var originalFetch = window.fetch;
          window.fetch = function() {
            var url = arguments[0];
            if (typeof url === 'string') {
              handleExplorerUrl(url);
            }
            return originalFetch.apply(this, arguments);
          };
        } catch(e) {}

        try {
          var originalOpen = XMLHttpRequest.prototype.open;
          XMLHttpRequest.prototype.open = function(method, url) {
            if (typeof url === 'string') {
              handleExplorerUrl(url);
            }
            return originalOpen.apply(this, arguments);
          };
        } catch(e) {}

        function checkPageForExplorerUrls() {
          if (_resolved) return;
          try {
            var iframes = document.querySelectorAll('iframe');
            for (var i = 0; i < iframes.length; i++) {
              var src = iframes[i].src || iframes[i].getAttribute('data-src') || '';
              handleExplorerUrl(src);
            }
            var links = document.querySelectorAll('a');
            for (var j = 0; j < links.length; j++) {
              var href = links[j].href || '';
              handleExplorerUrl(href);
            }
          } catch(e) {}
        }

        function checkPageForSibnetUrls() {
          if (_resolved) return false;
          try {
            var getSibnetId = function(url) {
              if (!url) return null;
              var match = url.match(/[?&]id=(\d+)/);
              if (match) return match[1];
              var pathMatch = url.match(new RegExp('/video(\\d+)')) || url.match(new RegExp('/v/(\\d+)'));
              if (pathMatch) return pathMatch[1];
              return null;
            };

            if (window.location.hostname === 'video.sibnet.ru') {
              sendToNative({ type: 'log', message: 'Sibnet player inceleniyor...' });
              
              var sibnetId = getSibnetId(window.location.href);
              if (sibnetId) {
                sendToNative({ type: 'log', message: 'Sibnet ID (Sayfadan) bulundu: ' + sibnetId });
                sendResolved('sibnet:' + sibnetId);
                return true;
              }
              
              var video = document.querySelector('video');
              if (video) {
                video.muted = true;
                video.volume = 0;
                video.setAttribute('muted', 'true');
                if (video.paused) {
                  try { video.play(); } catch(e) {}
                }
                if (video.currentSrc && (video.currentSrc.indexOf('.mp4') !== -1 || video.currentSrc.indexOf('http') === 0)) {
                  sendResolved('sibnet-direct:' + video.currentSrc);
                  return true;
                }
              }
              
              var html = document.documentElement.innerHTML;
              var srcMatch = html.match(new RegExp('src\\s*:\\s*["\'](/v/[^"\']+)["\']', 'i'));
              
              if (srcMatch && srcMatch[1]) {
                 var absoluteUrl = "https://video.sibnet.ru" + srcMatch[1];
                 sendToNative({ type: 'log', message: 'Saf link ayiklaniyor...' });
                 
                 fetch(absoluteUrl).then(function(res) {
                    var finalMp4 = res.url;
                    sendToNative({ type: 'log', message: 'Saf link basariyla cozuldu!' });
                    sendResolved('sibnet-direct:' + finalMp4);
                 }).catch(function(e) {
                    sendToNative({ type: 'log', message: 'Fetch hatasi: ' + e.message });
                 });
                 return true;
              } else {
                 var playBtn = document.querySelector('.vjs-big-play-button') || document.querySelector('.vjs-play-control') || document.querySelector('.vjs-poster');
                 if (playBtn) clickElement(playBtn);
                 
                 if (!window.__sibnetRetryDone) {
                   window.__sibnetRetryDone = true;
                   setTimeout(function() {
                     if (_resolved) return;
                     var vid = document.querySelector('video');
                     if (vid && vid.currentSrc && (vid.currentSrc.indexOf('.mp4') !== -1 || vid.currentSrc.indexOf('http') === 0)) {
                       sendResolved('sibnet-direct:' + vid.currentSrc);
                     } else {
                       var bodyHtml = document.documentElement.innerHTML;
                       var mp4Match = bodyHtml.match(new RegExp('https?://[^"\'\\s]+\\.mp4[^"\'\\s]*', 'i'));
                       if (mp4Match) {
                         sendToNative({ type: 'log', message: 'MP4 link HTML icerisinde bulundu!' });
                         sendResolved('sibnet-direct:' + mp4Match[0]);
                       } else {
                         window.__sibnetRetryDone = false;
                         sendToNative({ type: 'log', message: 'Sibnet video linki bulunamadi, tekrar denenecek...' });
                       }
                     }
                   }, 3000);
                 }
              }
              return true;
            }

            var iframes = document.querySelectorAll('iframe');
            for (var i = 0; i < iframes.length; i++) {
              var src = iframes[i].src || iframes[i].getAttribute('data-src') || '';
              if (src.includes('sibnet.ru')) {
                var sibnetId = getSibnetId(src);
                if (sibnetId) {
                  sendToNative({ type: 'log', message: 'Sibnet ID (iframe) bulundu: ' + sibnetId });
                  sendResolved('sibnet:' + sibnetId);
                  return true;
                }
                sendToNative({ type: 'log', message: 'Sibnet iframe bulundu. Yonlendiriliyor...' });
                window.__scraper_initialized = false;
                window.location.href = src;
                return true;
              }
            }
          } catch(e) {
            sendToNative({ type: 'log', message: 'checkPageForSibnetUrls error: ' + e.message });
          }
          return false;
        }

        function clickElement(el) {
          try {
            if (el.click) {
              el.click();
            } else {
              var ev = document.createEvent("MouseEvents");
              ev.initMouseEvent("click", true, true, window, 1, 0, 0, 0, 0, false, false, false, false, 0, null);
              el.dispatchEvent(ev);
            }
            sendToNative({ type: 'log', message: 'Elemente JS ile tıklandı.' });
          } catch (e) {
            sendToNative({ type: 'log', message: 'JS tıklama hatası: ' + e.message });
          }
        }

        function isUnrelatedElement(el, sourceListEl) {
          var parent = el;
          while (parent) {
            if (sourceListEl && parent === sourceListEl) return false;
            var id = (parent.id || '').toLowerCase();
            var className = (parent.className || '').toLowerCase();
            if (id === 'sourcelist' || className.indexOf('sources') !== -1 || className.indexOf('video-sources') !== -1) return false;
            parent = parent.parentElement;
          }

          parent = el;
          while (parent) {
            if (parent.tagName === 'HEADER' || parent.tagName === 'FOOTER') return true;
            var id = (parent.id || '').toLowerCase();
            var className = (parent.className || '').toLowerCase();
            if (id.indexOf('footer') !== -1 || id.indexOf('header') !== -1 || id.indexOf('sidebar') !== -1 || id.indexOf('comment') !== -1) return true;
            if (className.indexOf('footer') !== -1 || className.indexOf('header') !== -1 || className.indexOf('sidebar') !== -1 || className.indexOf('comment') !== -1) return true;
            parent = parent.parentElement;
          }
          return false;
        }

        function findLeafElementsByText(container, textQuery) {
          var root = container || document;
          var allElements = root.querySelectorAll('*');
          return Array.from(allElements).filter(function(el) {
            var text = (el.textContent || el.innerText || '').toLowerCase();
            if (text.indexOf(textQuery.toLowerCase()) === -1) return false;
            
            for (var i = 0; i < el.children.length; i++) {
              var childText = (el.children[i].textContent || el.children[i].innerText || '').toLowerCase();
              if (childText.indexOf(textQuery.toLowerCase()) !== -1) return false;
            }
            
            if (isUnrelatedElement(el, container)) return false;
            return true;
          });
        }

        function resolveClickTarget(el, container) {
          if (!el) return null;
          var parent = el;
          while (parent && parent !== container && parent !== document.body) {
            if (parent.className && typeof parent.className === 'string' && parent.className.indexOf('sourceBtn') !== -1) return parent;
            var tag = parent.tagName;
            if (tag === 'A' || tag === 'BUTTON' || tag === 'LI' || parent.hasAttribute('onclick') || parent.hasAttribute('data-url')) return parent;
            parent = parent.parentElement;
          }
          return el;
        }

        function removeAdOverlays() {
          try {
            var allElements = document.querySelectorAll('*');
            for (var i = 0; i < allElements.length; i++) {
              var el = allElements[i];
              var style = window.getComputedStyle(el);
              if (
                (style.position === 'fixed' || style.position === 'absolute') &&
                (style.zIndex && parseInt(style.zIndex) > 100) &&
                (style.width && parseFloat(style.width) >= window.innerWidth * 0.8 || el.offsetWidth >= window.innerWidth * 0.8) &&
                (style.height && parseFloat(style.height) >= window.innerHeight * 0.8 || el.offsetHeight >= window.innerHeight * 0.8) &&
                (style.opacity === '0' || parseFloat(style.opacity) < 0.1 || style.backgroundColor === 'transparent' || style.backgroundColor === 'rgba(0, 0, 0, 0)')
              ) {
                if (el.tagName !== 'HTML' && el.tagName !== 'BODY' && el !== debugDiv && !debugDiv.contains(el)) {
                  sendToNative({ type: 'log', message: 'Reklam perdesi silindi: ' + el.tagName + ' (ID: ' + el.id + ' | Class: ' + el.className + ')' });
                  el.parentNode.removeChild(el);
                }
              }
            }
          } catch(e) {}
        }

        function isPlayerLoaded() {
          try {
            var iframes = document.querySelectorAll('iframe');
            for (var i = 0; i < iframes.length; i++) {
              var src = iframes[i].src || iframes[i].getAttribute('data-src') || '';
              if (src.includes('optraco.top') || src.includes('sibnet.ru')) return true;
            }
          } catch(e) {}
          return false;
        }

        var captchaChecked = false;
        var lastClickTime = 0;
        var clickedBtnText = null;
        var checkCount = 0;
        var loggedNoCaptcha = false;
        var loggedSourceButtons = false;

        var runAutomation = function() {
          checkCount++;
          removeAdOverlays();

          try {
            if (_resolved) {
              clearInterval(automationInterval);
              return;
            }

            // --- NETWORK CHALLENGE / TURNSTILE DETECTOR ---
            try {
              var isNetworkChallenge = window.location.pathname.includes('/_aitr/network-challenge') || 
                                       window.location.pathname.includes('/api/CaptchaChallenge') || 
                                       document.querySelector('form[action*="network-challenge"]') || 
                                       document.querySelector('form[action*="verify"]') || 
                                       document.querySelector('.cf-turnstile');

              if (isNetworkChallenge) {
                var questionImg = document.querySelector('img.question');
                var questionText = questionImg ? (questionImg.getAttribute('alt') || 'Görseldeki sorunun cevabını seçin') : 'Bağlantınızı doğrulayın';
                var questionImgUrl = questionImg ? (questionImg.src || questionImg.getAttribute('src')) : null;

                if (!window.__challenge_notified) {
                  window.__challenge_notified = true;
                  sendToNative({ 
                    type: 'network_challenge_detected',
                    questionText: questionText,
                    questionImageUrl: questionImgUrl
                  });
                  sendToNative({ type: 'log', message: '⚠️ Güvenlik kontrolü algılandı: ' + questionText });
                }

                // 1. OTOMATİK CEVAP DOLDURUCU (Text Input: input[name="answer"])
                var answerInput = document.querySelector('input[name="answer"], input#answer, input.answer');
                if (answerInput && (!answerInput.value || !answerInput.value.trim())) {
                  var rawText = ((questionImg ? (questionImg.getAttribute('alt') || '') : '') + ' ' + (document.body ? document.body.innerText : '')).toLowerCase();
                  var autoAnswer = '';
                  if (rawText.includes('yoğun nüfus') || rawText.includes('en kalabalık il') || rawText.includes('nüfusa sahip')) {
                    autoAnswer = 'İstanbul';
                  } else if (rawText.includes('başkent')) {
                    autoAnswer = 'Ankara';
                  } else if (rawText.includes('yüzölçüm') || rawText.includes('en geniş')) {
                    autoAnswer = 'Konya';
                  } else if (rawText.includes('en kalabalık ikinci')) {
                    autoAnswer = 'Ankara';
                  } else if (rawText.includes('en kalabalık üçüncü')) {
                    autoAnswer = 'İzmir';
                  } else if (rawText.includes('01 plaka') || rawText.includes('plaka kodu 01')) {
                    autoAnswer = 'Adana';
                  } else if (rawText.includes('06 plaka') || rawText.includes('plaka kodu 06')) {
                    autoAnswer = 'Ankara';
                  } else if (rawText.includes('34 plaka') || rawText.includes('plaka kodu 34')) {
                    autoAnswer = 'İstanbul';
                  } else if (rawText.includes('35 plaka') || rawText.includes('plaka kodu 35')) {
                    autoAnswer = 'İzmir';
                  }

                  if (autoAnswer) {
                    answerInput.value = autoAnswer;
                    try {
                      answerInput.dispatchEvent(new Event('input', { bubbles: true }));
                      answerInput.dispatchEvent(new Event('change', { bubbles: true }));
                    } catch(e) {}
                    sendToNative({ type: 'log', message: '🤖 Güvenlik sorusu otomatik yanıtlandı: ' + autoAnswer });
                  } else if (!window.__answer_prompt_logged) {
                    window.__answer_prompt_logged = true;
                    sendToNative({ type: 'log', message: '✍️ Lütfen görseldeki sorunun cevabını yazın: ' + questionText });
                  }
                }

                // 2. TURNSTILE VE SUBMIT GÖZLEMCİSİ
                var turnstileInput = document.querySelector('input[name="cf-turnstile-response"]') || document.querySelector('input[id*="cf-chl-widget"]');
                if (turnstileInput && turnstileInput.value && !window.__turnstile_submitted) {
                  // Cevap inputu varsa ve hala boşsa, kullanıcı cevabı yazana kadar submit YAPMA!
                  if (answerInput && !answerInput.value.trim()) {
                    if (!window.__turnstile_waiting_logged) {
                      window.__turnstile_waiting_logged = true;
                      sendToNative({ type: 'log', message: '⏳ Turnstile onaylandı! Soru cevabını yazmanız bekleniyor...' });
                    }
                  } else {
                    window.__turnstile_submitted = true;
                    sendToNative({ type: 'log', message: '✅ Turnstile token ve cevap hazır! Form gönderiliyor...' });
                    var submitBtn = document.querySelector('button[type="submit"]') || 
                                    document.querySelector('form[action*="network-challenge"] button') || 
                                    document.querySelector('form[action*="verify"] button') || 
                                    document.querySelector('form button');
                    if (submitBtn) {
                      setTimeout(function() {
                        clickElement(submitBtn);
                      }, 300);
                    }
                  }
                }
              }
            } catch(chErr) {
              sendToNative({ type: 'log', message: 'Challenge detector hatası: ' + chErr.message });
            }
            // ----------------------------------------------

            checkPageForExplorerUrls();
            if (_resolved) { clearInterval(automationInterval); return; }

            if (checkPageForSibnetUrls()) {
              clearInterval(automationInterval);
              return;
            }

            var captchaImgs = [];
            try {
              captchaImgs = Array.from(document.querySelectorAll('.captcha-image'));
              if (captchaImgs.length === 0) {
                var allImgs = Array.from(document.querySelectorAll('img'));
                captchaImgs = allImgs.filter(function(img) {
                  var src = img.src || img.getAttribute('src') || '';
                  return src.toLowerCase().includes('captcha') && (src.includes('hash=') || src.includes('cid='));
                });
              }
            } catch(e) {}

            var sourceButtons = [];
            try {
              var sourceListEl = document.getElementById('sourceList') || document.querySelector('.sources') || document.querySelector('.video-sources');
              if (!sourceListEl && document.querySelector('.sourceBtn')) {
                sourceListEl = document.body;
              }
              if (sourceListEl) {
                var keywords = ['aitr', 'sibnet', 'filemoon', 'filesfm', 'hexupload', 'mailru', 'plus', 'player'];
                keywords.forEach(function(kw) {
                  var matches = findLeafElementsByText(sourceListEl, kw);
                  for (var m = 0; m < matches.length; m++) {
                    var leafEl = matches[m];
                    var optimalTarget = resolveClickTarget(leafEl, sourceListEl);
                    if (optimalTarget && sourceButtons.indexOf(optimalTarget) === -1) {
                      sourceButtons.push(optimalTarget);
                    }
                  }
                });
              }
            } catch(e) {}

            if (sourceButtons.length > 0 && captchaImgs.length === 0) {
              if (!loggedNoCaptcha) {
                loggedNoCaptcha = true;
                sendToNative({ type: 'log', message: 'Captcha yok — kaynak butonlari dogrudan gorunuyor. (' + sourceButtons.length + ' kaynak)' });
              }
            }

            var validCaptchaImgs = captchaImgs.filter(function(el) {
              var h = el.getAttribute('icon-hash');
              return h && h.length > 5;
            });

            if (validCaptchaImgs.length === 5 && !captchaChecked) {
              captchaChecked = true;
              var captchaHolder = document.querySelector('.captcha-holder') || document.body;
              var cid = captchaHolder ? (captchaHolder.getAttribute('data-captcha-id') || '0') : '0';

              sendToNative({ type: 'log', message: '🛡️ IconCaptcha hazır (5 görsel). Farklı olan analiz ediliyor...' });
              sendToNative({ type: 'captcha_detected', message: 'Bot koruması bulundu.' });

              (function() {
                try {
                  captchaHolder.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
                  if (window.jQuery) {
                    window.jQuery(captchaHolder).trigger('mouseenter');
                  }
                } catch(e) {}

                var iconData = validCaptchaImgs.map(function(el, idx) {
                  var hash = el.getAttribute('icon-hash') || '';
                  var bg = el.style.backgroundImage || window.getComputedStyle(el).backgroundImage || '';
                  var src = '';
                  if (bg && bg.indexOf('url(') !== -1) {
                    src = bg.split('url(')[1].split(')')[0].replace(/['"]/g, '').trim();
                  }
                  if (!src && hash) {
                    var vPath = window.__iconCaptchaValidationPath || '/api/Captcha/';
                    src = vPath + '?cid=' + cid + '&hash=' + hash;
                  }
                  if (src && !src.startsWith('http')) {
                    src = window.location.origin + (src.startsWith('/') ? '' : '/') + src;
                  }
                  return { element: el, hash: hash, src: src, index: idx };
                });

                var fetchPromises = iconData.map(function(item) {
                  if (!item.src) return Promise.resolve({ element: item.element, hash: item.hash, size: 0, buffer: null, index: item.index });
                  return fetch(item.src, { credentials: 'include', cache: 'force-cache' })
                    .then(function(res) { 
                      if (!res.ok) throw new Error('HTTP ' + res.status);
                      return res.arrayBuffer(); 
                    })
                    .then(function(buf) {
                      return { element: item.element, hash: item.hash, size: buf.byteLength, buffer: new Uint8Array(buf), index: item.index };
                    })
                    .catch(function(err) {
                      sendToNative({ type: 'log', message: '⚠️ Görsel #' + (item.index + 1) + ' indirme uyarısı: ' + err.message });
                      return { element: item.element, hash: item.hash, size: 0, buffer: null, index: item.index };
                    });
                });

                Promise.all(fetchPromises).then(function(results) {
                  sendToNative({ 
                    type: 'log', 
                    message: '📊 Görsel boyutları: ' + results.map(function(r) { return '#' + (r.index + 1) + ': ' + r.size + 'B'; }).join(' | ') 
                  });

                  var sizeFreq = {};
                  results.forEach(function(r) {
                    if (r.size > 0) {
                      sizeFreq[r.size] = (sizeFreq[r.size] || 0) + 1;
                    }
                  });

                  var outlier = results.find(function(r) {
                    return r.size > 0 && sizeFreq[r.size] === 1;
                  });

                  // Eğer boyutlar tamamen aynıysa (örn. hepsi 1420B), bayt fark matrisi ile en yüksek farka sahip olanı seç
                  if (!outlier && results.some(function(r) { return r.buffer && r.buffer.length > 0; })) {
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
                      if (totalDiff > maxDiff) {
                        maxDiff = totalDiff;
                        outlierIdx = i;
                      }
                    }
                    outlier = results[outlierIdx];
                    sendToNative({ type: 'log', message: '🔬 Bayt fark matrisi ile farklı görsel bulundu: #' + (outlierIdx + 1) });
                  }

                  if (!outlier) {
                    outlier = results[0];
                  }

                  sendToNative({ 
                    type: 'log', 
                    message: '🎯 Farklı olan görsel: #' + (outlier.index + 1) + ' (Hash: ' + (outlier.hash ? outlier.hash.substring(0, 8) : 'yok') + '... Boyut: ' + outlier.size + 'B)' 
                  });

                  // 1. Reklam katmanlarını temizle ve IconCaptcha yüklenme kilidini kaldır
                  purgeClickBlockingOverlays();
                  var iconsCont = captchaHolder.querySelector('.captcha-modal__icons');
                  if (iconsCont) {
                    iconsCont.classList.remove('captcha-opacity');
                    var ldr = iconsCont.querySelector('.captcha-loader');
                    if (ldr) ldr.remove();
                  }
                  if (window.jQuery && iconsCont) {
                    window.jQuery(iconsCont).removeClass('captcha-opacity');
                    window.jQuery(iconsCont).find('.captcha-loader').remove();
                  }

                  // 2. Akıllı Tıklama Pulse Zinciri (Çoklu aralıklarla tıklama garantisi)
                  var pulseDelays = [350, 1200, 2200, 3200];
                  pulseDelays.forEach(function(delay, idx) {
                    setTimeout(function() {
                      if (window.__captcha_solved_success || document.querySelector('.captcha-success')) {
                        return;
                      }
                      sendToNative({ 
                        type: 'log', 
                        message: '⚡ [' + (idx + 1) + '/' + pulseDelays.length + '] Görsele tıklama gönderiliyor (' + delay + 'ms)...' 
                      });
                      simulateIconCaptchaClick(outlier.element, cid);

                      // Yedek olarak istek taklidini de 2. pulse sırasında gönder
                      if (idx === 1 && outlier.hash) {
                        submitCaptchaDirectly(outlier.hash, cid);
                      }
                    }, delay);
                  });

                  // 3. Sonuç Kontrolü & Başarı Yönetimi
                  setTimeout(function() {
                    var successEl = document.querySelector('.captcha-success');
                    if (successEl || window.__captcha_solved_success) {
                      sendToNative({ type: 'log', message: '🎉 IconCaptcha başarıyla geçildi!' });
                      handlePostCaptchaSuccess(outlier.hash, cid);
                    } else {
                      sendToNative({ type: 'log', message: '⚠️ Captcha yanıtı bekleniyor, yeniden taranacak...' });
                      captchaChecked = false;
                    }
                  }, 4500);

                }).catch(function(err) {
                  sendToNative({ type: 'log', message: '❌ Görsel boyutu analiz hatası: ' + err.message });
                  captchaChecked = false;
                });
              })();
              return;
            }

            var now = Date.now();
            var shouldClick = true;

            if (clickedBtnText && (now - lastClickTime < 5000)) shouldClick = false;
            if (isPlayerLoaded()) shouldClick = false;

            // Fansub Selection based on user priorities
            var fansubSelectors = document.querySelectorAll('.fansubSelector, [data-fad]');
            if (fansubSelectors && fansubSelectors.length > 0 && !window.__fansub_clicked) {
              var priorities = window.__FANSUB_PRIORITY || ['TRanimeizle', 'seicode', 'BabaPro Fansub'];
              var targetFansubBtn = null;
              var chosenFsName = '';

              for (var p = 0; p < priorities.length; p++) {
                var pName = (priorities[p] || '').toLowerCase().trim();
                for (var f = 0; f < fansubSelectors.length; f++) {
                  var fEl = fansubSelectors[f];
                  var fName = (fEl.getAttribute('data-fad') || fEl.textContent || '').toLowerCase().trim();
                  if (fName && (fName === pName || fName.indexOf(pName) !== -1 || pName.indexOf(fName) !== -1)) {
                    targetFansubBtn = fEl;
                    chosenFsName = fEl.getAttribute('data-fad') || fEl.textContent.trim();
                    break;
                  }
                }
                if (targetFansubBtn) break;
              }

              if (!targetFansubBtn) {
                targetFansubBtn = document.querySelector('.fansubSelector.active') || fansubSelectors[0];
                chosenFsName = targetFansubBtn ? (targetFansubBtn.getAttribute('data-fad') || targetFansubBtn.textContent.trim()) : '';
              }

              if (targetFansubBtn) {
                var hasActiveBg = targetFansubBtn.classList.contains('active') || (targetFansubBtn.getAttribute('style') || '').indexOf('#eb0254') !== -1;
                if (!hasActiveBg && !window.__fansub_clicked) {
                  window.__fansub_clicked = true;
                  sendToNative({ type: 'log', message: 'Fansub seçiliyor: ' + chosenFsName });
                  clickElement(targetFansubBtn);
                }
              }
            }

            if (shouldClick && sourceButtons.length > 0) {
              var aitrVipBtn = null;
              var sibnetBtn = null;
              var foundTexts = [];
              for (var b = 0; b < sourceButtons.length; b++) {
                var btnText = (sourceButtons[b].textContent || sourceButtons[b].innerText || '').toLowerCase().trim();
                if (btnText) foundTexts.push(btnText);
                if (btnText.indexOf('aitr') !== -1 && !aitrVipBtn) aitrVipBtn = sourceButtons[b];
                if (btnText.indexOf('sibnet') !== -1 && !sibnetBtn) sibnetBtn = sourceButtons[b];
              }
              if (foundTexts.length > 0 && (!loggedSourceButtons || checkCount % 10 === 0)) {
                  sendToNative({ type: 'log', message: 'Bulunan buton metinleri: ' + foundTexts.join(' | ').substring(0, 100) });
              }

              if (!aitrVipBtn && !sibnetBtn) {
                if (checkCount > 30) {
                   clearInterval(automationInterval);
                   sendToNative({ type: 'noSource', message: 'Bu bolum icin desteklenen bir kaynak bulunamadi.' });
                }
                return;
              }

              if (aitrVipBtn) {
                if (!loggedSourceButtons) {
                  loggedSourceButtons = true;
                  sendToNative({ type: 'log', message: 'AitrVip kaynagi bulundu. Tiklaniyor...' });
                }
                clickElement(aitrVipBtn);
                lastClickTime = now;
                clickedBtnText = 'aitrvip';
              } else if (sibnetBtn) {
                if (!loggedSourceButtons) {
                  loggedSourceButtons = true;
                  sendToNative({ type: 'log', message: 'Sibnet kaynagi bulundu. Tiklaniyor...' });
                }
                clickElement(sibnetBtn);
                lastClickTime = now;
                clickedBtnText = 'sibnet';
              }
            }

          } catch (e) {
            sendToNative({ type: 'log', message: '[BOT HATA] ' + e.message });
          }
        };

        sendToNative({ type: 'log', message: 'Automation baslatiliyor...' });
        var automationInterval = setInterval(runAutomation, 500);

      })();
    } catch(err) {
       if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
           window.ReactNativeWebView.postMessage(JSON.stringify({type: 'error', message: 'Fatal Script Error: ' + err.message}));
       }
    }
    true;
`;
