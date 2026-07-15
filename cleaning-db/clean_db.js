const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Load environment variables from the backend's config if available, fallback to process.env
const envPath = path.join(__dirname, '../backend/.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/clofthel';
const DRAFT_FILE_NAME = 'raw_animes_draft.json';
const outputPath = path.join(__dirname, DRAFT_FILE_NAME);

// Define Schema for Anime
const animeSchema = new mongoose.Schema(
  {
    tranimeizle_slug: { type: String, required: true },
    orijinal_ad: { type: String, default: null },
    format: { type: String, default: null },
    season_year: { type: Number, default: null }
  },
  { collection: 'animes' }
);

const Anime = mongoose.models.Anime || mongoose.model('Anime', animeSchema);

async function cleanAndGroupDatabase() {
  try {
    console.log('--------------------------------------------------');
    console.log('[DB CLEANER] Starting database cleaning utility...');
    console.log(`[DB CLEANER] Target MongoDB URI: ${MONGO_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`); // Hide credentials in logs

    // 1. Connection
    await mongoose.connect(MONGO_URI);
    console.log('[DB CLEANER] MongoDB connection established successfully.');

    // Query all documents with projection: _id, orijinal_ad, tranimeizle_slug, format, season_year
    console.log('[DB CLEANER] Fetching all anime records from collection...');
    const rawAnimes = await Anime.find(
      {},
      {
        _id: 1,
        orijinal_ad: 1,
        tranimeizle_slug: 1,
        format: 1,
        season_year: 1
      }
    ).lean();

    console.log(`[DB CLEANER] Successfully retrieved ${rawAnimes.length} documents.`);

    // 2. Algorithmic Grouping
    console.log('[DB CLEANER] Grouping records algorithmically in memory...');
    const groups = {};
    let ungroupedCounter = 0;

    for (const anime of rawAnimes) {
      const originalAd = anime.orijinal_ad ? anime.orijinal_ad.trim() : '';
      const format = anime.format ? anime.format.trim() : '';
      const year = anime.season_year !== undefined && anime.season_year !== null ? String(anime.season_year) : '';

      // If original_ad is missing, we treat it as ungroupable and create a unique isolated group
      if (!originalAd) {
        ungroupedCounter++;
        const uniqueKey = `_ungrouped_${ungroupedCounter}`;
        groups[uniqueKey] = [anime];
      } else {
        // Grouping key strictly defined by: title, format, and year
        const key = `${originalAd.toLowerCase()}||${format.toLowerCase()}||${year}`;
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(anime);
      }
    }

    console.log(`[DB CLEANER] Grouped ${rawAnimes.length} documents into ${Object.keys(groups).length} unique anime groups.`);

    // 3. Transform to Simplified Schema
    console.log('[DB CLEANER] Transforming grouped items to simplified schema...');
    const simplifiedAnimes = [];

    for (const key of Object.keys(groups)) {
      const items = groups[key];
      const primaryItem = items[0];

      // Combine MongoDB IDs and slugs if multiple records grouped under same title/year/format
      const mongoDbId = items.length === 1 ? primaryItem._id.toString() : items.map(x => x._id.toString()).join(', ');
      const searchHint = items.length === 1 ? primaryItem.tranimeizle_slug : items.map(x => x.tranimeizle_slug).join(', ');

      simplifiedAnimes.push({
        mongo_db_id: mongoDbId,
        original_title: primaryItem.orijinal_ad || 'Bilinmeyen Anime',
        search_hint: searchHint,
        format: primaryItem.format || 'Unknown',
        year: primaryItem.season_year || null
      });
    }

    // 4. Sorting Alphabetically by original_title (Using Turkish locale support)
    console.log('[DB CLEANER] Sorting resulting array alphabetically by original_title...');
    simplifiedAnimes.sort((a, b) => {
      const titleA = a.original_title;
      const titleB = b.original_title;
      return titleA.localeCompare(titleB, 'tr', { sensitivity: 'base' });
    });

    // 5. Saving to File
    console.log(`[DB CLEANER] Saving simplified JSON data to: ${DRAFT_FILE_NAME}`);
    fs.writeFileSync(outputPath, JSON.stringify(simplifiedAnimes, null, 2), 'utf8');

    console.log('--------------------------------------------------');
    console.log(`[DB CLEANER] SUCCESS: Saved ${simplifiedAnimes.length} sorted records to:`);
    console.log(`[DB CLEANER] Path: ${outputPath}`);
    console.log('--------------------------------------------------');

  } catch (error) {
    console.error('[DB CLEANER] ERROR encountered during execution:');
    console.error(error);
  } finally {
    // Ensure database connection is closed when done
    await mongoose.disconnect();
    console.log('[DB CLEANER] Database connection closed.');
  }
}

// Execute clean and group task
cleanAndGroupDatabase();
