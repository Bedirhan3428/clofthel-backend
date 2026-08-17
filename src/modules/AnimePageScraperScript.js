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

      // Universal Anime Scraper (Works on both Overview Pages and Watch/Episode Pages)
      function scrapeAnyPage() {
        var currentUrl = window.location.href;

        // Title Extraction
        var titleEl = document.querySelector('.playlist-title h1, .animeDetail-title, .anime-title, .detail-title, h1, h2, h3, h4');
        var rawTitle = titleEl ? titleEl.innerText.trim() : document.title || '';
        var title = rawTitle.replace(/\\s*\\d+\\.\\s*Bölüm\\s*İzle.*$/i, '').replace(/\\s*İzle.*$/i, '').trim();

        // Poster Image
        var posterEl = document.querySelector('.poster img.img-responsive, .poster img, .animeDetail-video img, img.img-responsive, .news-image img');
        var poster = posterEl ? (posterEl.getAttribute('src') || '') : '';
        if (poster.startsWith('//')) poster = 'https:' + poster;

        // Genres
        var genres = [];
        var genreEls = document.querySelectorAll('.tags-inner .genre, .tags-inner a, a[href*="/animeizle/"], .genres a');
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
        var descEl = document.querySelector('.animeDetail-text, .post-content, .description, p');
        var description = descEl ? descEl.innerText.trim() : '';

        // Episodes Extraction: Search all possible containers (Links, Buttons, Select options, Dropdowns)
        var episodesMap = {};

        // Pattern A: All <a href="..."> that contain episode links
        var allLinks = document.querySelectorAll('a[href*="-bolum"], a[href*="/bolum/"], .btn-bolum, .flx-block, [data-href*="-bolum"]');
        allLinks.forEach(function(el) {
          var href = el.getAttribute('data-href') || el.getAttribute('href') || '';
          if (!href || href === '#' || href.startsWith('javascript:')) return;

          var cleanSlug = href.replace(/^https?:\\/\\/[^\\/]+/i, '').replace(/^\\/+/, '').replace(/[?#].*$/, '').trim();
          var epMatch = cleanSlug.match(/-(?:sezon-)?(\\d+)-bolum/i) || cleanSlug.match(/bolum-(\\d+)/i) || cleanSlug.match(/(\\d+)\\.?-?bolum/i);

          var epNum = null;
          if (epMatch) {
            epNum = parseInt(epMatch[1], 10);
          } else {
            var textMatch = (el.innerText || '').match(/(\\d+)\\s*\\.?\\s*Bölüm/i) || (el.innerText || '').match(/BÖL\\s*(\\d+)/i);
            if (textMatch) epNum = parseInt(textMatch[1], 10);
          }

          if (epNum && !episodesMap[String(epNum)]) {
            episodesMap[String(epNum)] = cleanSlug.startsWith('http') ? cleanSlug : 'https://www.tranimeizle.io/' + cleanSlug;
          }
        });

        // Pattern B: <select> dropdowns (often used on watch pages)
        var selectOptions = document.querySelectorAll('select option');
        selectOptions.forEach(function(opt) {
          var val = opt.getAttribute('value') || '';
          var text = opt.innerText || '';
          var epMatch = text.match(/(\\d+)\\s*\\.?\\s*Bölüm/i) || val.match(/-(?:sezon-)?(\\d+)-bolum/i);
          if (epMatch && val) {
            var epNum = parseInt(epMatch[1], 10);
            if (epNum && !episodesMap[String(epNum)]) {
              var fullEpUrl = val.startsWith('http') ? val : (val.startsWith('/') ? 'https://www.tranimeizle.io' + val : 'https://www.tranimeizle.io/' + val);
              episodesMap[String(epNum)] = fullEpUrl;
            }
          }
        });

        // Pattern C: If currently on a watch page and only 1 episode is visible
        if (Object.keys(episodesMap).length === 0 && currentUrl.includes('-bolum-izle')) {
          var curMatch = currentUrl.match(/-(?:sezon-)?(\\d+)-bolum/i);
          var curNum = curMatch ? parseInt(curMatch[1], 10) : 1;
          episodesMap[String(curNum)] = currentUrl;
        }

        // Pattern D: Check if on a List Page (e.g. /listeler/yenibolum, /listeler/populer, etc.)
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

        if (listItems.length > 0 && (currentUrl.includes('/listeler/') || currentUrl.includes('/yenibolum') || listItems.length > 5)) {
          sendToApp({
            type: 'batch_list_scraped',
            url: currentUrl,
            items: listItems,
            count: listItems.length
          });
        }

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

      window.clofthelTriggerScrape = scrapeAnyPage;
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

      // Auto-run scrape
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(scrapeAnyPage, 800);
      } else {
        window.addEventListener('DOMContentLoaded', function() {
          setTimeout(scrapeAnyPage, 800);
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
