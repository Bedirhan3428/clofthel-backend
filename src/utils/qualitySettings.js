import AsyncStorage from '@react-native-async-storage/async-storage';

const QUALITY_SETTINGS_KEY = '@clofthel_quality_settings';

export const getQualitySettings = async () => {
  try {
    const value = await AsyncStorage.getItem(QUALITY_SETTINGS_KEY);
    if (value !== null) {
      return JSON.parse(value);
    }
  } catch (error) {
    console.warn('Error reading quality settings:', error);
  }
  return null; // Return default or null if not found
};

export const saveQualitySettings = async (settings) => {
  try {
    await AsyncStorage.setItem(QUALITY_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('Error saving quality settings:', error);
  }
};
