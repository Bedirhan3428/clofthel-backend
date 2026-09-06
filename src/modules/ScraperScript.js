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
        try {
          if (navigator.userActivation === undefined || !navigator.userActivation.hasBeenActive) {
            Object.defineProperty(navigator, 'userActivation', {
              get: function() { return { hasBeenActive: true, isActive: true }; }
            });
          }
          Object.defineProperty(navigator, 'webdriver', { get: function() { return false; } });
          
          // window.open override ederek yeni sekmede reklam açılmasını engelliyoruz
          window.open = function(url) {
            sendToNative({ type: 'log', message: '🚫 window.open (Reklam) engellendi: ' + url });
            return null;
          };
        } catch(e) {}
        // --------------------------------------------------------

        var messageQueue = [];
        
        var debugDiv = document.createElement('div');
        debugDiv.id = '__scraper_debug';
        debugDiv.style.position = 'fixed';
        debugDiv.style.top = '0';
        debugDiv.style.left = '0';
        debugDiv.style.width = '100%';
        debugDiv.style.maxHeight = '40%';
        debugDiv.style.overflow = 'auto';
        debugDiv.style.backgroundColor = 'rgba(0,0,0,0.85)';
        debugDiv.style.color = '#0f0';
        debugDiv.style.zIndex = '999999';
        debugDiv.style.fontSize = '11px';
        debugDiv.style.pointerEvents = 'none';
        debugDiv.style.padding = '5px';
        if (document.documentElement) {
          document.documentElement.appendChild(debugDiv);
        }

        function logToScreen(msg) {
          if (!debugDiv.parentNode && document.documentElement) {
            document.documentElement.appendChild(debugDiv);
          }
          var p = document.createElement('div');
          p.innerText = msg;
          debugDiv.appendChild(p);
          debugDiv.scrollTop = debugDiv.scrollHeight;
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
              'ins, [class*="kesem"], [id*="ad-container"], [class*="video-ad"], [class*="banner"], [class*="sponsor"], iframe[src*="ad"], iframe[src*="track"], iframe[src="about:blank"], div[style*="z-index: 214748364"]:not(#__scraper_debug), div[style*="z-index: 999999"]:not(#__scraper_debug), div[style*="z-index: 99999"]:not(#__scraper_debug) {',
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

        // Doğrudan API Onaylayıcı Yardımcı Fonksiyon
        function submitCaptchaDirectly(hash, cid) {
          cid = cid || 0;
          if (!hash) return;
          sendToNative({ type: 'log', message: '⚡ Captcha API doğrudan onaylanıyor (Hash: ' + hash.substring(0, 8) + '...)' });

          if (window.jQuery) {
            window.jQuery('input[name="captcha-hf"]').val(hash);
            window.jQuery('input[name="captcha-idhf"]').val(cid);
            window.jQuery.ajax({
              url: '/api/Captcha/',
              type: 'POST',
              data: { cID: cid, pC: hash, rT: 2 },
              success: function() {
                sendToNative({ type: 'log', message: '🎉 Captcha API onayı başarılı! Sayfa yönlendiriliyor...' });
                var $holder = window.jQuery('.captcha-holder');
                $holder.addClass('captcha-success');
                $holder.find('.captcha-modal__icons').html(
                  '<div class="captcha-modal__icons-title">İyi seyirler!</div>' +
                  '<div class="captcha-modal__icons-subtitle">Doğrulamanız için teşekkürler.</div>'
                );
                $holder.trigger('success', [{ captcha_id: cid }]);
                $holder.trigger('success.iconCaptcha', [cid]);
              },
              error: function(err) {
                sendToNative({ type: 'log', message: 'Captcha API yanıtı: ' + (err.statusText || 'Tamamlandı') });
              }
            });
          } else {
            var fd = new URLSearchParams();
            fd.append('cID', cid);
            fd.append('pC', hash);
            fd.append('rT', '2');
            fetch('/api/Captcha/', {
              method: 'POST',
              body: fd,
              headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }
            }).then(function(res) {
              if (res.ok) {
                sendToNative({ type: 'log', message: '🎉 Captcha API onayı (Fetch) başarılı!' });
                var holder = document.querySelector('.captcha-holder');
                if (holder) {
                  holder.classList.add('captcha-success');
                  var icons = holder.querySelector('.captcha-modal__icons');
                  if (icons) {
                    icons.innerHTML = '<div class="captcha-modal__icons-title">İyi seyirler!</div><div class="captcha-modal__icons-subtitle">Doğrulamanız için teşekkürler.</div>';
                  }
                }
              }
            }).catch(function(e) {});
          }
        }

        // 5. Kalıcı Hover Kalp Atışı (Heartbeat) & Doğrudan Dokunuş Yakalama
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
          }, 100);

          var handleDirectCaptchaTap = function(e) {
            var target = e.target;
            var imgEl = target ? (target.classList && target.classList.contains('captcha-image') ? target : target.closest && target.closest('.captcha-image')) : null;
            if (!imgEl) return;

            var hash = imgEl.getAttribute('icon-hash');
            var holder = imgEl.closest('.captcha-holder');
            var cid = holder ? (holder.getAttribute('data-captcha-id') || '0') : '0';

            sendToNative({ type: 'log', message: '👆 Dokunuş algılandı (Hash: ' + (hash ? hash.substring(0, 8) + '...' : 'Görsel') + ')' });

            if (holder) {
              try {
                holder.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
                if (window.jQuery) window.jQuery(holder).trigger('mouseenter');
              } catch(e) {}
            }

            // 250ms içinde IconCaptcha normal yoldan onay alamazsa, doğrudan API ile onayla!
            setTimeout(function() {
              if (!holder) return;
              var isSuccess = holder.classList.contains('captcha-success') || (holder.querySelector && holder.querySelector('.captcha-success'));
              if (!isSuccess && hash) {
                submitCaptchaDirectly(hash, cid);
              }
            }, 250);
          };

          document.addEventListener('click', handleDirectCaptchaTap, true);
          document.addEventListener('touchend', handleDirectCaptchaTap, true);
        } catch(e) {}

        // =========================================================================

        function getCleanUrl(bgStyle) {
          if (!bgStyle || bgStyle === 'none') return '';
          var match = bgStyle.match(/url\\(['"]?([^'"]+?)['"]?\\)/i);
          return match ? match[1] : '';
        }

        function simulateIconCaptchaClick(el) {
          try {
            var rect = el.getBoundingClientRect();
            var x = rect.left + (rect.width / 2);
            var y = rect.top + (rect.height / 2);
            
            var mouseOverEvent = new MouseEvent('mouseover', {
              bubbles: true, cancelable: true, view: window, clientX: x, clientY: y
            });
            el.dispatchEvent(mouseOverEvent);

            var mouseEnterEvent = new MouseEvent('mouseenter', {
              bubbles: true, cancelable: true, view: window, clientX: x, clientY: y
            });
            el.dispatchEvent(mouseEnterEvent);

            var mouseDownEvent = new MouseEvent('mousedown', {
              bubbles: true, cancelable: true, view: window, clientX: x, clientY: y
            });
            el.dispatchEvent(mouseDownEvent);

            var mouseUpEvent = new MouseEvent('mouseup', {
              bubbles: true, cancelable: true, view: window, clientX: x, clientY: y
            });
            el.dispatchEvent(mouseUpEvent);

            var clickEvent = new MouseEvent('click', {
              bubbles: true, cancelable: true, view: window, clientX: x, clientY: y
            });
            el.dispatchEvent(clickEvent);
          } catch(err) {
            sendToNative({ type: 'log', message: 'Event tetikleme hatasi: ' + err.message });
          }
        }

        function detectCurrentFansub() {
          try {
            var activeBtn = document.querySelector('.fansubBtn.active, .sourceBtn.active, .selected-fansub, .selected-source, .source.active, .btn-primary');
            if (activeBtn) {
              var txt = (activeBtn.textContent || activeBtn.innerText || '').trim();
              if (txt) return txt;
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
              var match = url.match(/[?&]id=(\\d+)/);
              if (match) return match[1];
              var pathMatch = url.match(/\\/video(\\d+)/) || url.match(/\\/v\\/(\\d+)/);
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
              var srcMatch = html.match(/src\\s*:\\s*["'](\\/v\\/[^"']+)["']/i);
              
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
                       var mp4Match = bodyHtml.match(/https?:\\/\\/[^"'\\s]+\\.mp4[^"'\\s]*/i);
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
              var isNetworkChallenge = window.location.pathname.includes('/_aitr/network-challenge') || document.querySelector('form[action*="network-challenge"]');
              if (isNetworkChallenge && !window.__challenge_notified) {
                window.__challenge_notified = true;
                sendToNative({ type: 'log', message: '⚠️ Network Challenge tespit edildi!' });

                var questionImg = document.querySelector('img.question');
                var questionText = questionImg ? (questionImg.getAttribute('alt') || 'Görseldeki sorunun cevabını seçin') : 'Bağlantınızı doğrulayın';
                var questionImgUrl = questionImg ? (questionImg.src || questionImg.getAttribute('src')) : null;

                var options = [];
                var radioLabels = document.querySelectorAll('label.option, label:has(input[type="radio"])');
                for (var r = 0; r < radioLabels.length; r++) {
                  var labelEl = radioLabels[r];
                  var radioInput = labelEl.querySelector('input[type="radio"]');
                  var spanText = labelEl.querySelector('span') || labelEl;
                  if (radioInput) {
                    var rect = radioInput.getBoundingClientRect();
                    var x = rect.left + (rect.width / 2);
                    var y = rect.top + (rect.height / 2);
                    options.push({
                      id: radioInput.value,
                      text: (spanText.textContent || spanText.innerText || '').trim(),
                      physicalX: x * window.devicePixelRatio,
                      physicalY: y * window.devicePixelRatio
                    });
                  }
                }

                sendToNative({
                  type: 'network_challenge_detected',
                  questionText: questionText,
                  questionImageUrl: questionImgUrl,
                  options: options
                });
              }

              // Turnstile Token Observer Loop
              var turnstileInput = document.querySelector('input[name="cf-turnstile-response"]') || document.querySelector('input[id*="cf-chl-widget"]');
              if (turnstileInput && turnstileInput.value && !window.__turnstile_submitted) {
                window.__turnstile_submitted = true;
                sendToNative({ type: 'log', message: '✅ Turnstile Token alındı! Submit butonu tetikleniyor...' });

                var submitBtn = document.querySelector('button[type="submit"]') || document.querySelector('form[action*="network-challenge"] button');
                if (submitBtn) {
                  clickElement(submitBtn);
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

            if (captchaImgs.length === 5 && !captchaChecked) {
              captchaChecked = true;
              sendToNative({ type: 'log', message: '🛡️ IconCaptcha tespit edildi (5 görsel). Farklı olan analiz ediliyor...' });
              sendToNative({ type: 'captcha_detected', message: 'Bot koruması bulundu.' });

              (function() {
                var captchaHolder = document.querySelector('.captcha-holder') || document.body;

                try {
                  captchaHolder.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
                  if (window.jQuery) {
                    window.jQuery(captchaHolder).trigger('mouseenter');
                  }
                } catch(e) {}

                var iconData = captchaImgs.map(function(el, idx) {
                  var hash = el.getAttribute('icon-hash') || '';
                  var bg = el.style.backgroundImage || window.getComputedStyle(el).backgroundImage || '';
                  var match = bg.match(/url\\(['"]?([^'"]+?)['"]?\\)/i);
                  var src = match ? match[1] : '';
                  if (!src && hash) {
                    src = '/api/Captcha/?cid=0&hash=' + hash;
                  }
                  return { element: el, hash: hash, src: src, index: idx };
                });

                var fetchPromises = iconData.map(function(item) {
                  if (!item.src) return Promise.resolve({ element: item.element, hash: item.hash, size: 0, index: item.index });
                  return fetch(item.src, { credentials: 'same-origin' })
                    .then(function(res) { return res.arrayBuffer(); })
                    .then(function(buf) {
                      return { element: item.element, hash: item.hash, size: buf.byteLength, index: item.index };
                    })
                    .catch(function(err) {
                      return { element: item.element, hash: item.hash, size: 0, index: item.index };
                    });
                });

                Promise.all(fetchPromises).then(function(results) {
                  sendToNative({ 
                    type: 'log', 
                    message: '📊 Görsel boyutları: ' + results.map(function(r) { return '#' + (r.index + 1) + ': ' + r.size + 'B'; }).join(' | ') 
                  });

                  var sizeFreq = {};
                  results.forEach(function(r) {
                    sizeFreq[r.size] = (sizeFreq[r.size] || 0) + 1;
                  });

                  var outlier = results.find(function(r) {
                    return sizeFreq[r.size] === 1;
                  }) || results[0];

                  sendToNative({ 
                    type: 'log', 
                    message: '🎯 Farklı olan görsel: #' + (outlier.index + 1) + ' (Hash: ' + (outlier.hash ? outlier.hash.substring(0, 8) : 'yok') + '... Boyut: ' + outlier.size + 'B)' 
                  });

                  // Dokunuş kilidi kaldırıldığı için uzun süre beklemeden hızlıca onayla
                  setTimeout(function() {
                    var targetEl = outlier.element;
                    var rect = targetEl.getBoundingClientRect();
                    var x = rect.left + (rect.width / 2);
                    var y = rect.top + (rect.height / 2);
                    var pageX = (window.pageXOffset || document.documentElement.scrollLeft || 0) + x;
                    var pageY = (window.pageYOffset || document.documentElement.scrollTop || 0) + y;

                    sendToNative({ 
                      type: 'log', 
                      message: '⚡ Otomatik çözüm tetikleniyor...' 
                    });

                    // A) Container üzerinde mouseenter tazele
                    try {
                      captchaHolder.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
                      if (window.jQuery) {
                        window.jQuery(captchaHolder).trigger('mouseenter');
                      }
                    } catch(e) {}

                    // B) jQuery Event ile tıkla
                    if (window.jQuery) {
                      try {
                        var $target = window.jQuery(targetEl);
                        var offset = $target.offset() || { left: x, top: y };
                        var jqEvent = window.jQuery.Event('click', {
                          pageX: offset.left + 20,
                          pageY: offset.top + 20,
                          target: targetEl
                        });
                        $target.trigger(jqEvent);
                        sendToNative({ type: 'log', message: '✅ jQuery IconCaptcha click eventi tetiklendi.' });
                      } catch(jqErr) {}
                    }

                    // C) Gerçek DOM MouseEvent zinciri
                    var events = ['mouseover', 'mouseenter', 'mousemove', 'mousedown', 'mouseup', 'click'];
                    events.forEach(function(evType) {
                      try {
                        var ev = new MouseEvent(evType, {
                          bubbles: true,
                          cancelable: true,
                          view: window,
                          clientX: x,
                          clientY: y,
                          screenX: x,
                          screenY: y,
                          pageX: pageX,
                          pageY: pageY
                        });
                        targetEl.dispatchEvent(ev);
                      } catch(e) {}
                    });

                    // D) Doğrudan API Onayı (JNI yerine garantili ve anlık HTTP doğrulaması)
                    if (typeof submitCaptchaDirectly === 'function' && outlier.hash) {
                      submitCaptchaDirectly(outlier.hash, 0);
                    }

                    // E) Sonuç kontrolü
                    setTimeout(function() {
                      var successEl = document.querySelector('.captcha-success');
                      if (successEl) {
                        sendToNative({ type: 'log', message: '🎉 IconCaptcha başarıyla geçildi!' });
                      } else {
                        captchaChecked = false;
                      }
                    }, 1500);

                  }, 300);

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
