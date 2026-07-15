const fs = require('fs');
const path = require('path');

// Constants for orchestration
const STATE_FILE = path.join(__dirname, 'orchestrator_state.json');
const DRAFT_FILE = path.join(__dirname, 'raw_animes_draft.json');
const FINAL_FILE = path.join(__dirname, 'final_clean_directory.json');

const CHUNK_SIZE = 50; // Processing 50 items per batch
const API_KEY = 'sk-ai-v1-efd9c1e89df9084b79076732088d2db26f53f433e5d05ae8faaebc841017e113';
const BASE_URL = 'https://zenmux.ai/api/v1/chat/completions';

// API Providers for failover rotation
const PROVIDERS = [
  { model: 'x-ai/grok-4.5-free', name: 'Grok 4.5' },
  { model: 'stepfun/step-3.7-flash-free', name: 'Step 3.7 Flash' },
  { model: 'z-ai/glm-4.7-flash-free', name: 'GLM 4.7 Flash' }
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

// Clean JSON response by removing markdown blocks if they exist
function cleanJsonResponse(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9]*\s*/, '');
    cleaned = cleaned.replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

// Validate that the LLM output conforms to the exact schema
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

    for (const season of item.seasons) {
      if (season.season_number === undefined || !season.season_title || !season.format || !season.mongo_db_id) {
        throw new Error(`Item "${item.main_title_en}" has an invalid season schema: ${JSON.stringify(season)}`);
      }
    }

    for (const movie of item.related_movies_or_ovas) {
      if (!movie.title || !movie.format || !movie.mongo_db_id) {
        throw new Error(`Item "${item.main_title_en}" has an invalid related movie/OVA schema: ${JSON.stringify(movie)}`);
      }
    }
  }
  return true;
}

// Perform LLM API calls with timeouts
async function callLlmWithTimeout(provider, messages, timeoutMs = 60000) {
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
      content: 'You are an advanced database cleanup and deduplication assistant. You output ONLY valid JSON arrays with no markdown wrappers or explanations.'
    },
    {
      role: 'user',
      content: `Analyze the following chunk of raw anime metadata records. Standardise their titles and group them into their canonical English and Japanese main titles.

Input Array:
${JSON.stringify(chunk)}

Instructions:
1. For each record, identify its canonical English Main Title (e.g., "Oshi no Ko", "Dragon Ball Z", "Attack on Titan") and Japanese Main Title (e.g., "Shingeki no Kyojin", "Dragon Ball Z").
2. Determine if the record represents a "Season" of a TV Series, a "Movie", an "OVA", or a "Special".
3. Group records belonging to the same franchise/canonical show together.
4. Output a clean JSON array matching this exact schema:
[
  {
    "main_title_en": "Canonical English Title",
    "main_title_jp": "Canonical Japanese Title (or Romaji)",
    "type": "TV" or "Movie" or "OVA" or "Special",
    "seasons": [
      {
        "season_number": Integer (1 for Season 1, 2 for Season 2, etc. Use 0 for specials/unknown),
        "season_title": "Season 1", "Season 2", etc.,
        "format": "TV" or "OVA" or "Special",
        "mongo_db_id": "The mongo_db_id from the input record"
      }
    ],
    "related_movies_or_ovas": [
      {
        "title": "Movie or OVA title",
        "format": "Movie" or "OVA",
        "mongo_db_id": "The mongo_db_id from the input record"
      }
    ]
  }
]

Requirements:
- Do not output any chat messages, markdown code block ticks, or text outside the JSON array block.
- Begin your response directly with '[' and end with ']'.
- Ensure all mongo_db_id properties correspond to the exact mongo_db_id values provided in the input.`
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

    // Retry loop with model rotation
    while (!success && retries < PROVIDERS.length) {
      const provider = PROVIDERS[currentProviderIndex];
      console.log(`[ORCHESTRATOR] Attempting with provider: ${provider.name} (${provider.model})...`);

      try {
        const messages = createPrompt(chunkData);
        const startTime = Date.now();
        const response = await callLlmWithTimeout(provider, messages);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        if (!response.ok) {
          throw new Error(`HTTP Error Status: ${response.status} - ${response.statusText}`);
        }

        const responseText = await response.text();
        const cleanedText = cleanJsonResponse(responseText);

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
