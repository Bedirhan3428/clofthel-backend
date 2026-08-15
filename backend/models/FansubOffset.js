const mongoose = require('mongoose');

const FansubOffsetSchema = new mongoose.Schema({
  version: {
    type: Number,
    required: true,
    default: 1
  },
  offsets: {
    type: Map,
    of: Number,
    default: {
      'TRanimeizle': 0,
      'FGL Çeviri': 0,
      'Seicode': 10,
      'TAÇE': 8,
      'Anisekai': 7,
      'Puzzle': 0,
      'Tempura': 12,
      'Aoi Fansub': 5,
      'Animeou': 6,
      'Sukebe': 0,
      'Adonis': 0,
      'default': 0
    }
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('FansubOffset', FansubOffsetSchema);
