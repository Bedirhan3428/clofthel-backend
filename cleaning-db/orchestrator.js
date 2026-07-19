const fs = require('fs');
const path = require('path');

// Load environment variables
const localEnvPath = path.join(__dirname, '.env');
if (fs.existsSync(localEnvPath)) {
  require('dotenv').config({ path: localEnvPath });
} else {
  const backendEnvPath = path.join(__dirname, '../backend/.env');
  if (fs.existsSync(backendEnvPath)) {
    require('dotenv').config({ path: backendEnvPath });
  }
}

// Constants for orchestration
const STATE_FILE = path.join(__dirname, 'orchestrator_state.json');
const DRAFT_FILE = path.join(__dirname, 'raw_animes_draft.json');
const FINAL_FILE = path.join(__dirname, 'final_clean_directory.json');

const CHUNK_SIZE = 20; // Processing 20 items per batch to avoid timeouts
const API_KEY = process.env.API_KEY;
const BASE_URL = 'https://zenmux.ai/api/v1/chat/completions';

if (!API_KEY) {
  console.error('[ORCHESTRATOR] Error: API_KEY is not defined in the environment or .env file.');
  process.exit(1);
}

// Using strictly DeepSeek v4 Flash model
const PROVIDERS = [
  { model: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash' }
];

let currentProviderIndex = 0;

// Helper to load or initialize state
function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      console.log(`[ORCHESTRATOR] Found existing state file: ${STATE_FILE}`);
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.error(`[ORCHESTRATOR] Error parsing state file. Initializing clean state:`, err.message);
    }
  }
  return {
    processed_chunks: [],
    global_titles_map: {}
  };
}

// Helper to save current state
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

// Clean JSON response by removing markdown blocks and reasoning think tags if they exist
function cleanJsonResponse(text) {
  let cleaned = text.trim();
  
  // Strip DeepSeek <think>...</think> blocks if present
  if (cleaned.includes('<think>')) {
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }

  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9]*\s*/, '');
    cleaned = cleaned.replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

// Validate that the LLM output conforms to the exact schema, and normalize/sanitize on the fly
function validateLlmResponse(data) {
  if (!Array.isArray(data)) {
    throw new Error('Response is not a JSON array');
  }

  for (const item of data) {
    if (!item.main_title_en) {
      throw new Error('Item is missing "main_title_en"');
    }
    if (!Array.isArray(item.seasons)) {
      throw new Error(`Item "${item.main_title_en}" is missing "seasons" array`);
    }
    if (!Array.isArray(item.related_movies_or_ovas)) {
      throw new Error(`Item "${item.main_title_en}" is missing "related_movies_or_ovas" array`);
    }

    // Normalize and sanitize seasons array
    const sanitizedSeasons = [];
    for (const season of item.seasons) {
      // Heal title/season_title swap
      if (!season.season_title && season.title) {
        season.season_title = season.title;
      }
      // Heal format/type swap
      if (!season.format && season.type) {
        season.format = season.type;
      }
      if (season.season_number === undefined || !season.season_title || !season.format || !season.mongo_db_id) {
        throw new Error(`Item "${item.main_title_en}" has an invalid season schema: ${JSON.stringify(season)}`);
      }
      sanitizedSeasons.push({
        season_number: Number(season.season_number),
        season_title: String(season.season_title).trim(),
        format: String(season.format).trim(),
        mongo_db_id: String(season.mongo_db_id).trim()
      });
    }
    item.seasons = sanitizedSeasons;

    // Normalize and sanitize related_movies_or_ovas array
    const sanitizedMovies = [];
    for (const movie of item.related_movies_or_ovas) {
      // Heal title/season_title swap
      if (!movie.title && movie.season_title) {
        movie.title = movie.season_title;
      }
      // Heal format/type swap
      if (!movie.format && movie.type) {
        movie.format = movie.type;
      }
      if (!movie.title || !movie.format || !movie.mongo_db_id) {
        throw new Error(`Item "${item.main_title_en}" has an invalid related movie/OVA schema: ${JSON.stringify(movie)}`);
      }
      sanitizedMovies.push({
        title: String(movie.title).trim(),
        format: String(movie.format).trim(),
        mongo_db_id: String(movie.mongo_db_id).trim()
      });
    }
    item.related_movies_or_ovas = sanitizedMovies;
  }
  return true;
}

// Perform LLM API calls with timeouts
async function callLlmWithTimeout(provider, messages, timeoutMs = 180000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: provider.model,
        messages: messages,
        temperature: 0.1 // Low temperature to enforce strict schema adherence
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Generate the prompt for processing a chunk of records
function createPrompt(chunk) {
  return [
    {
      role: 'system',
      content: 'You are a translation and data-sanitization agent specializing in anime metadata. Your goal is to clean up messy anime titles and group them into a unified, high-quality directory format. IMPORTANT: DO NOT write any internal reasoning or <think> tags. Output ONLY the raw JSON array.'
    },
    {
      role: 'user',
      content: `Analyze the following chunk of raw anime metadata records. Clean their titles and group them into a unified, high-quality directory format based on the rules below.

Input Array:
${JSON.stringify(chunk)}

CLEANING RULES:
1. STRIP JUNK WORDS: Remove any trailing junk or web-scraper artifacts from titles and search hints. This includes, but is not limited to: "HD", "izle", "1080p", "Türkçe Altyazılı", "Türkçe Dublaj", "dual", "uncensored", "censored", etc. (e.g., "Dragon Ball HD" -> "Dragon Ball").
2. STANDARDIZE TITLES: 
   - "main_title_en": Must be the official international English title.
   - "main_title_jp": Must be the official Romaji (Japanese) title.
3. DETECT SEASONS: Extract the season numbers or parts from titles/hints. Group them strictly under the same main object. Do not make different seasons of the same anime separate root objects.
4. ABSOLUTE CONSTRAINT: Never alter, skip, or invent "mongo_db_id" values. They must be preserved exactly.

OUTPUT FORMAT:
Return ONLY a raw, valid JSON array. DO NOT use <think> tags or write internal reasoning. No markdown wraps (no \`\`\`json ... \`\`\`), no explanations. Start directly with '[' and end with ']'.

Example Output Structure:
[
  {
    "main_title_en": "86 EIGHTY-SIX",
    "main_title_jp": "86",
    "type": "TV",
    "seasons": [
      { "season_number": 1, "season_title": "Season 1", "format": "TV", "mongo_db_id": "6a135d..." },
      { "season_number": 2, "season_title": "Season 2", "format": "TV", "mongo_db_id": "6a135e..." }
    ],
    "related_movies_or_ovas": []
  }
]`
    }
  ];
}

// Merge LLM outputs into the global state map
function mergeChunkIntoGlobalMap(globalMap, cleanedItems) {
  for (const item of cleanedItems) {
    const mainTitleEnKey = item.main_title_en.trim().toLowerCase();
    
    if (globalMap[mainTitleEnKey]) {
      const existing = globalMap[mainTitleEnKey];
      
      // Update Japanese title if missing
      if (!existing.main_title_jp && item.main_title_jp) {
        existing.main_title_jp = item.main_title_jp.trim();
      }

      // Update primary type if missing
      if (!existing.type && item.type) {
        existing.type = item.type;
      }

      // Merge seasons
      if (item.seasons && Array.isArray(item.seasons)) {
        item.seasons.forEach(newSeason => {
          const seasonExists = existing.seasons.some(s => 
            s.mongo_db_id === newSeason.mongo_db_id ||
            (s.season_number === newSeason.season_number && s.season_number !== 0)
          );
          if (!seasonExists) {
            existing.seasons.push(newSeason);
          }
        });
        // Sort seasons by season_number ascending
        existing.seasons.sort((a, b) => a.season_number - b.season_number);
      }

      // Merge related movies or OVAs
      if (item.related_movies_or_ovas && Array.isArray(item.related_movies_or_ovas)) {
        item.related_movies_or_ovas.forEach(newMovie => {
          const movieExists = existing.related_movies_or_ovas.some(m => 
            m.mongo_db_id === newMovie.mongo_db_id
          );
          if (!movieExists) {
            existing.related_movies_or_ovas.push(newMovie);
          }
        });
      }
    } else {
      // Add a fresh map entry
      globalMap[mainTitleEnKey] = {
        main_title_en: item.main_title_en.trim(),
        main_title_jp: item.main_title_jp ? item.main_title_jp.trim() : '',
        type: item.type || 'TV',
        seasons: Array.isArray(item.seasons) ? item.seasons : [],
        related_movies_or_ovas: Array.isArray(item.related_movies_or_ovas) ? item.related_movies_or_ovas : []
      };
    }
  }
}

async function orchestrate() {
  console.log('==================================================');
  console.log('[ORCHESTRATOR] Starting Orchestrator Agent Layer...');
  console.log('==================================================');

  // Load raw data draft
  if (!fs.existsSync(DRAFT_FILE)) {
    console.error(`[ORCHESTRATOR] Error: Raw draft file not found at ${DRAFT_FILE}. Run clean_db.js first.`);
    process.exit(1);
  }

  const rawAnimes = JSON.parse(fs.readFileSync(DRAFT_FILE, 'utf8'));
  console.log(`[ORCHESTRATOR] Loaded ${rawAnimes.length} raw anime records.`);

  // Load current memory state (facilitating resume)
  const state = loadState();

  // Split raw records into chunks of size CHUNK_SIZE
  const chunks = [];
  for (let i = 0; i < rawAnimes.length; i += CHUNK_SIZE) {
    chunks.push(rawAnimes.slice(i, i + CHUNK_SIZE));
  }
  console.log(`[ORCHESTRATOR] Total chunks to process: ${chunks.length}`);

  // Main processing loop
  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
    // Skip if already processed in previous sessions
    if (state.processed_chunks.includes(chunkIdx)) {
      console.log(`[ORCHESTRATOR] Skipping already processed chunk: ${chunkIdx + 1}/${chunks.length}`);
      continue;
    }

    const chunkData = chunks[chunkIdx];
    console.log(`\n[ORCHESTRATOR] Processing chunk ${chunkIdx + 1}/${chunks.length} (${chunkData.length} records)...`);

    let success = false;
    let retries = 0;
    let responseText = '';

    // Retry loop with model rotation
    const MAX_RETRIES = 5;
    while (!success && retries < MAX_RETRIES) {
      const provider = PROVIDERS[currentProviderIndex];
      console.log(`[ORCHESTRATOR] Attempting with provider: ${provider.name} (${provider.model})...`);

      try {
        const messages = createPrompt(chunkData);
        const startTime = Date.now();
        const response = await callLlmWithTimeout(provider, messages);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`HTTP Error Status: ${response.status} - ${response.statusText}. Details: ${errText}`);
        }

        responseText = await response.text();
        const jsonResponse = JSON.parse(responseText);
        
        if (!jsonResponse.choices || !jsonResponse.choices[0] || !jsonResponse.choices[0].message) {
          throw new Error(`Unexpected API response structure: ${responseText}`);
        }

        const modelContent = jsonResponse.choices[0].message.content;
        const cleanedText = cleanJsonResponse(modelContent);

        // Parse and validate response structure
        const parsedData = JSON.parse(cleanedText);
        validateLlmResponse(parsedData);

        // Success - merge data and mark chunk as complete
        mergeChunkIntoGlobalMap(state.global_titles_map, parsedData);
        state.processed_chunks.push(chunkIdx);
        saveState(state);
        
        console.log(`[ORCHESTRATOR] Chunk ${chunkIdx + 1} processed successfully in ${duration}s.`);
        success = true;

      } catch (err) {
        retries++;
        console.warn(`[ORCHESTRATOR] WARNING: Attempt ${retries} failed using ${provider.name}. Error: ${err.message}`);
        if (responseText) {
          console.warn(`[ORCHESTRATOR] Raw response preview (first 400 chars): ${responseText.slice(0, 400)}`);
        }
        
        // Rotate to the next provider
        currentProviderIndex = (currentProviderIndex + 1) % PROVIDERS.length;
        console.log(`[ORCHESTRATOR] Rotating provider index to: ${currentProviderIndex} (${PROVIDERS[currentProviderIndex].name})`);
        
        // Brief delay before retry
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!success) {
      console.error(`\n[ORCHESTRATOR] FATAL: Failed to process chunk ${chunkIdx + 1} after rotating all providers.`);
      console.error(`[ORCHESTRATOR] Progress saved. You can resolve the API/Network issue and rerun the script to resume.`);
      process.exit(1);
    }
  }

  // Final compilation and file export
  console.log('\n==================================================');
  console.log('[ORCHESTRATOR] All chunks processed successfully!');
  console.log('[ORCHESTRATOR] Compiling final clean directory...');

  const finalCleanDirectory = Object.values(state.global_titles_map);
  
  // Sort the final map alphabetically by main_title_en
  finalCleanDirectory.sort((a, b) => {
    return a.main_title_en.localeCompare(b.main_title_en, 'tr', { sensitivity: 'base' });
  });

  fs.writeFileSync(FINAL_FILE, JSON.stringify(finalCleanDirectory, null, 2), 'utf8');
  console.log(`[ORCHESTRATOR] Final output saved: ${FINAL_FILE}`);
  console.log(`[ORCHESTRATOR] Total cleaned records: ${finalCleanDirectory.length}`);
  console.log('==================================================');
}

orchestrate();
