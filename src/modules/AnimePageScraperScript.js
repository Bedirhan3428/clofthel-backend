/**
 * Client-Side Anime Overview & Episode Scraper Script
 * Runs inside in-app WebView on user's device to extract anime metadata, episodes, and verify liveness.
 */
export const animePageScraperInjectedJs = `
  (function() {
    try {
      if (window.__anime_scraper_injected) return;
      window.__anime_scraper_injected = true;

      function sendToApp(payload) {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }
      }

      var currentUrl = window.location.href;
      sendToApp({ type: 'page_navigated', url: currentUrl });

      // 1. If on Search Results Page (e.g. /arama?q=... or duckduckgo)
      if (currentUrl.includes('/arama') || currentUrl.includes('duckduckgo') || currentUrl.includes('google')) {
        var foundLink = null;
        var links = document.querySelectorAll('a[href*="tranimeizle.io/anime/"], a[href^="/anime/"]');
        for (var i = 0; i < links.length; i++) {
          var href = links[i].getAttribute('href');
          if (href && (href.includes('/anime/') || href.includes('-izle'))) {
            foundLink = href.startsWith('/') ? 'https://www.tranimeizle.io' + href : href;
            break;
          }
        }
        if (foundLink) {
          sendToApp({ type: 'search_result_found', targetUrl: foundLink });
          window.location.href = foundLink;
          return;
        }
      }

      // 2. Check if on Single Episode Page (for liveness check)
      if (currentUrl.includes('-bolum-izle')) {
        setTimeout(function() {
          var hasPlayer = document.querySelector('.animeDetail-video, .player, #player, iframe, video, .sourceList') !== null;
          var epMatch = currentUrl.match(/-(\\d+)-bolum/i);
          var epNum = epMatch ? parseInt(epMatch[1], 10) : 1;
          sendToApp({
            type: 'episode_liveness_verified',
            url: currentUrl,
            episodeNumber: epNum,
            isValid: hasPlayer || document.body.innerText.length > 200
          });
        }, 1500);
        return;
      }

      // 3. Extract Full Anime Overview Page Metadata
      function scrapeOverviewPage() {
        var titleEl = document.querySelector('.playlist-title h1, .animeDetail-title, h1');
        var title = titleEl ? titleEl.innerText.trim() : '';

        var posterEl = document.querySelector('.poster img.img-responsive, .poster img, .animeDetail-video img');
        var poster = posterEl ? (posterEl.getAttribute('src') || '') : '';
        if (poster.startsWith('//')) poster = 'https:' + poster;

        // Genres
        var genres = [];
        var genreEls = document.querySelectorAll('.tags-inner .genre, .tags-inner a, a[href*="/animeizle/"]');
        genreEls.forEach(function(el) {
          var gText = el.innerText.trim();
          if (gText && genres.indexOf(gText) === -1) genres.push(gText);
        });

        // Other Names (Diğer İsimleri)
        var otherNames = [];
        var dds = document.querySelectorAll('dd');
        dds.forEach(function(dd) {
          if (dd.innerText.indexOf('Diğer İsimleri') !== -1) {
            var nextDt = dd.nextElementSibling;
            while (nextDt && nextDt.tagName.toLowerCase() === 'dt') {
              var parts = nextDt.innerText.split(/[,\\n]/);
              parts.forEach(function(p) {
                var clean = p.trim();
                if (clean.length > 2 && otherNames.indexOf(clean) === -1) {
                  otherNames.push(clean);
                }
              });
              nextDt = nextDt.nextElementSibling;
            }
          }
        });

        // Fansubs
        var fansubs = [];
        dds.forEach(function(dd) {
          if (dd.innerText.indexOf('Fansublar') !== -1) {
            var nextDt = dd.nextElementSibling;
            if (nextDt) {
              var fEls = nextDt.querySelectorAll('li a, a, .post-category');
              fEls.forEach(function(fel) {
                var fText = fel.innerText.trim();
                if (fText && fansubs.indexOf(fText) === -1) fansubs.push(fText);
              });
            }
          }
        });

        // Description
        var descEl = document.querySelector('.anime-description, .p-10 p, .animeDetail-desc, .p-10');
        var description = descEl ? descEl.innerText.trim() : '';

        // Episodes Extraction
        var episodesMap = {};
        var epEls = document.querySelectorAll('li.episodeBtn, .animeDetail-items ol li, .animeDetail-playlist ol li');
        if (epEls.length === 0) {
          epEls = document.querySelectorAll('a[href*="-bolum"]');
        }

        epEls.forEach(function(el, idx) {
          var dataSlug = el.getAttribute('data-slug') || (el.querySelector('[data-slug]') && el.querySelector('[data-slug]').getAttribute('data-slug')) || el.getAttribute('href') || (el.querySelector('a') && el.querySelector('a').getAttribute('href'));
          var titleText = (el.querySelector('.title, .etitle, span') ? el.querySelector('.title, .etitle, span').innerText.trim() : '') || el.innerText.trim();

          if (dataSlug) {
            var cleanSlug = dataSlug.replace(/^\\//, '');
            var epNum = null;
            var match1 = cleanSlug.match(/-(\\d+)-bolum/i);
            if (match1) {
              epNum = parseInt(match1[1], 10);
            } else {
              var match2 = titleText.match(/(\\d+)\\.?\\s*(?:bölüm|bolum|ep|episode)/i) || titleText.match(/bölüm\\s*(\\d+)/i) || titleText.match(/^(\\d+)$/);
              if (match2) {
                epNum = parseInt(match2[1], 10);
              } else {
                epNum = idx + 1;
              }
            }

            if (epNum && !episodesMap[String(epNum)]) {
              episodesMap[String(epNum)] = cleanSlug.startsWith('http') ? cleanSlug : 'https://www.tranimeizle.io/' + cleanSlug;
            }
          }
        });

        var totalEpisodes = Object.keys(episodesMap).length;

        sendToApp({
          type: 'anime_overview_scraped',
          url: currentUrl,
          data: {
            title: title,
            poster: poster,
            genres: genres,
            otherNames: otherNames,
            fansubs: fansubs,
            description: description,
            episodes: episodesMap,
            totalEpisodes: totalEpisodes,
            html: document.documentElement.outerHTML
          }
        });
      }

      // Run scrape after DOM is ready
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(scrapeOverviewPage, 800);
      } else {
        window.addEventListener('DOMContentLoaded', function() {
          setTimeout(scrapeOverviewPage, 800);
        });
      }
    } catch (e) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'scraper_error', error: e.message }));
      }
    }
  })();
  true;
`;
