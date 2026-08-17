/**
 * Clofthel — AniList Data Enricher Script
 * 
 * Iterates over all `animes` records with missing `anilist_id` or `cover_image`,
 * queries AniList GraphQL API by title, and atomically updates each record.
 * 
 * Usage:
 *   node enrich_anilist.js             # Full run
 *   node enrich_anilist.js --dry-run   # Preview without writing to DB
 *   node enrich_anilist.js --resume    # Resume from last saved progress
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// ── Configuration ──────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI;
const ANILIST_API_URL = 'https://graphql.anilist.co';
const PROGRESS_FILE = path.join(__dirname, 'enrich_progress.json');
const FAILED_FILE = path.join(__dirname, 'failed_enrichments.json');

const BASE_DELAY_MS = 1200;       // 1.2s between requests (AniList: 90 req/min)
const RETRY_DELAY_MS = 5000;      // 5s sleep on 429
const MAX_RETRIES_PER_RECORD = 3; // Max retries per record on 429
const ESCALATION_THRESHOLD = 5;   // Consecutive 429s before delay escalation
const ESCALATED_DELAY_MS = 3000;  // Escalated delay after too many 429s

// ── CLI Flags ──────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const RESUME = args.includes('--resume');

// ── AniList GraphQL Query ──────────────────────────────────────
const SEARCH_QUERY = `
  query ($search: String) {
    Media(search: $search, type: ANIME, format_not: MUSIC) {
      id
      title {
        romaji
        english
      }
      coverImage {
        extraLarge
        large
      }
      bannerImage
      description(asHtml: false)
      genres
      averageScore
      seasonYear
      format
    }
  }
`;

// ── Mongoose Schema (mirrors backend/models/Anime.js) ──────────
const animeSchema = new mongoose.Schema(
  {
    tranimeizle_slug: String,
    tranimeizle_url: String,
    anilist_id: { type: Number, default: null },
    orijinal_ad: { type: String, default: null },
    format: { type: String, default: null },
    total_episodes: { type: Number, default: 0 },
    episodes: { type: mongoose.Schema.Types.Mixed, default: {} },
    episodes_cache: { type: mongoose.Schema.Types.Mixed, default: {} },
    comparable_base_slug: { type: String, default: null },
    chronological_order: { type: Number, default: 1 },
    descriptive_label: { type: String, default: null },
    category: { type: String, default: null },
    cover_image: { type: String, default: null },
    banner_image: { type: String, default: null },
    description: { type: String, default: null },
    genres: { type: [String], default: [] },
    average_score: { type: Number, default: null },
    season_year: { type: Number, default: null },
  },
  { collection: 'animes', versionKey: false }
);

const Anime = mongoose.models.Anime || mongoose.model('Anime', animeSchema);

// ── Helper: Sleep ──────────────────────────────────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── Helper: Load/Save Progress ─────────────────────────────────
function loadProgress() {
  if (RESUME && fs.existsSync(PROGRESS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      return new Set(data.processed_ids || []);
    } catch {
      return new Set();
    }
  }
  return new Set();
}

function saveProgress(processedIds) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
    processed_ids: [...processedIds],
    updated_at: new Date().toISOString()
  }, null, 2), 'utf8');
}

function appendFailed(record, reason) {
  let failed = [];
  if (fs.existsSync(FAILED_FILE)) {
    try { failed = JSON.parse(fs.readFileSync(FAILED_FILE, 'utf8')); } catch { /* ignore */ }
  }
  failed.push({
    _id: record._id.toString(),
    orijinal_ad: record.orijinal_ad,
    reason,
    timestamp: new Date().toISOString()
  });
  fs.writeFileSync(FAILED_FILE, JSON.stringify(failed, null, 2), 'utf8');
}

// ── AniList Fetch with Retry ───────────────────────────────────
async function fetchAniListData(searchTitle, currentDelay) {
  for (let attempt = 1; attempt <= MAX_RETRIES_PER_RECORD; attempt++) {
    try {
      const response = await fetch(ANILIST_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query: SEARCH_QUERY, variables: { search: searchTitle } })
      });

      if (response.status === 429) {
        console.warn(`  ⚠ 429 Rate Limited (attempt ${attempt}/${MAX_RETRIES_PER_RECORD}). Sleeping ${RETRY_DELAY_MS / 1000}s...`);
        if (attempt < MAX_RETRIES_PER_RECORD) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        return { data: null, rateLimited: true };
      }

      if (!response.ok) {
        console.warn(`  ⚠ HTTP ${response.status} for "${searchTitle}"`);
        return { data: null, rateLimited: false };
      }

      const json = await response.json();
      const media = json?.data?.Media;
      return { data: media || null, rateLimited: false };
    } catch (error) {
      console.error(`  ✗ Network error (attempt ${attempt}): ${error.message}`);
      if (attempt < MAX_RETRIES_PER_RECORD) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      return { data: null, rateLimited: false };
    }
  }
  return { data: null, rateLimited: false };
}

// ── Main Enrichment Loop ───────────────────────────────────────
async function main() {
  console.log('==================================================');
  console.log('[ENRICHER] Clofthel AniList Data Enricher');
  console.log(`[ENRICHER] Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log(`[ENRICHER] Resume: ${RESUME ? 'YES' : 'NO'}`);
  console.log('==================================================\n');

  await mongoose.connect(MONGO_URI);
  console.log('[ENRICHER] Connected to MongoDB.\n');

  // Find records needing enrichment
  const query = {
    $or: [
      { anilist_id: null },
      { cover_image: null },
      { cover_image: { $exists: false } }
    ]
  };

  const records = await Anime.find(query).lean();
  console.log(`[ENRICHER] Found ${records.length} records needing enrichment.\n`);

  if (records.length === 0) {
    console.log('[ENRICHER] Nothing to do. All records are enriched!');
    await mongoose.disconnect();
    return;
  }

  const processedIds = loadProgress();
  let currentDelay = BASE_DELAY_MS;
  let consecutiveRateLimits = 0;
  let stats = { updated: 0, skipped: 0, failed: 0, noTitle: 0 };

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const recordId = record._id.toString();

    // Skip already processed (resume mode)
    if (processedIds.has(recordId)) {
      stats.skipped++;
      continue;
    }

    const searchTitle = record.orijinal_ad;
    if (!searchTitle) {
      console.log(`[${i + 1}/${records.length}] ⊘ No orijinal_ad for ${recordId} — skipping.`);
      stats.noTitle++;
      processedIds.add(recordId);
      continue;
    }

    process.stdout.write(`[${i + 1}/${records.length}] Searching "${searchTitle}"... `);

    const { data: media, rateLimited } = await fetchAniListData(searchTitle, currentDelay);

    if (rateLimited) {
      consecutiveRateLimits++;
      if (consecutiveRateLimits >= ESCALATION_THRESHOLD) {
        currentDelay = ESCALATED_DELAY_MS;
        console.warn(`\n[ENRICHER] ⚠ ${ESCALATION_THRESHOLD} consecutive 429s — escalating delay to ${currentDelay}ms.`);
      }
      appendFailed(record, '429 Rate Limited after max retries');
      stats.failed++;
      processedIds.add(recordId);
      saveProgress(processedIds);
      await sleep(currentDelay);
      continue;
    }

    // Reset consecutive counter on successful request
    consecutiveRateLimits = 0;

    if (!media) {
      console.log('✗ Not found on AniList.');
      appendFailed(record, 'No matching result on AniList');
      stats.failed++;
      processedIds.add(recordId);
      saveProgress(processedIds);
      await sleep(currentDelay);
      continue;
    }

    // Build update payload
    const updatePayload = {};
    if (record.anilist_id === null || record.anilist_id === undefined) {
      updatePayload.anilist_id = media.id;
    }
    if (!record.cover_image && media.coverImage) {
      updatePayload.cover_image = media.coverImage.extraLarge || media.coverImage.large;
    }
    if (!record.banner_image && media.bannerImage) {
      updatePayload.banner_image = media.bannerImage;
    }
    if (!record.description && media.description) {
      updatePayload.description = media.description.replace(/<[^>]+>/g, '').trim();
    }
    if ((!record.genres || record.genres.length === 0) && media.genres) {
      updatePayload.genres = media.genres;
    }
    if (record.average_score === null && media.averageScore) {
      updatePayload.average_score = media.averageScore;
    }
    if (record.season_year === null && media.seasonYear) {
      updatePayload.season_year = media.seasonYear;
    }

    if (Object.keys(updatePayload).length === 0) {
      console.log('⊘ Nothing to update.');
    } else if (DRY_RUN) {
      console.log(`✓ Would update: ${Object.keys(updatePayload).join(', ')}`);
    } else {
      await Anime.findByIdAndUpdate(record._id, { $set: updatePayload });
      console.log(`✓ Updated: ${Object.keys(updatePayload).join(', ')}`);
    }

    stats.updated++;
    processedIds.add(recordId);

    // Save progress every 10 records
    if (stats.updated % 10 === 0) {
      saveProgress(processedIds);
    }

    await sleep(currentDelay);
  }

  // Final progress save
  saveProgress(processedIds);

  console.log('\n==================================================');
  console.log('[ENRICHER] COMPLETE');
  console.log(`  ✓ Updated:   ${stats.updated}`);
  console.log(`  ⊘ Skipped:   ${stats.skipped}`);
  console.log(`  ✗ Failed:    ${stats.failed}`);
  console.log(`  ⊘ No Title:  ${stats.noTitle}`);
  console.log('==================================================');

  await mongoose.disconnect();
  console.log('[ENRICHER] Database connection closed.');
}

main().catch(err => {
  console.error('[ENRICHER] FATAL:', err);
  process.exit(1);
});
