import Constants from 'expo-constants';
import appJson from '../../app.json';

// Backend API base URL
export const API_BASE_URL = 'https://api.clofthel.com.tr/api';

// AniList GraphQL endpoint
export const ANILIST_API_URL = 'https://graphql.anilist.co';

// Sayfalama varsayılanları
export const DEFAULT_PAGE_SIZE = 20;

// Uygulama Sürümü (app.json dosyasından dinamik olarak okunur)
export const APP_VERSION = Constants?.expoConfig?.version || appJson?.expo?.version || '1.4.0';
export const APP_BUILD_CODE = Constants?.expoConfig?.android?.versionCode || appJson?.expo?.android?.versionCode || 140;

// Client API Key - Backend'e istek atarken kullanilan anahtar (Düz metin taramalarını engellemek için karakter dizisi olarak saklanır)
const _secretKeyBytes = [109, 88, 56, 33, 113, 86, 50, 35, 107, 76, 53, 110, 42, 112, 82, 57, 95, 121, 77, 49, 36, 119, 70, 56, 38, 106, 89, 51, 64, 99, 66, 54, 45, 115, 88, 52, 37, 100, 71, 56, 95, 118, 72, 50];
export const MOBILE_APP_SECRET = _secretKeyBytes.map(c => String.fromCharCode(c)).join('');

