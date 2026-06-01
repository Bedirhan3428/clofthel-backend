const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { Resend } = require('resend');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { JWT_SECRET } = require('../middleware/authMiddleware');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY);

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ── Rate Limiters (Brute Force Koruması) ────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 10, // IP başına 10 deneme
  message: { success: false, error: 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.' },
  standardHeaders: true,
  legacyHeaders: false
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 saat
  max: 5, // IP başına 5 kayıt
  message: { success: false, error: 'Çok fazla kayıt denemesi. 1 saat sonra tekrar deneyin.' },
  standardHeaders: true,
  legacyHeaders: false
});

const resendCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Çok fazla kod gönderme denemesi. 15 dakika sonra tekrar deneyin.' },
  standardHeaders: true,
  legacyHeaders: false
});

const sendVerificationEmail = async (email, code) => {
  // Production ortamında OTP kodunu konsola yazdırma (güvenlik riski)
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[DEV ONLY] Verification Code for ${email}: ${code}`);
  }
  try {
    await resend.emails.send({
      from: 'Clofthel <no-reply@clofthel.com.tr>',
      to: email,
      subject: 'Clofthel Doğrulama Kodunuz',
      html: `<div style="font-family: sans-serif; padding: 20px;">
        <h2>Clofthel'e Hoş Geldiniz!</h2>
        <p>Hesabınızı doğrulamak için aşağıdaki 6 haneli kodu kullanın:</p>
        <h1 style="color: #4a90e2; letter-spacing: 5px;">${code}</h1>
        <p>Bu kod 15 dakika geçerlidir.</p>
      </div>`
    });
  } catch (err) {
    console.error('Mail gönderme hatası:', err.message);
  }
};

// JWT Secret Key — .env'den alınır, fallback yok (güvenlik)
const JWT_EXPIRE = '30d'; // Token 30 gün geçerli olsun

// Token oluşturma yardımcı fonksiyonu
const sendTokenResponse = (user, statusCode, res) => {
  // Token oluştur
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
      avatar: user.avatar,
      role: user.role
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

    // İsim uzunluk kontrolü
    if (name.trim().length < 2 || name.trim().length > 50) {
      return res.status(400).json({ success: false, error: 'İsim 2-50 karakter arasında olmalıdır.' });
    }

    // E-posta format doğrulaması
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, error: 'Geçerli bir e-posta adresi girin.' });
    }

    // Şifre gücü kontrolü (min 8 karakter, en az 1 büyük, 1 küçük harf, 1 rakam)
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Şifre en az 8 karakter olmalıdır.' });
    }
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({ success: false, error: 'Şifre en az 1 büyük harf, 1 küçük harf ve 1 rakam içermelidir.' });
    }

    // Email kullanılıyor mu kontrol et
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Bu e-posta adresi zaten kullanılıyor.' });
    }

    // 6 haneli kod oluştur
    const code = generateOTP();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 dakika

    // Kullanıcıyı oluştur (isVerified: false olarak)
    const user = await User.create({
      name,
      email,
      password,
      verificationCode: code,
      verificationCodeExpires: expires
    });

    // E-postayı gönder
    await sendVerificationEmail(email, code);

    // Token DÖNMÜYORUZ, sadece başarı mesajı dönüyoruz
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

    // Email ve şifre kontrolü
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Lütfen e-posta ve şifrenizi girin.' });
    }

    // Kullanıcıyı bul (şifre ve doğrulanma durumunu kontrol etmek için)
    const user = await User.findOne({ email }).select('+password +isVerified');

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

    // Token'ı doğrula
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
          avatar: user.avatar,
          role: user.role
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

    const user = await User.findOne({ email }).select('+verificationCode +verificationCodeExpires');
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı.' });
    }

    if (user.isVerified) {
      return res.status(400).json({ success: false, error: 'Bu hesap zaten doğrulanmış.' });
    }

    if (user.verificationCode !== code.toString()) {
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

    const user = await User.findOne({ email });

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

    await sendVerificationEmail(email, code);

    res.json({ success: true, message: 'Yeni kod gönderildi.' });
  } catch (error) {
    console.error('[Resend Code Error]', error);
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
        const ticket = await client.verifyIdToken({
          idToken,
          audience: process.env.GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        userEmail = payload.email;
        userName = payload.name;
        userAvatar = payload.picture;
      } catch (e) {
        console.error('Google ID Token doğrulama hatası:', e.message);
        return res.status(401).json({ success: false, error: 'Google kimlik doğrulaması başarısız. Geçersiz token.' });
      }
    } else {
      return res.status(400).json({ success: false, error: 'Google ID Token gereklidir.' });
    }

    if (!userEmail) {
      return res.status(400).json({ success: false, error: 'E-posta alınamadı.' });
    }

    let user = await User.findOne({ email: userEmail });
    
    if (!user) {
      user = await User.create({
        name: userName || 'Kullanıcı',
        email: userEmail,
        password: Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8), 
        isVerified: true, 
        avatar: userAvatar || 'no-photo.jpg'
      });
    } else {
      if (!user.isVerified) {
        user.isVerified = true;
        await user.save();
      }
      if (userAvatar && user.avatar === 'no-photo.jpg') {
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
