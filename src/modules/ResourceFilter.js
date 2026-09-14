/**
 * Clofthel High-Performance Resource Filter & Speed Optimizer
 * 
 * Provides:
 * 1. shouldBlockNetworkRequest(url): Intercepts and denies requests at native WebView level.
 * 2. clientResourceBlockerJs: Injected before DOM loads to neutralize images, fonts, GIFs, thumbnails,
 *    preloaders (.se-pre-con, loader.gif), and unnecessary elements at JS/CSS/DOM level.
 * 
 * Strict Whitelist: Cloudflare Turnstile, Cloudflare Challenge, IconCaptcha, reCAPTCHA, and Video Streams.
 */

const BOT_PROTECTION_WHITELIST = [
  'challenges.cloudflare.com',
  'cloudflare.com',
  'turnstile',
  'cdn-cgi',
  'cf-chl',
  'network-challenge',
  'captcha',
  'recaptcha',
  'hcaptcha',
  'gstatic.com/recaptcha',
  'hcaptcha.com',
  'sibnet.ru',
  'optraco.top',
  '/explorer/',
  '.m3u8',
  '.mp4'
];

const BLOCKED_EXTENSIONS_REGEX = /\.(gif|png|jpe?g|webp|svg|ico|bmp|avif|tiff?|woff2?|ttf|otf|eot|mp3|ogg|wav)(?:[\?#]|$)/i;

const BLOCKED_PATH_FRAGMENTS = [
  '/uploads/images/',
  '/uploads/afis/',
  '/uploads/bolumler/',
  '/covers/',
  '/thumbnails/',
  'loader.gif',
  'se-pre-con',
  'static.tranimeizle',
  'img.tranimeizle',
  'cdn.tranimeizle'
];

const AD_AND_TRACKER_DOMAINS = [
  'syndication',
  'clickadu',
  'propellerads',
  'adcash',
  'adsterra',
  'monetag',
  'highcpmgate',
  'popunder',
  '1xbet',
  'doubleclick',
  'googleads',
  'google-analytics',
  'googletagmanager',
  'adnxs',
  'exdynsrv',
  'cp-host',
  'deloplen',
  'wargamings.net',
  'maxihalisaha',
  'betting',
  'casino',
  'popigram',
  'bayigram',
  'sosyalgram',
  'sosyalevin',
  'disqus',
  'yandex.ru',
  'mc.yandex',
  'criteo',
  'taboola',
  'outbrain',
  'histats',
  'statcounter',
  'scorecardresearch',
  'clarity.ms',
  'hotjar'
];

/**
 * Evaluates whether a network URL should be rejected in onShouldStartLoadWithRequest.
 * Returns true if the request MUST be blocked for high performance.
 * Returns false if the request is permitted (including all bot challenges).
 */
export function shouldBlockNetworkRequest(url) {
  if (!url || typeof url !== 'string') return false;

  const lowerUrl = url.toLowerCase();

  // 1. Safe local protocols
  if (lowerUrl.startsWith('about:blank') || lowerUrl.startsWith('data:') || lowerUrl.startsWith('blob:')) {
    return false;
  }

  // 2. Strict Whitelist Check (Bot Protection & Streams NEVER blocked)
  for (let i = 0; i < BOT_PROTECTION_WHITELIST.length; i++) {
    if (lowerUrl.includes(BOT_PROTECTION_WHITELIST[i])) {
      return false;
    }
  }

  // 3. Main HTML navigation pages on tranimeizle are NEVER blocked
  if (lowerUrl.includes('tranimeizle.') && (
    lowerUrl.includes('/anime/') ||
    lowerUrl.includes('/arama/') ||
    lowerUrl.includes('-izle') ||
    lowerUrl.includes('-bolum') ||
    lowerUrl.includes('/bolum/') ||
    lowerUrl.includes('/api/captchachallenge')
  )) {
    if (!BLOCKED_EXTENSIONS_REGEX.test(lowerUrl) && !lowerUrl.includes('loader.gif')) {
      return false;
    }
  }

  // 4. Block Ad & Tracker Domains
  for (let i = 0; i < AD_AND_TRACKER_DOMAINS.length; i++) {
    if (lowerUrl.includes(AD_AND_TRACKER_DOMAINS[i])) {
      return true;
    }
  }

  // 5. Block Images, GIFs, Fonts, Thumbnails by Extension
  if (BLOCKED_EXTENSIONS_REGEX.test(lowerUrl)) {
    return true;
  }

  // 6. Block Thumbnail, Preloader & Cover Photo Directories
  for (let i = 0; i < BLOCKED_PATH_FRAGMENTS.length; i++) {
    if (lowerUrl.includes(BLOCKED_PATH_FRAGMENTS[i])) {
      return true;
    }
  }

  return false;
}

/**
 * JavaScript code to inject before content loads (injectedJavaScriptBeforeContentLoaded).
 * Neutralizes image downloads, loader GIFs, preloaders (.se-pre-con), webfonts, and heavy UI components.
 */
export const clientResourceBlockerJs = `
(function() {
  if (window.__clofthel_resource_blocker_injected) return;
  window.__clofthel_resource_blocker_injected = true;

  var TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  function isWhitelistedUrl(u) {
    if (!u || typeof u !== 'string') return false;
    var lu = u.toLowerCase();
    return (
      lu.indexOf('challenges.cloudflare.com') !== -1 ||
      lu.indexOf('cloudflare.com') !== -1 ||
      lu.indexOf('turnstile') !== -1 ||
      lu.indexOf('cdn-cgi') !== -1 ||
      lu.indexOf('cf-chl') !== -1 ||
      lu.indexOf('network-challenge') !== -1 ||
      lu.indexOf('captcha') !== -1 ||
      lu.indexOf('recaptcha') !== -1 ||
      lu.indexOf('hcaptcha') !== -1 ||
      lu.indexOf('sibnet.ru') !== -1 ||
      lu.indexOf('optraco.top') !== -1 ||
      lu.indexOf('/explorer/') !== -1 ||
      lu.indexOf('.m3u8') !== -1 ||
      lu.indexOf('.mp4') !== -1 ||
      lu.indexOf('data:') === 0 ||
      lu.indexOf('blob:') === 0
    );
  }

  function isWhitelistedEl(el) {
    if (!el) return false;
    try {
      if (el.classList && (el.classList.contains('question') || el.classList.contains('captcha-image') || el.classList.contains('cf-turnstile'))) {
        return true;
      }
      if (el.closest && (el.closest('.captcha-holder') || el.closest('.cf-turnstile') || el.closest('[id*="cf-chl"]'))) {
        return true;
      }
    } catch(e) {}
    return false;
  }

  // 1. Preloader (.se-pre-con, loader.gif) & Unnecessary Element Annihilator
  function killPreloadersAndImages() {
    try {
      // 1.1. Instantly eradicate tranimeizle preloader & loader gif overlays
      var loaders = document.querySelectorAll(
        '.se-pre-con, #loader, .no-js #loader, .js #loader, [class*="preloader"], [class*="pre-loader"], [id*="preloader"], .page-loader, .loader:not(.captcha-loader)'
      );
      for (var li = 0; li < loaders.length; li++) {
        try { loaders[li].remove(); } catch(e) {}
      }

      // 1.2. Neutralize non-captcha inline images
      var imgs = document.querySelectorAll('img:not(.question):not([class*="captcha"])');
      for (var ii = 0; ii < imgs.length; ii++) {
        var im = imgs[ii];
        if (!isWhitelistedUrl(im.src) && !isWhitelistedEl(im)) {
          try {
            im.src = TRANSPARENT_PIXEL;
            im.removeAttribute('srcset');
            im.removeAttribute('data-src');
            im.style.display = 'none';
          } catch(e) {}
        }
      }

      // 1.3. Clear non-captcha background images
      var bgs = document.querySelectorAll('.flx-block, .anime-card, .film-item, .video-block, header, .banner, .header');
      for (var bi = 0; bi < bgs.length; bi++) {
        try { bgs[bi].style.backgroundImage = 'none'; } catch(e) {}
      }
    } catch(e) {}
  }

  // Execute preloader kill immediately
  killPreloadersAndImages();

  // 2. Continuous MutationObserver: Catch and destroy preloaders & images the exact millisecond they hit the DOM
  try {
    var observer = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (node.nodeType === 1) { // ELEMENT_NODE
            var cls = node.className || '';
            var id = node.id || '';

            // Destroy preloader element instantly
            if (typeof cls === 'string' && (cls.indexOf('se-pre-con') !== -1 || cls.indexOf('preloader') !== -1 || cls.indexOf('page-loader') !== -1) || id === 'loader') {
              try { node.remove(); } catch(e) {}
              continue;
            }

            if (node.tagName === 'IMG') {
              if (!isWhitelistedUrl(node.src) && !isWhitelistedEl(node)) {
                try {
                  node.src = TRANSPARENT_PIXEL;
                  node.removeAttribute('srcset');
                  node.removeAttribute('data-src');
                  node.style.display = 'none';
                } catch(e) {}
              }
            } else {
              // Search child nodes
              var innerLoaders = node.querySelectorAll ? node.querySelectorAll('.se-pre-con, #loader, [class*="preloader"]') : [];
              for (var l = 0; l < innerLoaders.length; l++) {
                try { innerLoaders[l].remove(); } catch(e) {}
              }

              var innerImgs = node.querySelectorAll ? node.querySelectorAll('img:not(.question):not([class*="captcha"])') : [];
              for (var k = 0; k < innerImgs.length; k++) {
                var innerImg = innerImgs[k];
                if (!isWhitelistedUrl(innerImg.src) && !isWhitelistedEl(innerImg)) {
                  try {
                    innerImg.src = TRANSPARENT_PIXEL;
                    innerImg.removeAttribute('srcset');
                    innerImg.removeAttribute('data-src');
                    innerImg.style.display = 'none';
                  } catch(e) {}
                }
              }
            }
          }
        }
      }
    });

    observer.observe(document.documentElement || document, {
      childList: true,
      subtree: true
    });
  } catch(e) {}

  // 3. Monkey-patch HTMLImageElement.src & srcset to intercept inline image loads
  try {
    var origSrcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (origSrcDesc && origSrcDesc.set) {
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        set: function(val) {
          if (isWhitelistedUrl(val) || isWhitelistedEl(this)) {
            return origSrcDesc.set.call(this, val);
          }
          return origSrcDesc.set.call(this, TRANSPARENT_PIXEL);
        },
        get: function() {
          return origSrcDesc.get.call(this);
        },
        configurable: true,
        enumerable: true
      });
    }

    var origSrcsetDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'srcset');
    if (origSrcsetDesc && origSrcsetDesc.set) {
      Object.defineProperty(HTMLImageElement.prototype, 'srcset', {
        set: function(val) {
          if (isWhitelistedUrl(val) || isWhitelistedEl(this)) {
            return origSrcsetDesc.set.call(this, val);
          }
          return origSrcsetDesc.set.call(this, '');
        },
        get: function() {
          return origSrcsetDesc.get.call(this);
        },
        configurable: true,
        enumerable: true
      });
    }

    // Intercept setAttribute for images
    var origSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, val) {
      var lName = (name || '').toLowerCase();
      if (this.tagName === 'IMG' && (lName === 'src' || lName === 'srcset' || lName === 'data-src')) {
        if (!isWhitelistedUrl(val) && !isWhitelistedEl(this)) {
          val = lName === 'srcset' ? '' : TRANSPARENT_PIXEL;
        }
      }
      return origSetAttribute.call(this, name, val);
    };
  } catch(e) {}

  // 4. Monkey-patch window.fetch to abort blocked media/ad requests
  try {
    var _rawFetch = window.fetch;
    if (_rawFetch) {
      window.fetch = function() {
        var arg0 = arguments[0];
        var reqUrl = (typeof arg0 === 'string') ? arg0 : (arg0 && arg0.url ? arg0.url : '');
        if (reqUrl && !isWhitelistedUrl(reqUrl)) {
          var lReq = reqUrl.toLowerCase();
          if (/\\.(gif|png|jpe?g|webp|svg|ico|bmp|avif|woff2?|ttf|otf)(?:[\\?#]|$)/i.test(lReq) ||
              lReq.indexOf('loader.gif') !== -1 ||
              lReq.indexOf('static.tranimeizle') !== -1 ||
              lReq.indexOf('/uploads/images/') !== -1 ||
              lReq.indexOf('/uploads/afis/') !== -1 ||
              lReq.indexOf('/uploads/bolumler/') !== -1 ||
              lReq.indexOf('syndication') !== -1 ||
              lReq.indexOf('clickadu') !== -1 ||
              lReq.indexOf('propellerads') !== -1 ||
              lReq.indexOf('adcash') !== -1 ||
              lReq.indexOf('monetag') !== -1 ||
              lReq.indexOf('highcpmgate') !== -1 ||
              lReq.indexOf('doubleclick') !== -1 ||
              lReq.indexOf('google-analytics') !== -1) {
            return Promise.resolve(new Response('', { status: 200, statusText: 'Blocked By Clofthel' }));
          }
        }
        return _rawFetch.apply(this, arguments);
      };
    }
  } catch(e) {}

  // 5. High-Specificity CSS Injection to suppress preloaders, loader gifs, images, fonts, banners
  var cssRules = [
    '/* 1. Complete Preloader & Loader GIF Eradication */',
    'div.se-pre-con,',
    '.se-pre-con,',
    '#loader,',
    '.no-js #loader,',
    '.js #loader,',
    '.page-loader,',
    '[class*="preloader"],',
    '[class*="pre-loader"],',
    '[id*="preloader"],',
    '.loader:not(.captcha-loader),',
    '[class*="spinner"]:not(.turnstile-icon):not([class*="captcha"]),',
    '[id*="spinner"] {',
    '  display: none !important;',
    '  visibility: hidden !important;',
    '  opacity: 0 !important;',
    '  width: 0 !important;',
    '  height: 0 !important;',
    '  min-width: 0 !important;',
    '  min-height: 0 !important;',
    '  max-width: 0 !important;',
    '  max-height: 0 !important;',
    '  pointer-events: none !important;',
    '  z-index: -999999 !important;',
    '  background: none !important;',
    '  background-color: transparent !important;',
    '  background-image: none !important;',
    '  content: none !important;',
    '}',
    '',
    '/* 2. Hide all non-captcha images completely */',
    'html body img:not(.question):not([class*="captcha"]):not([src*="challenges.cloudflare"]):not([src*="Captcha"]),',
    'html body picture:not([class*="captcha"]),',
    'img[src*="loader.gif"],',
    'img[src*="static.tranimeizle"],',
    'img[src*="/images/"],',
    'img[src*="/uploads/"] {',
    '  display: none !important;',
    '  visibility: hidden !important;',
    '  opacity: 0 !important;',
    '  width: 0 !important;',
    '  height: 0 !important;',
    '  max-width: 0 !important;',
    '  max-height: 0 !important;',
    '  content: none !important;',
    '  pointer-events: none !important;',
    '}',
    '',
    '/* 3. Suppress background images on everything except captcha */',
    'html body *:not(.captcha-image):not(.captcha-holder):not([class*="captcha"]):not(.cf-turnstile):not(iframe) {',
    '  background-image: none !important;',
    '}',
    '',
    '/* 4. Prevent font downloads */',
    '@font-face {',
    '  font-family: "__blocked__";',
    '  src: local("sans-serif") !important;',
    '}',
    '',
    '/* 5. Hide unnecessary page chrome on scraping pages (never hide sidebars with episode playlists) */',
    'header, footer, nav, .comments, #disqus_thread,',
    '.yorumlar, .reklam, .banner, .ad-box, [id*="reklam"], [class*="reklam"],',
    '[id*="banner"], [class*="banner"], .social-share, .share-buttons,',
    '.footer, .header-container, #header, #footer {',
    '  display: none !important;',
    '}'
  ].join('\\n');

  function injectOrMoveStyle() {
    try {
      var target = document.head || document.documentElement;
      if (!target) return;
      var styleEl = document.getElementById('__clofthel_perf_optimizer_style');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = '__clofthel_perf_optimizer_style';
        styleEl.type = 'text/css';
        styleEl.appendChild(document.createTextNode(cssRules));
        target.appendChild(styleEl);
      } else if (target.lastElementChild !== styleEl) {
        target.appendChild(styleEl);
      }
    } catch(e) {}
  }

  // Inject style immediately and on DOM readiness
  injectOrMoveStyle();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      injectOrMoveStyle();
      killPreloadersAndImages();
    });
  }

  // Fast pulse cleanup during the critical first 3 seconds of page load
  var cleanInterval = setInterval(function() {
    killPreloadersAndImages();
    injectOrMoveStyle();
  }, 40);

  setTimeout(function() {
    clearInterval(cleanInterval);
    // Slower continuous backup interval
    setInterval(killPreloadersAndImages, 250);
  }, 3000);
})();
true;
`;
