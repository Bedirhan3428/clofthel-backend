/**
 * Clofthel — AnimeDirectoryContext
 * 
 * Global context that loads the orchestrator anime directory into memory at startup,
 * initializes Fuse.js for zero-latency fuzzy search, and caches data with 24h TTL.
 */
import React, { createContext, useState, useEffect, useContext, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Fuse from 'fuse.js';
import { API_BASE_URL } from '../constants/config';
import { apiFetch } from '../services/api';

// ── Constants ──────────────────────────────────────────────────
const CACHE_KEY = '@clofthel_directory';
const CACHE_TS_KEY = '@clofthel_directory_ts';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const FUSE_OPTIONS = {
  keys: ['main_title_en', 'main_title_jp'],
  threshold: 0.3,
  includeScore: true,
  minMatchCharLength: 2,
  shouldSort: true,
};

// ── Context ────────────────────────────────────────────────────
const AnimeDirectoryContext = createContext(null);

export function AnimeDirectoryProvider({ children }) {
  const [directory, setDirectory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const fuseRef = useRef(null);

  // ── Initialize Fuse.js index ─────────────────────────────────
  const buildFuseIndex = useCallback((data) => {
    fuseRef.current = new Fuse(data, FUSE_OPTIONS);
  }, []);

  // ── Load from cache, then background-refresh if stale ────────
  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        // 1. Try loading from AsyncStorage cache first
        const [cachedData, cachedTs] = await Promise.all([
          AsyncStorage.getItem(CACHE_KEY),
          AsyncStorage.getItem(CACHE_TS_KEY),
        ]);

        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          const hasImages = Array.isArray(parsed) && parsed.length > 100 && parsed.some(item => item && item.cover_image);
          if (Array.isArray(parsed) && parsed.length > 100 && hasImages) {
            if (mounted) {
              setDirectory(parsed);
              buildFuseIndex(parsed);
              setIsLoading(false);
            }

            // 2. Check if cache is stale (>24h)
            const cacheAge = Date.now() - (parseInt(cachedTs, 10) || 0);
            if (cacheAge < TTL_MS) {
              return;
            }

            // 3. Background refresh (stale cache)
            console.log('[AnimeDirectory] Cache stale, refreshing in background...');
            fetchAndUpdateDirectory(mounted);
          } else {
            console.log('[AnimeDirectory] Cache is empty or invalid, forcing fetch...');
            await fetchAndUpdateDirectory(mounted);
            if (mounted) {
              setIsLoading(false);
            }
          }
        } else {
          // No cache — must fetch from network
          console.log('[AnimeDirectory] No cache found, fetching from network...');
          await fetchAndUpdateDirectory(mounted);
          if (mounted) {
            setIsLoading(false);
          }
        }
      } catch (error) {
        console.error('[AnimeDirectory] Initialization error:', error);
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    const fetchAndUpdateDirectory = async (isMounted) => {
      try {
        console.log(`[AnimeDirectory] Fetching directory from: ${API_BASE_URL}/animes/directory`);
        const response = await apiFetch(`${API_BASE_URL}/animes/directory`);
        console.log(`[AnimeDirectory] Fetch status: ${response.status}`);

        const json = await response.json();
        console.log(`[AnimeDirectory] Fetch success: ${json?.success}, count: ${json?.data?.length || 0}`);

        if (json.success && Array.isArray(json.data) && json.data.length > 100) {
          if (isMounted) {
            setDirectory(json.data);
            buildFuseIndex(json.data);
          }

          // Save to cache
          await Promise.all([
            AsyncStorage.setItem(CACHE_KEY, JSON.stringify(json.data)),
            AsyncStorage.setItem(CACHE_TS_KEY, Date.now().toString()),
          ]);
          console.log(`[AnimeDirectory] Cached ${json.data.length} entries.`);
        } else if (json.success && Array.isArray(json.data)) {
          console.warn(`[AnimeDirectory] Directory is too small (${json.data.length} entries). Not caching to prevent lock-in.`);
          if (isMounted) {
            setDirectory(json.data);
            buildFuseIndex(json.data);
          }
        } else if (json.error) {
          console.error(`[AnimeDirectory] Server returned error: ${json.error}`);
        }
      } catch (error) {
        console.warn('[AnimeDirectory] Network fetch failed:', error.message);
        // Stale cache continues to serve — app never shows empty state
      }
    };

    initialize();

    return () => {
      mounted = false;
    };
  }, [buildFuseIndex]);

  // ── Search function (instant, zero-latency) ──────────────────
  const searchAnime = useCallback((query) => {
    if (!query || query.trim().length < 2 || !fuseRef.current) {
      return [];
    }
    const results = fuseRef.current.search(query.trim(), { limit: 30 });
    return results.map(r => r.item);
  }, []);

  // ── Find entry by any season/movie mongo_db_id ───────────────
  const getAnimeByMongoId = useCallback((mongoId) => {
    if (!mongoId) return null;
    const searchIdStr = String(mongoId);
    return directory.find(item => {
      const hasSeason = (item.seasons || []).some(s => String(s.mongo_db_id) === searchIdStr);
      if (hasSeason) return true;
      const hasMovie = (item.related_movies_or_ovas || []).some(m => String(m.mongo_db_id) === searchIdStr);
      if (hasMovie) return true;
      return false;
    }) || null;
  }, [directory]);

  // ── Direct key lookup ────────────────────────────────────────
  const getAnimeByKey = useCallback((key) => {
    return directory.find(item => item._key === key) || null;
  }, [directory]);

  // ── Force refresh (manual cache invalidation) ────────────────
  const forceRefresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await apiFetch(`${API_BASE_URL}/animes/directory`);
      const json = await response.json();

      if (json.success && json.data) {
        setDirectory(json.data);
        buildFuseIndex(json.data);

        await Promise.all([
          AsyncStorage.setItem(CACHE_KEY, JSON.stringify(json.data)),
          AsyncStorage.setItem(CACHE_TS_KEY, Date.now().toString()),
        ]);
        console.log(`[AnimeDirectory] Force refreshed ${json.data.length} entries.`);
      }
    } catch (error) {
      console.warn('[AnimeDirectory] Force refresh failed:', error.message);
    } finally {
      setIsLoading(false);
    }
  }, [buildFuseIndex]);

  const value = {
    directory,
    searchAnime,
    getAnimeByKey,
    getAnimeByMongoId,
    isLoading,
    forceRefresh,
  };

  return (
    <AnimeDirectoryContext.Provider value={value}>
      {children}
    </AnimeDirectoryContext.Provider>
  );
}

export function useAnimeDirectory() {
  const context = useContext(AnimeDirectoryContext);
  if (!context) {
    throw new Error('useAnimeDirectory must be used within an AnimeDirectoryProvider');
  }
  return context;
}

export default AnimeDirectoryContext;
