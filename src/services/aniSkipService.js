import AsyncStorage from '@react-native-async-storage/async-storage';
import bundledOffsets from '../constants/fansubOffsets.json';
import { API_BASE_URL } from '../constants/config';

const FANSUB_OFFSETS_KEY = 'clofthel_fansub_offsets_config';
const ANISKIP_CACHE_PREFIX = 'aniskip_v2_cache_';
const MAL_MAP_CACHE_PREFIX = 'aniskip_mal_map_';

const malIdMemoryCache = new Map();

/**
 * Syncs fansub offsets with backend DB using version comparison
 */
export async function syncFansubOffsetsWithBackend() {
  try {
    let localConfig = bundledOffsets;
    try {
      const stored = await AsyncStorage.getItem(FANSUB_OFFSETS_KEY);
      if (stored) {
        localConfig = JSON.parse(stored);
      }
    } catch (e) {}

    const response = await fetch(`${API_BASE_URL}/v1/fansub-offsets`);
    if (response.ok) {
      const remote = await response.json();
      if (remote.success && remote.version > (localConfig.version || 0)) {
        console.log(`✨ [AniSkip] New fansub offsets version found: v${remote.version} (Local: v${localConfig.version || 0}). Updating cache...`);
        const updatedConfig = {
          version: remote.version,
          offsets: remote.offsets
        };
        await AsyncStorage.setItem(FANSUB_OFFSETS_KEY, JSON.stringify(updatedConfig));
        return updatedConfig;
      }
    }
    return localConfig;
  } catch (err) {
    console.warn('[AniSkip] Failed to sync fansub offsets with backend:', err.message);
    return bundledOffsets;
  }
}

/**
 * Resolves MyAnimeList ID (idMal) from an AniList ID via AniList GraphQL.
 * AniSkip API uses MyAnimeList IDs as primary identifiers.
 */
export async function getMalIdFromAnilistId(anilistId) {
  if (!anilistId || isNaN(Number(anilistId))) return null;
  const numId = parseInt(anilistId, 10);
  if (numId <= 0) return null;

  if (malIdMemoryCache.has(numId)) {
    return malIdMemoryCache.get(numId);
  }

  const cacheKey = `${MAL_MAP_CACHE_PREFIX}${numId}`;
  try {
    const stored = await AsyncStorage.getItem(cacheKey);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed > 0) {
        malIdMemoryCache.set(numId, parsed);
        return parsed;
      }
    }
  } catch (e) {}

  try {
    const query = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          id
          idMal
        }
      }
    `;
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ query, variables: { id: numId } })
    });

    if (res.ok) {
      const json = await res.json();
      const idMal = json?.data?.Media?.idMal;
      if (idMal && !isNaN(Number(idMal))) {
        const resolvedMalId = parseInt(idMal, 10);
        malIdMemoryCache.set(numId, resolvedMalId);
        await AsyncStorage.setItem(cacheKey, String(resolvedMalId));
        return resolvedMalId;
      }
    }
  } catch (err) {
    console.warn(`[AniSkip] Failed to resolve MAL ID from AniList ID ${numId}:`, err.message);
  }

  // Fallback to numId if AniList is unreachable or same ID
  return numId;
}

/**
 * Gets intro offset seconds for an anime given its fansub list
 */
export async function getFansubOffsetSeconds(fansubList = []) {
  let offsetsMap = bundledOffsets.offsets || {};
  try {
    const stored = await AsyncStorage.getItem(FANSUB_OFFSETS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.offsets) offsetsMap = parsed.offsets;
    }
  } catch (e) {}

  if (!fansubList || fansubList.length === 0) {
    return offsetsMap['default'] || 0;
  }

  // Check matching fansub with exact and fuzzy substring matching
  for (const fs of fansubList) {
    if (!fs) continue;
    const cleanFs = String(fs).replace(/[\[\]\(\)]/g, ' ').trim().toLowerCase();
    if (!cleanFs) continue;

    // 1. Exact match
    for (const [key, val] of Object.entries(offsetsMap)) {
      if (key.toLowerCase() === cleanFs) {
        return Number(val) || 0;
      }
    }

    // 2. Fuzzy substring match (e.g. "Seicode Fansub" -> "Seicode", "TAÇE Fansub" -> "TAÇE")
    for (const [key, val] of Object.entries(offsetsMap)) {
      const cleanKey = key.toLowerCase();
      if (cleanKey !== 'default' && (cleanFs.includes(cleanKey) || cleanKey.includes(cleanFs))) {
        return Number(val) || 0;
      }
    }
  }

  return offsetsMap['default'] || 0;
}

/**
 * Fetches AniSkip opening & ending intervals for the anime episode.
 * Automatically resolves AniList ID -> MyAnimeList ID and applies Fansub Intro Offset.
 */
export async function fetchAniSkipTimes(anilistIdOrOptions, episodeNumber, episodeLength = 0, fansubList = [], providedMalId = null) {
  let anilistId = anilistIdOrOptions;
  let ep = episodeNumber;
  let epLen = episodeLength;
  let fansubs = fansubList;
  let malId = providedMalId;

  // Support options object
  if (typeof anilistIdOrOptions === 'object' && anilistIdOrOptions !== null) {
    anilistId = anilistIdOrOptions.anilistId;
    ep = anilistIdOrOptions.episodeNumber;
    epLen = anilistIdOrOptions.episodeLength || 0;
    fansubs = anilistIdOrOptions.fansubList || anilistIdOrOptions.fansubs || [];
    malId = anilistIdOrOptions.malId || null;
  }

  // Parse clean episode number
  const epNum = parseInt(String(ep || '').replace(/\D+/g, ''), 10);
  if (isNaN(epNum) || epNum <= 0) {
    console.warn('[AniSkip] Invalid episode number:', ep);
    return null;
  }

  // Resolve MyAnimeList ID (AniSkip requires MAL ID)
  let targetMalId = malId && !isNaN(Number(malId)) ? parseInt(malId, 10) : null;
  if (!targetMalId && anilistId) {
    targetMalId = await getMalIdFromAnilistId(anilistId);
  }

  if (!targetMalId) {
    console.warn('[AniSkip] Could not resolve valid MAL ID for AniList ID:', anilistId);
    return null;
  }

  const cacheKey = `${ANISKIP_CACHE_PREFIX}${targetMalId}_${epNum}`;
  let rawSkipData = null;

  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      rawSkipData = JSON.parse(cached);
    }
  } catch (e) {}

  if (!rawSkipData) {
    try {
      const url = `https://api.aniskip.com/v2/skip-times/${targetMalId}/${epNum}?types=op&types=ed&episodeLength=${Math.floor(epLen || 0)}`;
      const response = await fetch(url);
      if (response.ok) {
        const json = await response.json();
        if (json.found && Array.isArray(json.results) && json.results.length > 0) {
          rawSkipData = json.results;
          await AsyncStorage.setItem(cacheKey, JSON.stringify(rawSkipData));
        }
      }
    } catch (err) {
      console.warn(`[AniSkip] API request failed for MAL ID ${targetMalId} Ep ${epNum}:`, err.message);
    }
  }

  if (!rawSkipData || rawSkipData.length === 0) return null;

  // Calculate Fansub Intro Offset
  const fansubOffset = await getFansubOffsetSeconds(fansubs);

  let opInterval = null;
  let edInterval = null;

  for (const item of rawSkipData) {
    if (item.skipType === 'op' && item.interval) {
      const start = Math.max(0, parseFloat((item.interval.startTime + fansubOffset).toFixed(2)));
      const end = Math.max(0, parseFloat((item.interval.endTime + fansubOffset).toFixed(2)));
      opInterval = {
        rawStartTime: item.interval.startTime,
        rawEndTime: item.interval.endTime,
        startTime: start,
        endTime: end,
        duration: Math.max(0, parseFloat((end - start).toFixed(2))),
        fansubOffset,
        skipType: 'op'
      };
    } else if (item.skipType === 'ed' && item.interval) {
      const start = Math.max(0, parseFloat((item.interval.startTime + fansubOffset).toFixed(2)));
      const end = Math.max(0, parseFloat((item.interval.endTime + fansubOffset).toFixed(2)));
      edInterval = {
        rawStartTime: item.interval.startTime,
        rawEndTime: item.interval.endTime,
        startTime: start,
        endTime: end,
        duration: Math.max(0, parseFloat((end - start).toFixed(2))),
        fansubOffset,
        skipType: 'ed'
      };
    }
  }

  console.log(`✅ [AniSkip] Skip times loaded (MAL ID: ${targetMalId}, Ep: ${epNum}, Fansub Offset: ${fansubOffset}s):`, 
    opInterval ? `OP: ${opInterval.startTime}s - ${opInterval.endTime}s` : 'No OP',
    edInterval ? `ED: ${edInterval.startTime}s - ${edInterval.endTime}s` : 'No ED'
  );

  return {
    op: opInterval,
    ed: edInterval,
    fansubOffset,
    malId: targetMalId,
    anilistId: anilistId ? parseInt(anilistId, 10) : null
  };
}
