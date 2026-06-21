/**
 * Shared Scraper Script for resolving tranimeizle.io video streams.
 * Includes canvas-based pixel comparison captcha solver and hover/click event simulation.
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
            sendToNative({ type: 'log', message: 'window.open engellendi (Reklam): ' + url });
            return null;
          };
        } catch(e) {}
        // --------------------------------------------------------

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

        var messageQueue = [];
        
        var debugDiv = document.createElement('div');
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

        var _resolved = false;
        function sendResolved(videoUrl) {
          if (_resolved) return;
          _resolved = true;
          sendToNative({ type: 'resolved', videoUrl: videoUrl });
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
                 if (playBtn) requestNativeTouch(playBtn);
                 
                 if (!window.__sibnetRetryDone) {
                   window.__sibnetRetryDone = true;
                   setTimeout(function() {
                     if (_resolved) return;
                     var vid = document.querySelector('video');
                     if (vid && vid.currentSrc && (vid.currentSrc.indexOf('.mp4') !== -1 || vid.currentSrc.indexOf('http') === 0)) {
                       sendResolved('sibnet-direct:' + vid.currentSrc);
                     } else {
                       var bodyHtml = document.documentElement.innerHTML;
                       var mp4Match = bodyHtml.match(/https?:\\/\\/[^"'\s]+\\.mp4[^"'\s]*/i);
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
            sendToNative({ type: 'log', message: 'Elemente JS ile tıklandı (Reklamsız hızlı geçiş).' });
          } catch (e) {
            sendToNative({ type: 'log', message: 'JS tıklama hatası: ' + e.message });
          }
        }

        function requestNativeTouch(el) {
          try {
            if (el.scrollIntoView) {
              el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
            }
          } catch(e){}

          setTimeout(function() {
            try {
              if (typeof simulateIconCaptchaClick === 'function') {
                simulateIconCaptchaClick(el);
              }
              
              var rect = el.getBoundingClientRect();
              var x = rect.left + (rect.width / 2);
              var y = rect.top + (rect.height / 2);
              
              if (x === 0 || y === 0 || rect.width === 0) {
                 sendToNative({ type: 'log', message: 'Element gorunmez veya 0x0.' });
                 return;
              }
              
              // CSS piksel koordinatlarını tam fiziksel piksele çeviriyoruz
              var physicalX = x * window.devicePixelRatio;
              var physicalY = y * window.devicePixelRatio;

              sendToNative({ type: 'log', message: 'Donanımsal (Native) Tıklama gönderiliyor: X:' + Math.round(x) + ' Y:' + Math.round(y) + ' (Fiziksel X:' + Math.round(physicalX) + ' Y:' + Math.round(physicalY) + ')' });
              sendToNative({ type: 'native_touch', x: physicalX, y: physicalY });
            } catch(e) {
              sendToNative({ type: 'log', message: 'Native touch hatasi: ' + e.message });
            }
          }, 100);
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
            } else if (captchaImgs.length === 0 && checkCount % 10 === 0) {
              try {
                var sourceListEl = document.getElementById('sourceList') || document.querySelector('.sources') || document.querySelector('.video-sources');
                if (sourceListEl) {
                  var elInfo = 'tag=' + sourceListEl.tagName + ', id=' + sourceListEl.id + ', class=' + sourceListEl.className;
                  sendToNative({ type: 'log', message: 'Kaynak alani bulundu (' + elInfo + ')' });
                } else {
                  sendToNative({ type: 'log', message: 'Sayfada kaynak alani (sourcelist) bulunamadi!' });
                }
                
                var allSourceBtnEls = Array.from(document.querySelectorAll('.sourceBtn')).map(function(el) {
                  return (el.textContent || el.innerText || '').trim();
                }).join(' | ');
                if(allSourceBtnEls) sendToNative({ type: 'log', message: '.sourceBtn: ' + allSourceBtnEls });

                var aitrEls = Array.from(document.querySelectorAll('*')).filter(function(el) {
                  var text = (el.textContent || el.innerText || '').toLowerCase();
                  return (text.includes('aitr') || text.includes('sibnet')) && el.children.length === 0;
                }).map(function(el) {
                  return el.tagName + ': ' + (el.textContent || el.innerText || '').trim();
                }).slice(0, 3).join(' | ');
                if(aitrEls) sendToNative({ type: 'log', message: 'Aitr/Sibnet yapraklari: ' + aitrEls });
              } catch(e) {
                sendToNative({ type: 'log', message: 'Log hatasi: ' + e.message });
              }
            }

            if (captchaImgs.length === 5 && !captchaChecked) {
              captchaChecked = true;
              var detectionTime = Date.now();
              sendToNative({ type: 'log', message: 'Captcha tespit edildi. Piksel analizi (Canvas) baslatiliyor...' });

              (function() {
                var imgs = captchaImgs;
                var loadedImages = [];
                var loadedCount = 0;

                function analyzePixels() {
                  try {
                    var canvases = [];
                    var ctxs = [];
                    var pixelData = [];
                    var width = 40;
                    var height = 40;

                    for (var i = 0; i < imgs.length; i++) {
                      var canvas = document.createElement('canvas');
                      canvas.width = width;
                      canvas.height = height;
                      var ctx = canvas.getContext('2d');
                      ctx.drawImage(loadedImages[i], 0, 0, width, height);
                      var imgData = ctx.getImageData(0, 0, width, height).data;
                      pixelData.push(imgData);
                    }

                    // Calculate pairwise differences
                    var diffSums = [0, 0, 0, 0, 0];
                    for (var i = 0; i < 5; i++) {
                      for (var j = i + 1; j < 5; j++) {
                        var diff = 0;
                        var data1 = pixelData[i];
                        var data2 = pixelData[j];
                        for (var k = 0; k < data1.length; k += 4) {
                          diff += Math.abs(data1[k] - data2[k]);       // R
                          diff += Math.abs(data1[k+1] - data2[k+1]);   // G
                          diff += Math.abs(data1[k+2] - data2[k+2]);   // B
                        }
                        diffSums[i] += diff;
                        diffSums[j] += diff;
                      }
                    }

                    // Outlier has the maximum sum of differences
                    var maxDiff = -1;
                    var outlierIndex = 0;
                    for (var i = 0; i < 5; i++) {
                      if (diffSums[i] > maxDiff) {
                        maxDiff = diffSums[i];
                        outlierIndex = i;
                      }
                    }

                    sendToNative({ type: 'log', message: 'Gorsel piksel farklari: ' + diffSums.join(', ') });
                    sendToNative({ type: 'log', message: 'En farkli gorsel bulundu (#' + (outlierIndex + 1) + ')' });

                    var targetEl = imgs[outlierIndex];
                    var timeElapsed = Date.now() - detectionTime;
                    var remainingDelay = Math.max(0, 2500 - timeElapsed);

                    setTimeout(function() {
                      sendToNative({ type: 'log', message: 'Donanımsal (Native) Tıklama gönderiliyor...' });
                      requestNativeTouch(targetEl);

                      // 4 saniye bekle, çözülmezse yenile veya sıfırla
                      setTimeout(function() {
                        if (!_resolved) {
                          var reloadCount = parseInt(sessionStorage.getItem('captcha_reloads') || '0');
                          if (reloadCount < 2) {
                            sessionStorage.setItem('captcha_reloads', reloadCount + 1);
                            sendToNative({ type: 'log', message: 'Sistem zorlanıyor, sayfa YENİLENİYOR (Reload ' + (reloadCount+1) + ')...' });
                            window.location.reload();
                          } else {
                            sendToNative({ type: 'log', message: 'Tüm donanımsal dokunuşlar başarısız. Lütfen ekrana BİR KEZ dokunun.' });
                            captchaChecked = false;
                          }
                        } else {
                          captchaChecked = false;
                        }
                      }, 4000);

                    }, remainingDelay);
                  } catch(e) {
                    sendToNative({ type: 'log', message: 'Piksel analiz hatasi: ' + e.message });
                    captchaChecked = false;
                  }
                }

                for (var k = 0; k < imgs.length; k++) {
                  (function(index) {
                    var imgEl = imgs[index];
                    var bgStyle = imgEl.style.backgroundImage || window.getComputedStyle(imgEl).backgroundImage || '';
                    var srcUrl = getCleanUrl(bgStyle) || imgEl.src || imgEl.getAttribute('src') || '';

                    if (srcUrl) {
                      var absoluteUrl = new URL(srcUrl, window.location.href).href;
                      var tempImg = new Image();
                      tempImg.crossOrigin = "anonymous";
                      tempImg.onload = function() {
                        loadedCount++;
                        if (loadedCount === 5) {
                          analyzePixels();
                        }
                      };
                      tempImg.onerror = function() {
                        sendToNative({ type: 'log', message: 'Gorsel ' + (index + 1) + ' canvas yukleme hatasi.' });
                        captchaChecked = false;
                      };
                      loadedImages[index] = tempImg;
                      tempImg.src = absoluteUrl;
                    } else {
                      sendToNative({ type: 'log', message: 'Gorsel ' + (index + 1) + ' URL bulunamadi.' });
                      captchaChecked = false;
                    }
                  })(k);
                }
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
