import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFERENCES_KEY = '@clofthel_player_preferences';

export const DEFAULT_PREFERENCES = {
  doubleTapEnabled: true,
  swipeSeekEnabled: true,
  skipInterval: 10,
  buttonSize: 'medium',
  defaultSpeed: 1.0,
  ultraClarityEnabled: false,
};

export const getPlayerPreferences = async () => {
  try {
    const value = await AsyncStorage.getItem(PREFERENCES_KEY);
    if (value !== null) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(value) };
    }
  } catch (error) {
    console.warn('Error reading player preferences:', error);
  }
  return DEFAULT_PREFERENCES;
};

export const savePlayerPreferences = async (preferences) => {
  try {
    await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.warn('Error saving player preferences:', error);
  }
};
