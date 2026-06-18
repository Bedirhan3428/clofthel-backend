import AsyncStorage from '@react-native-async-storage/async-storage';

const PROFILE_KEY = 'device_performance_profile';
const PREFS_KEY = 'user_player_preferences';

const DEFAULT_PREFS = {
  aiQuality: 'balanced', // 'battery-saver' | 'balanced' | 'directors-cut'
  buttonSize: 'medium',   // 'small' | 'medium' | 'large'
  skipInterval: 15,       // seconds
  doubleTapEnabled: true,
  swipeSeekEnabled: true
};

// In-memory cache for synchronous reads
let performanceProfileCache = null;
let playerPreferencesCache = { ...DEFAULT_PREFS };
let isCacheLoaded = false;

// Preload the cache immediately
(async () => {
  try {
    const [profile, prefs] = await Promise.all([
      AsyncStorage.getItem(PROFILE_KEY),
      AsyncStorage.getItem(PREFS_KEY)
    ]);
    if (profile) performanceProfileCache = profile;
    if (prefs) {
      try {
        playerPreferencesCache = { ...DEFAULT_PREFS, ...JSON.parse(prefs) };
      } catch (e) {
        console.warn('[Preferences] JSON parse error:', e);
      }
    }
    isCacheLoaded = true;
    console.log('[Preferences] Cache loaded successfully');
  } catch (e) {
    console.warn('[Preferences] Failed to preload AsyncStorage cache:', e);
  }
})();

/**
 * Gets the classified hardware performance profile of the device.
 * @returns {'low' | 'mid' | 'high' | null}
 */
export function getPerformanceProfile() {
  return performanceProfileCache;
}

/**
 * Saves the classified hardware performance profile.
 * @param {'low' | 'mid' | 'high'} profile 
 */
export function setPerformanceProfile(profile) {
  performanceProfileCache = profile;
  AsyncStorage.setItem(PROFILE_KEY, profile).catch(e => {
    console.warn('[Preferences] Error saving performance profile:', e);
  });
}

/**
 * Gets the user's customized player preferences.
 * @returns {typeof DEFAULT_PREFS}
 */
export function getPlayerPreferences() {
  return playerPreferencesCache;
}

/**
 * Saves/updates user's customized player preferences.
 * @param {Partial<typeof DEFAULT_PREFS>} prefs 
 */
export function savePlayerPreferences(prefs) {
  playerPreferencesCache = { ...playerPreferencesCache, ...prefs };
  AsyncStorage.setItem(PREFS_KEY, JSON.stringify(playerPreferencesCache)).catch(e => {
    console.warn('[Preferences] Error saving player preferences:', e);
  });
}

/**
 * Storage compatibility wrapper for WatchScreen.js using AsyncStorage
 */
export const storage = {
  getString: async (key) => {
    try {
      return await AsyncStorage.getItem(key);
    } catch (e) {
      console.warn('[Storage] getString error:', e);
      return null;
    }
  },
  set: async (key, value) => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (e) {
      console.warn('[Storage] set error:', e);
    }
  },
  delete: async (key) => {
    try {
      await AsyncStorage.removeItem(key);
    } catch (e) {
      console.warn('[Storage] delete error:', e);
    }
  }
};

