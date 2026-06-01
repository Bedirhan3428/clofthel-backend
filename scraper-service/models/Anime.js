const mongoose = require('mongoose');

const animeSchema = new mongoose.Schema(
  {
    tranimeizle_slug: {
      type: String,
      required: true,
      index: true,
    },
    tranimeizle_url: {
      type: String,
    },
    anilist_id: {
      type: Number,
      index: true,
      default: null,
    },
    orijinal_ad: {
      type: String,
      default: null,
    },
    format: {
      type: String,
      default: null,
    },
    total_episodes: {
      type: Number,
      default: 0,
    },
    episodes: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    episodes_cache: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    comparable_base_slug: {
      type: String,
      index: true,
      default: null,
    },
    chronological_order: {
      type: Number,
      default: 1,
    },
    descriptive_label: {
      type: String,
      default: null,
    },
    category: {
      type: String,
      default: null,
    },
    cover_image: {
      type: String,
      default: null,
    },
    banner_image: {
      type: String,
      default: null,
    },
    description: {
      type: String,
      default: null,
    },
    genres: {
      type: [String],
      default: [],
    },
    average_score: {
      type: Number,
      default: null,
    },
    season_year: {
      type: Number,
      default: null,
    },
  },
  {
    collection: 'animes',
    versionKey: false,
  }
);

module.exports = mongoose.model('Anime', animeSchema);
