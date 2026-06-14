const cheerio = require('cheerio');
fetch('https://www.tranimeizle.io/anime/one-piece-izle')
  .then(r => r.text())
  .then(html => {
    const $ = cheerio.load(html);
    $('iframe').each((i, el) => console.log($(el).attr('src') || $(el).attr('data-src')));
  });
