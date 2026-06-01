const express = require('express');
const Groq = require('groq-sdk');
const Anime = require('../models/Anime');

const router = express.Router();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
let groq;

if (GROQ_API_KEY) {
  groq = new Groq({ apiKey: GROQ_API_KEY });
}

router.post('/recommend', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Lütfen bir istek metni girin.' });
    }

    if (!groq) {
      return res.status(503).json({ success: false, error: 'AI entegrasyonu şu anda kullanılamıyor. GROQ API anahtarı eksik.' });
    }

    // Sistematik Prompt
    const systemPrompt = `
Sen profesyonel bir anime öneri asistanısın. Kullanıcının isteğini analiz et ve ona uyan en iyi 5 animenin sadece İngilizce veya Romaji adlarını ver.
SADECE JSON FORMATINDA DÖN! Hiçbir açıklama yazma. Markdown kullanma, sadece raw json listesi ver.
Örnek Çıktı:
["Attack on Titan", "Death Note", "Fullmetal Alchemist: Brotherhood", "Jujutsu Kaisen", "Demon Slayer"]
`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.5,
      max_tokens: 1024,
    });

    const responseText = chatCompletion.choices[0]?.message?.content || "";
    
    // JSON'ı ayıkla
    let animeNames = [];
    try {
      const jsonMatch = responseText.match(/\[.*\]/s);
      if (jsonMatch) {
        animeNames = JSON.parse(jsonMatch[0]);
      } else {
        animeNames = JSON.parse(responseText);
      }
    } catch (e) {
      console.error('[AI Parse Error]', e, responseText);
      return res.status(500).json({ success: false, error: 'Yapay zeka yanıtı anlaşılamadı.' });
    }

    if (!Array.isArray(animeNames) || animeNames.length === 0) {
      return res.status(404).json({ success: false, error: 'Uygun anime bulunamadı.' });
    }

    // Kaçış (escape) fonksiyonu: Regex karakterlerini temizle
    const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Veritabanında (MongoDB) bu isimlere sahip animeleri ara
    const regexQueries = animeNames.map(name => new RegExp(escapeRegex(name.trim()), 'i'));
    
    // Veritabanımızda title veya anime_title (ya da romaji) içerisinde geçenleri arıyoruz
    const animes = await Anime.find({
      $or: [
        { title: { $in: regexQueries } },
        { anime_title: { $in: regexQueries } },
        { 'title.romaji': { $in: regexQueries } },
        { 'title.english': { $in: regexQueries } },
        { orijinal_ad: { $in: regexQueries } },
        { descriptive_label: { $in: regexQueries } }
      ]
    }).limit(10); // En fazla 10 sonuç döndür

    res.status(200).json({
      success: true,
      data: animes,
      aiSuggestedNames: animeNames
    });

  } catch (error) {
    console.error('[AI Recommendation Error]', error);
    res.status(500).json({ success: false, error: 'Öneri sunulurken bir hata oluştu.', details: error.message });
  }
});

module.exports = router;
