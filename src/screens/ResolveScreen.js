import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Animated,
  Platform,
  findNodeHandle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { fetchEpisodeVideoUrl, cacheEpisodeVideoUrl } from '../services/api';
import TouchInjector from '../modules/TouchInjector';
import { API_BASE_URL } from '../constants/config';

let WebView = null;
if (Platform.OS !== 'web') {
  try {
    WebView = require('react-native-webview').WebView;
  } catch (e) {
    console.warn('[ResolveScreen] react-native-webview not available:', e.message);
  }
}

const IS_WEB = Platform.OS === 'web';

export default function ResolveScreen({ route, navigation }) {
  const { animeId, episodeNumber, episodeTitle, animeTitle, startAt } = route.params;

  const [loading, setLoading] = useState(true);
  const [resolvingState, setResolvingState] = useState('Veritabanı kontrol ediliyor...');
  const [errorMsg, setErrorMsg] = useState(null);
  const [episodeUrl, setEpisodeUrl] = useState(null);
  const [progressPercent, setProgressPercent] = useState(10);
  const [showWebView, setShowWebView] = useState(false);

  const webViewRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const animatedProgress = useRef(new Animated.Value(10)).current;
  const [displayedPercent, setDisplayedPercent] = useState(10);

  // Pulse animation for loading indicator
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 1000,
          useNativeDriver: true,
        })
      ])
    ).start();
  }, []);

  // Smoothly animate progress bar and count up percentage text
  useEffect(() => {
    Animated.timing(animatedProgress, {
      toValue: progressPercent,
      duration: 1000, // 1 second smooth transition
      useNativeDriver: false,
    }).start();

    let start = displayedPercent;
    const end = progressPercent;
    if (start === end) return;

    const range = end - start;
    const stepTime = Math.max(Math.floor(1000 / Math.abs(range)), 15);

    const timer = setInterval(() => {
      start += (end > start ? 1 : -1);
      setDisplayedPercent(start);
      if (start === end) {
        clearInterval(timer);
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [progressPercent]);

  useEffect(() => {
    checkDatabaseCache();
  }, []);

  const checkDatabaseCache = async () => {
    setLoading(true);
    setErrorMsg(null);
    setEpisodeUrl(null);
    setProgressPercent(10);
    animatedProgress.setValue(10);
    setDisplayedPercent(10);
    setResolvingState('Veritabanı kontrol ediliyor...');

    if (!IS_WEB && !WebView) {
      setErrorMsg('HATA: WebView bileşeni yüklenemedi. (Native modül eksik)');
      setLoading(false);
      return;
    }

    try {
      const result = await fetchEpisodeVideoUrl(animeId, episodeNumber);
      console.log('[ResolveScreen] DB check result:', result);
      
      if (result.success && result.videoUrl) {
        setResolvingState('Video yükleniyor...');
        let finalUrl = result.videoUrl;
        if (finalUrl.startsWith('sibnet-direct:')) {
          finalUrl = finalUrl.replace('sibnet-direct:', '');
        } else if (finalUrl.startsWith('sibnet:')) {
          const sibnetId = finalUrl.replace('sibnet:', '');
          finalUrl = `${API_BASE_URL}/animes/sibnet-proxy?sibnetId=${sibnetId}`;
        }
        
        // Immediately replace with Player Watch screen
        navigation.replace('Watch', {
          animeId,
          episodeNumber,
          episodeTitle,
          animeTitle,
          videoUrl: finalUrl,
          startAt: startAt || 0
        });
      } else if (result.code === 'NOT_CACHED') {
        if (!result.episodeUrl) {
          setErrorMsg('Bölüm izleme linki bulunamadı.');
          setLoading(false);
          return;
        }
        console.log('[ResolveScreen] Loading WebView with URL:', result.episodeUrl);
        setEpisodeUrl(result.episodeUrl);
        setResolvingState('Video yükleniyor...');
      } else {
        setErrorMsg(result.error || 'Video adresi alınamadı.');
        setLoading(false);
      }
    } catch (err) {
      console.error('[ResolveScreen] Initial load error:', err);
      setErrorMsg('Ağ hatası oluştu. Lütfen tekrar deneyin.');
      setLoading(false);
    }
  };

  const handleWebViewMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'log') {
        console.log('[WebView Log]', data.message);
        const msg = data.message.toLowerCase();
        if (msg.includes('sayfa')) setProgressPercent(15);
        else if (msg.includes('iframe') || msg.includes('yok')) setProgressPercent(30);
        else if (msg.includes('captcha tespit')) setProgressPercent(45);
        else if (msg.includes('tekrar')) setProgressPercent(55);
        else if (msg.includes('farkli') || msg.includes('farklı')) setProgressPercent(70);
        else if (msg.includes('tiklaniyor') || msg.includes('tıklanıyor') || msg.includes('basildi')) setProgressPercent(85);
        
      } else if (data.type === 'resolved') {
        setProgressPercent(100);
        let finalUrl = data.videoUrl;
        
        // Cache in backend database
        await cacheEpisodeVideoUrl(animeId, episodeNumber, finalUrl);
        
        if (finalUrl.startsWith('sibnet-direct:')) {
          finalUrl = finalUrl.replace('sibnet-direct:', '');
        } else if (finalUrl.startsWith('sibnet:')) {
          const sibnetId = finalUrl.replace('sibnet:', '');
          finalUrl = `${API_BASE_URL}/animes/sibnet-proxy?sibnetId=${sibnetId}`;
        }
        
        // Replace with Watch player screen
        navigation.replace('Watch', {
          animeId,
          episodeNumber,
          episodeTitle,
          animeTitle,
          videoUrl: finalUrl,
          startAt: startAt || 0
        });
      } else if (data.type === 'noSource' || data.type === 'error') {
        setErrorMsg(data.message || 'Anime bulunamadı.');
        setLoading(false);
      } else if (data.type === 'native_touch') {
        const { x, y } = data;
        if (TouchInjector) {
          const reactTag = event.nativeEvent.target; // React Native'in gönderdiği gerçek View Tag'ı
          if (reactTag) {
            console.log(`[Native Touch] Injecting touch at X:${x} Y:${y} on tag: ${reactTag}`);
            TouchInjector.simulateTouch(reactTag, x, y)
              .then(res => console.log('[Native Touch Success]', res))
              .catch(err => console.error('[Native Touch Error]', err));
          } else {
            console.warn('[Native Touch] WebView reactTag could not be resolved from event.');
          }
        }
      }
    } catch (err) {
      console.error('[ResolveScreen Message Parse Error]', err);
    }
  };

  const injectedJs = `
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

              sendToNative({ type: 'log', message: 'Donanımsal dokunuş talep ediliyor: X:' + Math.round(x) + ' Y:' + Math.round(y) + ' (Fiziksel X:' + Math.round(physicalX) + ' Y:' + Math.round(physicalY) + ')' });
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
                (parseFloat(style.width) >= window.innerWidth * 0.8 || el.offsetWidth >= window.innerWidth * 0.8) &&
                (parseFloat(style.height) >= window.innerHeight * 0.8 || el.offsetHeight >= window.innerHeight * 0.8) &&
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
              sendToNative({ type: 'log', message: 'Captcha tespit edildi. Arka planda 5 gorsel hemen analiz ediliyor...' });

              (function() {
                var imgs = captchaImgs;
                var imageSizes = [];
                var fetchPromises = [];

                for (var k = 0; k < imgs.length; k++) {
                  (function(img, index) {
                    var srcUrl = '';
                    try {
                      var bgStyle = img.style.backgroundImage || window.getComputedStyle(img).backgroundImage || '';
                      if (bgStyle && bgStyle !== 'none') {
                        var cleanUrl = bgStyle.trim();
                        if (cleanUrl.indexOf('url(') === 0) {
                          cleanUrl = cleanUrl.substring(4);
                          if (cleanUrl.charAt(0) === '"' || cleanUrl.charAt(0) === "'") cleanUrl = cleanUrl.substring(1);
                          var closingIndex = cleanUrl.indexOf(')');
                          if (closingIndex !== -1) cleanUrl = cleanUrl.substring(0, closingIndex);
                          if (cleanUrl.charAt(cleanUrl.length - 1) === '"' || cleanUrl.charAt(cleanUrl.length - 1) === "'") {
                            cleanUrl = cleanUrl.substring(0, cleanUrl.length - 1);
                          }
                          srcUrl = cleanUrl;
                        }
                      }
                    } catch(e) {}

                    if (!srcUrl) {
                      var srcAttr = img.src || img.getAttribute('src') || '';
                      if (srcAttr) {
                        srcUrl = srcAttr;
                      } else {
                        var hash = img.getAttribute('icon-hash');
                        if (hash) srcUrl = '/api/Captcha/?cid=' + index + '&hash=' + hash;
                      }
                    }

                    if (srcUrl) {
                      try {
                        var absoluteUrl = new URL(srcUrl, window.location.href).href;
                        fetchPromises.push(
                          fetch(absoluteUrl)
                            .then(function(res) { return res.blob(); })
                            .then(function(blob) {
                              imageSizes.push({ index: index, size: blob.size, element: img });
                            })
                            .catch(function(e) {
                              sendToNative({ type: 'log', message: 'Gorsel ' + index + ' yuklenemedi.' });
                            })
                        );
                      } catch(e) {}
                    }
                  })(imgs[k], k);
                }

                Promise.all(fetchPromises).then(function() {
                  if (imageSizes.length < 5) {
                    sendToNative({ type: 'log', message: 'Bazi gorseller yuklenemedi. Tekrar denenecek...' });
                    captchaChecked = false;
                    return;
                  }

                  // 1. Tüm boyutları küçükten büyüğe sırala ve ortanca (medyan) değeri bul.
                  // 4 resim aynı (veya çok benzer), 1 resim farklı olduğu için medyan kesinlikle 'aynı' olan resimlerin boyutuna çok yakındır.
                  var sizesArray = imageSizes.map(function(img) { return img.size; }).sort(function(a, b) { return a - b; });
                  var medianSize = sizesArray[2];

                  // 2. Medyan değere boyutu en uzak olan (en çok sapan) resmi bul.
                  var maxDiff = -1;
                  var outlierImg = null;
                  imageSizes.forEach(function(img) {
                    var diff = Math.abs(img.size - medianSize);
                    if (diff > maxDiff) {
                      maxDiff = diff;
                      outlierImg = img;
                    }
                  });

                  if (outlierImg && maxDiff > 0) {
                    sendToNative({ type: 'log', message: 'En farkli gorsel bulundu (#' + (outlierImg.index + 1) + ', ' + outlierImg.size + ' byte). Zamanlama (timing) ayarlaniyor...' });
                    
                    var targetEl = outlierImg.element;
                    
                    var timeElapsed = Date.now() - detectionTime;
                    var remainingDelay = Math.max(0, 2500 - timeElapsed);
                    
                    setTimeout(function() {
                      sendToNative({ type: 'log', message: 'Donanımsal (Native) Tıklama gönderiliyor...' });
                      requestNativeTouch(targetEl);
                      
                      // Güvence tıklamasına (parent element) gerek yok, çünkü Native dokunuş zaten baloncuklama (bubbling) yapacak.

                      // 4 saniye bekle, çözülmezse yenile
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
                  } else {
                    sendToNative({ type: 'log', message: 'Farkli gorsel bulunamadi veya fark yok. Tekrar denenecek...' });
                    captchaChecked = false;
                  }
                }).catch(function(e) {
                  setTimeout(function() { captchaChecked = false; }, 3000);
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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      
      {loading ? (
        episodeUrl ? (
          // Scraper/Automation is running (WebView runs in background, user sees a clean full-screen loading overlay)
          <SafeAreaView style={styles.resolvingContainer} edges={['top', 'left', 'right', 'bottom']}>
            <View style={{ flex: 1, position: 'relative' }}>
              <View style={styles.webViewContainer}>
                {IS_WEB ? (
                  <View style={{ flex: 1, width: '100%', height: '100%' }}>
                    <iframe
                      src={episodeUrl}
                      style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        backgroundColor: '#000',
                      }}
                      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                      title="Video Resolver"
                    />
                  </View>
                ) : WebView ? (
                  <WebView
                    ref={webViewRef}
                    source={{ uri: episodeUrl }}
                    injectedJavaScriptBeforeContentLoaded={injectedJs}
                    injectedJavaScript={injectedJs}
                    onMessage={handleWebViewMessage}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    mixedContentMode="always"
                    mediaPlaybackRequiresUserAction={false}
                    style={{ flex: 1, width: '100%', height: '100%' }}
                    onLoadStart={(e) => console.log('[WebView] Load Start:', e.nativeEvent.url)}
                    onLoad={(e) => console.log('[WebView] Loaded successfully')}
                    onLoadEnd={(e) => console.log('[WebView] Load End')}
                    onError={(e) => console.error('[WebView] Error:', e.nativeEvent)}
                    onHttpError={(e) => console.error('[WebView] HTTP Error:', e.nativeEvent)}
                    setSupportMultipleWindows={false}
                    onShouldStartLoadWithRequest={(request) => {
                      const url = request.url;
                      // Izin verilecek guvenilir domain listesi
                      const isTrAnime = url.includes('tranimeizle.io');
                      const isOptraco = url.includes('optraco.top');
                      const isSibnet = url.includes('sibnet.ru');
                      const isCaptcha = url.includes('Captcha') || url.includes('challenge');
                      const isGoogle = url.includes('google');
                      
                      if (isTrAnime || isOptraco || isSibnet || isCaptcha || isGoogle || url.startsWith('about:blank') || url.startsWith('data:')) {
                        return true;
                      }
                      
                      console.log('[Ad Blocker] Engellenen reklam yönlendirmesi:', url);
                      return false;
                    }}
                  />
                ) : null}
              </View>

              {/* Temiz Yükleme Perdesi (Full Screen Loading Overlay) */}
              <View style={styles.webViewOverlay}>
                <Text style={styles.overlayText}>Bölüm Yükleniyor...</Text>
                <Text style={styles.overlayPercentText}>%{displayedPercent}</Text>
                
                <View style={styles.progressContainerCompact}>
                  <Animated.View style={[styles.progressBar, { width: animatedProgress.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%'],
                  }) }]} />
                </View>

                <TouchableOpacity 
                  style={styles.cancelButtonOverlay}
                  onPress={() => {
                    navigation.goBack();
                  }}
                >
                  <Text style={styles.cancelButtonText}>İptal Et</Text>
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>
        ) : (
          // Initial Database/Cache check: Show standard loading screen
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.accent} style={{ marginBottom: 20 }} />
            <Text style={styles.loadingTitle}>{resolvingState}</Text>
          </View>
        )
      ) : errorMsg ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={80} color={COLORS.error} style={styles.errorIcon} />
          <Text style={styles.errorTitle}>Hata Oluştu</Text>
          <Text style={styles.errorText}>{errorMsg}</Text>
          
          <TouchableOpacity style={styles.retryButton} onPress={checkDatabaseCache}>
            <Text style={styles.retryButtonText}>Yeniden Dene</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
            <Text style={styles.backLinkText}>Geri Dön</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#09090E',
  },
  loadingOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxl,
    zIndex: 9999,
  },
  loadingTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.title + 2,
    fontWeight: FONT_WEIGHTS.bold,
    marginTop: 40,
    marginBottom: SPACING.sm,
    letterSpacing: 0.5,
  },
  loadingStateText: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.lg,
  },
  loadingSubtitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body - 1,
    textAlign: 'center',
    paddingHorizontal: SPACING.md,
    marginTop: 20,
    lineHeight: 18,
  },
  progressContainer: {
    height: 6,
    width: '70%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 10,
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 3,
  },
  cancelButton: {
    position: 'absolute',
    bottom: 50,
    padding: 10,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxl,
    backgroundColor: COLORS.bgPrimary,
  },
  errorIcon: {
    marginBottom: SPACING.lg,
    ...SHADOWS.glow,
  },
  errorTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.heading,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.sm,
  },
  errorText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    textAlign: 'center',
    marginBottom: SPACING.xxl,
    lineHeight: 20,
    paddingHorizontal: SPACING.md,
  },
  retryButton: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xxl,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.accent,
    ...SHADOWS.glow,
    marginBottom: SPACING.lg,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
  },
  backLink: {
    paddingVertical: SPACING.sm,
  },
  backLinkText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
  },
  resolvingContainer: {
    flex: 1,
    backgroundColor: '#09090E',
  },
  webViewContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000',
  },
  webViewOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#09090E',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    paddingHorizontal: 40,
  },
  overlayText: {
    color: '#FFF',
    fontSize: FONT_SIZES.heading,
    fontWeight: FONT_WEIGHTS.bold,
    textAlign: 'center',
    marginBottom: SPACING.xs,
    letterSpacing: 0.5,
  },
  overlayPercentText: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.heading + 6,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 30,
  },
  progressContainerCompact: {
    height: 8,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 40,
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 4,
  },
  cancelButtonOverlay: {
    position: 'absolute',
    bottom: 60,
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  cancelButtonText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});
