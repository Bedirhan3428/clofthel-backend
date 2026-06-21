require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Anime = require('./models/Anime');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/clofthel';

function cleanSlug(slug) {
  if (!slug) return [];
  return slug.toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter(x => x && x.length > 2);
}

function isValidMatch(slug, titleRomaji, titleEnglish) {
  const slugTokens = cleanSlug(slug);
  if (slugTokens.length === 0) return false;
  
  const romaji = (titleRomaji || '').toLowerCase();
  const english = (titleEnglish || '').toLowerCase();
  
  // Stopwords to ignore
  const stopwords = ['izle', 'movie', 'film', 'season', 'sezon', 'part', 'kisim', 'ova', 'ona', 'special', 'tv', 'dublaj', 'altyazi', 'hd', 'fullhd'];
  
  // Filter out stopwords
  const keyTokens = slugTokens.filter(t => !stopwords.includes(t) && !/^\d+$/.test(t));
  if (keyTokens.length === 0) return true; // fallback
  
  // The first 2 key tokens are the most important
  const firstToken = keyTokens[0];
  const secondToken = keyTokens[1];
  
  const matchesFirst = romaji.includes(firstToken) || english.includes(firstToken);
  const matchesSecond = secondToken ? (romaji.includes(secondToken) || english.includes(secondToken)) : false;
  
  // Handled specific franchise mappings
  if (slug.includes('attack-on-titan') && (romaji.includes('shingeki') || english.includes('titan'))) return true;
  if (slug.includes('shingeki-no-kyojin') && (romaji.includes('shingeki') || english.includes('titan'))) return true;
  if (slug.includes('your-name') && (romaji.includes('kimi') || english.includes('name'))) return true;
  if (slug.includes('kimi-no-na-wa') && (romaji.includes('kimi') || english.includes('name'))) return true;
  
  return matchesFirst || matchesSecond;
}

async function searchAniListTitles(query, retryCount = 0) {
  const gqlQuery = `
    query ($search: String) {
      Page(page: 1, perPage: 8) {
        media(search: $search, type: ANIME, format_not: MUSIC) {
          id
          title {
            romaji
            english
          }
          format
          coverImage {
            large
          }
          bannerImage
          description
          averageScore
          seasonYear
        }
      }
    }
  `;
  try {
    const response = await axios.post('https://graphql.anilist.co', {
      query: gqlQuery,
      variables: { search: query }
    });
    return response.data?.data?.Page?.media || [];
  } catch (err) {
    if (err.response && err.response.status === 429 && retryCount < 4) {
      const waitTime = 15000 + (retryCount * 5000);
      console.log(`[429 Rate Limit] Waiting ${waitTime / 1000}s and retrying (Attempt ${retryCount + 1})...`);
      await new Promise(r => setTimeout(r, waitTime));
      return await searchAniListTitles(query, retryCount + 1);
    }
    console.error(`AniList Search API error for "${query}":`, err.message);
    throw err; // Re-throw to signal search failure (not empty results)
  }
}

function formatSlugToTitle(slug) {
  if (!slug) return '';
  let title = slug.replace(/-izle$/, '');
  title = title.replace(/-/g, ' ');
  title = title.replace(/\b(izle|turkce|dublaj|altyazi|full\s*hd|hd)\b/gi, '');
  return title.trim();
}

async function repair() {
  await mongoose.connect(MONGO_URI, { family: 4 });
  console.log('Connected to MongoDB.');

  const animes = await Anime.find({}).lean();
  console.log(`Analyzing ${animes.length} entries for mismatches...`);

  const queue = [];

  for (const anime of animes) {
    const slug = anime.tranimeizle_slug;
    const title = anime.orijinal_ad || '';
    const anilistId = anime.anilist_id;

    // ONLY repair active mismatched mappings
    if (anilistId && title) {
      const valid = isValidMatch(slug, title, title);
      if (!valid) {
        console.log(`[SUSPICIOUS] Slug: ${slug} | Title: ${title} | AniList ID: ${anilistId}`);
        queue.push(anime);
      }
    }
  }

  console.log(`\nFound ${queue.length} mismatched entries to repair.`);
  
  if (queue.length === 0) {
    console.log('No repairs needed!');
    await mongoose.disconnect();
    return;
  }

  // Process queue sequentially to respect AniList rate limits
  for (let i = 0; i < queue.length; i++) {
    const anime = queue[i];
    const slug = anime.tranimeizle_slug;
    console.log(`\n[${i+1}/${queue.length}] Resolving: ${slug}`);

    const cleanTitle = formatSlugToTitle(slug);
    
    // Wait 1500ms between requests to avoid rate limit proactively
    await new Promise(resolve => setTimeout(resolve, 1500));

    try {
      const mediaList = await searchAniListTitles(cleanTitle);

      if (mediaList && mediaList.length > 0) {
        // Find the first media item that matches our validation rules
        let bestMatch = null;
        for (const media of mediaList) {
          if (isValidMatch(slug, media.title.romaji, media.title.english)) {
            bestMatch = media;
            break;
          }
        }

        if (bestMatch) {
          const englishTitle = bestMatch.title.english || bestMatch.title.romaji;
          console.log(`✅ MATCH FOUND: ${slug} -> AniList ID: ${bestMatch.id} | Title: ${englishTitle}`);

          // Update database
          await Anime.updateOne(
            { _id: anime._id },
            {
              $set: {
                anilist_id: bestMatch.id,
                orijinal_ad: englishTitle,
                format: bestMatch.format || anime.format,
                cover_image: bestMatch.coverImage?.large || anime.cover_image,
                banner_image: bestMatch.bannerImage || anime.banner_image,
                description: bestMatch.description || anime.description,
                average_score: bestMatch.averageScore || anime.average_score,
                season_year: bestMatch.seasonYear || anime.season_year
              }
            }
          );
        } else {
          console.log(`❌ NO VALID MATCH FOUND in top ${mediaList.length} results for: ${slug}`);
          // If the current match was incorrect, set it to null so it doesn't display wrong title/seasons
          console.log(`Removing wrong mapping for ${slug} (ID: ${anime.anilist_id})`);
          await Anime.updateOne(
            { _id: anime._id },
            {
              $set: {
                anilist_id: null,
                orijinal_ad: formatSlugToTitle(slug)
              }
            }
          );
        }
      } else {
        console.log(`⚠️ Search returned no results for: ${slug}`);
        console.log(`Removing wrong mapping for ${slug} (ID: ${anime.anilist_id})`);
        await Anime.updateOne(
          { _id: anime._id },
          {
            $set: {
              anilist_id: null,
              orijinal_ad: formatSlugToTitle(slug)
            }
          }
        );
      }
    } catch (err) {
      console.error(`Skipping ${slug} due to search query failure:`, err.message);
      // DO NOT touch the database record if the API query itself failed!
    }
  }

  console.log('\nRepair process complete!');
  await mongoose.disconnect();
}

repair();
