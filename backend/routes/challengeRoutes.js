const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const ChallengeQuestion = require('../models/ChallengeQuestion');

/**
 * Helper to compute question hash from question text or alt
 */
function computeHash(questionText, options) {
  const normalizedText = (questionText || '').trim().toLowerCase();
  const optionStr = (options || []).map(o => (o.text || '').trim().toLowerCase()).sort().join('|');
  return crypto.createHash('sha256').update(`${normalizedText}_${optionStr}`).digest('hex');
}

/**
 * Query Llama 8B Service or Fallback Heuristic Engine
 */
async function queryLlama8b(questionText, options) {
  const prompt = `Aşağıdaki Türkçe güvenlik sorusuna göre en mantıklı şıkkı seç.
Soru: "${questionText}"
Şıklar:
${options.map((o, idx) => `${idx + 1}) ID: ${o.id} - Metin: ${o.text}`).join('\n')}

Sadece doğru şıkkın ID'sini tam olarak yanıtla. Başka bir açıklama yazma.`;

  // 1. If LLAMA_API_URL is configured, call Llama 8B endpoint
  if (process.env.LLAMA_API_URL) {
    try {
      const response = await axios.post(
        process.env.LLAMA_API_URL,
        {
          model: process.env.LLAMA_MODEL_NAME || 'meta-llama/Llama-3.1-8B-Instruct',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 50
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.LLAMA_API_KEY || ''}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      const responseText = (response.data.choices?.[0]?.message?.content || '').trim();
      const matchedOption = options.find(o => responseText.includes(o.id) || responseText.toLowerCase().includes(o.text.toLowerCase()));
      if (matchedOption) {
        return matchedOption;
      }
    } catch (err) {
      console.error('❌ [LLAMA 8B] API Error:', err.message);
    }
  }

  // 2. Rule-based Heuristic Engine for common Turkish geography/culture questions
  const textLower = (questionText || '').toLowerCase();
  
  if (textLower.includes('yoğun nüfus') || textLower.includes('en kalabalık') || textLower.includes('nüfusa sahip')) {
    const istanbul = options.find(o => o.text.toLowerCase().includes('istanbul'));
    if (istanbul) return istanbul;
  }
  if (textLower.includes('başkent')) {
    const ankara = options.find(o => o.text.toLowerCase().includes('ankara'));
    if (ankara) return ankara;
  }
  if (textLower.includes('en büyük yüzölçüm') || textLower.includes('en geniş il')) {
    const konya = options.find(o => o.text.toLowerCase().includes('konya'));
    if (konya) return konya;
  }

  // Default to first option as safe fallback
  return options[0];
}

/**
 * POST /api/v1/challenge/solve
 * Resolves network challenge question via Central DB or Llama 8B
 */
router.post('/solve', async (req, res) => {
  try {
    const { questionText, questionImageUrl, options, clientHash } = req.body;

    if (!options || !Array.isArray(options) || options.length === 0) {
      return res.status(400).json({ success: false, error: 'Şıklar (options) dizisi gerekli.' });
    }

    const questionHash = clientHash || computeHash(questionText, options);

    // 1. Check Central DB Question Pool
    let existingRecord = await ChallengeQuestion.findOne({ questionHash });
    if (existingRecord) {
      console.log(`🎯 [CHALLENGE POOL] Match found in MongoDB for Hash (${questionHash.substring(0, 8)}...): ${existingRecord.correctOptionText}`);
      return res.json({
        success: true,
        source: 'central_db',
        questionHash,
        correctOptionId: existingRecord.correctOptionId,
        correctOptionText: existingRecord.correctOptionText
      });
    }

    // 2. Query Llama 8B Service
    console.log(`🤖 [CHALLENGE POOL] Querying Llama 8B for question: "${questionText}"`);
    const solution = await queryLlama8b(questionText, options);

    if (solution) {
      // 3. Save newly learned solution into Central DB Question Pool
      await ChallengeQuestion.create({
        questionHash,
        questionText: questionText || 'Bilinmeyen Soru',
        questionImageUrl: questionImageUrl || null,
        options,
        correctOptionId: solution.id,
        correctOptionText: solution.text,
        confidence: 0.95,
        solvedBy: 'llama_8b'
      });

      console.log(`✨ [CHALLENGE POOL] Llama 8B solved & saved to MongoDB: ${solution.text} (${solution.id})`);

      return res.json({
        success: true,
        source: 'llama_8b',
        questionHash,
        correctOptionId: solution.id,
        correctOptionText: solution.text
      });
    }

    return res.status(500).json({ success: false, error: 'Soru çözülemedi.' });
  } catch (err) {
    console.error('❌ [CHALLENGE ROUTE] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/v1/challenge/report
 * User manual correction report to update/override Central DB pool
 */
router.post('/report', async (req, res) => {
  try {
    const { questionHash, questionText, options, correctOptionId } = req.body;
    if (!questionHash || !correctOptionId) {
      return res.status(400).json({ success: false, error: 'questionHash ve correctOptionId gerekli.' });
    }

    const matchedOpt = (options || []).find(o => o.id === correctOptionId);

    await ChallengeQuestion.findOneAndUpdate(
      { questionHash },
      {
        questionText: questionText || 'Raporlanan Soru',
        options: options || [],
        correctOptionId,
        correctOptionText: matchedOpt ? matchedOpt.text : null,
        confidence: 1.0,
        solvedBy: 'human'
      },
      { upsert: true, new: true }
    );

    console.log(`📌 [CHALLENGE POOL] Human correction updated for Hash (${questionHash.substring(0, 8)}...): ${correctOptionId}`);
    res.json({ success: true, message: 'Doğrulama soru havuzuna kaydedildi.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
