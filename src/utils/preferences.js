import { MMKV } from 'react-native-mmkv';

export const storage = new MMKV({
  id: 'clofthel-preferences'
});

const PROFILE_KEY = 'device_performance_profile';
const PREFS_KEY = 'user_player_preferences';

const DEFAULT_PREFS = {
  aiQuality: 'balanced', // 'battery-saver' | 'balanced' | 'directors-cut'
  buttonSize: 'medium',   // 'small' | 'medium' | 'large'
  skipInterval: 15,       // seconds
  doubleTapEnabled: true,
  swipeSeekEnabled: true
};

/**
 * Gets the classified hardware performance profile of the device.
 * @returns {'low' | 'mid' | 'high' | null}
 */
export function getPerformanceProfile() {
  return storage.getString(PROFILE_KEY) || null;
}

/**
 * Saves the classified hardware performance profile.
 * @param {'low' | 'mid' | 'high'} profile 
 */
export function setPerformanceProfile(profile) {
  storage.set(PROFILE_KEY, profile);
}

/**
 * Gets the user's customized player preferences.
 * @returns {typeof DEFAULT_PREFS}
 */
export function getPlayerPreferences() {
  try {
    const raw = storage.getString(PREFS_KEY);
    if (raw) {
      return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('[Preferences] Error reading player preferences:', e);
  }
  return DEFAULT_PREFS;
}

/**
 * Saves/updates user's customized player preferences.
 * @param {Partial<typeof DEFAULT_PREFS>} prefs 
 */
export function savePlayerPreferences(prefs) {
  try {
    const current = getPlayerPreferences();
    const updated = { ...current, ...prefs };
    storage.set(PREFS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('[Preferences] Error saving player preferences:', e);
  }
}
