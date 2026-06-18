const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Lütfen adınızı girin'],
    trim: true,
    maxlength: [50, 'Adınız 50 karakterden uzun olamaz']
  },
  email: {
    type: String,
    required: [true, 'Lütfen e-posta adresinizi girin'],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Lütfen geçerli bir e-posta adresi girin'
    ]
  },
  password: {
    type: String,
    required: [true, 'Lütfen şifrenizi girin'],
    minlength: [6, 'Şifreniz en az 6 karakter olmalıdır'],
    select: false // Sorgularda şifrenin otomatik dönmemesi için
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  avatar: {
    type: String,
    default: null
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationCode: {
    type: String,
    select: false
  },
  verificationCodeExpires: {
    type: Date,
    select: false
  },
  expoPushTokens: [{
    type: String
  }],
  avatar: {
    type: String,
    default: 'no-photo.jpg'
  },
  favorites: [{
    type: mongoose.Schema.ObjectId,
    ref: 'Anime'
  }],
  notifyOnFavorites: {
    type: Boolean,
    default: true
  },
  watchHistory: [{
    anime: {
      type: mongoose.Schema.ObjectId,
      ref: 'Anime'
    },
    episode: {
      type: Number
    },
    currentTime: {
      type: Number,
      default: 0
    },
    watchedAt: {
      type: Date,
      default: Date.now
    }
  }],
  customLists: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    animes: [{
      type: mongoose.Schema.ObjectId,
      ref: 'Anime'
    }],
    notificationsEnabled: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  hasAcceptedLegal: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Şifreyi veritabanına kaydetmeden önce şifrele (Hash)
UserSchema.pre('save', async function(next) {
  // Eğer şifre değişmemişse (sadece isim vs güncellendiyse) atla
  if (!this.isModified('password')) {
    next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Girilen şifre ile veritabanındaki hash'lenmiş şifreyi karşılaştır
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
