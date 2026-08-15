import AsyncStorage from '@react-native-async-storage/async-storage';
import bundledOffsets from '../constants/fansubOffsets.json';
import { API_BASE_URL } from '../constants/config';

const FANSUB_OFFSETS_KEY = 'clofthel_fansub_offsets_config';
const ANISKIP_CACHE_PREFIX = 'aniskip_cache_';

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
 * Gets intro offset seconds for an anime given its fansub list
 */
export async function getFansubOffsetSeconds(fansubList = []) {
  let offsetsMap = bundledOffsets.offsets;
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

  // Check matching fansub
  for (const fs of fansubList) {
    const cleanFs = (fs || '').trim();
    if (offsetsMap[cleanFs] !== undefined) {
      return Number(offsetsMap[cleanFs]) || 0;
    }
    // Case-insensitive match
    for (const [key, val] of Object.entries(offsetsMap)) {
      if (key.toLowerCase() === cleanFs.toLowerCase()) {
        return Number(val) || 0;
      }
    }
  }

  return offsetsMap['default'] || 0;
}

/**
 * Fetches AniSkip opening & ending intervals for the anime episode
 */
export async function fetchAniSkipTimes(anilistId, episodeNumber, episodeLength = 0, fansubList = []) {
  if (!anilistId || !episodeNumber) return null;

  const cacheKey = `${ANISKIP_CACHE_PREFIX}${anilistId}_${episodeNumber}`;
  let rawSkipData = null;

  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      rawSkipData = JSON.parse(cached);
    }
  } catch (e) {}

  if (!rawSkipData) {
    try {
      const url = `https://api.aniskip.com/v2/skip-times/${anilistId}/${episodeNumber}?types=op&types=ed&episodeLength=${Math.floor(episodeLength)}`;
      const response = await fetch(url);
      if (response.ok) {
        const json = await response.json();
        if (json.found && Array.isArray(json.results)) {
          rawSkipData = json.results;
          await AsyncStorage.setItem(cacheKey, JSON.stringify(rawSkipData));
        }
      }
    } catch (err) {
      console.warn(`[AniSkip] API request failed for AniList ID ${anilistId} Ep ${episodeNumber}:`, err.message);
    }
  }

  if (!rawSkipData || rawSkipData.length === 0) return null;

  // Calculate Fansub Intro Offset
  const fansubOffset = await getFansubOffsetSeconds(fansubList);

  let opInterval = null;
  let edInterval = null;

  for (const item of rawSkipData) {
    if (item.skipType === 'op' && item.interval) {
      opInterval = {
        rawStartTime: item.interval.startTime,
        rawEndTime: item.interval.endTime,
        startTime: Math.max(0, item.interval.startTime + fansubOffset),
        endTime: Math.max(0, item.interval.endTime + fansubOffset),
        fansubOffset
      };
    } else if (item.skipType === 'ed' && item.interval) {
      edInterval = {
        rawStartTime: item.interval.startTime,
        rawEndTime: item.interval.endTime,
        startTime: Math.max(0, item.interval.startTime + fansubOffset),
        endTime: Math.max(0, item.interval.endTime + fansubOffset),
        fansubOffset
      };
    }
  }

  return {
    op: opInterval,
    ed: edInterval,
    fansubOffset
  };
}
