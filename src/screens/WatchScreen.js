import { Image } from 'expo-image';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  PixelRatio,
  findNodeHandle,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Animated,
  ScrollView,
  Platform,
  TouchableWithoutFeedback,
  FlatList,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { addToHistory, cacheEpisodeVideoUrl } from '../services/api';
import { fetchAnimeDetails as fetchAniListDetails, searchAnimes, fetchFullSeasonChain, fetchAniListEpisodeMetadata } from '../services/anilistService';
import { resolveEpisodeStream } from '../services/lightweightResolver';
import { API_BASE_URL } from '../constants/config';
import TouchInjector from '../modules/TouchInjector';
import NetworkChallengeResolver from '../components/NetworkChallengeResolver';
import { scraperInjectedJs } from '../modules/ScraperScript';
import { shouldBlockNetworkRequest } from '../modules/ResourceFilter';
import * as ScreenOrientation from 'expo-screen-orientation';
import { UltraClarityView } from '../../modules/ultra-clarity/src';
import { getQualitySettings, saveQualitySettings } from '../utils/qualitySettings';
import { getPlayerPreferences, DEFAULT_PREFERENCES } from '../utils/preferences';
import { useAlert } from '../context/AlertContext';
import { syncFansubOffsetsWithBackend, fetchAniSkipTimes } from '../services/aniSkipService';

let WebView = null;
if (Platform.OS !== 'web') {
  try {
    WebView = require('react-native-webview').WebView;
  } catch (e) {
    console.warn('[WatchScreen] react-native-webview not available:', e.message);
  }
}

const IS_WEB = Platform.OS === 'web';
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const cleanEpTitle = (title) => {
  if (!title) return '';
  return String(title).split('\n')[0].replace(/\s*İzle.*$/i, '').trim();
};

const detectSeasonFromTitle = (raw) => {
  if (!raw) return 1;
  if (/youkoso|classroom\s*of\s*the\s*elite/i.test(raw)) {
    if (/4th\s*season|4\.\s*sezon|\bseason\s*4\b|\bsezon\s*4\b/i.test(raw)) return 4;
    if (/2-nensei|2\.\s*s[ıi]n[ıi]f|2nd\s*year|second\s*year/i.test(raw)) return 4;
    if (/3rd\s*season|3\.\s*sezon|\bseason\s*3\b|\bsezon\s*3\b/i.test(raw)) return 3;
    if (/2nd\s*season|2\.\s*sezon|\bseason\s*2\b|\bsezon\s*2\b/i.test(raw)) return 2;
    if (/1st\s*season|1\.\s*sezon|\bseason\s*1\b|\bsezon\s*1\b/i.test(raw)) return 1;
  }
  const m = raw.match(/(\d+)\s*\.?\s*(?:st|nd|rd|th)?\s*(?:sezon|season)/i) ||
            raw.match(/[-_](\d+)(?:st|nd|rd|th)?[-_](?:sezon|season)/i) ||
            raw.match(/(?:sezon|season)\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  if (/\b(?:iv|4th)\b/i.test(raw)) return 4;
  if (/\b(?:iii|3rd)\b/i.test(raw)) return 3;
  if (/\b(?:ii|2nd)\b/i.test(raw)) return 2;
  return 1;
};

const resolveAniListMedia = async ({ anilistId, animeId, animeTitle, episodeTitle, initialAnime }) => {
  let detail = null;

  // 1. Check numeric AniList ID
  let targetId = anilistId || (initialAnime?.id && typeof initialAnime.id === 'number' ? initialAnime.id : initialAnime?.anilist_id);
  if (!targetId && animeId && !isNaN(Number(animeId)) && Number(animeId) > 1000 && !/^[a-fA-F0-9]{24}$/.test(String(animeId))) {
    targetId = Number(animeId);
  }

  if (targetId) {
    try {
      detail = await fetchAniListDetails(targetId);
    } catch (e) {}
  }

  // 2. If no detail yet, search AniList with title
  if (!detail) {
    const rawSearch = animeTitle || episodeTitle || initialAnime?.title || initialAnime?.orijinal_ad || '';
    if (rawSearch) {
      const epClean = rawSearch.replace(/\s*\d+\.\s*bölüm.*$/i, '').replace(/\s*izle.*$/i, '').trim();
      const seasonNum = detectSeasonFromTitle(epClean);
      const convertedEng = epClean.replace(/(\d+)\.\s*sezon/gi, 'Season $1').replace(/sezon/gi, 'Season').trim();
      const numberEng = epClean.replace(/(\d+)\.\s*sezon/gi, '$1').trim();
      const baseTitle = epClean.replace(/\s*\d+\.\s*sezon.*$/i, '').replace(/\s*season\s*\d+.*$/i, '').trim();

      console.log(`[WatchScreen] AniList aranıyor: "${convertedEng}" (Hedef Sezon: ${seasonNum})`);
      
      let candidate = null;
      let results = await searchAnimes(convertedEng, 1, 5);
      if (results && results.length > 0) candidate = results[0];

      if (!candidate) {
        results = await searchAnimes(numberEng, 1, 5);
        if (results && results.length > 0) candidate = results[0];
      }

      if (!candidate || (seasonNum > 1 && detectSeasonFromTitle(candidate.title_english || candidate.title) !== seasonNum)) {
        results = await searchAnimes(baseTitle, 1, 10);
        if (results && results.length > 0) {
          const matchingSeason = results.find(r => detectSeasonFromTitle(r.title_english || r.title) === seasonNum);
          if (matchingSeason) candidate = matchingSeason;
          else if (!candidate) candidate = results[0];
        }
      }

      if (candidate?.id) {
        try {
          detail = await fetchAniListDetails(candidate.id) || candidate;
        } catch (e) {
          detail = candidate;
        }
      }
    }
  }

  return detail;
};

export default function WatchScreen({ route, navigation }) {
  const { 
    animeId, 
    episodeNumber: initialEpisodeNumber, 
    episodeTitle: initialEpisodeTitle, 
    videoUrl: initialVideoUrl, 
    fansub: initialFansub, 
    fansubs: initialFansubs,
    anilistId: initialAnilistId,
    startAt,
    episodes: initialEpisodes,
    seasons: initialSeasons,
    anime: initialAnime
  } = route.params || {};
  const { showAlert } = useAlert();

  const [currentEpisodeNumber, setCurrentEpisodeNumber] = useState(initialEpisodeNumber);
  const [currentEpisodeTitle, setCurrentEpisodeTitle] = useState(initialEpisodeTitle);
  const [currentVideoUrl, setCurrentVideoUrl] = useState(initialVideoUrl);
  const [currentEpisodeFansub, setCurrentEpisodeFansub] = useState(initialFansub || null);
  const [currentAnilistId, setCurrentAnilistId] = useState(initialAnilistId || null);
  const [currentStartAt, setCurrentStartAt] = useState(startAt || 0);

  const [isInlineResolving, setIsInlineResolving] = useState(false);
  const [inlineResolveProgress, setInlineResolveProgress] = useState(10);
  const [inlineResolveState, setInlineResolveState] = useState('');
  const [inlineResolveUrl, setInlineResolveUrl] = useState(null);
  const [inlineTargetEp, setInlineTargetEp] = useState(null);

  useEffect(() => {
    setCurrentEpisodeNumber(initialEpisodeNumber);
    setCurrentEpisodeTitle(initialEpisodeTitle);
    setCurrentVideoUrl(initialVideoUrl);
    setCurrentEpisodeFansub(initialFansub || null);
    if (initialAnilistId) setCurrentAnilistId(initialAnilistId);
    setCurrentStartAt(startAt || 0);
  }, [initialEpisodeNumber, initialEpisodeTitle, initialVideoUrl, initialFansub, initialAnilistId, startAt]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('main'); // 'main' | 'quality' | 'speed'
  const [qualityLevels, setQualityLevels] = useState([]);
  const [selectedQuality, setSelectedQuality] = useState(-1);
  const [selectedSpeed, setSelectedSpeed] = useState(1.0);
  const [currentQualityLabel, setCurrentQualityLabel] = useState('Otomatik');
  const [currentSpeedLabel, setCurrentSpeedLabel] = useState('1.0x');

  const [isLandscape, setIsLandscape] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [clarityMode, setClarityMode] = useState('off');

  const [episodes, setEpisodes] = useState(initialEpisodes || route.params?.episodes || []);
  const [seasons, setSeasons] = useState(initialSeasons || route.params?.seasons || []);
  const [currentAnime, setCurrentAnime] = useState(initialAnime || route.params?.anime || null);
  const [isFixingAnilist, setIsFixingAnilist] = useState(false);
  const [playerPrefs, setPlayerPrefs] = useState(DEFAULT_PREFERENCES);
  const [aniSkipData, setAniSkipData] = useState(null);
  const [fansubOffsetSeconds, setFansubOffsetSeconds] = useState(0);

  useEffect(() => {
    if (route.params?.episodes && route.params.episodes.length > 0) {
      setEpisodes(route.params.episodes);
    }
  }, [route.params?.episodes]);

  useEffect(() => {
    if (route.params?.seasons && route.params.seasons.length > 0) {
      setSeasons(route.params.seasons);
    }
  }, [route.params?.seasons]);

  useEffect(() => {
    syncFansubOffsetsWithBackend().catch(() => {});
  }, []);

  // 1. Fetch full anime detail from AniList on mount
  useEffect(() => {
    let isMounted = true;
    const loadDetail = async () => {
      try {
        console.log('[WatchScreen] AniList bilgileri sorgulanıyor...');
        const anilistDetail = await resolveAniListMedia({
          anilistId: currentAnilistId || initialAnilistId || route.params?.anilistId,
          animeId,
          animeTitle: route.params?.animeTitle,
          episodeTitle: initialEpisodeTitle || currentEpisodeTitle,
          initialAnime
        });

        if (anilistDetail && isMounted) {
          console.log(`[WatchScreen] AniList detayları yüklendi: ${anilistDetail.title_english || anilistDetail.title} (ID: ${anilistDetail.id})`);
          setCurrentAnime(anilistDetail);
          setCurrentAnilistId(anilistDetail.id || anilistDetail.anilist_id);

          // AniList / Kitsu bölüm başlıkları ile mevcut başlığı ve bölüm listesini sezona özel olarak zenginleştir
          const sNum = detectSeasonFromTitle(currentEpisodeTitle || route.params?.episodeTitle || anilistDetail.title_english || anilistDetail.title, 1);
          fetchAniListEpisodeMetadata(anilistDetail.id || anilistDetail.anilist_id, anilistDetail.title_english || anilistDetail.title, sNum).then(meta => {
            if (meta && Object.keys(meta).length > 0 && isMounted) {
              const currentMeta = meta[currentEpisodeNumber];
              if (currentMeta?.title) {
                const cleanCurrent = cleanEpTitle(currentEpisodeTitle);
                if (!cleanCurrent || !cleanCurrent.includes(' - ') || /izle/i.test(cleanCurrent)) {
                  setCurrentEpisodeTitle(`${currentEpisodeNumber}. Bölüm - ${currentMeta.title}`);
                }
              }

              setEpisodes(prev => {
                if (!prev || prev.length === 0) return prev;
                return prev.map(ep => {
                  const m = meta[ep.episode_number];
                  if (!m) return ep;
                  return {
                    ...ep,
                    episode_title: `${ep.episode_number}. Bölüm - ${m.title}`,
                    thumbnail: m.thumbnail || ep.thumbnail
                  };
                });
              });
            }
          }).catch(() => {});

          // If seasons not provided, automatically fetch the full franchise season chain from AniList
          if (!seasons || seasons.length === 0) {
            try {
              const chain = await fetchFullSeasonChain(anilistDetail);
              if (chain && chain.length > 0 && isMounted) {
                setSeasons(chain);
              }
            } catch (chainErr) {
              console.log('[WatchScreen] Season chain walk error:', chainErr.message);
            }
          }
        }
      } catch (err) {
        console.warn('[WatchScreen] Detail load error:', err);
      }
    };
    loadDetail();
    return () => { isMounted = false; };
  }, [animeId, initialAnilistId, route.params?.animeTitle]);

  // 2. Resolve AniList ID and load AniSkip times with fansub intro offset
  useEffect(() => {
    let isCancelled = false;
    const loadSkipTimes = async () => {
      if (!currentEpisodeNumber) return;
      try {
        const isNumericId = (id) => id && !isNaN(Number(id)) && Number(id) > 0 && !/^[a-fA-F0-9]{24}$/.test(String(id));
        let anilistId = isNumericId(currentAnilistId)
          ? Number(currentAnilistId)
          : (isNumericId(currentAnime?.anilist_id)
              ? Number(currentAnime.anilist_id)
              : (isNumericId(currentAnime?.id) ? Number(currentAnime.id) : null));

        // If AniList ID not resolved yet, attempt resolution using title
        if (!anilistId) {
          const targetTitle = currentAnime?.title_english || currentAnime?.title || route.params?.animeTitle || currentEpisodeTitle;
          if (targetTitle) {
            const resolved = await resolveAniListMedia({
              anilistId: null,
              animeId,
              animeTitle: targetTitle,
              episodeTitle: currentEpisodeTitle,
              initialAnime
            });
            if (resolved?.id && !isCancelled) {
              anilistId = resolved.id;
              setCurrentAnilistId(resolved.id);
            }
          }
        }

        if (anilistId) {
          // Extract fansub tags from episode title or active fansub list
          const detectedFansubTag = (currentEpisodeTitle || '').match(/\[(.*?)\]/)?.[1] || null;
          const activeFansubs = [];
          if (currentEpisodeFansub) activeFansubs.push(currentEpisodeFansub);
          if (detectedFansubTag) activeFansubs.push(detectedFansubTag);
          if (Array.isArray(currentAnime?.fansubs)) activeFansubs.push(...currentAnime.fansubs);
          if (Array.isArray(initialFansubs)) activeFansubs.push(...initialFansubs);

          const knownMalId = currentAnime?.idMal || currentAnime?.mal_id || null;

          console.log(`🎬 [WatchScreen AniSkip] Fetching skip times for AniList ID: ${anilistId}, MAL ID: ${knownMalId || 'Auto-resolve'}, Episode: ${currentEpisodeNumber}, Fansubs:`, activeFansubs);

          const skipTimes = await fetchAniSkipTimes(
            anilistId,
            currentEpisodeNumber,
            0,
            activeFansubs,
            knownMalId
          );

          if (!isCancelled && skipTimes) {
            console.log(`✅ [WatchScreen AniSkip] Skip intervals loaded:`, JSON.stringify(skipTimes));
            setAniSkipData(skipTimes);
            if (skipTimes.fansubOffset) {
              setFansubOffsetSeconds(skipTimes.fansubOffset);
            }
            if (webViewRef.current) {
              if (Platform.OS === 'web') {
                if (webViewRef.current.contentWindow) {
                  webViewRef.current.contentWindow.postMessage(JSON.stringify({ type: 'setSkipTimes', value: skipTimes }), '*');
                }
              } else {
                webViewRef.current.injectJavaScript(`if(window.setSkipTimes){window.setSkipTimes(${JSON.stringify(skipTimes)});}true;`);
              }
            }
          }
        } else {
          console.log(`ℹ️ [WatchScreen AniSkip] No numeric AniList ID available for anime ${animeId} yet.`);
        }
      } catch (e) {
        console.warn('[WatchScreen AniSkip] Error loading skip times:', e.message);
      }
    };

    loadSkipTimes();
    return () => { isCancelled = true; };
  }, [animeId, currentAnilistId, currentAnime, currentEpisodeNumber, currentEpisodeFansub, currentEpisodeTitle]);

  useEffect(() => {
    const loadPrefs = async () => {
      try {
        const prefs = await getPlayerPreferences();
        setPlayerPrefs(prefs);
        setClarityMode(prefs.clarityMode);
        setSelectedSpeed(prefs.defaultSpeed);
        setCurrentSpeedLabel(prefs.defaultSpeed === 1.0 ? 'Normal (1.0x)' : `${prefs.defaultSpeed}x`);
      } catch (err) {
        console.warn('[WatchScreen] Failed to load player preferences:', err);
      }
    };
    loadPrefs();

    const unsubscribe = navigation?.addListener ? navigation.addListener('focus', loadPrefs) : null;
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [navigation]);

  const slideAnim = useRef(new Animated.Value(400)).current;
  const webViewRef = useRef(null);
  const bgWebViewRef = useRef(null);     // Arka plandaki N+1, N+2 kazayıcı için
  const inlineWebViewRef = useRef(null); // Oyuncu içindeki geçiş kazayıcı için
  const currentVideoTimeRef = useRef(startAt || 0);
  const wasPausedBySettings = useRef(false);
  const saveIntervalRef = useRef(null);

  useEffect(() => {
    const updateDimensions = () => {
      const { width, height } = Dimensions.get('window');
      setIsLandscape(width > height);
    };

    updateDimensions();
    const subscription = Dimensions.addEventListener('change', updateDimensions);
    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (isSettingsOpen) {
      wasPausedBySettings.current = true;
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 65,
        friction: 10,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 400,
        duration: 200,
        useNativeDriver: true,
      }).start();
      
      if (wasPausedBySettings.current) {
        sendControlCommand('playVideo', null);
        wasPausedBySettings.current = false;
      }
    }
  }, [isSettingsOpen]);

  useEffect(() => {
    return () => {
      if (Platform.OS !== 'web') {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(err => {
          console.warn('[WatchScreen] ScreenOrientation lock portrait failed on unmount:', err);
        });
        if (Platform.OS === 'android') {
          try {
            const NavigationBar = require('expo-navigation-bar');
            NavigationBar.setVisibilityAsync("visible").catch(() => {});
          } catch (e) {}
        }
      }
    };
  }, []);

  // Fetch clean episode title from AniList in the background
  useEffect(() => {
    loadEpisodeTitle();
  }, [currentEpisodeNumber]);

  const loadEpisodeTitle = async () => {
    try {
      const detail = await fetchAnimeDetail(animeId);
      if (detail && detail.streamingEpisodes) {
        const cleanSearchPattern = `episode ${currentEpisodeNumber}`;
        const foundEp = detail.streamingEpisodes.find(ep => {
          const cleanTitle = ep.title.toLowerCase();
          return cleanTitle.startsWith(cleanSearchPattern) || 
                 cleanTitle.includes(`episode ${currentEpisodeNumber} `) || 
                 cleanTitle === cleanSearchPattern;
        });
        
        if (foundEp) {
          let cleanTitle = foundEp.title;
          const prefixRegex = new RegExp(`^episode\\s+${currentEpisodeNumber}\\s*-\\s*`, 'i');
          cleanTitle = cleanTitle.replace(prefixRegex, '');
          const exactRegex = new RegExp(`^episode\\s+${currentEpisodeNumber}$`, 'i');
          if (exactRegex.test(cleanTitle)) {
            cleanTitle = `${currentEpisodeNumber}. Bölüm`;
          }

          if (cleanTitle && cleanTitle !== `${currentEpisodeNumber}. Bölüm`) {
            setCurrentEpisodeTitle(cleanTitle);
            try {
              await fetch(`${API_BASE_URL}/animes/${animeId}/currentEpisodeNumber/title`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: cleanTitle })
              });
            } catch (saveErr) {
              console.warn('[WatchScreen] Failed to save episode title:', saveErr);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[WatchScreen] AniList title fetch failed:', e);
    }
  };

  useEffect(() => {
    // Her 15 saniyede bir izleme pozisyonunu backend'e kaydet
    saveIntervalRef.current = setInterval(() => {
      const time = currentVideoTimeRef.current;
      if (time > 5) {
        addToHistory(animeId, currentEpisodeNumber, Math.floor(time));
      }
    }, 15000);

    return () => {
      // Ekrandan çıkarken son pozisyonu kaydet
      const time = currentVideoTimeRef.current;
      if (time > 5) {
        addToHistory(animeId, currentEpisodeNumber, Math.floor(time));
      }
      if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);
    };
  }, [animeId, currentEpisodeNumber]);

  const [backgroundResolveUrl, setBackgroundResolveUrl] = useState(null);
  const [backgroundTargetEp, setBackgroundTargetEp] = useState(null);

  const checkAndResolveEp = async (epNum) => {
    try {
      const epObj = episodes.find(e => e.episode_number === epNum);
      if (epObj?.url) {
        const res = await resolveEpisodeStream(epObj.url);
        if (res?.streamUrl) {
          if (animeId && typeof cacheEpisodeVideoUrl === 'function') {
            cacheEpisodeVideoUrl(animeId, epNum, res.streamUrl, res.fansub || null).catch(() => {});
          }
          return true;
        }
      }
    } catch (err) {
      console.warn('[WatchScreen Background Queue] checkAndResolveEp failed:', err.message);
    }
    return false;
  };

  const startBackgroundResolution = async () => {
    try {
      const nextEp1 = parseInt(currentEpisodeNumber, 10) + 1;
      const nextEp2 = parseInt(currentEpisodeNumber, 10) + 2;

      console.log(`[WatchScreen Background Queue] Starting pre-scraping checklist. Current episode: ${currentEpisodeNumber}`);
      
      const resolved1 = await checkAndResolveEp(nextEp1);
      if (resolved1) {
        await checkAndResolveEp(nextEp2);
      }
    } catch(err) {
      console.warn('[WatchScreen Background Queue] Queue check failed:', err.message);
    }
  };

  useEffect(() => {
    setBackgroundResolveUrl(null);
    setBackgroundTargetEp(null);

    // 18 seconds delay from video start
    const delayTimer = setTimeout(() => {
      startBackgroundResolution();
    }, 18000);

    return () => clearTimeout(delayTimer);
  }, [currentEpisodeNumber]);

  const handleBackgroundWebViewMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'log') {
        console.log(`[Bg Scraper Log for Ep ${backgroundTargetEp}]`, data.message);
      } else if (data.type === 'resolved') {
        const resolvedUrl = data.videoUrl;
        const resolvedFansub = data.fansub || null;
        console.log(`[Bg Scraper Ep ${backgroundTargetEp}] Resolved source:`, resolvedUrl, `(Fansub: ${resolvedFansub || 'N/A'})`);
        
        const resolvedEp = backgroundTargetEp;
        setBackgroundResolveUrl(null);
        setBackgroundTargetEp(null);

        // If we resolved N+1, proceed to N+2
        if (resolvedEp === parseInt(currentEpisodeNumber, 10) + 1) {
          setTimeout(() => {
            checkAndResolveEp(parseInt(currentEpisodeNumber, 10) + 2);
          }, 2000);
        }
      } else if (data.type === 'noSource' || data.type === 'error') {
        console.warn(`[Bg Scraper Ep ${backgroundTargetEp}] Resolution failed:`, data.message);
        setBackgroundResolveUrl(null);
        setBackgroundTargetEp(null);
      } else if (data.type === 'native_touch') {
        const { x, y, cssX, cssY, dpr, url } = data;
        if (TouchInjector && bgWebViewRef.current) {
          const reactTag = findNodeHandle(bgWebViewRef.current);
          if (reactTag) {
            const scale = PixelRatio.get();
            const scaledX = x / scale;
            const scaledY = y / scale;

            console.log(`[Bg Scraper Touch Fix] Density: ${scale} | DPR: ${dpr} | Scaled X:${scaledX} Y:${scaledY}`);
            
            fetch(`${API_BASE_URL}/internal/debug-log`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'bg_captcha_touch_event',
                x: Math.round(x),
                y: Math.round(y),
                scaledX: Math.round(scaledX),
                scaledY: Math.round(scaledY),
                cssX,
                cssY,
                scale,
                dpr,
                url,
                animeId,
                episodeNumber: backgroundTargetEp,
                timestamp: Date.now()
              })
            }).catch(err => console.log('[Bg Debug Log Error]', err.message));

            setTimeout(() => {
              TouchInjector.simulateTouch(reactTag, scaledX, scaledY)
                .then(res => console.log('[Bg Touch Success]', res))
                .catch(err => console.error('[Bg Touch Error]', err));
            }, 25);
          }
        }
      }
    } catch(err) {
      console.error('[Bg Scraper Message Parse Error]', err);
    }
  };

  const handleTransitionToEpisode = async (epNum) => {
    if (epNum === currentEpisodeNumber && !isInlineResolving) return;

    // 1. Cancel background pre-resolution if running
    setBackgroundResolveUrl(null);
    setBackgroundTargetEp(null);
    
    // 2. Pause current video playback
    sendControlCommand('pauseVideo', null);
    
    // 3. Set inline resolving state
    setIsInlineResolving(true);
    setInlineResolveProgress(15);
    setInlineResolveState('Bölüm kontrol ediliyor...');
    setInlineTargetEp(epNum);
    
    // Try to find the episode title from episodes array
    let epObj = episodes.find(e => e.episode_number === epNum);
    let epTitle = epObj ? epObj.episode_title : `${epNum}. Bölüm`;
    let targetUrl = epObj?.url;

    // Fallback: If targetUrl is missing, try generating from existing episode URL
    if (!targetUrl && episodes.length > 0) {
      const sampleUrl = episodes.find(e => e.url)?.url;
      if (sampleUrl) {
        targetUrl = sampleUrl.replace(/(\d+)-bolum-izle/i, `${epNum}-bolum-izle`);
      }
    }

    if (!targetUrl) {
      showAlert("Hata", `${epNum}. bölüm izleme adresi bulunamadı.`);
      setIsInlineResolving(false);
      setInlineResolveUrl(null);
      setInlineTargetEp(null);
      return;
    }

    console.log(`🎬 [WatchScreen] Bölüm ${epNum} geçişi başlatılıyor -> URL: ${targetUrl}`);

    try {
      setInlineResolveState('Akış taranıyor...');
      setInlineResolveProgress(35);

      // 1. Fast Path: Direct stream extraction (takes ~50-150ms)
      try {
        const directStream = await resolveEpisodeStream(targetUrl);
        if (directStream?.streamUrl) {
          let streamFinal = directStream.streamUrl;
          if (streamFinal.startsWith('sibnet-direct:')) {
            streamFinal = streamFinal.replace('sibnet-direct:', '');
          } else if (streamFinal.startsWith('sibnet:')) {
            const sId = streamFinal.replace('sibnet:', '');
            streamFinal = `${API_BASE_URL}/animes/sibnet-proxy?sibnetId=${sId}`;
          }

          console.log(`⚡ [WatchScreen Fast Path] Direct stream found for Ep ${epNum}:`, streamFinal);

          // Background async cache
          if (animeId && typeof cacheEpisodeVideoUrl === 'function') {
            try {
              cacheEpisodeVideoUrl(animeId, epNum, streamFinal, directStream.fansub || null).catch(() => {});
            } catch (e) {}
          }

          setCurrentEpisodeNumber(epNum);
          setCurrentEpisodeTitle(cleanEpTitle(epTitle));
          setCurrentVideoUrl(streamFinal);
          setCurrentEpisodeFansub(directStream.fansub || null);
          setCurrentStartAt(0);

          setIsInlineResolving(false);
          setInlineResolveUrl(null);
          setInlineTargetEp(null);
          return;
        }
      } catch (fastErr) {
        console.warn('[WatchScreen Fast Path] Direct extract missed:', fastErr.message);
      }

      // 2. Full Resolver Path: Launch NetworkChallengeResolver with Section 4
      setInlineResolveProgress(50);
      setInlineResolveState('Video oynatıcı hazırlanıyor...');
      setInlineResolveUrl(targetUrl);
    } catch (err) {
      console.warn('[WatchScreen inline resolve] failed:', err);
      showAlert("Hata", "Ağ hatası oluştu.");
      setIsInlineResolving(false);
      setInlineResolveUrl(null);
      setInlineTargetEp(null);
    }
  };

  const handleInlineWebViewMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'log') {
        console.log(`[Inline Scraper Log for Ep ${inlineTargetEp}]`, data.message);
        const msg = data.message.toLowerCase();
        if (msg.includes('sayfa')) {
          setInlineResolveProgress(25);
          setInlineResolveState('Sayfa yükleniyor...');
        } else if (msg.includes('iframe') || msg.includes('yok')) {
          setInlineResolveProgress(40);
          setInlineResolveState('Video oynatıcı aranıyor...');
        } else if (msg.includes('captcha tespit')) {
          setInlineResolveProgress(60);
          setInlineResolveState('Bot koruması çözülüyor...');
        } else if (msg.includes('tekrar')) {
          setInlineResolveProgress(75);
          setInlineResolveState('Yeniden deneniyor...');
        } else if (msg.includes('tiklaniyor') || msg.includes('tıklanıyor') || msg.includes('basildi')) {
          setInlineResolveProgress(90);
          setInlineResolveState('Bölüm başlatılıyor...');
        }
      } else if (data.type === 'resolved') {
        const resolvedUrl = data.videoUrl;
        const resolvedFansub = data.fansub || null;
        console.log(`[Inline Scraper Ep ${inlineTargetEp}] Resolved source:`, resolvedUrl, `(Fansub: ${resolvedFansub || 'N/A'})`);
        setInlineResolveProgress(100);

        let finalUrl = resolvedUrl;
        if (finalUrl.startsWith('sibnet-direct:')) {
          finalUrl = finalUrl.replace('sibnet-direct:', '');
        } else if (finalUrl.startsWith('sibnet:')) {
          const sibnetId = finalUrl.replace('sibnet:', '');
          finalUrl = `${API_BASE_URL}/animes/sibnet-proxy?sibnetId=${sibnetId}`;
        }

        const epObj = episodes.find(e => e.episode_number === inlineTargetEp);
        const epTitle = epObj ? epObj.episode_title : `${inlineTargetEp}. Bölüm`;

        setCurrentEpisodeNumber(inlineTargetEp);
        setCurrentEpisodeTitle(epTitle);
        setCurrentVideoUrl(finalUrl);
        setCurrentEpisodeFansub(resolvedFansub);
        setCurrentStartAt(0); // Transitioned episode always starts at 0
        
        setIsInlineResolving(false);
        setInlineResolveUrl(null);
        setInlineTargetEp(null);
      } else if (data.type === 'noSource' || data.type === 'error') {
        console.warn(`[Inline Scraper Ep ${inlineTargetEp}] Resolution failed:`, data.message);
        showAlert("Hata", data.message || "Bölüm yüklenemedi.");
        setIsInlineResolving(false);
        setInlineResolveUrl(null);
        setInlineTargetEp(null);
      } else if (data.type === 'native_touch') {
        const { x, y } = data;
        if (TouchInjector && inlineWebViewRef.current) {
          const reactTag = findNodeHandle(inlineWebViewRef.current);
          if (reactTag) {
            const scale = PixelRatio.get();
            const scaledX = x / scale;
            const scaledY = y / scale;

            console.log(`[Inline Scraper Touch Fix] Ölçeklendi X:${scaledX} Y:${scaledY}`);
            
            setTimeout(() => {
              TouchInjector.simulateTouch(reactTag, scaledX, scaledY)
                .then(res => console.log('[Inline Touch Success]', res))
                .catch(err => console.error('[Inline Touch Error]', err));
            }, 25);
          }
        }
      }
    } catch(err) {
      console.error('[Inline Scraper Message Parse Error]', err);
    }
  };

  const handleFixAnilist = async () => {
    setIsFixingAnilist(true);
    try {
      const anilistDetail = await resolveAniListMedia({
        anilistId: null, // force fresh search
        animeId,
        animeTitle: route.params?.animeTitle || currentAnime?.title,
        episodeTitle: currentEpisodeTitle,
        initialAnime: null
      });

      if (anilistDetail) {
        setCurrentAnime(anilistDetail);
        setCurrentAnilistId(anilistDetail.id || anilistDetail.anilist_id);

        try {
          const chain = await fetchFullSeasonChain(anilistDetail);
          if (chain && chain.length > 0) {
            setSeasons(chain);
          }
        } catch (chainErr) {
          console.log('[WatchScreen] Season chain fetch error:', chainErr.message);
        }

        showAlert("Başarılı", `AniList verileri güncellendi: ${anilistDetail.title_english || anilistDetail.title}`);
      } else {
        showAlert("Bilgi", "AniList eşleşmesi bulunamadı.");
      }
    } catch (e) {
      console.warn('[WatchScreen] Fix AniList error:', e);
      showAlert("Hata", "AniList verileri güncellenirken sorun oluştu.");
    } finally {
      setIsFixingAnilist(false);
    }
  };

  const sendControlCommand = (command, val) => {
    if (Platform.OS === 'web') {
      try {
        if (webViewRef.current && webViewRef.current.contentWindow) {
          webViewRef.current.contentWindow.postMessage(
            JSON.stringify({ type: command, value: val }),
            '*'
          );
        }
      } catch (e) {
        console.warn('[WatchScreen] Failed to post message to web player:', e);
      }
    } else {
      webViewRef.current?.injectJavaScript(`${command}(${val}); true;`);
    }
  };

  // WebView Message Broker
  const handleWebViewMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type !== 'timeupdate') {
        console.log('[WebView Player Log]', data.type);
      }

      if (data.type === 'fullscreen') {
        setIsFullscreen(data.isFullscreen);
        if (Platform.OS !== 'web') {
          try {
            if (data.isFullscreen) {
              await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
              if (Platform.OS === 'android') {
                try {
                  const NavigationBar = require('expo-navigation-bar');
                  await NavigationBar.setVisibilityAsync("hidden");
                  await NavigationBar.setBehaviorAsync("overlay-swipe");
                } catch (navErr) {
                  console.warn('[WatchScreen] Failed to hide navigation bar:', navErr);
                }
              }
            } else {
              await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
              if (Platform.OS === 'android') {
                try {
                  const NavigationBar = require('expo-navigation-bar');
                  await NavigationBar.setVisibilityAsync("visible");
                } catch (navErr) {
                  console.warn('[WatchScreen] Failed to show navigation bar:', navErr);
                }
              }
            }
          } catch (orientationErr) {
            console.warn('[WatchScreen] Orientation lock failed:', orientationErr);
          }
        }
      }

      if (data.type === 'nextEpisode') {
        const nextNum = parseInt(currentEpisodeNumber, 10) + 1;
        const hasNext = episodes.some(ep => ep.episode_number === nextNum);
        if (hasNext || episodes.length === 0) {
          handleTransitionToEpisode(nextNum);
        } else {
          showAlert("Bilgi", "Bu serinin son bölümündesiniz.");
        }
      }

      if (data.type === 'openSettings') {
        setIsSettingsOpen(true);
        setSettingsTab('main');
      }

      if (data.type === 'qualityLevels') {
        setQualityLevels(data.levels || []);
      }

      if (data.type === 'qualitySelected') {
        setSelectedQuality(data.index);
        setCurrentQualityLabel(data.label);
      }

      if (data.type === 'speedSelected') {
        setSelectedSpeed(data.speed);
        setCurrentSpeedLabel(data.label);
      }

      if (data.type === 'timeupdate') {
        currentVideoTimeRef.current = data.currentTime;
      }

      if (data.type === 'playerReady' && startAt > 0) {
        // Video hazır olduğunda kaldığı yerden devam ettir
        sendControlCommand('seekTo', startAt);
      }

      if (data.type === 'backgroundClick') {
        setIsSettingsOpen(prev => prev ? false : prev);
      }
    } catch (err) {
      console.error('[WebView Message Parse Error]', err);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" hidden={isFullscreen} />
      
      <SafeAreaView style={styles.playerWrapper} edges={isFullscreen ? [] : ['top', 'left', 'right']}>
        {/* Video Player Box */}
        <View style={[styles.videoPlayerBox, isFullscreen && styles.videoPlayerBoxFullscreen]}>
          {playerPrefs ? (
            IS_WEB ? (
              <WebVideoPlayer
                videoUrl={currentVideoUrl}
                onMessage={handleWebViewMessage}
                webViewRef={webViewRef}
                clarityMode={clarityMode}
                startAt={currentStartAt}
                playerPrefs={playerPrefs}
                isFullscreen={isFullscreen}
                aniSkipData={aniSkipData}
                key={`${currentEpisodeNumber}_${currentVideoUrl}_${playerPrefs?.buttonSize || 'medium'}`}
              />
            ) : (
              <VideoPlayerWrapper
                videoUrl={currentVideoUrl}
                onMessage={handleWebViewMessage}
                webViewRef={webViewRef}
                clarityMode={clarityMode}
                startAt={currentStartAt}
                playerPrefs={playerPrefs}
                isFullscreen={isFullscreen}
                aniSkipData={aniSkipData}
                key={`${currentEpisodeNumber}_${currentVideoUrl}_${playerPrefs?.buttonSize || 'medium'}`}
              />
            )
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
              <ActivityIndicator color={COLORS.accent} />
            </View>
          )}

          {isInlineResolving && (
            <View style={styles.inlineLoadingOverlay}>
              <ActivityIndicator size="large" color={COLORS.accent} style={{ marginBottom: 10 }} />
              <Text style={styles.inlineLoadingState}>Bölüm Hazırlanıyor...</Text>
            </View>
          )}

          
          {/* Overlay Back Button on Video */}
          <TouchableOpacity
            style={styles.videoBackButton}
            activeOpacity={0.7}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
        
        {/* Details ScrollView */}
        {!isFullscreen && (
          <ScrollView style={styles.detailsScrollView} contentContainerStyle={styles.detailsContent} showsVerticalScrollIndicator={false}>
            <View style={styles.headerInfoContainer}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.detailsTitle}>
                    {cleanEpTitle(currentEpisodeTitle) || `${currentEpisodeNumber}. Bölüm`}
                  </Text>
                  <Text style={styles.detailsSubTitle}>
                    {currentAnime?.title_english || currentAnime?.title || currentAnime?.title_romaji || route.params?.animeTitle || 'Anime'}
                  </Text>
                  {currentAnime?.title_romaji && currentAnime?.title_romaji !== (currentAnime?.title_english || currentAnime?.title) ? (
                    <Text style={styles.detailsOriginalTitle} numberOfLines={1}>
                      {currentAnime.title_romaji}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity 
                  style={styles.fixAnilistButton} 
                  onPress={handleFixAnilist}
                  disabled={isFixingAnilist}
                >
                  {isFixingAnilist ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="sync-outline" size={15} color="#FFF" style={{ marginRight: 4 }} />
                      <Text style={styles.fixAnilistText}>Yenile</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* Quick Meta Badges Row */}
              <View style={styles.metaBadgesRow}>
                {currentAnime?.rating ? (
                  <View style={styles.metaBadge}>
                    <Ionicons name="star" size={13} color="#FFD700" style={{ marginRight: 4 }} />
                    <Text style={styles.metaBadgeText}>{currentAnime.rating} / 10</Text>
                  </View>
                ) : (currentAnime?.averageScore ? (
                  <View style={styles.metaBadge}>
                    <Ionicons name="star" size={13} color="#FFD700" style={{ marginRight: 4 }} />
                    <Text style={styles.metaBadgeText}>{(currentAnime.averageScore / 10).toFixed(1)} / 10</Text>
                  </View>
                ) : null)}

                <View style={styles.metaBadge}>
                  <Text style={styles.metaBadgeText}>{currentAnime?.format || 'TV'}</Text>
                </View>

                {currentAnime?.status && (
                  <View style={[styles.metaBadge, currentAnime.status === 'RELEASING' ? styles.metaBadgeSuccess : null]}>
                    <Text style={styles.metaBadgeText}>
                      {currentAnime.status === 'FINISHED' ? 'Tamamlandı' : currentAnime.status === 'RELEASING' ? 'Devam Ediyor' : currentAnime.status === 'NOT_YET_RELEASED' ? 'Yakında' : currentAnime.status}
                    </Text>
                  </View>
                )}

                {(currentAnime?.totalEpisodes || episodes.length > 0) && (
                  <View style={styles.metaBadge}>
                    <Ionicons name="layers-outline" size={13} color={COLORS.textSecondary} style={{ marginRight: 4 }} />
                    <Text style={styles.metaBadgeText}>{currentAnime?.totalEpisodes || episodes.length} Bölüm</Text>
                  </View>
                )}

                {currentAnilistId && (
                  <View style={styles.metaBadgeAnilist}>
                    <Text style={styles.metaBadgeAnilistText}>AniList #{currentAnilistId}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Episode Navigation Buttons */}
            <View style={styles.navigationWrapper}>
              <TouchableOpacity 
                style={[styles.navButton, currentEpisodeNumber <= 1 && styles.navButtonDisabled]}
                disabled={currentEpisodeNumber <= 1 || isInlineResolving}
                onPress={() => handleTransitionToEpisode(currentEpisodeNumber - 1)}
                activeOpacity={0.8}
              >
                <Ionicons name="play-back" size={20} color={currentEpisodeNumber <= 1 ? '#555' : '#FFF'} />
                <Text style={[styles.navButtonText, currentEpisodeNumber <= 1 && styles.navButtonTextDisabled]}>Önceki Bölüm</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.navButton, isInlineResolving && styles.navButtonDisabled]}
                disabled={isInlineResolving}
                onPress={() => handleTransitionToEpisode(currentEpisodeNumber + 1)}
                activeOpacity={0.8}
              >
                <Text style={styles.navButtonText}>Sonraki Bölüm</Text>
                <Ionicons name="play-forward" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.detailsDivider} />
            
            {/* AniList Feature Info Cards */}
            <View style={styles.featureGrid}>
              <View style={styles.featureCard}>
                <Ionicons name="film-outline" size={20} color={COLORS.accent} style={styles.featureCardIcon} />
                <Text style={styles.featureCardTitle}>Türler</Text>
                <Text style={styles.featureCardText} numberOfLines={2}>
                  {currentAnime?.genres?.length ? currentAnime.genres.join(', ') : (currentAnime?.enrichedGenres?.length ? currentAnime.enrichedGenres.join(', ') : (route.params?.genres ? route.params.genres.join(', ') : 'Belirtilmemiş'))}
                </Text>
              </View>

              <View style={styles.featureCard}>
                <Ionicons name="calendar-outline" size={20} color={COLORS.accent} style={styles.featureCardIcon} />
                <Text style={styles.featureCardTitle}>Yayın Sezonu</Text>
                <Text style={styles.featureCardText} numberOfLines={2}>
                  {currentAnime?.season ? `${currentAnime.season} ` : ''}{currentAnime?.seasonYear || currentAnime?.startYear || route.params?.year || 'Belirtilmemiş'}
                </Text>
              </View>
            </View>

            <View style={styles.featureGrid}>
              <View style={styles.featureCard}>
                <Ionicons name="business-outline" size={20} color={COLORS.accent} style={styles.featureCardIcon} />
                <Text style={styles.featureCardTitle}>Stüdyo</Text>
                <Text style={styles.featureCardText} numberOfLines={2}>
                  {currentAnime?.studios?.length ? currentAnime.studios.slice(0, 2).join(', ') : 'Belirtilmemiş'}
                </Text>
              </View>

              <View style={styles.featureCard}>
                <Ionicons name="star-outline" size={20} color={COLORS.accent} style={styles.featureCardIcon} />
                <Text style={styles.featureCardTitle}>AniList Puanı</Text>
                <Text style={styles.featureCardText} numberOfLines={2}>
                  {currentAnime?.rating ? `⭐ ${currentAnime.rating} / 10` : (currentAnime?.averageScore ? `⭐ ${(currentAnime.averageScore / 10).toFixed(1)} / 10` : 'Belirtilmemiş')}
                </Text>
              </View>
            </View>

            <View style={styles.infoInfoBox}>
              <View style={styles.infoTitleRow}>
                <Ionicons name="book-outline" size={20} color={COLORS.accent} style={{ marginRight: 6 }} />
                <Text style={styles.infoTitleText}>Konusu (AniList)</Text>
              </View>
              <Text style={styles.infoBodyText}>
                {currentAnime?.description || currentAnime?.synopsis || route.params?.description || 'Bu animenin konusu henüz eklenmemiş. Bölümü izleyerek maceraya hemen ortak olabilirsiniz.'}
              </Text>
            </View>

            <View style={styles.detailsDivider} />

            {/* Episodes List */}
            <Text style={styles.sectionTitle}>Bölümler</Text>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.episodesListContainer}
              data={episodes}
              keyExtractor={(ep, index) => ep._id ? String(ep._id) : (ep.episode_number ? String(ep.episode_number) : String(index))}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={5}
              renderItem={({ item: ep }) => {
                const isActive = currentEpisodeNumber === ep.episode_number;
                return (
                  <TouchableOpacity 
                    style={[styles.episodeCard, isActive && styles.episodeCardActive]}
                    disabled={isInlineResolving}
                    onPress={() => {
                      if (isActive) return;
                      handleTransitionToEpisode(ep.episode_number);
                    }}
                  >
                    <Image 
                      source={{ uri: ep.thumbnail || currentAnime?.bannerImage || currentAnime?.coverImage || 'https://via.placeholder.com/150' }} 
                      style={styles.episodeImage} 
                    />
                    <View style={styles.episodeOverlay}>
                      <Text style={[styles.episodeCardTitle, isActive && styles.episodeCardTitleActive]} numberOfLines={2}>
                        {cleanEpTitle(ep.episode_title) || `${ep.episode_number}. Bölüm`}
                      </Text>
                      {isActive && <Ionicons name="play-circle" size={20} color={COLORS.accent} style={{ marginTop: 4 }} />}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />

            {/* Seasons Navigation */}
            {seasons && seasons.length > 1 && (
              <>
                <View style={styles.detailsDivider} />
                <Text style={styles.sectionTitle}>Sezonlar</Text>
                <View style={styles.seasonsGrid}>
                  {seasons.map((s, idx) => {
                    // Check if current anime is this season
                    // We can compare animeId with s._id
                    const isCurrentSeason = animeId === s._id;
                    return (
                      <TouchableOpacity
                        key={s._id}
                        style={[styles.seasonButton, isCurrentSeason && styles.seasonButtonActive]}
                        onPress={() => {
                          if (isCurrentSeason) return;
                          navigation.replace('AnimeDetail', { anime: { _id: s._id, title: s.label } });
                        }}
                      >
                        <Text style={[styles.seasonButtonText, isCurrentSeason && styles.seasonButtonTextActive]} numberOfLines={1}>
                          {s.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

          </ScrollView>
        )}
      </SafeAreaView>

      {/* Settings Bottom Sheet */}
      {isSettingsOpen && (
        <View style={styles.sheetContainer}>
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={() => {
              setIsSettingsOpen(false);
              sendControlCommand('playVideo', null);
            }}
          />
          <Animated.View style={[
            styles.bottomSheet,
            isFullscreen && styles.bottomSheetLandscape,
            { transform: [{ translateY: slideAnim }] }
          ]}>
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            {settingsTab === 'main' && (
              <View>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetHeaderText}>Oynatma Ayarları</Text>
                </View>
                <TouchableOpacity style={styles.sheetItem} onPress={() => setSettingsTab('quality')}>
                  <Text style={styles.sheetItemText}>Kalite</Text>
                  <Text style={styles.sheetItemValue}>{currentQualityLabel}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetItem} onPress={() => setSettingsTab('speed')}>
                  <Text style={styles.sheetItemText}>Oynatma Hızı</Text>
                  <Text style={styles.sheetItemValue}>{currentSpeedLabel}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetItem} onPress={() => setSettingsTab('clarity')}>
                  <Text style={styles.sheetItemText}>Görüntü Netliği (AI)</Text>
                  <Text style={[styles.sheetItemValue, clarityMode !== 'off' ? {color: COLORS.accent} : {}]}>
                    {clarityMode === 'off' && 'Kapalı'}
                    {clarityMode === 'performance' && 'Performans'}
                    {clarityMode === 'balanced' && 'Dengeli'}
                    {clarityMode === 'ai-native' && 'AI Native'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.sheetItem} 
                  onPress={() => {
                    setIsSettingsOpen(false);
                    navigation.navigate('PlayerSettings');
                  }}
                >
                  <Text style={styles.sheetItemText}>Player & Buton Ayarları</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.sheetItemValue}>
                      {playerPrefs?.buttonSize === 'small' ? 'Küçük' : playerPrefs?.buttonSize === 'large' ? 'Büyük' : 'Normal'}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={COLORS.textSecondary} style={{ marginLeft: 4 }} />
                  </View>
                </TouchableOpacity>
              </View>
            )}
            
            {settingsTab === 'quality' && (
              <View>
                <TouchableOpacity style={styles.sheetSubHeader} onPress={() => setSettingsTab('main')}>
                  <Ionicons name="chevron-back" size={20} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={styles.sheetHeaderText}>Kalite Seçin</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.sheetOption, selectedQuality === -1 && styles.sheetOptionActive]}
                  onPress={() => {
                    setSelectedQuality(-1);
                    setCurrentQualityLabel('Otomatik');
                    sendControlCommand('selectQuality', -1);
                    setIsSettingsOpen(false);
                  }}
                >
                  <Text style={styles.sheetOptionText}>Otomatik</Text>
                  {selectedQuality === -1 && <Ionicons name="checkmark" size={18} color="#FFF" />}
                </TouchableOpacity>

                {qualityLevels.map((lvl) => (
                  <TouchableOpacity
                    key={lvl.index}
                    style={[styles.sheetOption, selectedQuality === lvl.index && styles.sheetOptionActive]}
                    onPress={() => {
                      setSelectedQuality(lvl.index);
                      setCurrentQualityLabel(lvl.height ? `${lvl.height}p` : `Kalite ${lvl.index + 1}`);
                      sendControlCommand('selectQuality', lvl.index);
                      setIsSettingsOpen(false);
                      sendControlCommand('playVideo', null);
                    }}
                  >
                    <Text style={styles.sheetOptionText}>{lvl.height ? `${lvl.height}p` : `Kalite ${lvl.index + 1}`}</Text>
                    {selectedQuality === lvl.index && <Ionicons name="checkmark" size={18} color="#FFF" />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {settingsTab === 'speed' && (
              <View>
                <TouchableOpacity style={styles.sheetSubHeader} onPress={() => setSettingsTab('main')}>
                  <Ionicons name="chevron-back" size={20} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={styles.sheetHeaderText}>Hız Seçin</Text>
                </TouchableOpacity>

                {[0.5, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0, 5.0].map((speed) => (
                  <TouchableOpacity
                    key={speed}
                    style={[styles.sheetOption, selectedSpeed === speed && styles.sheetOptionActive]}
                    onPress={() => {
                      setSelectedSpeed(speed);
                      setCurrentSpeedLabel(speed === 1.0 ? 'Normal (1.0x)' : `${speed}x`);
                      sendControlCommand('setPlaySpeed', speed);
                      setIsSettingsOpen(false);
                      sendControlCommand('playVideo', null);
                    }}
                  >
                    <Text style={styles.sheetOptionText}>{speed === 1.0 ? 'Normal (1.0x)' : `${speed}x`}</Text>
                    {selectedSpeed === speed && <Ionicons name="checkmark" size={18} color="#FFF" />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {settingsTab === 'clarity' && (
              <View>
                <TouchableOpacity style={styles.sheetSubHeader} onPress={() => setSettingsTab('main')}>
                  <Ionicons name="chevron-back" size={20} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={styles.sheetHeaderText}>Netlik Modu Seçin</Text>
                </TouchableOpacity>

                {[
                  { label: 'Kapalı (Orijinal)', value: 'off' },
                  { label: 'Performans (Düşük Güç)', value: 'performance' },
                  { label: 'Dengeli (Önerilen)', value: 'balanced' },
                  { label: 'AI Native (Maksimum)', value: 'ai-native' }
                ].map((mode) => (
                  <TouchableOpacity
                    key={mode.value}
                    style={[styles.sheetOption, clarityMode === mode.value && styles.sheetOptionActive]}
                    onPress={() => {
                      setClarityMode(mode.value);
                      sendControlCommand('setClarityMode', mode.value);
                      setIsSettingsOpen(false);
                      sendControlCommand('playVideo', null);
                    }}
                  >
                    <Text style={styles.sheetOptionText}>{mode.label}</Text>
                    {clarityMode === mode.value && <Ionicons name="checkmark" size={18} color="#FFF" />}
                  </TouchableOpacity>
                ))}
              </View>
            )}
            </ScrollView>
          </Animated.View>
        </View>
      )}
      {Platform.OS !== 'web' && WebView && backgroundResolveUrl && (
        <View style={{ width: 1, height: 1, position: 'absolute', opacity: 0.01, pointerEvents: 'none' }}>
          <WebView
            ref={bgWebViewRef}
            source={{ uri: backgroundResolveUrl }}
            injectedJavaScriptBeforeContentLoaded={`window.__FANSUB_PRIORITY = ${JSON.stringify(playerPrefs?.fansubPriority || ['TRanimeizle', 'seicode', 'BabaPro Fansub'])}; true;\n${scraperInjectedJs}`}
            injectedJavaScript={`window.__FANSUB_PRIORITY = ${JSON.stringify(playerPrefs?.fansubPriority || ['TRanimeizle', 'seicode', 'BabaPro Fansub'])}; true;\n${scraperInjectedJs}`}
            onMessage={handleBackgroundWebViewMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            mixedContentMode="always"
            mediaPlaybackRequiresUserAction={false}
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={(request) => {
              if (shouldBlockNetworkRequest(request.url)) {
                return false;
              }
              const url = request.url || '';
              return url.includes('tranimeizle.io') || url.includes('Captcha') || url.includes('challenge') || url.startsWith('about:blank') || url.startsWith('data:');
            }}
          />
        </View>
      )}
      {/* Arka Planda Sessizce Çalışan Video Akış Çözücü */}
      {isInlineResolving && inlineResolveUrl && (
        <View
          style={{
            position: 'absolute',
            top: -9999,
            left: -9999,
            width: SCREEN_WIDTH,
            height: 400,
            opacity: 0,
            pointerEvents: 'none',
            zIndex: -9999,
          }}
        >
          <NetworkChallengeResolver
            targetUrl={inlineResolveUrl}
            visible={true}
            silent={true}
            fansubPriority={playerPrefs?.fansubPriority}
            onResolved={(data) => {
              let finalUrl = data?.videoUrl;
              if (!finalUrl) {
                console.warn('[WatchScreen Arka Plan Çözücü] videoUrl bulunamadı:', data);
                return;
              }

              if (finalUrl.startsWith('sibnet-direct:')) {
                finalUrl = finalUrl.replace('sibnet-direct:', '');
              } else if (finalUrl.startsWith('sibnet:')) {
                const sId = finalUrl.replace('sibnet:', '');
                finalUrl = `${API_BASE_URL}/animes/sibnet-proxy?sibnetId=${sId}`;
              }

              const detectedFansub = data.fansub || null;
              const epObj = episodes.find(e => e.episode_number === inlineTargetEp);
              const epTitle = epObj ? epObj.episode_title : `${inlineTargetEp}. Bölüm`;

              console.log(`🚀 [WatchScreen Arka Plan Çözücü] Bölüm ${inlineTargetEp} akışı bulundu:`, finalUrl, 'Fansub:', detectedFansub);

              // Backend cache'e kaydet
              if (animeId && typeof cacheEpisodeVideoUrl === 'function') {
                try {
                  cacheEpisodeVideoUrl(animeId, inlineTargetEp, finalUrl, detectedFansub).catch(() => {});
                } catch (e) {}
              }

              setCurrentEpisodeNumber(inlineTargetEp);
              setCurrentEpisodeTitle(cleanEpTitle(epTitle));
              setCurrentVideoUrl(finalUrl);
              setCurrentEpisodeFansub(detectedFansub);
              setCurrentStartAt(0);

              setIsInlineResolving(false);
              setInlineResolveUrl(null);
              setInlineTargetEp(null);
            }}
            onError={(err) => {
              console.warn(`[WatchScreen Arka Plan Çözücü Hatası] Ep ${inlineTargetEp}:`, err);
              showAlert('Hata', err || 'Bölüm yüklenemedi.');
              setIsInlineResolving(false);
              setInlineResolveUrl(null);
              setInlineTargetEp(null);
            }}
            onClose={() => {
              setIsInlineResolving(false);
              setInlineResolveUrl(null);
              setInlineTargetEp(null);
            }}
          />
        </View>
      )}
    </View>
  );
}

const getRefererForUrl = (url) => {
  if (!url) return 'https://optraco.top/';
  try {
    if (url.includes('sibnet.ru')) {
      return 'https://video.sibnet.ru/';
    }
    if (url.includes('/plateau/')) {
      const parts = url.split('/plateau/');
      const baseUrl = parts[0];
      const remaining = parts[1].split('/');
      const uuid = remaining[0];
      const hash = remaining[1].replace('.m3u8', '');
      return `${baseUrl}/explorer/${uuid}/${hash}`;
    }
  } catch (e) {
    console.error('[getRefererForUrl] Error:', e);
  }
  return 'https://optraco.top/';
};

const generatePlayerHtml = (videoUrl, isMp4, clarityMode = 'off', startAt = 0, playerPrefs = {}, initialSkipTimes = null) => {
  const prefs = {
    doubleTapEnabled: true,
    swipeSeekEnabled: true,
    skipInterval: 10,
    buttonSize: 'medium',
    defaultSpeed: 1.0,
    clarityMode: 'off',
    autoSkipIntro: false,
    ...playerPrefs
  };
  let btnSizeMultiplier = 1.0;
  if (prefs.buttonSize === 'small') btnSizeMultiplier = 0.82;
  if (prefs.buttonSize === 'large') btnSizeMultiplier = 1.22;

  // Resolve active clarity mode
  const activeClarity = clarityMode || prefs.clarityMode || 'off';
  let activeFilter = 'none';
  if (activeClarity === 'performance') {
    activeFilter = 'contrast(1.06) saturate(1.10)';
  } else if (activeClarity === 'balanced') {
    activeFilter = 'contrast(1.12) saturate(1.18)';
  } else if (activeClarity === 'ai-native') {
    activeFilter = 'contrast(1.18) saturate(1.26) brightness(1.02)';
  }

  return `
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <title>Premium Video Player</title>
      <script src="https://cdn.jsdelivr.net/npm/hls.js@1.4.12/dist/hls.min.js"></script>
      <style>
        :root {
          --accent-color: #FF6B00;
          --btn-pref-scale: ${btnSizeMultiplier};

          /* Normal / Compact Mode (Portrait embed) */
          --center-btn-size: calc(36px * var(--btn-pref-scale));
          --play-btn-size: calc(48px * var(--btn-pref-scale));
          --center-icon-size: calc(18px * var(--btn-pref-scale));
          --play-icon-size: calc(24px * var(--btn-pref-scale));
          --center-gap: 16px;
          --btn-label-size: calc(7.5px * var(--btn-pref-scale));
          --top-btn-pad: 6px;
          --top-btn-icon: 18px;
          --top-gap: 8px;
          --top-offset: 10px;
          --bottom-offset: 10px;
          --bottom-pad: 0 12px;
          --time-font-size: 11px;
          --progress-height: 4px;
          --progress-hover-height: 6px;
          --progress-knob-size: 11px;
        }

        /* Fullscreen / Spacious Mode */
        body.is-fullscreen,
        body.is-spacious,
        .player-container.fullscreen {
          --center-btn-size: calc(56px * var(--btn-pref-scale));
          --play-btn-size: calc(72px * var(--btn-pref-scale));
          --center-icon-size: calc(26px * var(--btn-pref-scale));
          --play-icon-size: calc(36px * var(--btn-pref-scale));
          --center-gap: 36px;
          --btn-label-size: calc(9.5px * var(--btn-pref-scale));
          --top-btn-pad: 8px;
          --top-btn-icon: 22px;
          --top-gap: 14px;
          --top-offset: 18px;
          --bottom-offset: 16px;
          --bottom-pad: 0 24px;
          --time-font-size: 13px;
          --progress-height: 6px;
          --progress-hover-height: 8px;
          --progress-knob-size: 15px;
        }

        @media (min-height: 290px) and (min-width: 480px) {
          :root {
            --center-btn-size: calc(56px * var(--btn-pref-scale));
            --play-btn-size: calc(72px * var(--btn-pref-scale));
            --center-icon-size: calc(26px * var(--btn-pref-scale));
            --play-icon-size: calc(36px * var(--btn-pref-scale));
            --center-gap: 36px;
            --btn-label-size: calc(9.5px * var(--btn-pref-scale));
            --top-btn-pad: 8px;
            --top-btn-icon: 22px;
            --top-gap: 14px;
            --top-offset: 18px;
            --bottom-offset: 16px;
            --bottom-pad: 0 24px;
            --time-font-size: 13px;
            --progress-height: 6px;
            --progress-hover-height: 8px;
            --progress-knob-size: 15px;
          }
        }

        * {
          -webkit-tap-highlight-color: transparent;
          outline: none;
          box-sizing: border-box;
        }
        body, html {
          margin: 0; padding: 0; width: 100%; height: 100%;
          background-color: #000; overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          user-select: none; -webkit-user-select: none;
          touch-action: manipulation;
        }
        .player-container {
          position: relative; width: 100%; height: 100%;
          background: #000; display: flex; justify-content: center; align-items: center;
          overflow: hidden;
          contain: layout style paint;
          touch-action: manipulation;
        }
        video {
          width: 100%; height: 100%; object-fit: contain; z-index: 1;
          transform: translateZ(0); -webkit-transform: translateZ(0);
          ${activeFilter !== 'none' ? `filter: ${activeFilter};` : ''}
        }
        .click-backdrop {
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          z-index: 5; background: transparent; pointer-events: auto;
          touch-action: manipulation;
        }
        .loading-overlay {
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          background: #000; z-index: 50; display: flex; flex-direction: column;
          justify-content: center; align-items: center; pointer-events: none;
          transition: opacity 0.15s ease;
        }
        .spinner {
          width: 38px; height: 38px; border: 3px solid rgba(255,255,255,0.15);
          border-top-color: var(--accent-color); border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin-bottom: 8px;
        }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .loading-text {
          color: #fff; font-size: 13px; font-weight: 500; opacity: 0.85;
          letter-spacing: 0.5px;
        }
        .controls-overlay {
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          z-index: 10; opacity: 1; visibility: visible;
          transition: opacity 0.12s linear, visibility 0.12s linear;
          pointer-events: auto;
          background: rgba(0, 0, 0, 0.40);
          transform: translateZ(0);
          will-change: opacity;
          touch-action: manipulation;
        }
        .controls-overlay.hidden {
          opacity: 0; visibility: hidden; pointer-events: none !important;
        }
        .controls-overlay.hidden * {
          pointer-events: none !important;
        }
        .top-controls {
          position: absolute; top: var(--top-offset); right: var(--top-offset);
          display: flex; align-items: center; gap: var(--top-gap); z-index: 20;
          transform: translateZ(0);
        }
        .control-btn {
          background: rgba(255, 255, 255, 0.16);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1px solid rgba(255, 255, 255, 0.28);
          color: #FFFFFF !important;
          cursor: pointer; padding: var(--top-btn-pad); border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.12s ease, transform 0.08s ease, border-color 0.12s ease;
          outline: none;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
          touch-action: manipulation;
        }
        .control-btn svg {
          width: var(--top-btn-icon); height: var(--top-btn-icon);
          display: block; pointer-events: none;
          color: #FFFFFF !important;
          stroke: #FFFFFF !important;
        }
        .control-btn:hover {
          background: rgba(255, 255, 255, 0.28);
          border-color: rgba(255, 255, 255, 0.5);
        }
        .control-btn:active {
          transform: scale(0.92);
          background: rgba(255, 255, 255, 0.38);
        }
        #btn-settings:active svg {
          transform: rotate(30deg);
        }
        .center-controls {
          position: absolute; top: 50%; left: 50%;
          transform: translate(-50%, -50%) translateZ(0);
          display: flex; align-items: center; gap: var(--center-gap); z-index: 15;
          will-change: transform;
        }
        .center-btn {
          background: rgba(255, 255, 255, 0.15);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1.2px solid rgba(255, 255, 255, 0.28);
          color: #FFFFFF !important;
          width: var(--center-btn-size); height: var(--center-btn-size); border-radius: 50%;
          position: relative; display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.42);
          transition: transform 0.1s ease, background 0.12s ease, border-color 0.12s ease, opacity 0.12s ease;
          will-change: transform; touch-action: manipulation;
        }
        .center-btn:hover {
          background: rgba(255, 255, 255, 0.26);
          border-color: rgba(255, 255, 255, 0.5);
        }
        .center-btn:active {
          transform: scale(0.92);
          background: rgba(255, 255, 255, 0.36);
        }
        .center-btn svg {
          width: var(--center-icon-size); height: var(--center-icon-size);
          display: block; pointer-events: none;
          color: #FFFFFF !important;
          stroke: #FFFFFF !important;
        }
        .center-btn svg line {
          stroke: #FFFFFF !important;
        }
        .center-btn svg polygon {
          fill: #FFFFFF !important;
          stroke: #FFFFFF !important;
        }
        .center-btn .btn-label {
          position: absolute; font-size: var(--btn-label-size); font-weight: 800;
          color: #FFFFFF !important; top: 52%; left: 50%; transform: translate(-50%, -50%);
          letter-spacing: -0.5px; pointer-events: none;
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
        }
        .play-btn {
          width: var(--play-btn-size); height: var(--play-btn-size);
          background: rgba(255, 255, 255, 0.24);
          border: 1.6px solid rgba(255, 255, 255, 0.44);
          box-shadow: 0 6px 24px rgba(0, 0, 0, 0.55);
        }
        .play-btn:hover {
          background: rgba(255, 255, 255, 0.35);
          border-color: rgba(255, 255, 255, 0.65);
        }
        .play-btn:active {
          background: rgba(255, 255, 255, 0.45);
        }
        .play-btn svg {
          width: var(--play-icon-size); height: var(--play-icon-size);
          color: #FFFFFF !important;
          fill: #FFFFFF !important;
        }
        .play-btn svg polygon,
        .play-btn svg rect {
          fill: #FFFFFF !important;
          stroke: none !important;
        }
        .bottom-controls {
          position: absolute; bottom: var(--bottom-offset); left: 0; width: 100%;
          display: flex; flex-direction: column; z-index: 15;
          padding: var(--bottom-pad); box-sizing: border-box;
          transform: translateZ(0);
        }
        .time-display {
          color: #fff; font-size: var(--time-font-size); font-weight: 500;
          margin-bottom: 5px; pointer-events: none;
          text-shadow: 0 1px 2px rgba(0,0,0,0.9); letter-spacing: 0.3px;
        }
        .progress-bar-container {
          position: relative; width: 100%; height: var(--progress-height);
          background: rgba(255, 255, 255, 0.22); cursor: pointer;
          transition: height 0.12s ease; pointer-events: auto;
          border-radius: 3px; transform: translateZ(0);
          touch-action: none;
        }
        .progress-bar-container:hover, .progress-bar-container.seeking {
          height: var(--progress-hover-height);
        }
        .progress-fill {
          position: absolute; top: 0; left: 0; height: 100%; width: 0%;
          background: var(--accent-color); z-index: 2; border-radius: 3px;
        }
        .buffer-fill {
          position: absolute; top: 0; left: 0; height: 100%; width: 0%;
          background: rgba(255, 255, 255, 0.35); z-index: 1; border-radius: 3px;
        }
        .progress-knob {
          position: absolute; top: 50%; left: 0%;
          width: var(--progress-knob-size); height: var(--progress-knob-size);
          border-radius: 50%; background: #fff; border: 2px solid var(--accent-color);
          box-shadow: 0 1px 4px rgba(0,0,0,0.4); z-index: 5;
          transform: translate(-50%, -50%) scale(0);
          transition: transform 0.1s ease; pointer-events: none;
        }
        .progress-bar-container:hover .progress-knob,
        .progress-bar-container.seeking .progress-knob {
          transform: translate(-50%, -50%) scale(1);
        }
        .progress-tooltip {
          position: absolute; bottom: 18px; background: rgba(0, 0, 0, 0.88);
          color: #fff; padding: 4px 8px; border-radius: 5px;
          font-size: 11px; font-weight: 600; pointer-events: none;
          display: none; z-index: 100; transform: translateX(-50%);
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 2px 8px rgba(0,0,0,0.5); white-space: nowrap;
        }

        /* Double Tap & Swipe HUD */
        .double-tap-overlay {
          position: absolute; top: 0; bottom: 0; width: 32%;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          z-index: 8; opacity: 0; pointer-events: none;
          background: radial-gradient(circle, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0) 70%);
          transition: opacity 0.15s ease;
        }
        .double-tap-overlay.left { left: 0; border-radius: 0 50% 50% 0; }
        .double-tap-overlay.right { right: 0; border-radius: 50% 0 0 50%; }
        .double-tap-overlay.active { opacity: 1; }
        .ripple-container {
          position: absolute; width: 70px; height: 70px; display: flex; align-items: center; justify-content: center;
        }
        body.is-fullscreen .ripple-container, body.is-spacious .ripple-container {
          width: 100px; height: 100px;
        }
        .ripple-circle {
          position: absolute; width: 100%; height: 100%; border-radius: 50%;
          background: rgba(255, 255, 255, 0.2); transform: scale(0);
        }
        .double-tap-overlay.active .ripple-circle:nth-child(1) {
          animation: rippleEffect 0.5s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
        }
        .double-tap-overlay.active .ripple-circle:nth-child(2) {
          animation: rippleEffect 0.5s cubic-bezier(0.1, 0.8, 0.3, 1) 0.1s forwards;
        }
        .double-tap-overlay.active .ripple-circle:nth-child(3) {
          animation: rippleEffect 0.5s cubic-bezier(0.1, 0.8, 0.3, 1) 0.2s forwards;
        }
        @keyframes rippleEffect {
          0% { transform: scale(0.2); opacity: 1; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        .double-tap-text {
          display: flex; flex-direction: row; align-items: center; gap: 4px;
          color: #fff; font-size: 12px; font-weight: 700; text-shadow: 0 1px 3px rgba(0,0,0,0.8);
          z-index: 9;
        }
        body.is-fullscreen .double-tap-text, body.is-spacious .double-tap-text {
          font-size: 15px;
        }
        .double-tap-text svg {
          width: 16px; height: 16px;
        }
        body.is-fullscreen .double-tap-text svg, body.is-spacious .double-tap-text svg {
          width: 20px; height: 20px;
        }
        .swipe-hud {
          position: absolute; top: 16px; left: 50%;
          transform: translateX(-50%) scale(0.92);
          background: rgba(20, 20, 25, 0.68);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.28);
          border-radius: 12px; padding: 6px 16px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          z-index: 40; pointer-events: none; opacity: 0;
          transition: opacity 0.12s, transform 0.12s;
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.55);
        }
        body.is-fullscreen .swipe-hud, body.is-spacious .swipe-hud {
          top: 24px; padding: 8px 20px;
        }
        .swipe-hud.active {
          opacity: 1; transform: translateX(-50%) scale(1);
        }
        .swipe-hud-time {
          color: #ffffff; font-size: 14px; font-weight: 700;
        }
        body.is-fullscreen .swipe-hud-time, body.is-spacious .swipe-hud-time {
          font-size: 17px;
        }
        .swipe-hud-change {
          color: var(--accent-color); font-size: 11px; font-weight: 600; margin-top: 1px;
        }

        /* Frosted Glass Skip Intro Button */
        .skip-intro-btn {
          position: absolute;
          bottom: calc(var(--bottom-offset) + 38px);
          right: 20px;
          display: none;
          align-items: center;
          gap: 8px;
          background: rgba(20, 20, 25, 0.72);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.35);
          border-radius: 9999px;
          padding: 7px 15px;
          color: #FFFFFF !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
          z-index: 35;
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.6);
          transition: transform 0.15s ease, background 0.15s ease, opacity 0.2s ease;
          touch-action: manipulation;
          user-select: none;
          -webkit-user-select: none;
        }
        .skip-intro-btn.visible {
          display: flex;
        }
        .skip-intro-btn:hover {
          background: rgba(40, 40, 45, 0.88);
          border-color: rgba(255, 255, 255, 0.6);
          transform: scale(1.04);
        }
        .skip-intro-btn:active {
          transform: scale(0.95);
          background: rgba(255, 255, 255, 0.25);
        }
        .skip-intro-btn svg {
          width: 15px;
          height: 15px;
          fill: #FFFFFF !important;
          stroke: none !important;
          pointer-events: none;
        }
        .skip-intro-btn span {
          color: #FFFFFF !important;
          pointer-events: none;
        }

        body.is-fullscreen .skip-intro-btn,
        body.is-spacious .skip-intro-btn {
          bottom: calc(var(--bottom-offset) + 52px);
          right: 32px;
          padding: 10px 20px;
          font-size: 14px;
        }
        body.is-fullscreen .skip-intro-btn svg,
        body.is-spacious .skip-intro-btn svg {
          width: 18px;
          height: 18px;
        }
      </style>
    </head>
    <body>
      <div class="player-container" id="player-container">
        <video id="player" playsinline preload="auto"></video>
        <div class="loading-overlay" id="loading-overlay">
          <div class="spinner"></div>
          <div class="loading-text">Yükleniyor...</div>
        </div>
        <div class="click-backdrop" id="click-backdrop"></div>
        <div class="controls-overlay" id="controls-overlay">
          <div class="top-controls">
            <button class="control-btn" id="btn-settings" aria-label="Ayarlar">
              <svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            </button>
            <button class="control-btn" id="btn-fullscreen" aria-label="Tam Ekran">
              <svg id="fs-icon-maximize" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
              <svg id="fs-icon-minimize" style="display: none;" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>
            </button>
          </div>
          
          <div class="center-controls">
            <button class="center-btn" id="btn-rewind" aria-label="${prefs.skipInterval} Saniye Geri">
              <svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>
              <span class="btn-label">${prefs.skipInterval}</span>
            </button>
            <button class="center-btn play-btn" id="btn-play-pause" aria-label="Oynat/Duraklat">
              <svg id="play-icon" viewBox="0 0 24 24" fill="#FFFFFF" stroke="none"><polygon points="6 3 20 12 6 21 6 3" fill="#FFFFFF"></polygon></svg>
              <svg id="pause-icon" style="display: none;" viewBox="0 0 24 24" fill="#FFFFFF" stroke="none"><rect x="6" y="4" width="4" height="16" rx="1" fill="#FFFFFF"></rect><rect x="14" y="4" width="4" height="16" rx="1" fill="#FFFFFF"></rect></svg>
            </button>
            <button class="center-btn" id="btn-forward" aria-label="${prefs.skipInterval} Saniye İleri">
              <svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path></svg>
              <span class="btn-label">${prefs.skipInterval}</span>
            </button>
            <button class="center-btn" id="btn-next-episode" aria-label="Sonraki Bölüm">
              <svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4" fill="#FFFFFF"></polygon><line x1="19" y1="5" x2="19" y2="19" stroke="#FFFFFF"></line></svg>
            </button>
          </div>
          
          <div class="bottom-controls">
            <div class="time-display" id="time-display">00:00 / 00:00</div>
            <div class="progress-bar-container" id="progress-bar">
              <div class="buffer-fill" id="buffer-fill"></div>
              <div class="progress-fill" id="progress-fill"></div>
              <div class="progress-knob" id="progress-knob"></div>
              <div class="progress-tooltip" id="progress-tooltip">00:00</div>
            </div>
          </div>
        </div>

        <!-- Double Tap Seek Overlays -->
        <div class="double-tap-overlay left" id="double-tap-left">
          <div class="ripple-container">
            <div class="ripple-circle"></div>
            <div class="ripple-circle"></div>
            <div class="ripple-circle"></div>
          </div>
          <div class="double-tap-text">
            <svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>
            <span>${prefs.skipInterval}s</span>
          </div>
        </div>
        <div class="double-tap-overlay right" id="double-tap-right">
          <div class="ripple-container">
            <div class="ripple-circle"></div>
            <div class="ripple-circle"></div>
            <div class="ripple-circle"></div>
          </div>
          <div class="double-tap-text">
            <span>${prefs.skipInterval}s</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>
          </div>
        </div>

        <!-- Swipe Seek HUD Overlay -->
        <div class="swipe-hud" id="swipe-hud">
          <div class="swipe-hud-time" id="swipe-hud-time">00:00</div>
          <div class="swipe-hud-change" id="swipe-hud-change">[+0:00]</div>
        </div>

        <!-- Frosted Glass Skip Intro Button (In-DOM) -->
        <button class="skip-intro-btn" id="btn-skip-intro" aria-label="İntroyu Geç">
          <svg viewBox="0 0 24 24"><polygon points="5 4 15 12 5 20 5 4" fill="#FFFFFF"></polygon><line x1="19" y1="5" x2="19" y2="19" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"></line></svg>
          <span>İntroyu Geç</span>
        </button>
      </div>
      
      <script>
        const video = document.getElementById('player');
        const videoUrl = '${videoUrl}';
        const isMp4 = ${isMp4};
        
        let hlsInstance = null;
        let _isFullscreenLocal = false;
        let isSwiping = false;
        let controlsWereHiddenOnSwipeStart = false;
        
        function sendToParent(obj) {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify(obj));
          } else {
            window.parent.postMessage(JSON.stringify(obj), '*');
          }
        }

        // Fast tap utility to eliminate 300ms mobile browser delay
        function bindFastClick(el, fn) {
          if (!el) return;
          let handled = false;
          el.addEventListener('touchend', (e) => {
            handled = true;
            setTimeout(() => { handled = false; }, 300);
            e.stopPropagation();
            fn(e);
          }, { passive: false });
          el.addEventListener('click', (e) => {
            if (handled) {
              e.stopPropagation();
              e.preventDefault();
              return;
            }
            e.stopPropagation();
            fn(e);
          });
        }

        let currentSkipTimes = ${initialSkipTimes ? JSON.stringify(initialSkipTimes) : 'null'};
        const autoSkipIntro = ${prefs.autoSkipIntro ? 'true' : 'false'};
        const btnSkipIntro = document.getElementById('btn-skip-intro');

        window.setSkipTimes = function(data) {
          currentSkipTimes = data;
          if (!currentSkipTimes || !currentSkipTimes.op) {
            if (btnSkipIntro) btnSkipIntro.classList.remove('visible');
          }
        };

        if (btnSkipIntro) {
          bindFastClick(btnSkipIntro, (e) => {
            if (currentSkipTimes && currentSkipTimes.op) {
              video.currentTime = currentSkipTimes.op.endTime;
              btnSkipIntro.classList.remove('visible');
            }
          });
        }

        function updateLayoutMode() {
          const isLandscapeOrLarge = (window.innerHeight > 280 && window.innerWidth > 480) || _isFullscreenLocal;
          document.body.classList.toggle('is-fullscreen', _isFullscreenLocal);
          document.body.classList.toggle('is-spacious', isLandscapeOrLarge);
          const container = document.getElementById('player-container');
          if (container) container.classList.toggle('fullscreen', _isFullscreenLocal);
        }
        window.addEventListener('resize', updateLayoutMode, { passive: true });
        window.addEventListener('orientationchange', updateLayoutMode, { passive: true });
        
        const loadingOverlay = document.getElementById('loading-overlay');
        let hasStartedPlaying = false;
        
        video.addEventListener('waiting', () => {
          if (!hasStartedPlaying) loadingOverlay.style.opacity = '1';
        }, { passive: true });
        
        video.addEventListener('playing', () => {
          loadingOverlay.style.opacity = '0';
          hasStartedPlaying = true;
        }, { passive: true });
        
        video.addEventListener('canplay', () => {
          loadingOverlay.style.opacity = '0';
        }, { passive: true });
        
        function initPlayer() {
          const defaultSpeed = ${prefs.defaultSpeed};
          if (isMp4) {
            video.preload = 'auto';
            video.src = videoUrl;
            video.addEventListener('loadedmetadata', function() {
              if (${startAt} > 0) video.currentTime = ${startAt};
              video.playbackRate = defaultSpeed;
              video.play().catch(e => console.log('Autoplay blocked:', e));
            });
            sendToParent({ type: 'qualityLevels', levels: [] });
            sendToParent({ type: 'qualitySelected', index: -1, label: 'Otomatik' });
            sendToParent({ type: 'speedSelected', speed: defaultSpeed, label: defaultSpeed === 1.0 ? 'Normal (1.0x)' : defaultSpeed + 'x' });
          } else if (Hls.isSupported()) {
            const hlsOptions = {
              maxBufferLength: 25,
              maxMaxBufferLength: 50,
              maxBufferSize: 30 * 1024 * 1024,
              backBufferLength: 15,
              maxBufferHole: 0.8,
              lowLatencyMode: false,
              startFragPrefetch: false,
              progressive: false,
              enableWorker: true,
              fragLoadingTimeOut: 15000,
              manifestLoadingTimeOut: 12000,
              levelLoadingTimeOut: 12000,
              fragLoadingMaxRetry: 5,
              levelLoadingMaxRetry: 5,
              capLevelToPlayerSize: ${activeClarity === 'ai-native' ? 'false' : 'true'}
            };
            const hls = new Hls(hlsOptions);
            hlsInstance = hls;
            hls.loadSource(videoUrl);
            hls.attachMedia(video);
            
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
              populateQualityLevels(hls.levels);
              if (${activeClarity === 'ai-native'}) {
                selectQuality(hls.levels.length - 1);
              } else {
                sendToParent({ type: 'qualitySelected', index: -1, label: 'Otomatik' });
              }
              video.playbackRate = defaultSpeed;
              sendToParent({ type: 'speedSelected', speed: defaultSpeed, label: defaultSpeed === 1.0 ? 'Normal (1.0x)' : defaultSpeed + 'x' });
              if (${startAt} > 0) video.currentTime = ${startAt};
              video.play().catch(e => {
                console.log('Autoplay error, retrying:', e);
                video.play().catch(() => {});
              });
            });
            
            hls.on(Hls.Events.ERROR, function(event, data) {
              if (data.fatal) {
                switch(data.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    hls.startLoad();
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    hls.recoverMediaError();
                    break;
                }
              }
            });
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = videoUrl;
            video.addEventListener('loadedmetadata', function() {
              if (${startAt} > 0) video.currentTime = ${startAt};
              video.playbackRate = defaultSpeed;
              video.play().catch(e => console.log('Autoplay blocked:', e));
            });
            sendToParent({ type: 'qualityLevels', levels: [] });
            sendToParent({ type: 'qualitySelected', index: -1, label: 'Otomatik' });
            sendToParent({ type: 'speedSelected', speed: defaultSpeed, label: defaultSpeed === 1.0 ? 'Normal (1.0x)' : defaultSpeed + 'x' });
          }
        }
        
        function populateQualityLevels(levels) {
          const formattedLevels = levels.map((lvl, idx) => ({
            index: idx,
            height: lvl.height
          }));
          sendToParent({ type: 'qualityLevels', levels: formattedLevels });
        }
        
        function selectQuality(index) {
          if (hlsInstance) {
            hlsInstance.nextLevel = index;
            const label = index === -1 ? 'Otomatik' : (hlsInstance.levels[index].height ? hlsInstance.levels[index].height + 'p' : 'Seviye ' + (index + 1));
            sendToParent({ type: 'qualitySelected', index: index, label: label });
          }
        }
        
        function setPlaySpeed(speed) {
          video.playbackRate = speed;
          sendToParent({ type: 'speedSelected', speed: speed, label: speed === 1.0 ? 'Normal (1.0x)' : speed + 'x' });
        }
        
        const btnPlayPause = document.getElementById('btn-play-pause');
        const playIcon = document.getElementById('play-icon');
        const pauseIcon = document.getElementById('pause-icon');
        
        bindFastClick(btnPlayPause, () => {
          togglePlay();
        });
        
        function togglePlay() {
          if (video.paused) {
            video.play().catch(e => console.log('Playback error:', e));
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
          } else {
            video.pause();
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
          }
          resetControlsTimeout();
        }
        
        video.addEventListener('play', () => {
          playIcon.style.display = 'none';
          pauseIcon.style.display = 'block';
          resetControlsTimeout();
        }, { passive: true });
        
        video.addEventListener('pause', () => {
          playIcon.style.display = 'block';
          pauseIcon.style.display = 'none';
          if (!isSwiping) {
            showControls();
          }
        }, { passive: true });
        
        const btnRewind = document.getElementById('btn-rewind');
        const btnForward = document.getElementById('btn-forward');
        const skipInterval = ${prefs.skipInterval};
        
        bindFastClick(btnRewind, () => {
          video.currentTime = Math.max(0, video.currentTime - skipInterval);
          resetControlsTimeout();
        });
        
        bindFastClick(btnForward, () => {
          video.currentTime = Math.min(video.duration || 0, video.currentTime + skipInterval);
          resetControlsTimeout();
        });
        
        const btnFullscreen = document.getElementById('btn-fullscreen');
        const container = document.getElementById('player-container');
        
        bindFastClick(btnFullscreen, () => {
          toggleFullscreen();
        });
        
        function toggleFullscreen() {
          if (window.ReactNativeWebView) {
            _isFullscreenLocal = !_isFullscreenLocal;
            updateFullscreenIcons(_isFullscreenLocal);
            updateLayoutMode();
            sendToParent({ type: 'fullscreen', isFullscreen: _isFullscreenLocal });
          } else {
            if (!document.fullscreenElement &&
                !document.mozFullScreenElement &&
                !document.webkitFullscreenElement &&
                !document.msFullscreenElement) {
              if (container.requestFullscreen) {
                container.requestFullscreen();
              } else if (container.msRequestFullscreen) {
                container.msRequestFullscreen();
              } else if (container.mozRequestFullScreen) {
                container.mozRequestFullScreen();
              } else if (container.webkitRequestFullscreen) {
                container.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
              }
            } else {
              if (document.exitFullscreen) {
                document.exitFullscreen();
              } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
              } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
              } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
              }
            }
          }
          resetControlsTimeout();
        }

        function updateFullscreenIcons(isFS) {
          const maxIcon = document.getElementById('fs-icon-maximize');
          const minIcon = document.getElementById('fs-icon-minimize');
          if (maxIcon && minIcon) {
            if (isFS) {
              maxIcon.style.display = 'none';
              minIcon.style.display = 'block';
            } else {
              maxIcon.style.display = 'block';
              minIcon.style.display = 'none';
            }
          }
        }

        function onFullscreenChange() {
          const isFS = !!(document.fullscreenElement ||
                       document.webkitFullscreenElement ||
                       document.mozFullScreenElement ||
                       document.msFullscreenElement);
          _isFullscreenLocal = isFS;
          updateFullscreenIcons(isFS);
          updateLayoutMode();
          sendToParent({ type: 'fullscreen', isFullscreen: isFS });
        }

        document.addEventListener('fullscreenchange', onFullscreenChange, { passive: true });
        document.addEventListener('webkitfullscreenchange', onFullscreenChange, { passive: true });
        document.addEventListener('mozfullscreenchange', onFullscreenChange, { passive: true });
        document.addEventListener('MSFullscreenChange', onFullscreenChange, { passive: true });
        
        const timeDisplay = document.getElementById('time-display');
        const progressFill = document.getElementById('progress-fill');
        const bufferFill = document.getElementById('buffer-fill');
        const progressBar = document.getElementById('progress-bar');
        const progressKnob = document.getElementById('progress-knob');
        
        function formatTime(seconds) {
          if (isNaN(seconds) || seconds === Infinity) return '00:00';
          const s = Math.floor(seconds % 60);
          const m = Math.floor((seconds / 60) % 60);
          const h = Math.floor(seconds / 3600);
          const pad = (n) => n.toString().padStart(2, '0');
          if (h > 0) return pad(h) + ':' + pad(m) + ':' + pad(s);
          return pad(m) + ':' + pad(s);
        }
        
        let lastSentTime = 0;
        video.addEventListener('timeupdate', () => {
          const current = video.currentTime;
          const duration = video.duration || 0;
          timeDisplay.textContent = formatTime(current) + ' / ' + formatTime(duration);
          
          if (duration > 0) {
            const pct = (current / duration) * 100;
            progressFill.style.width = pct + '%';
            if (!isSeeking) {
              progressKnob.style.left = pct + '%';
            }
          }

          if (currentSkipTimes && currentSkipTimes.op) {
            const opStart = currentSkipTimes.op.startTime;
            const opEnd = currentSkipTimes.op.endTime;
            if (current >= opStart && current < opEnd) {
              if (autoSkipIntro) {
                video.currentTime = opEnd;
                if (btnSkipIntro) btnSkipIntro.classList.remove('visible');
              } else {
                if (btnSkipIntro) btnSkipIntro.classList.add('visible');
              }
            } else {
              if (btnSkipIntro) btnSkipIntro.classList.remove('visible');
            }
          } else {
            if (btnSkipIntro) btnSkipIntro.classList.remove('visible');
          }

          if (Math.abs(current - lastSentTime) > 1.2) {
            sendToParent({ type: 'timeupdate', currentTime: current });
            lastSentTime = current;
          }
        }, { passive: true });
        
        video.addEventListener('progress', () => {
          const duration = video.duration || 0;
          if (duration > 0 && video.buffered.length > 0) {
            const bufferedEnd = video.buffered.end(video.buffered.length - 1);
            bufferFill.style.width = (bufferedEnd / duration) * 100 + '%';
          }
        }, { passive: true });
        
        video.addEventListener('loadedmetadata', () => {
          timeDisplay.textContent = '00:00 / ' + formatTime(video.duration || 0);
        }, { passive: true });
        
        let isSeeking = false;
        const progressTooltip = document.getElementById('progress-tooltip');
        
        function seekTo(event) {
          const rect = progressBar.getBoundingClientRect();
          const clientX = event.clientX || (event.touches && event.touches[0] ? event.touches[0].clientX : 0);
          let pct = (clientX - rect.left) / rect.width;
          pct = Math.max(0, Math.min(1, pct));
          const duration = video.duration || 0;
          const targetTime = pct * duration;
          video.currentTime = targetTime;
          progressFill.style.width = (pct * 100) + '%';
          progressKnob.style.left = (pct * 100) + '%';
          resetControlsTimeout();
          updateTooltip(clientX, rect.left, rect.width, targetTime);
        }

        function updateTooltip(clientX, rectLeft, rectWidth, time) {
          progressTooltip.style.display = 'block';
          progressTooltip.textContent = formatTime(time);
          const relativeX = clientX - rectLeft;
          const posX = Math.max(0, Math.min(rectWidth, relativeX));
          progressTooltip.style.left = posX + 'px';
        }

        function hideTooltip() {
          progressTooltip.style.display = 'none';
        }
        
        progressBar.addEventListener('click', (e) => {
          e.stopPropagation();
          seekTo(e);
          setTimeout(hideTooltip, 1000);
        });
        
        progressBar.addEventListener('touchstart', (e) => {
          e.stopPropagation();
          isSeeking = true;
          progressBar.classList.add('seeking');
          seekTo(e.touches[0]);
        }, { passive: false });
        
        progressBar.addEventListener('touchmove', (e) => {
          if (isSeeking) {
            e.preventDefault();
            seekTo(e.touches[0]);
          }
        }, { passive: false });
        
        progressBar.addEventListener('touchend', (e) => {
          if (isSeeking) {
            e.stopPropagation();
            isSeeking = false;
            progressBar.classList.remove('seeking');
            setTimeout(hideTooltip, 800);
          }
        }, { passive: false });
        
        const btnSettings = document.getElementById('btn-settings');
        bindFastClick(btnSettings, () => {
          video.pause();
          sendToParent({ type: 'openSettings' });
          resetControlsTimeout();
        });

        const btnNextEpisode = document.getElementById('btn-next-episode');
        if (btnNextEpisode) {
          bindFastClick(btnNextEpisode, () => {
            sendToParent({ type: 'nextEpisode' });
          });
        }
        
        const controlsOverlay = document.getElementById('controls-overlay');
        const clickBackdrop = document.getElementById('click-backdrop');
        let controlsTimer = null;
        
        function showControls() {
          controlsOverlay.classList.remove('hidden');
          resetControlsTimeout();
        }
        
        function hideControls() {
          if (!video.paused) {
            controlsOverlay.classList.add('hidden');
          }
        }
        
        function resetControlsTimeout() {
          clearTimeout(controlsTimer);
          if (!video.paused && !controlsOverlay.classList.contains('hidden')) {
            controlsTimer = setTimeout(hideControls, 3500);
          }
        }
        
        let dtTimerLeft = null;
        let dtTimerRight = null;
        function triggerDoubleTapFeedback(side) {
          const overlay = document.getElementById('double-tap-' + side);
          if (!overlay) return;
          if (side === 'left') {
            clearTimeout(dtTimerLeft);
            overlay.classList.remove('active');
            void overlay.offsetWidth;
            overlay.classList.add('active');
            dtTimerLeft = setTimeout(() => overlay.classList.remove('active'), 550);
          } else {
            clearTimeout(dtTimerRight);
            overlay.classList.remove('active');
            void overlay.offsetWidth;
            overlay.classList.add('active');
            dtTimerRight = setTimeout(() => overlay.classList.remove('active'), 550);
          }
        }

        // INSTANT TAP & DOUBLE-TAP ENGINE
        let singleTapTimer = null;
        let lastTapTime = 0;
        let lastTapX = 0;
        let lastSeekTapTime = 0;
        let lastSeekSide = null;
        
        function handleInstantTap(touchX) {
          const now = Date.now();
          const timeSinceLastTap = now - lastTapTime;
          const timeSinceLastSeek = now - lastSeekTapTime;
          const rect = document.getElementById('player-container').getBoundingClientRect();
          const relativeX = touchX - rect.left;
          const isHidden = controlsOverlay.classList.contains('hidden');
          const isLeftSide = relativeX < rect.width * 0.38;
          const isRightSide = relativeX > rect.width * 0.62;
          
          // 1. Multi-tap seek continuation (3rd, 4th quick tap within 420ms on the same seek side)
          if (${prefs.doubleTapEnabled} && timeSinceLastSeek < 420 && lastSeekSide && ((lastSeekSide === 'left' && isLeftSide) || (lastSeekSide === 'right' && isRightSide))) {
            if (singleTapTimer) {
              clearTimeout(singleTapTimer);
              singleTapTimer = null;
            }
            lastSeekTapTime = now;
            lastTapTime = now;
            lastTapX = touchX;
            if (lastSeekSide === 'left') {
              video.currentTime = Math.max(0, video.currentTime - skipInterval);
              triggerDoubleTapFeedback('left');
            } else {
              video.currentTime = Math.min(video.duration || 0, video.currentTime + skipInterval);
              triggerDoubleTapFeedback('right');
            }
            if (isHidden) {
              controlsOverlay.classList.add('hidden');
            }
            return;
          }

          // 2. Double-tap detection (2nd tap within 280ms)
          if (${prefs.doubleTapEnabled} && timeSinceLastTap < 280 && timeSinceLastTap > 0 && Math.abs(touchX - lastTapX) < 130 && (isLeftSide || isRightSide)) {
            // Cancel pending single tap toggle before controls ever show!
            if (singleTapTimer) {
              clearTimeout(singleTapTimer);
              singleTapTimer = null;
            }
            lastTapTime = 0; // consumed
            const side = isLeftSide ? 'left' : 'right';
            lastSeekSide = side;
            lastSeekTapTime = now;
            
            if (side === 'left') {
              video.currentTime = Math.max(0, video.currentTime - skipInterval);
              triggerDoubleTapFeedback('left');
            } else {
              video.currentTime = Math.min(video.duration || 0, video.currentTime + skipInterval);
              triggerDoubleTapFeedback('right');
            }

            // CRITICAL: Keep controls hidden if they were hidden!
            if (isHidden) {
              controlsOverlay.classList.add('hidden');
            } else {
              resetControlsTimeout();
            }
            return;
          }
          
          // Record this tap
          lastTapTime = now;
          lastTapX = touchX;
          lastSeekSide = null;
          
          // 3. Single-tap handling:
          if (!isHidden) {
            // Controls currently visible: tapping empty area immediately hides controls (0ms)
            if (singleTapTimer) {
              clearTimeout(singleTapTimer);
              singleTapTimer = null;
            }
            hideControls();
          } else {
            // Controls currently hidden:
            // Wait 175ms so double-tap can cancel it before controls ever appear!
            if (singleTapTimer) {
              clearTimeout(singleTapTimer);
            }
            if (${prefs.doubleTapEnabled}) {
              singleTapTimer = setTimeout(() => {
                showControls();
                singleTapTimer = null;
              }, 175);
            } else {
              showControls();
            }
          }
        }

        let backdropTouchStartX = 0;
        let backdropTouchStartY = 0;
        let backdropHasMoved = false;

        function onBackdropTouchStart(e) {
          const touch = e.touches[0];
          backdropTouchStartX = touch.clientX;
          backdropTouchStartY = touch.clientY;
          backdropHasMoved = false;
        }

        function onBackdropTouchEnd(e) {
          if (backdropHasMoved) return;
          const touch = e.changedTouches ? e.changedTouches[0] : null;
          const touchX = touch ? touch.clientX : backdropTouchStartX;
          e.preventDefault();
          handleInstantTap(touchX);
        }

        function onBackdropClick(e) {
          if (backdropHasMoved) {
            backdropHasMoved = false;
            return;
          }
          if (e.target.closest('button, .progress-bar-container')) return;
          const touchX = e.clientX || backdropTouchStartX;
          handleInstantTap(touchX);
        }

        clickBackdrop.addEventListener('touchstart', onBackdropTouchStart, { passive: true });
        clickBackdrop.addEventListener('touchmove', (e) => {
          const touch = e.touches[0];
          if (Math.abs(touch.clientX - backdropTouchStartX) > 10 || Math.abs(touch.clientY - backdropTouchStartY) > 10) {
            backdropHasMoved = true;
          }
        }, { passive: true });
        clickBackdrop.addEventListener('touchend', onBackdropTouchEnd, { passive: false });
        clickBackdrop.addEventListener('click', onBackdropClick);

        controlsOverlay.addEventListener('touchstart', onBackdropTouchStart, { passive: true });
        controlsOverlay.addEventListener('touchmove', (e) => {
          const touch = e.touches[0];
          if (Math.abs(touch.clientX - backdropTouchStartX) > 10 || Math.abs(touch.clientY - backdropTouchStartY) > 10) {
            backdropHasMoved = true;
          }
        }, { passive: true });
        controlsOverlay.addEventListener('touchend', (e) => {
          if (e.target.closest('button, .progress-bar-container')) return;
          onBackdropTouchEnd(e);
        }, { passive: false });
        controlsOverlay.addEventListener('click', (e) => {
          if (e.target.closest('button, .progress-bar-container')) return;
          onBackdropClick(e);
        });

        // Swipe to Seek functionality (Passive with active scrub check)
        const swipeHud = document.getElementById('swipe-hud');
        const swipeHudTime = document.getElementById('swipe-hud-time');
        const swipeHudChange = document.getElementById('swipe-hud-change');
        
        function showSwipeHud(targetTime, delta) {
          swipeHudTime.textContent = formatTime(targetTime);
          const sign = delta >= 0 ? '+' : '';
          swipeHudChange.textContent = '[' + sign + formatTime(delta) + ']';
          swipeHud.classList.add('active');
        }
        
        function hideSwipeHud() {
          swipeHud.classList.remove('active');
        }

        let swipeStartX = 0;
        let swipeStartY = 0;
        let swipeInitialTime = 0;
        let swipeCurrentTargetTime = 0;
        
        function handleSwipeStart(e) {
          if (!${prefs.swipeSeekEnabled}) return;
          if (e.target.closest('button, .progress-bar-container')) return;
          const touch = e.touches[0];
          swipeStartX = touch.clientX;
          swipeStartY = touch.clientY;
          swipeInitialTime = video.currentTime;
          isSwiping = false;
          controlsWereHiddenOnSwipeStart = controlsOverlay.classList.contains('hidden');
        }

        function handleSwipeMove(e) {
          if (!${prefs.swipeSeekEnabled} || swipeStartX === 0) return;
          const touch = e.touches[0];
          const deltaX = touch.clientX - swipeStartX;
          const deltaY = touch.clientY - swipeStartY;
          
          if (!isSwiping && Math.abs(deltaX) > 15 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
            isSwiping = true;
            backdropHasMoved = true;
            if (singleTapTimer) {
              clearTimeout(singleTapTimer);
              singleTapTimer = null;
            }
            video.pause();
            // DO NOT show controls! Media buttons must NOT pop up!
            clearTimeout(controlsTimer);
          }
          
          if (isSwiping) {
            e.preventDefault();
            const rect = clickBackdrop.getBoundingClientRect();
            const swipeSensitivity = 180; 
            const deltaSeconds = -(deltaX / rect.width) * swipeSensitivity;
            swipeCurrentTargetTime = Math.max(0, Math.min(video.duration || 0, swipeInitialTime + deltaSeconds));
            showSwipeHud(swipeCurrentTargetTime, deltaSeconds);
          }
        }

        function handleSwipeEnd(e) {
          if (!${prefs.swipeSeekEnabled} || !isSwiping) {
            swipeStartX = 0;
            return;
          }
          video.currentTime = swipeCurrentTargetTime;
          hideSwipeHud();
          video.play().catch(() => {});
          isSwiping = false;
          swipeStartX = 0;
          if (controlsWereHiddenOnSwipeStart) {
            controlsOverlay.classList.add('hidden');
          } else {
            resetControlsTimeout();
          }
        }

        clickBackdrop.addEventListener('touchstart', handleSwipeStart, { passive: true });
        clickBackdrop.addEventListener('touchmove', handleSwipeMove, { passive: false });
        clickBackdrop.addEventListener('touchend', handleSwipeEnd, { passive: true });

        controlsOverlay.addEventListener('touchstart', handleSwipeStart, { passive: true });
        controlsOverlay.addEventListener('touchmove', handleSwipeMove, { passive: false });
        controlsOverlay.addEventListener('touchend', handleSwipeEnd, { passive: true });
        
        window.setFullscreenMode = function(isFS) {
          _isFullscreenLocal = !!isFS;
          updateFullscreenIcons(_isFullscreenLocal);
          updateLayoutMode();
        };

        window.setButtonSize = function(size) {
          let scale = 1.0;
          if (size === 'small') scale = 0.82;
          if (size === 'large') scale = 1.22;
          document.documentElement.style.setProperty('--btn-pref-scale', scale);
        };

        window.playVideo = function() {
          const vid = document.getElementById('player');
          if (vid && vid.paused) vid.play();
        };

        window.setClarityMode = function(mode) {
          const vid = document.getElementById('player');
          if (!vid) return;
          
          if (mode === 'performance') {
            vid.style.filter = 'contrast(1.06) saturate(1.10)';
          } else if (mode === 'balanced') {
            vid.style.filter = 'contrast(1.12) saturate(1.18)';
          } else if (mode === 'ai-native') {
            vid.style.filter = 'contrast(1.18) saturate(1.26) brightness(1.02)';
          } else {
            vid.style.filter = '';
          }
        };

        window.addEventListener('message', (event) => {
          try {
            let data = event.data;
            if (typeof data === 'string') data = JSON.parse(data);
            if (data && data.type) {
              if (data.type === 'selectQuality') {
                selectQuality(data.value);
              } else if (data.type === 'setPlaySpeed') {
                setPlaySpeed(data.value);
              } else if (data.type === 'setClarityMode') {
                if (window.setClarityMode) window.setClarityMode(data.value);
              } else if (data.type === 'setFullscreenMode') {
                if (window.setFullscreenMode) window.setFullscreenMode(data.value);
              } else if (data.type === 'setButtonSize') {
                if (window.setButtonSize) window.setButtonSize(data.value);
              } else if (data.type === 'setSkipTimes') {
                if (window.setSkipTimes) window.setSkipTimes(data.value);
              } else if (data.type === 'playVideo') {
                if (window.playVideo) window.playVideo();
              }
            }
          } catch (e) {
            console.error('Error handling parent message in iframe:', e);
          }
        });

        initPlayer();
        showControls();
        updateLayoutMode();
      <\/script>
    </body>
    </html>
  `;
};

function VideoPlayerWrapper({ videoUrl, onMessage, webViewRef, clarityMode, startAt, playerPrefs, isFullscreen, aniSkipData }) {
  const refererUrl = getRefererForUrl(videoUrl);
  console.log('[WatchScreen] Playing video directly with Referer baseUrl:', refererUrl);

  const isSibnet = videoUrl && (videoUrl.includes('sibnet.ru') || videoUrl.toLowerCase().includes('.mp4'));
  let videoSourceUrl = videoUrl;
  let isMp4 = false;

  if (isSibnet) {
    isMp4 = true;
    console.log('[WatchScreen] Playing Sibnet tokenized video via custom player:', videoSourceUrl);
  } else if (videoUrl && videoUrl.toLowerCase().includes('.mp4')) {
    isMp4 = true;
  }

  const [initialHtml] = useState(() => generatePlayerHtml(videoSourceUrl, isMp4, clarityMode, startAt, playerPrefs, aniSkipData));

  useEffect(() => {
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`if(window.setClarityMode) { window.setClarityMode('${clarityMode}'); } true;`);
    }
  }, [clarityMode]);

  useEffect(() => {
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`if(window.setFullscreenMode) { window.setFullscreenMode(${!!isFullscreen}); } true;`);
    }
  }, [isFullscreen]);

  useEffect(() => {
    if (webViewRef.current && playerPrefs?.buttonSize) {
      webViewRef.current.injectJavaScript(`if(window.setButtonSize) { window.setButtonSize('${playerPrefs.buttonSize}'); } true;`);
    }
  }, [playerPrefs?.buttonSize]);

  useEffect(() => {
    if (webViewRef.current && aniSkipData) {
      webViewRef.current.injectJavaScript(`if(window.setSkipTimes) { window.setSkipTimes(${JSON.stringify(aniSkipData)}); } true;`);
    }
  }, [aniSkipData]);

  return (
    <WebView
      ref={webViewRef}
      source={{ html: initialHtml, baseUrl: refererUrl }}
      originWhitelist={['*']}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      cacheEnabled={true}
      cacheMode="LOAD_DEFAULT"
      allowsFullscreenVideo={true}
      mediaPlaybackRequiresUserAction={false}
      allowsInlineMediaPlayback={true}
      mixedContentMode="always"
      androidLayerType="none"
      scrollEnabled={false}
      bounces={false}
      style={styles.videoPlayer}
      onMessage={onMessage}
    />
  );
}

function WebVideoPlayer({ videoUrl, onMessage, webViewRef, clarityMode, startAt, playerPrefs, isFullscreen, aniSkipData }) {
  const isSibnet = videoUrl && (videoUrl.includes('sibnet.ru') || videoUrl.toLowerCase().includes('.mp4'));
  let videoSourceUrl = videoUrl;
  let isMp4 = false;

  if (isSibnet) {
    isMp4 = true;
  } else if (videoUrl && videoUrl.toLowerCase().includes('.mp4')) {
    isMp4 = true;
  }

  const [initialHtml] = useState(() => generatePlayerHtml(videoSourceUrl, isMp4, clarityMode, startAt, playerPrefs, aniSkipData));

  useEffect(() => {
    if (webViewRef.current && webViewRef.current.contentWindow) {
      webViewRef.current.contentWindow.postMessage(JSON.stringify({ type: 'setClarityMode', value: clarityMode }), '*');
    }
  }, [clarityMode]);

  useEffect(() => {
    if (webViewRef.current && webViewRef.current.contentWindow) {
      webViewRef.current.contentWindow.postMessage(JSON.stringify({ type: 'setFullscreenMode', value: !!isFullscreen }), '*');
    }
  }, [isFullscreen]);

  useEffect(() => {
    if (webViewRef.current && webViewRef.current.contentWindow && playerPrefs?.buttonSize) {
      webViewRef.current.contentWindow.postMessage(JSON.stringify({ type: 'setButtonSize', value: playerPrefs.buttonSize }), '*');
    }
  }, [playerPrefs?.buttonSize]);

  useEffect(() => {
    if (webViewRef.current && webViewRef.current.contentWindow && aniSkipData) {
      webViewRef.current.contentWindow.postMessage(JSON.stringify({ type: 'setSkipTimes', value: aniSkipData }), '*');
    }
  }, [aniSkipData]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const handler = (event) => {
      try {
        let data = event.data;
        if (typeof data === 'string') {
          data = JSON.parse(data);
        }
        if (data && data.type) {
          onMessage({ nativeEvent: { data: JSON.stringify(data) } });
        }
      } catch (e) {
        // Ignore cross-origin or parse errors
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onMessage]);

  return (
    <View style={styles.videoPlayer}>
      <iframe
        ref={webViewRef}
        srcDoc={initialHtml}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          backgroundColor: '#000',
        }}
        sandbox="allow-scripts allow-same-origin allow-popups"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        title="Video Player"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  playerWrapper: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  videoPlayerBox: {
    width: '100%',
    height: SCREEN_WIDTH * 9 / 16,
    backgroundColor: '#000',
    position: 'relative',
    borderBottomLeftRadius: BORDER_RADIUS.md,
    borderBottomRightRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
  },
  videoPlayerBoxFullscreen: {
    width: '100%',
    height: '100%',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderRadius: 0,
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
  },
  videoBackButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  detailsScrollView: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  detailsContent: {
    padding: SPACING.xl,
  },
  detailsTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.title,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.xs,
    lineHeight: 28,
  },
  detailsSubTitle: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 2,
  },
  detailsOriginalTitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.small,
    marginTop: 2,
    fontStyle: 'italic',
  },
  fixAnilistButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.sm,
  },
  fixAnilistText: {
    color: '#FFF',
    fontSize: FONT_SIZES.small - 1,
    fontWeight: FONT_WEIGHTS.medium,
  },
  metaBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  metaBadgeSuccess: {
    borderColor: 'rgba(46, 213, 115, 0.3)',
    backgroundColor: 'rgba(46, 213, 115, 0.08)',
  },
  metaBadgeText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  metaBadgeAnilist: {
    backgroundColor: 'rgba(0, 173, 237, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 173, 237, 0.3)',
  },
  metaBadgeAnilistText: {
    color: '#00ADED',
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.bold,
  },
  detailsDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginVertical: SPACING.md,
  },
  headerInfoContainer: {
    marginBottom: SPACING.md,
  },
  navigationWrapper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginVertical: SPACING.sm,
  },
  navButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  navButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  navButtonText: {
    color: '#FFF',
    fontSize: FONT_SIZES.body - 1,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  navButtonTextDisabled: {
    color: '#555',
  },
  featureGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: SPACING.md,
  },
  featureCard: {
    flex: 1,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  featureCardIcon: {
    marginBottom: 6,
  },
  featureCardTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.body - 1,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 4,
  },
  featureCardText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  infoInfoBox: {
    backgroundColor: 'rgba(255, 107, 0, 0.05)',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.15)',
  },
  infoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  infoTitleText: {
    color: '#FFF',
    fontSize: FONT_SIZES.body - 1,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  infoBodyText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  sheetContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  bottomSheet: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: SPACING.xl,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  bottomSheetLandscape: {
    maxHeight: '90%',
    paddingBottom: 16,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: SPACING.sm,
  },
  sheetSubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: SPACING.sm,
  },
  sheetHeaderText: {
    color: '#FFF',
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
  },
  sheetItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  sheetItemText: {
    color: '#FFF',
    fontSize: FONT_SIZES.body,
  },
  sheetItemValue: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body - 1,
  },
  sheetOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: SPACING.sm,
  },
  sheetOptionActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
  },
  sheetOptionText: {
    color: '#FFF',
    fontSize: FONT_SIZES.body,
  },
  seasonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  seasonButton: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  seasonButtonActive: {
    backgroundColor: COLORS.accentGlowSubtle,
    borderColor: COLORS.borderAccent,
  },
  seasonButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  seasonButtonTextActive: {
    color: COLORS.accent,
  },
  sectionTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md,
    marginTop: SPACING.lg,
  },
  episodesListContainer: {
    paddingRight: SPACING.xl,
    gap: SPACING.sm,
  },
  episodeCard: {
    width: 160,
    height: 100,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: COLORS.bgSecondary,
  },
  episodeCardActive: {
    borderColor: COLORS.accent,
  },
  episodeImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    opacity: 0.6,
  },
  episodeOverlay: {
    ...StyleSheet.absoluteFillObject,
    padding: SPACING.sm,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  episodeCardTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium,
  },
  episodeCardTitleActive: {
    color: COLORS.accent,
    fontWeight: FONT_WEIGHTS.bold,
  },
  inlineLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  inlineLoadingState: {
    color: '#FFF',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
    marginBottom: 6,
  },
  inlineLoadingPercent: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 12,
  },
  inlineProgressBarContainer: {
    width: '60%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 16,
  },
  inlineProgressBar: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 2,
  },
  inlineCancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  inlineCancelText: {
    color: '#FFF',
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium,
  },
});
