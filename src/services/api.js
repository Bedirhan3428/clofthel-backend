/**
 * Clofthel — Data Layer
 * Backend API fetch + AniList GraphQL enrichment.
 */
import { API_BASE_URL, ANILIST_API_URL, DEFAULT_PAGE_SIZE, APP_VERSION, MOBILE_APP_SECRET } from '../constants/config';
import AsyncStorage from '@react-native-async-storage/async-storage';

import CryptoJS from 'crypto-js';

// Güvenli Rastgele Metin Üretici
const generateNonce = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Güvenli İstek Gönderici (HMAC-SHA256)
export const apiFetch = async (url, options = {}) => {
  if (url.startsWith(API_BASE_URL)) {
    const timestamp = Date.now().toString();
    const nonce = generateNonce();
    
    // İmza metni (Payload): URL + timestamp + nonce
    const pathWithQuery = url.replace(API_BASE_URL, '/api');
    const payload = `${pathWithQuery}|${timestamp}|${nonce}`;
    
    // HMAC-SHA256 ile imzala (Mobil App Secret ile)
    const signature = CryptoJS.HmacSHA256(payload, MOBILE_APP_SECRET).toString(CryptoJS.enc.Hex);

    const headers = {
      ...options.headers,
      'x-clofthel-timestamp': timestamp,
      'x-clofthel-nonce': nonce,
      'x-clofthel-signature': signature
    };
    return fetch(url, { ...options, headers });
  }
  return fetch(url, options);
};

// ── AniList GraphQL Query ──────────────────────────────────────
const ANIME_QUERY = `
  query ($ids: [Int]) {
    Page(page: 1, perPage: 50) {
      media(id_in: $ids, type: ANIME) {
        id
        title {
          romaji
          english
        }
        coverImage {
          large
          extraLarge
        }
        bannerImage
        genres
        averageScore
        episodes
        status
        season
        seasonYear
        description(asHtml: false)
      }
    }
  }
`;

const SINGLE_ANIME_QUERY = `
  query ($id: Int, $search: String) {
    Media(id: $id, search: $search, type: ANIME, format_not: MUSIC) {
      id
      title {
        romaji
        english
      }
      coverImage {
        large
        extraLarge
      }
      bannerImage
      genres
      averageScore
      episodes
      status
      season
      seasonYear
      description(asHtml: false)
      streamingEpisodes {
        title
        url
      }
    }
  }
`;


// ── API Caches & Rate Limits ─────────────────────────────────
const animeCache = new Map();
let anilistRateLimitExpiry = 0;

// ── Alternative API Fallbacks ──────────────────────────────────

async function fetchKitsuSingle(searchTitle) {
  if (!searchTitle) return null;
  try {
    const response = await fetch(`https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(searchTitle)}&page[limit]=1`);
    if (!response.ok) return null;
    const json = await response.json();
    if (json?.data && json.data.length > 0) {
      const attrs = json.data[0].attributes;
      return {
        id: json.data[0].id,
        title: {
          romaji: attrs.canonicalTitle,
          english: attrs.titles?.en || attrs.titles?.en_us
        },
        coverImage: {
          extraLarge: attrs.posterImage?.original || attrs.posterImage?.large,
          large: attrs.posterImage?.medium || attrs.posterImage?.small
        },
        bannerImage: attrs.coverImage?.original || attrs.coverImage?.large,
        genres: [], 
        averageScore: attrs.averageRating ? Math.round(parseFloat(attrs.averageRating)) : null,
        description: attrs.synopsis || attrs.description,
        seasonYear: attrs.startDate ? parseInt(attrs.startDate.substring(0, 4)) : null,
        format: attrs.subtype ? attrs.subtype.toUpperCase() : 'TV',
        source: 'kitsu'
      };
    }
    return null;
  } catch (error) {
    console.error('fetchKitsuSingle error:', error);
    return null;
  }
}

async function fetchJikanSingle(searchTitle) {
  if (!searchTitle) return null;
  try {
    const response = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(searchTitle)}&limit=1`);
    if (!response.ok) return null;
    const json = await response.json();
    if (json?.data && json.data.length > 0) {
      const anime = json.data[0];
      return {
        id: anime.mal_id,
        title: {
          romaji: anime.title,
          english: anime.title_english
        },
        coverImage: {
          extraLarge: anime.images?.webp?.large_image_url || anime.images?.jpg?.large_image_url,
          large: anime.images?.webp?.image_url || anime.images?.jpg?.image_url
        },
        bannerImage: null,
        genres: anime.genres ? anime.genres.map(g => g.name) : [],
        averageScore: anime.score ? Math.round(anime.score * 10) : null,
        description: anime.synopsis,
        seasonYear: anime.year,
        season: anime.season ? anime.season.toUpperCase() : null,
        format: anime.type ? anime.type.toUpperCase() : 'TV',
        source: 'jikan'
      };
    }
    return null;
  } catch (error) {
    console.error('fetchJikanSingle error:', error);
    return null;
  }
}

// ── AniList Helper ─────────────────────────────────────────────

/**
 * Animeleri çoklu olarak çeker (AniList -> Kitsu -> Jikan fallback).
 * @param {Array} animes
 * @returns {Object} cacheKey → media object map
 */
async function fetchMediaBatch(animes) {
  if (!animes || animes.length === 0) return {};

  const result = {};
  const missingAnimes = [];

  animes.forEach((a) => {
    const cacheKey = a.anilist_id || `fallback_${a._id}`;
    if (animeCache.has(cacheKey)) {
      result[cacheKey] = animeCache.get(cacheKey);
    } else {
      missingAnimes.push(a);
    }
  });

  if (missingAnimes.length === 0) return result;

  const anilistIds = missingAnimes.map(a => a.anilist_id).filter(Boolean);

  // 1. Try AniList batch (Only if not rate limited)
  if (anilistIds.length > 0 && Date.now() > anilistRateLimitExpiry) {
    try {
      const response = await fetch(ANILIST_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: ANIME_QUERY, variables: { ids: anilistIds } }),
      });

      if (response.status === 429) {
        console.warn('[AniList Batch] 429 Rate Limit hit. Entering 1 minute cooldown.');
        anilistRateLimitExpiry = Date.now() + 60000; // 1 min cooldown
      } else if (response.ok) {
        const json = await response.json();
        const mediaList = json?.data?.Page?.media || [];
        mediaList.forEach((m) => { 
          const enriched = { ...m, source: 'anilist' };
          animeCache.set(m.id, enriched);
          result[m.id] = enriched; 
        });
      }
    } catch (error) {
      console.error('[AniList Batch] Error:', error);
    }
  }

  // 2. Fallback for missing items (failed batch or no anilist_id)
  const stillMissing = missingAnimes.filter(a => {
    const key = a.anilist_id || `fallback_${a._id}`;
    return !result[key];
  });

  // Eğer çok sayıda missing varsa (örn. 3'ten fazla - arama listesi veya anasayfa yükleme durumları),
  // Jikan ve Kitsu'yu rate-limit etmemek ve uygulamayı kilitlememek için fallback'leri atlıyoruz.
  // Bu durumda veritabanındaki veriler doğrudan kullanılacaktır.
  if (stillMissing.length > 0 && stillMissing.length <= 3) {
    await Promise.all(stillMissing.map(async (a) => {
      const title = a.anime_title;
      if (!title) return;
      
      let fallbackData = await fetchKitsuSingle(title);
      if (!fallbackData) {
        fallbackData = await fetchJikanSingle(title);
      }
      
      if (fallbackData) {
        const cacheKey = a.anilist_id || `fallback_${a._id}`;
        result[cacheKey] = fallbackData;
        animeCache.set(cacheKey, fallbackData);
      }
    }));
  }

  return result;
}

/**
 * AniList'ten tek anime bilgisi çeker (ID veya Arama Terimi ile).
 * @param {number|null} anilistId
 * @param {string|null} searchTitle
 * @returns {Object|null}
 */
async function fetchAniListSingle(anilistId, searchTitle = null) {
  if (!anilistId && !searchTitle) return null;

  // Rate limit aktifse hemen iptal et
  if (Date.now() < anilistRateLimitExpiry) {
    return null;
  }

  try {
    const variables = {};
    if (anilistId) variables.id = anilistId;
    if (searchTitle) variables.search = searchTitle;

    const response = await fetch(ANILIST_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: SINGLE_ANIME_QUERY, variables }),
    });

    if (response.status === 429) {
      console.warn('[AniList Single] 429 Rate Limit hit. Entering 1 minute cooldown.');
      anilistRateLimitExpiry = Date.now() + 60000; // 1 min cooldown
      return null;
    }

    if (!response.ok) return null;

    const json = await response.json();
    const media = json?.data?.Media;
    if (media) {
      return { ...media, source: 'anilist' };
    }
    return null;
  } catch (error) {
    console.error('getAnilistIdByTitle error:', error);
    return null;
  }
}

// ── AI API ───────────────────────────────────────────────────

export const getAiRecommendations = async (prompt) => {
  try {
    const response = await apiFetch(`${API_BASE_URL}/ai/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('getAiRecommendations error:', error);
    return { success: false, error: 'Ağ bağlantısı koptu veya sunucuya erişilemiyor.' };
  }
};

// ── Profile API ────────────────────────────────────────────────

export const getProfileData = async () => {
  try {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) return null;
    
    const response = await apiFetch(`${API_BASE_URL}/profile`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    if (!data.success) return null;

    // Collect all unique animes for enrichment
    const animeMap = new Map();
    const addAnime = (anime) => {
      if (!anime || !anime._id) return;
      if (!animeMap.has(anime._id)) {
        if (!anime.anime_title) {
          anime.anime_title = anime.orijinal_ad || anime.tranimeizle_slug?.replace(/-/g, ' ') || '';
        }
        animeMap.set(anime._id, anime);
      }
    };

    if (data.favorites) {
      data.favorites.forEach(addAnime);
    }
    if (data.watchHistory) {
      data.watchHistory.forEach(item => {
        if (item && item.anime) addAnime(item.anime);
      });
    }
    if (data.customLists) {
      data.customLists.forEach(list => {
        if (list && list.animes) {
          list.animes.forEach(addAnime);
        }
      });
    }

    const uniqueAnimes = Array.from(animeMap.values());
    if (uniqueAnimes.length > 0) {
      const mediaMap = await fetchMediaBatch(uniqueAnimes);
      const enrichedCache = new Map();
      uniqueAnimes.forEach(a => {
        const key = a.anilist_id || `fallback_${a._id}`;
        const enriched = enrichAnime(a, mediaMap[key]);
        enrichedCache.set(a._id, enriched);
      });

      // Map back enriched animes
      if (data.favorites) {
        data.favorites = data.favorites.map(a => a ? enrichedCache.get(a._id) || a : null).filter(Boolean);
      }
      if (data.watchHistory) {
        data.watchHistory = data.watchHistory.map(item => {
          if (item && item.anime) {
            item.anime = enrichedCache.get(item.anime._id) || item.anime;
          }
          return item;
        }).filter(item => item && item.anime);
      }
      if (data.customLists) {
        data.customLists = data.customLists.map(list => {
          if (list && list.animes) {
            list.animes = list.animes.map(a => a ? enrichedCache.get(a._id) || a : null).filter(Boolean);
          }
          return list;
        });
      }
    }

    return data;
  } catch (err) {
    console.error('getProfileData error', err);
    return null;
  }
};

export const toggleFavorite = async (animeId) => {
  try {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) return null;

    const response = await apiFetch(`${API_BASE_URL}/profile/favorite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ animeId })
    });
    const data = await response.json();
    return data.success ? data : null;
  } catch (err) {
    console.error('toggleFavorite error', err);
    return null;
  }
};

export const addToHistory = async (animeId, episode, currentTime) => {
  try {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) return null;

    const response = await apiFetch(`${API_BASE_URL}/profile/history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ animeId, episode, currentTime: currentTime || 0 })
    });
    const data = await response.json();
    return data.success ? data : null;
  } catch (err) {
    console.error('addToHistory error', err);
    return null;
  }
};

export const createCustomList = async (name) => {
  try {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) return null;

    const response = await apiFetch(`${API_BASE_URL}/profile/lists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name })
    });
    const data = await response.json();
    return data.success ? data : null;
  } catch (err) {
    console.error('createCustomList error', err);
    return null;
  }
};

export const updateAvatar = async (avatarUrl) => {
  try {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) return null;

    const response = await apiFetch(`${API_BASE_URL}/profile/avatar`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ avatarUrl })
    });
    const data = await response.json();
    return data.success ? data : null;
  } catch (err) {
    console.error('updateAvatar error', err);
    return null;
  }
};

export const deleteCustomList = async (listId) => {
  try {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) return null;

    const response = await apiFetch(`${API_BASE_URL}/profile/lists/${listId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await response.json();
    return data.success ? data : null;
  } catch (err) {
    console.error('deleteCustomList error', err);
    return null;
  }
};

export const toggleAnimeInList = async (listId, animeId) => {
  try {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) return null;

    const response = await apiFetch(`${API_BASE_URL}/profile/lists/anime`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ listId, animeId })
    });
    const data = await response.json();
    return data.success ? data : null;
  } catch (err) {
    console.error('toggleAnimeInList error', err);
    return null;
  }
};


function cleanTitleForCompare(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics/accents (e.g. Pokémon -> Pokemon)
    .replace(/[^a-z0-9\s]/g, '') // remove special characters
    .replace(/\s+/g, ' ')
    .trim();
}

function getBestTitle(dbTitle, anilistTitle) {
  if (!anilistTitle) return dbTitle;
  if (!dbTitle) return anilistTitle;

  const dbLower = dbTitle.toLowerCase();
  const aniLower = anilistTitle.toLowerCase();

  if (dbLower === aniLower) return anilistTitle;

  // Generic franchises checklist (normalized for comparisons)
  const genericFranchises = ['naruto', 'bleach', 'one piece', 'gintama', 'fairy tail', 'pokemon'];
  
  const cleanDb = cleanTitleForCompare(dbTitle);
  const cleanAni = cleanTitleForCompare(anilistTitle);

  const isGeneric = genericFranchises.some(f => cleanAni === f);

  // If the DB title is more detailed (e.g. contains "movie", "shippuden", "season", "sezon", etc.)
  // and the AniList title is just a prefix of it, keep the DB title.
  if (cleanDb.includes(cleanAni) && (dbTitle.length > anilistTitle.length + 3 || isGeneric)) {
    return dbTitle;
  }

  return anilistTitle;
}

/**
 * MongoDB anime objesini AniList verisiyle zenginleştirir.
 */
function enrichAnime(mongoItem, anilistData) {
  const finalCoverImage = anilistData 
    ? (anilistData.coverImage?.extraLarge || anilistData.coverImage?.large || mongoItem.cover_image || null)
    : (mongoItem.cover_image || null);
    
  const finalBannerImage = anilistData
    ? (anilistData.bannerImage || mongoItem.banner_image || null)
    : (mongoItem.banner_image || null);

  if (!anilistData) {
    return {
      ...mongoItem,
      id: mongoItem._id,
      title: mongoItem.anime_title,
      romajiTitle: mongoItem.anime_title,
      coverImage: finalCoverImage,
      cover_image: finalCoverImage,
      bannerImage: finalBannerImage,
      banner_image: finalBannerImage,
      enrichedGenres: mongoItem.genres || [],
      averageScore: mongoItem.average_score || null,
      totalEpisodes: mongoItem.total_episodes || null,
      description: mongoItem.description || null,
      seasonYear: mongoItem.season_year || null,
      orijinal_ad: mongoItem.orijinal_ad || mongoItem.anime_title,
      format: mongoItem.format || 'TV',
    };
  }

  const anilistTitle = anilistData.title?.english || anilistData.title?.romaji;
  const finalTitle = getBestTitle(mongoItem.anime_title, anilistTitle);

  return {
    ...mongoItem,
    id: mongoItem._id,
    anilist_id: anilistData.source === 'anilist' ? (anilistData.id || mongoItem.anilist_id || null) : (mongoItem.anilist_id || null),
    title: finalTitle,
    romajiTitle: anilistData.title?.romaji || mongoItem.anime_title,
    coverImage: finalCoverImage,
    cover_image: finalCoverImage,
    bannerImage: finalBannerImage,
    banner_image: finalBannerImage,
    enrichedGenres: anilistData.genres || mongoItem.genres || [],
    averageScore: anilistData.averageScore || mongoItem.average_score || null,
    totalEpisodes: mongoItem.total_episodes || null,
    description: anilistData.description || mongoItem.description || null,
    seasonYear: anilistData.seasonYear || mongoItem.season_year || null,
    season: anilistData.season || mongoItem.season || null,
    streamingEpisodes: anilistData.streamingEpisodes || [],
    orijinal_ad: anilistTitle || mongoItem.orijinal_ad || mongoItem.anime_title,
    format: anilistData.format || mongoItem.format || 'TV',
  };
}

// ── Backend API Functions ──────────────────────────────────────

/**
 * Son eklenen animeleri çeker ve AniList ile zenginleştirir.
 */
export async function fetchRecentAnimes(limit = DEFAULT_PAGE_SIZE) {
  try {
    const response = await apiFetch(`${API_BASE_URL}/animes/recent?limit=${limit}`);
    const json = await response.json();

    if (!json.success) throw new Error('API error');

    const animes = json.data;
    const mediaMap = await fetchMediaBatch(animes);

    return animes.map((a) => enrichAnime(a, mediaMap[a.anilist_id || `fallback_${a._id}`]));
  } catch (error) {
    console.error('[fetchRecentAnimes] Error:', error);
    return [];
  }
}

/**
 * Trend animeleri çeker ve AniList ile zenginleştirir.
 */
export async function fetchTrendingAnimes(limit = DEFAULT_PAGE_SIZE) {
  try {
    const response = await apiFetch(`${API_BASE_URL}/animes/trending?limit=${limit}`);
    const json = await response.json();

    if (!json.success) throw new Error('API error');

    const animes = json.data;
    const mediaMap = await fetchMediaBatch(animes);

    return animes.map((a) => enrichAnime(a, mediaMap[a.anilist_id || `fallback_${a._id}`]));
  } catch (error) {
    console.error('[fetchTrendingAnimes] Error:', error);
    return [];
  }
}

/**
 * Tek anime detayı — backend + AniList zenginleştirmesi.
 */
export async function fetchAnimeDetail(animeId) {
  try {
    const response = await apiFetch(`${API_BASE_URL}/animes/${animeId}`);
    const json = await response.json();

    if (!json.success) throw new Error('API error');

    const anime = json.data;
    
    // Eğer anilist_id varsa onunla, yoksa başlık (anime_title) ile AniList'te ara
    let anilistData = anime.anilist_id
      ? await fetchAniListSingle(anime.anilist_id)
      : await fetchAniListSingle(null, anime.anime_title);

    // AniList'te bulunamadıysa veya rate limit yendiyse alternatif API'leri dene
    if (!anilistData) {
      anilistData = await fetchKitsuSingle(anime.anime_title);
      if (!anilistData) {
        anilistData = await fetchJikanSingle(anime.anime_title);
      }
    }

    return enrichAnime(anime, anilistData);
  } catch (error) {
    console.error('[fetchAnimeDetail] Error:', error);
    return null;
  }
}
export async function resetAnimeAnilistId(animeId) {
  try {
    const response = await apiFetch(`${API_BASE_URL}/animes/${animeId}/reset-anilist`, { method: 'POST' });
    const json = await response.json();
    return json.success;
  } catch (error) {
    console.error('[resetAnimeAnilistId] Error:', error);
    return false;
  }
}

export async function saveAnimeAnilistId(animeId, anilistId, coverImage, bannerImage, orijinalAd, format) {
  try {
    const response = await apiFetch(`${API_BASE_URL}/animes/${animeId}/anilist-id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        anilist_id: anilistId,
        cover_image: coverImage,
        banner_image: bannerImage,
        orijinal_ad: orijinalAd,
        format: format
      })
    });
    const json = await response.json();
    return json.success;
  } catch (error) {
    console.error('[saveAnimeAnilistId] Error:', error);
    return false;
  }
}


/**
 * Anime bölümlerini listeler.
 */
export async function fetchEpisodes(animeId) {
  try {
    const response = await apiFetch(`${API_BASE_URL}/animes/${animeId}/episodes`);
    const json = await response.json();

    if (!json.success) throw new Error('API error');

    return json.data || [];
  } catch (error) {
    console.error('[fetchEpisodes] Error:', error);
    return [];
  }
}

/**
 * Anime bölümünün video oynatma linkini çeker.
 */
export async function fetchEpisodeVideoUrl(animeId, episodeNumber) {
  try {
    const response = await apiFetch(`${API_BASE_URL}/animes/${animeId}/episodes/${episodeNumber}/video-url`);
    const json = await response.json();
    return json;
  } catch (error) {
    console.error('[fetchEpisodeVideoUrl] Error:', error);
    return { success: false, error: 'Video adresi kontrol edilemedi.' };
  }
}

/**
 * Çözümlenen .m3u8 linkini backend önbelleğine kaydeder.
 */
export async function cacheEpisodeVideoUrl(animeId, episodeNumber, videoUrl) {
  try {
    const userToken = await AsyncStorage.getItem('userToken');
    const headers = {
      'Content-Type': 'application/json'
    };
    if (userToken) {
      headers['Authorization'] = `Bearer ${userToken}`;
    }
    const response = await apiFetch(`${API_BASE_URL}/animes/${animeId}/episodes/${episodeNumber}/video-url`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ videoUrl })
    });
    const json = await response.json();
    return json;
  } catch (error) {
    console.error('[cacheEpisodeVideoUrl] Error:', error);
    return { success: false, error: 'Video adresi önbelleğe kaydedilemedi.' };
  }
}

/**
 * Anime arama fonksiyonu.
 */
export async function searchAnimes(query) {
  if (!query || query.trim() === '') return [];
  try {
    const response = await apiFetch(`${API_BASE_URL}/animes/search?q=${encodeURIComponent(query)}`);
    const json = await response.json();

    if (!json.success) throw new Error('API error');

    const animes = json.data;
    const mediaMap = await fetchMediaBatch(animes);

    return animes.map((a) => enrichAnime(a, mediaMap[a.anilist_id || `fallback_${a._id}`]));
  } catch (error) {
    console.error('[searchAnimes] Error:', error);
    return [];
  }
}

/**
 * Türlere (Genre) göre anime listeleme fonksiyonu.
 */
export async function fetchAnimesByGenre(genre) {
  if (!genre) return [];
  try {
    const response = await apiFetch(`${API_BASE_URL}/animes/genre/${encodeURIComponent(genre)}`);
    const json = await response.json();

    if (!json.success) throw new Error('API error');

    const animes = json.data;
    const mediaMap = await fetchMediaBatch(animes);

    return animes.map((a) => enrichAnime(a, mediaMap[a.anilist_id || `fallback_${a._id}`]));
  } catch (error) {
    console.error('[fetchAnimesByGenre] Error:', error);
    return [];
  }
}

/**
 * Featured anime — son eklenenlerden ilkini seç.
 */
export function getFeatured(animes) {
  if (!animes || animes.length === 0) return null;
  // En yüksek AniList puanına sahip olanı seç
  return animes.reduce(
    (best, item) => ((item.averageScore || 0) > (best.averageScore || 0) ? item : best),
    animes[0]
  );
}

/**
 * Kullanıcı adını günceller.
 */
export async function updateName(name) {
  try {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) return { success: false, error: 'Oturum bulunamadı.' };

    const response = await apiFetch(`${API_BASE_URL}/profile/update-name`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name })
    });
    return await response.json();
  } catch (err) {
    console.error('updateName error:', err);
    return { success: false, error: 'Sunucu bağlantı hatası.' };
  }
}

/**
 * Kullanıcı e-posta adresini günceller ve yeni doğrulama maili gönderir.
 */
export async function updateEmail(email) {
  try {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) return { success: false, error: 'Oturum bulunamadı.' };

    const response = await apiFetch(`${API_BASE_URL}/profile/update-email`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ email })
    });
    return await response.json();
  } catch (err) {
    console.error('updateEmail error:', err);
    return { success: false, error: 'Sunucu bağlantı hatası.' };
  }
}

/**
 * Favoriler için bildirim ayarını değiştirir
 */
export async function toggleFavoritesNotificationsApi(enabled) {
  try {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) return null;

    const response = await apiFetch(`${API_BASE_URL}/profile/settings/notifications/favorites`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ enabled })
    });
    return await response.json();
  } catch (err) {
    console.error('toggleFavoritesNotificationsApi error:', err);
    return null;
  }
}

/**
 * Özel liste için bildirim ayarını değiştirir
 */
export async function toggleListNotificationsApi(listId, enabled) {
  try {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) return null;

    const response = await apiFetch(`${API_BASE_URL}/profile/lists/${listId}/notifications`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ enabled })
    });
    return await response.json();
  } catch (err) {
    console.error('toggleListNotificationsApi error:', err);
    return null;
  }
}

/**
 * Kullanıcının bildirimlerini getirir
 */
export async function getNotifications(page = 1, limit = 20) {
  try {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) return null;

    const response = await apiFetch(`${API_BASE_URL}/notifications?page=${page}&limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return await response.json();
  } catch (err) {
    console.error('getNotifications error:', err);
    return null;
  }
}

/**
 * Tek bir bildirimi okundu olarak işaretler
 */
export async function markNotificationAsRead(id) {
  try {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) return null;

    const response = await apiFetch(`${API_BASE_URL}/notifications/${id}/read`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return await response.json();
  } catch (err) {
    console.error('markNotificationAsRead error:', err);
    return null;
  }
}

/**
 * Tüm bildirimleri okundu olarak işaretler
 */
export async function markAllNotificationsAsRead() {
  try {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) return null;

    const response = await apiFetch(`${API_BASE_URL}/notifications/read-all`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return await response.json();
  } catch (err) {
    console.error('markAllNotificationsAsRead error:', err);
    return null;
  }
}

/**
 * Yasal metinlerin kabul edildiğini backend'e kaydeder.
 */
export async function acceptLegalWarningApi() {
  try {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) return null;

    const response = await apiFetch(`${API_BASE_URL}/profile/accept-legal`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return await response.json();
  } catch (err) {
    console.error('acceptLegalWarningApi error:', err);
    return null;
  }
}

/**
 * Uygulamanın güncel sürüm durumunu kontrol eder.
 */
export async function checkAppUpdate() {
  try {
    const response = await apiFetch(`${API_BASE_URL}/version`);
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.json();
  } catch (err) {
    console.error('[checkAppUpdate] Error:', err);
    return { success: false, error: err.message };
  }
}

