const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { JWT_SECRET } = require('../middleware/authMiddleware');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/mailer');

const googleClientId = (process.env.GOOGLE_CLIENT_ID || '').trim().replace(/^['"]|['"]$/g, '');
const client = new OAuth2Client(googleClientId);

const router = express.Router();

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ── Rate Limiters (Brute Force Koruması) ────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 15, // IP başına 15 deneme
  message: { success: false, error: 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.' },
  standardHeaders: true,
  legacyHeaders: false
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 saat
  max: 10, // IP başına 10 kayıt
  message: { success: false, error: 'Çok fazla kayıt denemesi. 1 saat sonra tekrar deneyin.' },
  standardHeaders: true,
  legacyHeaders: false
});

const resendCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  message: { success: false, error: 'Çok fazla kod gönderme denemesi. 15 dakika sonra tekrar deneyin.' },
  standardHeaders: true,
  legacyHeaders: false
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  message: { success: false, error: 'Çok fazla şifre sıfırlama denemesi. 15 dakika sonra tekrar deneyin.' },
  standardHeaders: true,
  legacyHeaders: false
});

// JWT Secret Key — .env'den alınır
const JWT_EXPIRE = '30d'; // Token 30 gün geçerli olsun

// Token oluşturma yardımcı fonksiyonu
const sendTokenResponse = (user, statusCode, res) => {
  const token = jwt.sign({ id: user._id }, JWT_SECRET, {
    expiresIn: JWT_EXPIRE
  });

  res.status(statusCode).json({
    success: true,
    token,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar || null,
      role: user.role,
      hasAcceptedLegal: user.hasAcceptedLegal
    }
  });
};

/**
 * POST /api/auth/register
 * Yeni kullanıcı kaydı
 */
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Gerekli alanların kontrolü
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Lütfen tüm alanları doldurun.' });
    }

    const trimmedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    // İsim uzunluk kontrolü
    if (trimmedName.length < 2 || trimmedName.length > 50) {
      return res.status(400).json({ success: false, error: 'İsim 2-50 karakter arasında olmalıdır.' });
    }

    // E-posta format doğrulaması
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ success: false, error: 'Geçerli bir e-posta adresi girin.' });
    }

    // Şifre uzunluk kontrolü (en az 6 karakter)
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Şifre en az 6 karakter olmalıdır.' });
    }

    // Email kullanılıyor mu kontrol et
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Bu e-posta adresi zaten kullanılıyor.' });
    }

    // 6 haneli kod oluştur
    const code = generateOTP();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 dakika

    // Kullanıcıyı oluştur (isVerified: false olarak)
    const user = await User.create({
      name: trimmedName,
      email: normalizedEmail,
      password,
      avatar: null,
      verificationCode: code,
      verificationCodeExpires: expires,
      hasAcceptedLegal: false
    });

    // E-postayı gönder
    await sendVerificationEmail(normalizedEmail, code);

    res.status(201).json({ 
      success: true, 
      message: 'Doğrulama kodu e-postanıza gönderildi.',
      email: user.email
    });
  } catch (error) {
    console.error('[Auth Register Error]', error);
    res.status(500).json({ success: false, error: 'Sunucu hatası oluştu. Lütfen tekrar deneyin.' });
  }
});

/**
 * POST /api/auth/login
 * Kullanıcı girişi
 */
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Lütfen e-posta ve şifrenizi girin.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Kullanıcıyı bul
    const user = await User.findOne({ email: normalizedEmail }).select('+password +isVerified');

    if (!user) {
      return res.status(401).json({ success: false, error: 'Geçersiz e-posta veya şifre.' });
    }

    // Şifre eşleşiyor mu kontrol et
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Geçersiz e-posta veya şifre.' });
    }

    // E-posta doğrulanmış mı?
    if (!user.isVerified) {
      return res.status(403).json({ 
        success: false, 
        error: 'Lütfen e-posta adresinizi doğrulayın.',
        requiresVerification: true,
        email: user.email
      });
    }

    sendTokenResponse(user, 200, res);
  } catch (error) {
    console.error('[Auth Login Error]', error);
    res.status(500).json({ success: false, error: 'Sunucu hatası oluştu.' });
  }
});

/**
 * GET /api/auth/me
 * Mevcut giriş yapmış kullanıcının bilgilerini getirir (Token doğrulama)
 */
router.get('/me', async (req, res) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, error: 'Bu işlem için yetkiniz yok (Token bulunamadı).' });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.id);

      if (!user) {
        return res.status(404).json({ success: false, error: 'Bu tokene ait kullanıcı bulunamadı.' });
      }

      res.status(200).json({
        success: true,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          avatar: user.avatar || null,
          role: user.role,
          hasAcceptedLegal: user.hasAcceptedLegal
        }
      });
    } catch (err) {
      return res.status(401).json({ success: false, error: 'Token geçersiz veya süresi dolmuş.' });
    }

  } catch (error) {
    res.status(500).json({ success: false, error: 'Sunucu hatası.' });
  }
});

/**
 * POST /api/auth/verify-email
 * 6 haneli kod doğrulama
 */
router.post('/verify-email', resendCodeLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ success: false, error: 'E-posta ve kod gereklidir.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select('+verificationCode +verificationCodeExpires');
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı.' });
    }

    if (user.isVerified) {
      return res.status(400).json({ success: false, error: 'Bu hesap zaten doğrulanmış.' });
    }

    if (user.verificationCode !== code.toString().trim()) {
      return res.status(400).json({ success: false, error: 'Hatalı doğrulama kodu.' });
    }

    if (Date.now() > user.verificationCodeExpires) {
      return res.status(400).json({ success: false, error: 'Doğrulama kodunun süresi dolmuş. Lütfen yeni kod isteyin.' });
    }

    // Doğrula
    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpires = undefined;
    await user.save();

    // Başarılı doğrulama sonrası Token ver
    sendTokenResponse(user, 200, res);
  } catch (error) {
    console.error('[Verify Email Error]', error);
    res.status(500).json({ success: false, error: 'Sunucu hatası.' });
  }
});

/**
 * POST /api/auth/resend-code
 * Doğrulama kodunu tekrar gönder
 */
router.post('/resend-code', resendCodeLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'E-posta adresi gereklidir.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı.' });
    }

    if (user.isVerified) {
      return res.status(400).json({ success: false, error: 'Hesap zaten doğrulanmış.' });
    }

    const code = generateOTP();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    user.verificationCode = code;
    user.verificationCodeExpires = expires;
    await user.save();

    await sendVerificationEmail(normalizedEmail, code);

    res.json({ success: true, message: 'Yeni kod gönderildi.' });
  } catch (error) {
    console.error('[Resend Code Error]', error);
    res.status(500).json({ success: false, error: 'Sunucu hatası.' });
  }
});

/**
 * POST /api/auth/forgot-password
 * Şifre sıfırlama kodu gönder
 */
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'E-posta adresi gereklidir.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ success: false, error: 'Bu e-posta adresine kayıtlı bir hesap bulunamadı.' });
    }

    const code = generateOTP();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 dakika

    user.resetPasswordCode = code;
    user.resetPasswordExpires = expires;
    await user.save();

    await sendPasswordResetEmail(normalizedEmail, code);

    res.json({ 
      success: true, 
      message: 'Şifre sıfırlama kodu e-postanıza gönderildi.',
      email: normalizedEmail
    });
  } catch (error) {
    console.error('[Forgot Password Error]', error);
    res.status(500).json({ success: false, error: 'Sunucu hatası.' });
  }
});

/**
 * POST /api/auth/reset-password
 * Kodu doğrula ve yeni şifreyi kaydet
 */
router.post('/reset-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ success: false, error: 'E-posta, kod ve yeni şifre gereklidir.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'Şifre en az 6 karakter olmalıdır.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select('+resetPasswordCode +resetPasswordExpires +password');

    if (!user) {
      return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı.' });
    }

    if (!user.resetPasswordCode || user.resetPasswordCode !== code.toString().trim()) {
      return res.status(400).json({ success: false, error: 'Hatalı veya geçersiz sıfırlama kodu.' });
    }

    if (Date.now() > user.resetPasswordExpires) {
      return res.status(400).json({ success: false, error: 'Sıfırlama kodunun süresi dolmuş. Lütfen yeni kod isteyin.' });
    }

    user.password = newPassword;
    user.resetPasswordCode = undefined;
    user.resetPasswordExpires = undefined;
    user.isVerified = true;
    await user.save();

    sendTokenResponse(user, 200, res);
  } catch (error) {
    console.error('[Reset Password Error]', error);
    res.status(500).json({ success: false, error: 'Sunucu hatası.' });
  }
});

/**
 * POST /api/auth/google
 * Google ile Giriş / Kayıt
 */
router.post('/google', async (req, res) => {
  try {
    const { idToken, email, name, avatar } = req.body;
    
    let userEmail = email;
    let userName = name;
    let userAvatar = avatar;

    if (idToken) {
      try {
        const cleanedClientId = (process.env.GOOGLE_CLIENT_ID || '').trim().replace(/^['"]|['"]$/g, '');
        const ticket = await client.verifyIdToken({
          idToken,
          audience: cleanedClientId
        });
        const payload = ticket.getPayload();
        userEmail = payload.email;
        userName = payload.name;
        userAvatar = payload.picture;
      } catch (e) {
        console.error('Google ID Token doğrulama hatası:', e.message);
        const cleanedClientId = (process.env.GOOGLE_CLIENT_ID || '').trim().replace(/^['"]|['"]$/g, '');
        let tokenDetails = "";
        try {
          const tempPayload = jwt.decode(idToken);
          tokenDetails = ` (Token Aud: ${tempPayload ? tempPayload.aud : 'null'}, Server Aud: ${cleanedClientId})`;
        } catch(decodeErr) {
          tokenDetails = " (Token decode failed)";
        }
        return res.status(401).json({ success: false, error: 'Google kimlik doğrulaması başarısız. Hata: ' + e.message + tokenDetails });
      }
    } else {
      return res.status(400).json({ success: false, error: 'Google ID Token gereklidir.' });
    }

    if (!userEmail) {
      return res.status(400).json({ success: false, error: 'E-posta alınamadı.' });
    }

    const normalizedEmail = userEmail.trim().toLowerCase();
    let user = await User.findOne({ email: normalizedEmail });
    
    if (!user) {
      user = await User.create({
        name: userName || 'Kullanıcı',
        email: normalizedEmail,
        password: Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8), 
        isVerified: true, 
        avatar: userAvatar || null,
        hasAcceptedLegal: false
      });
    } else {
      if (!user.isVerified) {
        user.isVerified = true;
        await user.save();
      }
      if (userAvatar && (!user.avatar || user.avatar === 'no-photo.jpg')) {
        user.avatar = userAvatar;
        await user.save();
      }
    }

    sendTokenResponse(user, 200, res);
  } catch (error) {
    console.error('[Google Auth Error]', error);
    res.status(500).json({ success: false, error: 'Google girişi başarısız oldu.' });
  }
});

module.exports = router;
