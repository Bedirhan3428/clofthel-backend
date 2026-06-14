const express = require('express');
const router = express.Router();
const Comment = require('../models/Comment');
const badWords = require('../karaliste.json');

// Yardımcı Fonksiyon: Küfür/Spam kontrolü
function containsBadWords(text) {
    if (!text) return false;
    const lowerText = text.toLowerCase();
    const tokens = lowerText.split(/[\s,.\?!_]+/);
    return badWords.some(word => tokens.includes(word));
}

// 1. Yorumları Getir
router.get('/:targetId', async (req, res) => {
    try {
        const comments = await Comment.find({ targetId: req.params.targetId }).sort({ createdAt: -1 });
        
        const userAuthorKey = req.query.authorKey;
        const mappedComments = comments.map(c => {
            const mapped = c.toObject();
            mapped.isMine = Boolean(userAuthorKey && mapped.authorKey === userAuthorKey);
            delete mapped.authorKey; // Güvenlik: Anahtarı dışarı sızdırma
            return mapped;
        });

        res.json({ success: true, comments: mappedComments });
    } catch (error) {
        console.error("API Hatası (GET /api/comments):", error);
        res.status(500).json({ success: false, error: 'Yorumlar getirilirken bir hata oluştu.' });
    }
});

// 2. Yorum Ekle
router.post('/', async (req, res) => {
    try {
        const { targetId, authorName, content, authorKey } = req.body;
        if (!targetId || !authorName || !content || !authorKey) {
            return res.status(400).json({ success: false, error: "Eksik alanlar var." });
        }
        
        if (containsBadWords(content) || containsBadWords(authorName)) {
            return res.status(400).json({ success: false, error: "Yorumunuzda veya isminizde uygunsuz kelimeler tespit edildi!" });
        }
        
        const userIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        // Son 24 saat kontrolü (IP Spam Koruması)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentComment = await Comment.findOne({
            ip: userIp,
            createdAt: { $gte: oneDayAgo }
        });

        if (recentComment) {
            return res.status(429).json({ success: false, error: "Günde sadece 1 kez yorum yapabilirsiniz." });
        }
        
        const newComment = new Comment({
            targetId,
            authorName: authorName.trim(),
            content: content.trim(),
            authorKey,
            ip: userIp
        });
        
        await newComment.save();
        
        const commentResponse = newComment.toObject();
        delete commentResponse.authorKey; // Güvenlik
        
        res.json({ success: true, comment: commentResponse });
    } catch (error) {
        console.error("API Hatası (POST /api/comments):", error);
        res.status(500).json({ success: false, error: 'Yorum eklenirken hata oluştu.' });
    }
});

// 3. Yorum Düzenle
router.patch('/:id', async (req, res) => {
    try {
        const { content, authorKey } = req.body;
        
        const comment = await Comment.findById(req.params.id);
        if (!comment) return res.status(404).json({ success: false, error: "Yorum bulunamadı." });

        if (comment.authorKey !== authorKey) {
            return res.status(403).json({ success: false, error: "Bu yorumu düzenleme yetkiniz yok." });
        }

        if (!content || !content.trim()) {
            return res.status(400).json({ success: false, error: "Yorum içeriği boş olamaz." });
        }
        
        if (containsBadWords(content)) {
            return res.status(400).json({ success: false, error: "Yorumunuzda uygunsuz kelimeler tespit edildi!" });
        }

        comment.content = content.trim();
        comment.isEdited = true;
        comment.editedAt = new Date();
        
        await comment.save();

        res.json({ success: true, message: "Yorum güncellendi." });
    } catch (error) {
        console.error("API Hatası (PATCH /api/comments/:id):", error);
        res.status(500).json({ success: false, error: 'Yorum düzenlenirken hata oluştu.' });
    }
});

// 4. Yorum Silme
router.delete('/:id', async (req, res) => {
    try {
        const { authorKey } = req.body;
        
        const comment = await Comment.findById(req.params.id);
        if (!comment) return res.status(404).json({ success: false, error: "Yorum bulunamadı." });

        if (comment.authorKey !== authorKey) {
            return res.status(403).json({ success: false, error: "Bu yorumu silme yetkiniz yok." });
        }

        await Comment.findByIdAndDelete(req.params.id);

        res.json({ success: true, message: "Yorum silindi." });
    } catch (error) {
        console.error("API Hatası (DELETE /api/comments/:id):", error);
        res.status(500).json({ success: false, error: 'Yorum silinirken hata oluştu.' });
    }
});

// 5. Yorum Beğenme
router.post('/:id/like', async (req, res) => {
    try {
        const userIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        
        const comment = await Comment.findById(req.params.id);
        if (!comment) return res.status(404).json({ success: false, error: "Yorum bulunamadı." });

        if (comment.likes && comment.likes.includes(userIp)) {
            return res.status(400).json({ success: false, error: "Bu yorumu zaten beğendiniz." });
        }

        comment.likes.push(userIp);
        comment.likeCount = comment.likes.length;
        
        await comment.save();

        res.json({ success: true, message: "Beğenildi", likeCount: comment.likeCount });
    } catch (error) {
        console.error("API Hatası (POST /api/comments/:id/like):", error);
        res.status(500).json({ success: false, error: 'Beğenilirken hata oluştu.' });
    }
});

module.exports = router;
