/**
 * Client-Side Anime Overview & Episode Scraper Script
 * Runs inside in-app WebView on user's device to extract anime metadata, episodes, and verify liveness.
 */
export const animePageScraperInjectedJs = `
  (function() {
    try {
      function sendToApp(payload) {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }
      }

      var currentUrl = window.location.href;
      sendToApp({ type: 'page_navigated', url: currentUrl });

      // Check for Cloudflare Turnstile / Bot Verification
      var isCloudflare = document.title.indexOf('Bağlantı') !== -1 ||
                         document.title.indexOf('Cloudflare') !== -1 ||
                         document.title.indexOf('Just a moment') !== -1 ||
                         document.querySelector('#challenge-stage, .cf-turnstile, iframe[src*="cloudflare"], iframe[src*="turnstile"]') !== null;

      if (isCloudflare) {
        sendToApp({ type: 'cloudflare_detected', url: currentUrl });
      }

      // 1. If on Search Results Page (e.g. /arama?q=... or duckduckgo)
      if (currentUrl.includes('/arama') || currentUrl.includes('duckduckgo') || currentUrl.includes('google')) {
        var foundLink = null;
        var links = document.querySelectorAll('a[href*="tranimeizle.io/anime/"], a[href^="/anime/"], a[href*="-izle"]');
        for (var i = 0; i < links.length; i++) {
          var href = links[i].getAttribute('href');
          if (href && (href.includes('/anime/') || (href.includes('-izle') && !href.includes('/arama')))) {
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

      var retryCount = 0;
      var maxRetries = 6;
      var hasSentOverview = false;

      // Universal Anime Scraper (Works on both Overview Pages and Watch/Episode Pages)
      function scrapeAnyPage() {
        var currentUrl = window.location.href;

        // Check Cloudflare again in case it just appeared or disappeared
        if (document.title.indexOf('Bağlantı') !== -1 || document.title.indexOf('Cloudflare') !== -1 || document.querySelector('#challenge-stage') !== null) {
          sendToApp({ type: 'cloudflare_detected', url: currentUrl });
          return;
        }

        // Title Extraction
        var titleEl = document.querySelector('.playlist-title h1, .animeDetail-title, .anime-title, .detail-title, h1, h2, h3, h4');
        var rawTitle = titleEl ? titleEl.innerText.trim() : document.title || '';
        var title = rawTitle.replace(/\\s*\\d+\\.\\s*Bölüm\\s*İzle.*$/i, '').replace(/\\s*İzle.*$/i, '').trim();

        // Poster Image
        var posterEl = document.querySelector('.poster img.img-responsive, .poster img, .animeDetail-video img, img.img-responsive, .news-image img');
        var poster = posterEl ? (posterEl.getAttribute('src') || '') : '';
        if (poster.startsWith('//')) poster = 'https:' + poster;

        // Genres (Do not scrape from webpage; strictly fetched from AniList)
        var genres = [];

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
        var descEl = document.querySelector('.animeDetail-text, .post-content, .description, p');
        var description = descEl ? descEl.innerText.trim() : '';

        // Episodes Extraction: Search all possible containers (Links, Buttons, Select options, Dropdowns, Cards)
        var episodesMap = {};

        // Comprehensive selector for episode elements
        var allCandidates = document.querySelectorAll('a[href], div[data-href], button[data-href], .btn-bolum, .flx-block, select option');
        allCandidates.forEach(function(el) {
          var rawHref = el.getAttribute('data-href') || el.getAttribute('href') || el.getAttribute('value') || '';
          if (!rawHref || rawHref === '#' || rawHref.startsWith('javascript:')) return;

          var cleanSlug = rawHref.replace(/^https?:\\/\\/[^\\/]+/i, '').replace(/^\\/+/, '').replace(/[?#].*$/, '').trim();
          var epMatch = cleanSlug.match(/-(?:sezon-)?(\\d+)-bolum/i) || cleanSlug.match(/bolum-(\\d+)/i) || cleanSlug.match(/(\\d+)\\.?-?bolum/i);

          var epNum = null;
          if (epMatch) {
            epNum = parseInt(epMatch[1], 10);
          } else {
            var textMatch = (el.innerText || '').match(/(\\d+)\\s*\\.?\\s*Bölüm/i) || (el.innerText || '').match(/BÖL\\s*(\\d+)/i);
            if (textMatch) epNum = parseInt(textMatch[1], 10);
          }

          if (epNum && !episodesMap[String(epNum)]) {
            episodesMap[String(epNum)] = rawHref.startsWith('http') ? rawHref : 'https://www.tranimeizle.io/' + cleanSlug;
          }
        });

        // If on a single episode watch page and only 1 episode is visible
        if (Object.keys(episodesMap).length === 0 && currentUrl.includes('-bolum-izle')) {
          var curMatch = currentUrl.match(/-(?:sezon-)?(\\d+)-bolum/i);
          var curNum = curMatch ? parseInt(curMatch[1], 10) : 1;
          episodesMap[String(curNum)] = currentUrl;
        }

        var totalEpisodes = Object.keys(episodesMap).length;

        // If on a List Page (e.g. /listeler/yenibolum, /listeler/populer)
        var isListPage = currentUrl.includes('/listeler/') || currentUrl.includes('/yenibolum');
        if (isListPage) {
          var listItems = [];
          var flxBlocks = document.querySelectorAll('.flx-block, [data-href*="-bolum"], a[href*="-bolum-izle"]');
          flxBlocks.forEach(function(block) {
            var href = block.getAttribute('data-href') || block.getAttribute('href') || '';
            if (!href || href === '#' || href.startsWith('javascript:')) return;
            var titleEl = block.querySelector('.f-name, .flx-title, .title, strong') || block;
            var titleText = titleEl ? titleEl.innerText.trim() : '';
            var imgEl = block.querySelector('img');
            var imgSrc = imgEl ? (imgEl.getAttribute('src') || '') : '';
            listItems.push({ href: href, title: titleText, poster: imgSrc });
          });

          if (listItems.length > 0) {
            sendToApp({
              type: 'batch_list_scraped',
              url: currentUrl,
              items: listItems,
              count: listItems.length
            });
            return;
          }
        }

        // If episodes were found, send anime overview to app once
        if (totalEpisodes > 0) {
          if (!hasSentOverview) {
            hasSentOverview = true;
            sendToApp({
              type: 'anime_overview_scraped',
              url: currentUrl,
              data: {
                title: title || rawTitle,
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
        } else if (retryCount < maxRetries) {
          retryCount++;
          sendToApp({ type: 'scraper_waiting', retry: retryCount, url: currentUrl });
          setTimeout(scrapeAnyPage, 1000);
        } else {
          // Final attempt completed with 0 episodes
          if (!hasSentOverview) {
            hasSentOverview = true;
            sendToApp({
              type: 'anime_overview_scraped',
              url: currentUrl,
              data: {
                title: title || rawTitle,
                poster: poster,
                genres: genres,
                otherNames: otherNames,
                fansubs: fansubs,
                description: description,
                episodes: episodesMap,
                totalEpisodes: 0,
                html: document.documentElement.outerHTML
              }
            });
          }
        }
      }

      window.clofthelTriggerScrape = function() {
        hasSentOverview = false; // Allow manual user click to re-send
        retryCount = maxRetries; // Force immediate run
        scrapeAnyPage();
      };

      window.clofthelTriggerBatchScrape = function() {
        var listItems = [];
        var flxBlocks = document.querySelectorAll('.flx-block, [data-href], a[href*="-bolum-izle"], a[href*="-izle"]');
        flxBlocks.forEach(function(block) {
          var href = block.getAttribute('data-href') || block.getAttribute('href') || '';
          if (!href || href === '#' || href.startsWith('javascript:')) return;
          var titleEl = block.querySelector('.f-name, .flx-title, .title, strong') || block;
          var titleText = titleEl ? titleEl.innerText.trim() : '';
          var imgEl = block.querySelector('img');
          var imgSrc = imgEl ? (imgEl.getAttribute('src') || '') : '';
          listItems.push({ href: href, title: titleText, poster: imgSrc });
        });
        sendToApp({
          type: 'batch_list_scraped',
          url: window.location.href,
          items: listItems,
          count: listItems.length
        });
      };

      // Auto-run scrape with progressive delays
      setTimeout(scrapeAnyPage, 600);
      setTimeout(scrapeAnyPage, 1800);
      setTimeout(scrapeAnyPage, 3500);

    } catch (e) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'scraper_error', error: e.message }));
      }
    }
  })();
  true;
`;
