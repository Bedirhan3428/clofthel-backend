/**
 * Clofthel — AnimeDetailScreen (Dual-Core Architecture)
 * 
 * Orchestrator Layer: seasons and related movies are loaded from the backend (queried from orchestrator_state in DB).
 * MongoDB Layer: episodes, imagery, and details are fetched from the database for the active season's mongo_db_id.
 */
import { Image } from 'expo-image';
import React, { useState, useEffect, useCallback, useContext, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  FlatList,
  Animated,
  Modal,
  TextInput,
  Platform,
  Share,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  COLORS,
  SPACING,
  FONT_SIZES,
  FONT_WEIGHTS,
  BORDER_RADIUS,
} from '../constants/theme';
import { addToHistory, toggleFavorite, getProfileData, toggleAnimeInList, syncAnimeCacheApi } from '../services/api';
import { 
  searchTranimeizleMatch, 
  fetchEpisodesForAnime, 
  parseEpisodesHtml,
  searchAndExtractEpisodes,
  getFirstAnimeLinkFromSearch,
  fetchHtml, 
  parseSearchResultsHtml, 
  isBotBlocked, 
  matchCandidateForSeason,
  getCleanSearchQuery,
  detectSeasonNumber,
  detectPartNumber,
  detectCandidateSeason,
  extractSeasonsFromCandidates,
  completeMissingEpisodes,
  normalizeTurkish,
  isSpecial,
  isMovie,
  BASE_URL 
} from '../services/lightweightResolver';
import { 
  fetchAnimeDetails as fetchAniListDetails, 
  fetchFullSeasonChain,
  isAnimeUpcoming,
  formatReleaseDateTr
} from '../services/anilistService';
import { scraperInjectedJs } from '../modules/ScraperScript';
import { challengeHeartbeatJs } from '../modules/ChallengeHeartbeat';
import { useAlert } from '../context/AlertContext';
import { AuthContext } from '../context/AuthContext';

let WebView = null;
if (Platform.OS !== 'web') {
  try {
    WebView = require('react-native-webview').WebView;
  } catch (e) {
    console.warn('[AnimeDetailScreen] react-native-webview not available:', e.message);
  }
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BANNER_HEIGHT = 320;
const POSTER_WIDTH = 130;
const POSTER_HEIGHT = 190;

export default function AnimeDetailScreen({ route, navigation }) {
  const { showAlert } = useAlert();
  const { user } = useContext(AuthContext);

  // Params passed from navigation
  const passedAnime = route.params?.anime;
  const passedEntry = route.params?.orchestratorEntry;

  const initialId = passedAnime?._id || passedAnime?.id || passedAnime?.anilist_id || passedEntry?.seasons?.[0]?.mongo_db_id || route.params?.id || route.params?.anilist_id;
  const initialTitle = passedAnime?.title || passedAnime?.anime_title || passedAnime?.title_romaji || passedAnime?.title_english || passedAnime?.orijinal_ad || passedEntry?.main_title_en || route.params?.title || '';
  const clickedSeasonNum = detectSeasonNumber(initialTitle, 0);
  const clickedPartNum = detectPartNumber(initialTitle, 1);
  const clickedIsFinal = Boolean(/(?:final\s*(?:season|sezon)|the\s*final|son\s*sezon|\(final\))/i.test(initialTitle));

  if (!initialId) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Anime verisi bulunamadı.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── States ───────────────────────────────────────────────────
  const [activeMongoId, setActiveMongoId] = useState(initialId);
  const [anime, setAnime] = useState(passedAnime || null);
  const [loading, setLoading] = useState(true);
  const [loadingEpisodes, setLoadingEpisodes] = useState(true);
  const [episodes, setEpisodes] = useState([]);
  
  // Pre-populate from passed entry (KESİNLİKLE SPECIAL / OVA SEZON OLARAK EKLENMEZ)
  const [seasons, setSeasons] = useState(passedEntry?.seasons?.filter(s => {
    if (!s) return false;
    const t = normalizeTurkish(s.season_title || s.title || '').toLowerCase();
    const hasExplicitSeason = /\b(\d+)\s*\.?\s*(?:st|nd|rd|th)?\s*(?:sezon|season)\b/i.test(t) || s.season_number > 0;
    const isExplicitSpecialOrOva = /\b(?:ozel\s*bolum|special\s*episode|ova|oad|ona|recap|ozet)\b/i.test(t);
    if (isExplicitSpecialOrOva) return false;
    if (hasExplicitSeason) return true;
    return !/(?:ozel|ozet|\b(?:ova|oad|ona|sp|special|specials|recap)\b)/i.test(t);
  }).map(s => ({
    _id: s.mongo_db_id,
    season_number: s.season_number,
    label: s.season_title,
    category: 'seasons',
    cover_image: passedEntry?.cover_image || null,
    banner_image: passedEntry?.banner_image || null
  })) || []);

  const [relatedMoviesOvas, setRelatedMoviesOvas] = useState(passedEntry?.related_movies_or_ovas?.filter(m => {
    if (!m) return false;
    const fmt = (m.format || '').toUpperCase();
    if (['SPECIAL', 'OVA', 'ONA', 'MUSIC'].includes(fmt)) return false;
    const t = m.title || '';
    if (/(?:özel|ozel|özet|\b(?:ova|oad|ona|sp|special|specials|recap)\b)/i.test(t)) return false;
    return fmt === 'MOVIE' || /(?:film|movie)/i.test(t);
  }).map(m => ({
    _id: m.mongo_db_id,
    title: m.title,
    format: m.format,
    category: 'movies'
  })) || []);

  const [showFullDescription, setShowFullDescription] = useState(false);

  // User-related state
  const [isFavorite, setIsFavorite] = useState(false);
  const [customLists, setCustomLists] = useState([]);
  const [isListModalVisible, setIsListModalVisible] = useState(false);

  // Animation and Season Cache
  const useRefValue = useRef(new Animated.Value(0));
  const fadeAnim = useRefValue.current;
  const seasonCacheRef = useRef({});
  const allCandidatesRef = useRef([]);
  const isAlertOpenRef = useRef(false);
  const webViewRef = useRef(null);
  const hasAppliedInitialSeasonRef = useRef(false);
  const hasRetriedSeasonSearchRef = useRef({});

  // ── Tranimeizle Canlı İstek & Arama Konsolu Durumları ────────
  const [logs, setLogs] = useState([]);
  const [searchStatus, setSearchStatus] = useState('idle'); // 'idle' | 'searching' | 'blocked' | 'success' | 'empty' | 'error'
  const [searchCandidates, setSearchCandidates] = useState([]);
  const [searchQueryInput, setSearchQueryInput] = useState('');
  const [isLogExpanded, setIsLogExpanded] = useState(true);
  const [selectedCandidateUrl, setSelectedCandidateUrl] = useState(null);
  const [isChallengeModalVisible, setIsChallengeModalVisible] = useState(false);
  const [challengeUrl, setChallengeUrl] = useState('');
  const [isJsonModalVisible, setIsJsonModalVisible] = useState(false);
  const [isJsonCopied, setIsJsonCopied] = useState(false);

  const handleCopyJson = async () => {
    try {
      const jsonStr = JSON.stringify(episodes, null, 2);
      if (Clipboard && Clipboard.setStringAsync) {
        await Clipboard.setStringAsync(jsonStr);
      }
      setIsJsonCopied(true);
      addLog('📋 Bölümler JSON panoya kopyalandı!', 'success');
      setTimeout(() => setIsJsonCopied(false), 2500);
    } catch (err) {
      console.warn('Copy failed:', err);
    }
  };

  const handleShareJson = async () => {
    try {
      const jsonStr = JSON.stringify(episodes, null, 2);
      await Share.share({
        title: `${anime?.title || 'Anime'} Bölümler JSON (${episodes.length})`,
        message: jsonStr,
      });
    } catch (err) {
      console.warn('Share failed:', err);
    }
  };

  // Merkezi bölüm formatlama ve filtreleme fonksiyonu
  const formatAndFilterEpisodes = useCallback((rawEps, mongoId, targetTotal = 0, defaultTitle = '', defaultThumb = '', targetFormat = 'TV') => {
    if (!rawEps || !Array.isArray(rawEps)) return [];
    
    const episodesByNumber = new Map();
    const isMovieTarget = targetFormat === 'MOVIE' || parseInt(targetTotal, 10) === 1;

    for (const ep of rawEps) {
      if (!ep) continue;
      let num = parseInt(ep.number || ep.episode_number, 10);
      const epUrl = (ep.url || '').trim();
      const rawTitle = (ep.title || ep.episode_title || '').trim();

      // KESİNLİKLE SPECIAL / OVA / RECAP / ÖZEL BÖLÜM İSTEMİYORUZ!
      const normEp = normalizeTurkish(`${epUrl} ${rawTitle}`).toLowerCase();
      const isExplicitSpecialEp = /\bozel\s*bolum\b/i.test(normEp) ||
                                  /\bspecial\s*episode\b/i.test(normEp) ||
                                  /\b(?:ova|oad|ona)\b/i.test(normEp) ||
                                  /[-_](?:ova|oad|ona|recap|offline|chibi|omake)[-_]/i.test(normEp) ||
                                  normEp.includes('offline') ||
                                  normEp.includes('omake') ||
                                  normEp.includes('recap') ||
                                  normEp.includes('ozet');
      const isSpecialContextOnly = /\bozel\s*(?:sinav|ders|guc|kuvvet|harekat|tim|operasyon)\b/i.test(normEp) ||
                                   /\bspecial\s*(?:exam|ops|operations|forces|force|power|powers|lesson|class|assignment)\b/i.test(normEp);

      if (isExplicitSpecialEp || (!isSpecialContextOnly && (normEp.includes('ozel') || normEp.includes('special') || /\bsp\b/i.test(normEp)) && isNaN(num))) {
        continue;
      }

      const isMovieUrl = epUrl.includes('film') || epUrl.includes('movie') || isMovieTarget;

      if (isNaN(num) || num <= 0) {
        if (isMovieUrl) {
          num = 1;
        } else {
          continue;
        }
      }

      const lower = rawTitle.toLowerCase();

      // SADECE NOKTA (.), BOŞLUK, VEYA GEÇERSİZ / BUTON METİNLERİNİ KESİNLİKLE FİLTRELE
      if (
        !rawTitle ||
        rawTitle === '.' ||
        /^[.\s,;:!?•·…\-_]+$/.test(rawTitle) ||
        lower === 'hemen izle' ||
        lower === 'ilk bölüm' ||
        lower === 'ilk bolum' ||
        lower === 'fragman' ||
        lower === 'tanıtım' ||
        lower === 'tanitim'
      ) {
        // Eğer başlık geçersizse ve zaten bu bölüm numarasına sahip zengin bir bölüm varsa bunu çöpe at
        if (episodesByNumber.has(num)) {
          continue;
        }
      }

      // Geçersiz linkleri filtrele (boş, #, / veya javascript:)
      if (!epUrl || epUrl === '#' || epUrl === '/' || epUrl.endsWith('/anime/') || epUrl.indexOf('javascript:') === 0) {
        continue;
      }

      const formatted = {
        _id: `${mongoId || 'ep'}_${num}`,
        episode_number: num,
        episode_title: (rawTitle && rawTitle !== '.' && !/^[.\s]+$/.test(rawTitle)) 
          ? rawTitle 
          : (isMovieTarget ? (defaultTitle || 'Film') : `${num}. Bölüm`),
        url: epUrl.startsWith('http') ? epUrl : `${BASE_URL}${epUrl.startsWith('/') ? '' : '/'}${epUrl}`,
        thumbnail: ep.thumbnail ? (ep.thumbnail.startsWith('http') ? ep.thumbnail : `${BASE_URL}${ep.thumbnail.startsWith('/') ? '' : '/'}${ep.thumbnail}`) : (defaultThumb || null),
        release_date: ep.release_date || null
      };

      // Tekilleştirme: Aynı bölüm numarasından birden fazla geldiyse (örn: hero buton vs liste öğesi)
      if (episodesByNumber.has(num)) {
        const existing = episodesByNumber.get(num);
        const newHasThumb = Boolean(formatted.thumbnail);
        const oldHasThumb = Boolean(existing.thumbnail);
        const newTitleLen = (formatted.episode_title || '').length;
        const oldTitleLen = (existing.episode_title || '').length;

        if ((!oldHasThumb && newHasThumb) || (newTitleLen > oldTitleLen)) {
          episodesByNumber.set(num, formatted);
        }
      } else {
        episodesByNumber.set(num, formatted);
      }
    }

    let result = Array.from(episodesByNumber.values()).sort((a, b) => a.episode_number - b.episode_number);

    // Tek bölümlük film kurtarıcı: Liste boşsa fakat 1 adet rawEp veya URL geldiyse
    if (result.length === 0 && isMovieTarget && rawEps.length > 0 && rawEps[0].url) {
      result = [{
        _id: `${mongoId || 'ep'}_1`,
        episode_number: 1,
        episode_title: defaultTitle || 'Film',
        url: rawEps[0].url.startsWith('http') ? rawEps[0].url : `${BASE_URL}${rawEps[0].url.startsWith('/') ? '' : '/'}${rawEps[0].url}`,
        thumbnail: rawEps[0].thumbnail || defaultThumb || null,
        release_date: null
      }];
    }

    // KULLANICI KESİN KURALI: Olmayan / henüz çıkmamış bölümleri asla sahte olarak listeleme!
    // Sadece sitede gerçekten mevcut ve taranmış olan bölümleri listele.
    return result;
  }, []);

  const addLog = useCallback((message, type = 'info') => {
    console.log(`[DetailLog:${type}] ${message}`);
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const newEntry = { id: `${Date.now()}_${Math.random()}`, time, message, type };
    setLogs(prev => [newEntry, ...prev.slice(0, 79)]);
  }, []);

  // ── Aktif Hedef ve Kalp Atışı JS Scripti (Tüm WebView yaşam döngüsünde kullanılır) ──
  const currentSeasonForJs = (seasons && seasons.find(s => s && String(s._id) === String(activeMongoId))) || (seasons && seasons[0]) || null;
  const currentAnimeDataForJs = anime || passedAnime;
  const targetFormatForJs = currentAnimeDataForJs?.format || 'TV';
  const rawTitleForSeasonDetection = currentSeasonForJs?.title || currentSeasonForJs?.label || currentAnimeDataForJs?.title_romaji || currentAnimeDataForJs?.title || initialTitle || '';
  const seasonNumForJs = currentSeasonForJs?.season_number || detectSeasonNumber(rawTitleForSeasonDetection, 1);
  const partNumForJs = currentSeasonForJs?.part_number || detectPartNumber(rawTitleForSeasonDetection, 1);
  const isFinalForJs = Boolean(currentSeasonForJs?.is_final || /(?:final\s*(?:season|sezon)|the\s*final|son\s*sezon|\(final\))/i.test(rawTitleForSeasonDetection));
  const targetTitleForJs = getCleanSearchQuery(currentSeasonForJs?.title || currentAnimeDataForJs?.title_romaji || currentAnimeDataForJs?.title || initialTitle || '');
  const totalEpsForJs = currentAnimeDataForJs?.episodes || currentSeasonForJs?.episodes || 0;
  const seasonTitleForJs = currentSeasonForJs?.title || currentSeasonForJs?.label || '';
  const titleRomajiForJs = currentSeasonForJs?.title_romaji || currentSeasonForJs?.node?.title_romaji || currentAnimeDataForJs?.title_romaji || currentAnimeDataForJs?.titleRomaji || '';
  const titleEnglishForJs = currentSeasonForJs?.title_english || currentSeasonForJs?.node?.title_english || currentAnimeDataForJs?.title_english || currentAnimeDataForJs?.titleEnglish || '';
  const synonymsForJs = [
    ...(currentSeasonForJs?.node?.synonyms || []),
    ...(currentAnimeDataForJs?.synonyms || [])
  ];
  const isCurrentSeasonUpcoming = isAnimeUpcoming(currentSeasonForJs) || ((!seasons || seasons.length <= 1) && isAnimeUpcoming(currentAnimeDataForJs));
  const releaseDateStr = formatReleaseDateTr(currentSeasonForJs || currentAnimeDataForJs);
  const activeHeartbeatJs = `window.__TARGET_TITLE = ${JSON.stringify(targetTitleForJs)}; window.__TARGET_SEASON = ${seasonNumForJs}; window.__TARGET_PART = ${partNumForJs}; window.__TARGET_IS_FINAL = ${isFinalForJs}; window.__TARGET_SEASON_TITLE = ${JSON.stringify(seasonTitleForJs)}; window.__TARGET_TITLE_ROMAJI = ${JSON.stringify(titleRomajiForJs)}; window.__TARGET_TITLE_EN = ${JSON.stringify(titleEnglishForJs)}; window.__TARGET_SYNONYMS = ${JSON.stringify(synonymsForJs)}; window.__TARGET_TOTAL_EPISODES = ${totalEpsForJs}; window.__TARGET_FORMAT = ${JSON.stringify(targetFormatForJs)}; ` + challengeHeartbeatJs;

  // ── Heartbeat Bot Solver & Touch Unblocker (Her 1 sn'de bir WebView'a enjekte edilir) ──
  useEffect(() => {
    if (!isChallengeModalVisible) return;

    addLog('⚡ [BOT ÇÖZÜCÜ] Canlı kalp atışı ve dokunmatik kalkan devrede...', 'info');

    // İlk anlık enjeksiyon
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(activeHeartbeatJs);
    }

    // Her 1 saniyede bir sayfayı tara ve çöz
    const timer = setInterval(() => {
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(activeHeartbeatJs);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isChallengeModalVisible, addLog, activeHeartbeatJs]);

  // ── Canlı Bölüm JSON Loglayıcı ──────────────────────────────
  useEffect(() => {
    if (episodes && episodes.length > 0) {
      console.log('=== CURRENT_EPISODES_JSON START ===');
      console.log(JSON.stringify(episodes, null, 2));
      console.log('=== CURRENT_EPISODES_JSON END ===');
    }
  }, [episodes]);

  const loadEpisodesForUrl = useCallback(async (overviewUrl, candidateTitle = '') => {
    if (!overviewUrl) return [];
    setLoadingEpisodes(true);
    setSelectedCandidateUrl(overviewUrl);
    setChallengeUrl(overviewUrl);
    addLog(`📥 [BÖLÜMLER] Sayfa yükleniyor: ${overviewUrl}`, 'info');

    try {
      const startTime = Date.now();
      const { status, html, size, error, ok } = await fetchHtml(overviewUrl, 12000);
      const duration = Date.now() - startTime;

      if (error) {
        addLog(`❌ [HATA] Bölüm sayfası isteği başarısız (${duration}ms): ${error}`, 'error');
        if (WebView) {
          addLog(`🛡️ Doğrudan HTTP başarısız, WebView köprüsü açılıyor...`, 'warn');
          setChallengeUrl(overviewUrl);
          setIsChallengeModalVisible(true);
        } else {
          setLoadingEpisodes(false);
        }
        return [];
      }

      if (status === 404) {
        addLog(`ℹ️ [404] Bu adres bulunamadı: ${overviewUrl}`, 'info');
        return [];
      }

      const titleMatch = html ? html.match(/<title>([^<]*)<\/title>/i) : null;
      const pageTitle = titleMatch ? titleMatch[1].trim() : 'Başlık yok';
      addLog(`📡 [HTTP] Durum: ${status} | Boyut: ${size} B | Süre: ${duration}ms | Başlık: "${pageTitle}"`, ok ? 'success' : 'warn');

      if (isBotBlocked(html, size) || status === 403) {
        addLog(`🛡️ [ENGEL] Bölüm sayfası Cloudflare/Bot doğrulamasına takıldı (HTTP ${status})`, 'warn');
      }

      const currentSeason = (seasons && seasons.find(s => s && String(s._id) === String(activeMongoId))) || (seasons && seasons[0]) || null;
      const currentAnimeData = anime || passedAnime;
      const targetFormat = currentAnimeData?.format || 'TV';
      const targetTotal = currentAnimeData?.episodes || currentSeason?.episodes || 0;
      const targetTitle = candidateTitle || currentSeason?.title || currentAnimeData?.title || initialTitle || '';
      const rawEps = await fetchEpisodesForAnime(overviewUrl, targetTotal, targetTitle, targetFormat);
      if (rawEps && rawEps.length > 0) {
        const formattedEps = formatAndFilterEpisodes(rawEps, activeMongoId, targetTotal, targetTitle, currentAnimeData?.banner_image || currentAnimeData?.cover_image, targetFormat);
        setEpisodes(formattedEps);
        addLog(`🎉 [TAMAMLANDI] ${formattedEps.length} adet bölüm listelendi!`, 'success');

        seasonCacheRef.current[activeMongoId] = {
          ...(seasonCacheRef.current[activeMongoId] || {}),
          episodes: formattedEps,
          selectedCandidateUrl: overviewUrl
        };
        return formattedEps;
      } else {
        if (WebView && (isBotBlocked(html, size) || status === 403)) {
          addLog(`🛡️ Doğrudan HTTP engelli (403). WebView köprüsü açılıyor...`, 'warn');
          setChallengeUrl(overviewUrl);
          setIsChallengeModalVisible(true);
          return [];
        } else {
          addLog(`⚠️ [UYARI] Bu sayfadan oynatılabilir bölüm ayrıştırılamadı.`, 'warn');
          return [];
        }
      }
    } catch (err) {
      addLog(`❌ [HATA] Bölüm yüklenirken hata: ${err.message}`, 'error');
      if (WebView) {
        setChallengeUrl(overviewUrl);
        setIsChallengeModalVisible(true);
      } else {
        setEpisodes([]);
      }
      return [];
    } finally {
      setLoadingEpisodes(false);
    }
  }, [activeMongoId, addLog, seasons, anime, passedAnime, initialTitle]);



  // ── Load user status ─────────────────────────────────────────
  useEffect(() => {
    if (user && activeMongoId) {
      getProfileData().then(data => {
        if (data?.favorites) {
          setIsFavorite(data.favorites.some(f => (f._id || f) === activeMongoId));
        }
        if (data?.customLists) {
          setCustomLists(data.customLists);
        }
      });
    }
  }, [user, activeMongoId]);

  // ── Fetch Details & Episodes ─────────────────────────────────
  // ── Fetch Details from AniList & Immediately trigger Tranimeizle search ──
  useEffect(() => {
    let cancelled = false;
    const anilistId = anime?.anilist_id || passedAnime?.anilist_id || (typeof initialId === 'number' ? initialId : parseInt(initialId, 10));

    const cached = seasonCacheRef.current[activeMongoId];
    if (cached) {
      if (cached.anime) setAnime(cached.anime);
      if (cached.episodes && cached.episodes.length > 0) {
        const cleaned = formatAndFilterEpisodes(cached.episodes, activeMongoId, cached.anime?.episodes || 0, cached.anime?.title);
        setEpisodes(cleaned);
        setLoadingEpisodes(false);
      }
      setLoading(false);
      fadeAnim.setValue(1);
    } else {
      setLoading(true);
      setLoadingEpisodes(true);
      fadeAnim.setValue(0);
    }

    async function loadAll() {
      try {
        let currentAnimeData = anime || passedAnime;
        let loadedSeasons = seasons;

        // 1. Fetch rich AniList details if anilistId is available
        if (anilistId) {
          if (!currentAnimeData || !currentAnimeData.synopsis || !currentAnimeData.relations || !currentAnimeData.relations.length) {
            const aniData = await fetchAniListDetails(anilistId);
            if (aniData && !cancelled) {
              currentAnimeData = { ...currentAnimeData, ...aniData };
              setAnime(currentAnimeData);
            }
          }

          // Build full chronological season chain (Sezon 1, 2, 3...)
          const isMovie = (currentAnimeData?.format || '').toUpperCase() === 'MOVIE' || (passedAnime?.format || '').toUpperCase() === 'MOVIE';
          if (!isMovie && currentAnimeData && (!loadedSeasons || loadedSeasons.length <= 1)) {
            const chain = await fetchFullSeasonChain(currentAnimeData);
            if (chain && chain.length > 0 && !cancelled) {
              loadedSeasons = chain;
              setSeasons(chain);
            }
          } else if (isMovie && !cancelled) {
            loadedSeasons = [];
            setSeasons([]);
          }
        }

        if (!cancelled) setLoading(false);

        // 2. Arama yap -> ilk çıkan sonucun içindeki linke git -> ordan bölümleri çekip listele!
        const isMovie = (currentAnimeData?.format || '').toUpperCase() === 'MOVIE' || (passedAnime?.format || '').toUpperCase() === 'MOVIE';
        const activeSeasonList = (!isMovie && loadedSeasons && loadedSeasons.length > 0) ? loadedSeasons : (!isMovie ? seasons : []);
        let currentSeason = null;

        // 1. Tıklanan kartın spesifik bir sezon numarası, Final Sezon veya kısım (Part) varsa
        // İlk açılışta KESİNLİKLE o sezon ve kısma git!
        if (!isMovie && (clickedSeasonNum > 0 || clickedIsFinal) && !hasAppliedInitialSeasonRef.current && activeSeasonList && activeSeasonList.length > 0) {
          let matchBySeason = null;
          if (clickedSeasonNum > 0) {
            if (clickedPartNum > 1) {
              matchBySeason = activeSeasonList.find(s => s.season_number === clickedSeasonNum && (s.part_number || 1) === clickedPartNum);
            }
            if (!matchBySeason) {
              matchBySeason = activeSeasonList.find(s => s.season_number === clickedSeasonNum);
            }
          } else if (clickedIsFinal) {
            if (clickedPartNum > 1) {
              matchBySeason = activeSeasonList.find(s => (s.is_final || (s.label && /final/i.test(s.label))) && (s.part_number || 1) === clickedPartNum);
            }
            if (!matchBySeason) {
              matchBySeason = activeSeasonList.find(s => s.is_final || (s.label && /final/i.test(s.label)));
            }
          }
          if (matchBySeason) {
            currentSeason = matchBySeason;
            hasAppliedInitialSeasonRef.current = true;
            if (currentSeason._id && String(currentSeason._id) !== String(activeMongoId)) {
              setActiveMongoId(currentSeason._id);
            }
          }
        }

        // 2. ID eşleşmesi (kullanıcı sekme değiştirdiğinde veya ID ile direkt eşleştiğinde)
        if (!isMovie && !currentSeason && activeMongoId && activeSeasonList && activeSeasonList.length > 0) {
          currentSeason = activeSeasonList.find(s => s && (String(s._id) === String(activeMongoId) || String(s.anilist_id) === String(activeMongoId)));
        }

        // 3. Bulunamadıysa başlık sezonuna, kısmına veya final durumuna göre ara
        if (!isMovie && !currentSeason && activeSeasonList && activeSeasonList.length > 0) {
          const rawSearchT = currentAnimeData?.title || currentAnimeData?.title_romaji || currentAnimeData?.title_english || initialTitle;
          const targetInitNum = detectSeasonNumber(rawSearchT, 0);
          const targetInitPart = detectPartNumber(rawSearchT, 1);
          const targetInitFinal = /(?:final\s*(?:season|sezon)|the\s*final|son\s*sezon|\(final\)|\bfinal\b)/i.test(rawSearchT);
          if (targetInitNum > 0) {
            if (targetInitPart > 1) {
              currentSeason = activeSeasonList.find(s => s.season_number === targetInitNum && (s.part_number || 1) === targetInitPart);
            }
            if (!currentSeason) {
              currentSeason = activeSeasonList.find(s => s.season_number === targetInitNum);
            }
          } else if (targetInitFinal) {
            currentSeason = activeSeasonList.find(s => s.is_final || (s.label && /final/i.test(s.label)));
          }
          if (!currentSeason) {
            const currentAnimeId = String(currentAnimeData?.id || currentAnimeData?.anilist_id || currentAnimeData?._id || '');
            const matchInList = activeSeasonList.find(s => s && (String(s._id) === currentAnimeId || String(s.anilist_id) === currentAnimeId));
            if (matchInList) {
              currentSeason = matchInList;
            } else {
              currentSeason = activeSeasonList[0];
            }
          }
          if (currentSeason && currentSeason._id && String(currentSeason._id) !== String(activeMongoId)) {
            setActiveMongoId(currentSeason._id);
          }
        }
        const targetTitle = currentSeason?.title || currentSeason?.label || currentAnimeData?.title_romaji || currentAnimeData?.title || currentAnimeData?.orijinal_ad || initialTitle || '';
        const seasonNum = currentSeason?.season_number || detectSeasonNumber(currentSeason?.title || currentSeason?.label || targetTitle, 1);
        const partNum = currentSeason?.part_number || detectPartNumber(currentSeason?.title || currentSeason?.label || targetTitle, 1);
        const isFinal = Boolean(currentSeason?.is_final || /(?:final\s*(?:season|sezon)|the\s*final|son\s*sezon|\(final\))/i.test(currentSeason?.title || currentSeason?.label || targetTitle));
        const targetTotal = currentAnimeData?.episodes || currentSeason?.episodes || 0;
        const targetFormat = currentAnimeData?.format || 'TV';

        const searchPayload = {
          title_romaji: currentSeason?.title_romaji || currentSeason?.node?.title_romaji || currentAnimeData?.title_romaji || currentAnimeData?.titleRomaji || '',
          title_english: currentSeason?.title_english || currentSeason?.node?.title_english || currentAnimeData?.title_english || currentAnimeData?.titleEnglish || '',
          title: currentSeason?.title || currentSeason?.label || currentAnimeData?.title || initialTitle || '',
          season_title: currentSeason?.label || currentSeason?.title || '',
          orijinal_ad: currentSeason?.node?.orijinal_ad || currentAnimeData?.orijinal_ad || '',
          synonyms: [
            ...(currentSeason?.node?.synonyms || []),
            ...(currentAnimeData?.synonyms || [])
          ],
          episodes: targetTotal,
          format: targetFormat,
          part_number: partNum,
          is_final: isFinal
        };

        // Önbellek kontrolü (Eğer bu sezon zaten çekildiyse anında yükle)
        const cachedSeasonData = seasonCacheRef.current[activeMongoId];
        if (cachedSeasonData && cachedSeasonData.episodes && cachedSeasonData.episodes.length > 0) {
          const cleaned = formatAndFilterEpisodes(cachedSeasonData.episodes, activeMongoId, targetTotal, targetTitle, currentAnimeData?.banner_image || currentAnimeData?.cover_image, targetFormat);
          if (!cancelled) {
            setEpisodes(cleaned);
            setLoadingEpisodes(false);
          }
          return;
        }

        // Çıkmamış / Henüz Yayınlanmamış Anime ve Sezon Kontrolü
        const isCurrentSeasonUpcoming = isAnimeUpcoming(currentSeason);
        const isWholeAnimeUpcoming = (!currentSeason || (seasons && seasons.length <= 1)) && isAnimeUpcoming(currentAnimeData);
        if (isCurrentSeasonUpcoming || isWholeAnimeUpcoming) {
          const relDate = formatReleaseDateTr(currentSeason || currentAnimeData);
          const formattedLogDate = relDate && relDate !== 'Yakında' ? `${relDate} tarihinde çıkacak` : 'yakında çıkacak';
          addLog(`📅 Bu anime / sezon henüz yayınlanmadı (${formattedLogDate}). Sitede arama yapılmıyor.`, 'info');
          if (!cancelled) {
            setEpisodes([]);
            setLoadingEpisodes(false);
            setIsChallengeModalVisible(false);
          }
          return;
        }

        if (targetTitle) {
          setSearchQueryInput(targetTitle);
          addLog(`🚀 Sezon ${seasonNum}${partNum > 1 ? ` (${partNum}. Kısım)` : ''} ("${targetTitle}") için arama yapılıp bölümler getiriliyor...`, 'info');
          if (!cancelled) {
            const pipelineRes = await searchAndExtractEpisodes(searchPayload, seasonNum);
            if (pipelineRes.success && pipelineRes.episodes.length > 0) {
              const formattedEps = formatAndFilterEpisodes(pipelineRes.episodes, activeMongoId, targetTotal, targetTitle, currentAnimeData?.banner_image || currentAnimeData?.cover_image, targetFormat);
              if (!cancelled) {
                setEpisodes(formattedEps);
                setLoadingEpisodes(false);
                addLog(`🎉 [BÖLÜMLER LİSTELENDİ] ${formattedEps.length} adet bölüm başarıyla yüklendi!`, 'success');
              }
              seasonCacheRef.current[activeMongoId] = {
                anime: currentAnimeData,
                episodes: formattedEps,
                selectedCandidateUrl: pipelineRes.targetUrl
              };
            } else {
              // HTTP başarısız (Cloudflare veya boş) — WebView Arama Fallback
              let bestQuery = pipelineRes.bestSearchQuery;
              if (!bestQuery) {
                const baseQuery = getCleanSearchQuery(currentAnimeData?.title_romaji || currentAnimeData?.title || targetTitle);
                if (isFinal && partNum > 1) {
                  bestQuery = `${baseQuery} Final Sezon ${partNum}. Kısım`;
                } else if (partNum > 1) {
                  bestQuery = `${baseQuery} ${seasonNum}. Sezon ${partNum}. Kısım`;
                } else if (isFinal) {
                  bestQuery = `${baseQuery} Final Sezon`;
                } else if (seasonNum > 1) {
                  bestQuery = `${baseQuery} ${seasonNum}. Sezon`;
                } else {
                  bestQuery = baseQuery;
                }
              }
              const searchUrl = `${BASE_URL}/arama/${encodeURIComponent(bestQuery)}`;
              addLog(`🌐 [WEBVIEW ARAMA] Site içi arama sayfasına gidiliyor: ${searchUrl}`, 'info');
              setSelectedCandidateUrl(searchUrl);
              setChallengeUrl(searchUrl);
              if (WebView && !cancelled) {
                setIsChallengeModalVisible(true);
              }
            }
          }
        }
      } catch (err) {
        console.warn('[Detail] Error loading detail/episodes:', err.message);
        if (!cancelled && !cached) setEpisodes([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoadingEpisodes(false);
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }).start();
        }
      }
    }

    loadAll();

    return () => {
      cancelled = true;
    };
  }, [activeMongoId]);

  // ── Handlers ─────────────────────────────────────────────────
  const handleSeasonSelect = useCallback((seasonId) => {
    if (seasonId === activeMongoId) return;
    setActiveMongoId(seasonId);
  }, [activeMongoId]);

  const handleToggleFavorite = async () => {
    if (!user) {
      showAlert('Giriş Gerekli', 'Favorilere eklemek için lütfen giriş yapın.');
      return;
    }
    if (!activeMongoId) return;
    const res = await toggleFavorite(activeMongoId);
    if (res?.success) {
      setIsFavorite(res.isFavorite);
    }
  };

  const handleToggleAnimeInList = async (listId) => {
    if (!activeMongoId) return;
    const res = await toggleAnimeInList(listId, activeMongoId);
    if (res?.success) {
      setCustomLists(res.customLists);
    }
  };


  // ── Derived dynamic values ───────────────────────────────────
  const mainTitleEn = anime?.title || anime?.anime_title || initialTitle || 'Loading...';
  const mainTitleJp = anime?.romajiTitle || anime?.orijinal_ad || passedAnime?.orijinal_ad || '';
  const animeType = anime?.format || passedAnime?.format || 'TV';
  
  // Use passed images as fallback to prevent slow loading flashes
  const bannerImage = anime?.banner_image || anime?.bannerImage || passedAnime?.banner_image || passedAnime?.bannerImage || passedEntry?.banner_image || null;
  const coverImage = anime?.cover_image || anime?.coverImage || passedAnime?.cover_image || passedAnime?.coverImage || passedEntry?.cover_image || null;
  
  const description = anime?.description && typeof anime.description === 'string'
    ? anime.description.replace(/<[^>]+>/g, '').replace(/\n+/g, ' ').trim()
    : null;
    
  const genresRaw = anime?.genres || anime?.enrichedGenres || passedAnime?.genres || [];
  const genres = Array.isArray(genresRaw)
    ? genresRaw
    : (typeof genresRaw === 'string' ? genresRaw.split(',').map(g => g.trim()).filter(Boolean) : []);
    
  const averageScore = anime?.averageScore || anime?.average_score || passedAnime?.average_score || null;

  // Active Label resolution
  const activeLabel = (activeMongoId && seasons && seasons.find(s => s && String(s._id) === String(activeMongoId))?.label) ||
                      (activeMongoId && relatedMoviesOvas && relatedMoviesOvas.find(m => m && String(m._id) === String(activeMongoId))?.title) ||
                      'Sezon 1';

  // ── Render Episode Card ──────────────────────────────────────
  const renderEpisodeCard = useCallback(({ item }) => {
    const hasThumb = Boolean(item.thumbnail);

    return (
      <TouchableOpacity
        style={styles.episodeCard}
        activeOpacity={0.8}
        onPress={() => {
          if (user) {
            addToHistory(activeMongoId, item.episode_number);
          }
          navigation.navigate('Resolve', {
            animeId: activeMongoId,
            episodeNumber: item.episode_number,
            episodeTitle: item.episode_title || `${item.episode_number}. Bölüm`,
            animeTitle: mainTitleEn,
            anilistId: anime?.anilist_id || null,
            fansubs: anime?.fansubs || [],
            episodeUrl: item.url,
            episodes: episodes
          });
        }}
      >
        {hasThumb ? (
          <View style={styles.episodeThumbnailContainer}>
            <Image
              source={{ uri: item.thumbnail }}
              style={styles.episodeThumbnail}
              contentFit="cover"
              transition={200}
            />
            <View style={styles.episodeThumbnailOverlay} />
            <View style={styles.episodeThumbNumberBadge}>
              <Text style={styles.episodeThumbNumberText}>#{item.episode_number}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.episodeNumberBadge}>
            <Text style={styles.episodeNumberText}>{item.episode_number}</Text>
          </View>
        )}

        <View style={styles.episodeInfo}>
          <Text style={styles.episodeTitle} numberOfLines={2}>
            {item.episode_title || `${item.episode_number}. Bölüm`}
          </Text>
          <View style={styles.episodeDateRow}>
            <Ionicons
              name={item.release_date ? "calendar-outline" : "play-circle-outline"}
              size={12}
              color={COLORS.accent}
            />
            <Text style={styles.episodeDateText}>
              {item.release_date || (item.source_url ? 'Hazır' : 'HD')}
            </Text>
          </View>
        </View>

        <View style={styles.episodePlayButton}>
          <Ionicons name="play" size={16} color={COLORS.accent} />
        </View>
      </TouchableOpacity>
    );
  }, [activeMongoId, mainTitleEn, navigation, user, episodes, anime]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Banner + Poster Header ──────────────────── */}
        <View style={styles.bannerContainer}>
          {bannerImage ? (
            <Image
              source={{ uri: bannerImage }}
              style={styles.bannerImage}
              contentFit="cover"
              blurRadius={2}
            />
          ) : coverImage ? (
            <Image
              source={{ uri: coverImage }}
              style={styles.bannerImage}
              contentFit="cover"
              blurRadius={8}
            />
          ) : (
            <View style={[styles.bannerImage, styles.bannerPlaceholder]} />
          )}

          <LinearGradient
            colors={[
              'rgba(9, 9, 14, 0.20)',
              'rgba(9, 9, 14, 0.60)',
              'rgba(9, 9, 14, 0.95)',
              COLORS.bgPrimary,
            ]}
            locations={[0, 0.4, 0.75, 1]}
            style={styles.bannerGradient}
          />

          {/* Back button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>

          {/* Poster + Title overlay */}
          <View style={styles.headerOverlay}>
            <View>
              {coverImage ? (
                <Image source={{ uri: coverImage }} style={styles.posterImage} contentFit="cover" />
              ) : (
                <View style={[styles.posterImage, styles.posterPlaceholder]}>
                  <Ionicons name="image-outline" size={40} color={COLORS.textMuted} />
                </View>
              )}
            </View>

            <View style={styles.titleContainer}>
              <Text style={styles.mainTitle} numberOfLines={3}>{mainTitleEn}</Text>
              {mainTitleJp && mainTitleJp !== mainTitleEn && (
                <Text style={styles.jpTitleText} numberOfLines={2}>{mainTitleJp}</Text>
              )}
              <View style={styles.typeBadgeRow}>
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>{animeType}</Text>
                </View>
                {averageScore && (
                  <View style={styles.scoreBadge}>
                    <Ionicons name="star" size={12} color="#FFD700" />
                    <Text style={styles.scoreText}>{averageScore}%</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* ── Action Buttons ──────────────────────────── */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionButton} onPress={handleToggleFavorite} activeOpacity={0.7}>
            <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={22} color={isFavorite ? COLORS.error : COLORS.textPrimary} />
            <Text style={styles.actionText}>{isFavorite ? 'Favorilerde' : 'Favorile'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => setIsListModalVisible(true)} activeOpacity={0.7}>
            <Ionicons name="list-outline" size={22} color={COLORS.textPrimary} />
            <Text style={styles.actionText}>Listeye Ekle</Text>
          </TouchableOpacity>
        </View>

        {/* ── Description ─────────────────────────────── */}
        {description && (
          <View style={styles.section}>
            <Text
              style={styles.descriptionText}
              numberOfLines={showFullDescription ? undefined : 4}
            >
              {description}
            </Text>
            {description.length > 200 && (
              <TouchableOpacity onPress={() => setShowFullDescription(!showFullDescription)}>
                <Text style={styles.showMoreText}>
                  {showFullDescription ? 'Daha az göster' : 'Devamını oku'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Genres ──────────────────────────────────── */}
        {genres.length > 0 && (
          <View style={styles.genreRow}>
            {genres.map((genre, i) => (
              <View key={i} style={styles.genreChip}>
                <Text style={styles.genreText}>{genre}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Season Selector ─────────────────────────── */}
        {seasons && seasons.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sezonlar</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
              {seasons.map((season, index) => {
                if (!season) return null;
                const isActive = season._id && String(season._id) === String(activeMongoId);
                return (
                  <TouchableOpacity
                    key={season._id || index}
                    style={[styles.pill, isActive && styles.pillActive]}
                    onPress={() => season._id && handleSeasonSelect(season._id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
                      {season.label || `Sezon ${season.season_number || index + 1}`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Related Movies (Sadece Filmler) ─────────────── */}
        {relatedMoviesOvas && relatedMoviesOvas.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>İlgili Filmler</Text>
            <FlatList
              horizontal
              data={relatedMoviesOvas}
              keyExtractor={(item, i) => item?._id || `movie-${i}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.movieListContent}
              renderItem={({ item }) => {
                if (!item) return null;
                const isActive = item._id && String(item._id) === String(activeMongoId);
                return (
                  <TouchableOpacity
                    style={[styles.movieCard, isActive && styles.movieCardActive]}
                    onPress={() => item._id && handleSeasonSelect(item._id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.movieIconContainer}>
                      <Ionicons name="film-outline" size={24} color={isActive ? COLORS.accent : COLORS.textMuted} />
                    </View>
                    <Text style={[styles.movieTitle, isActive && styles.movieTitleActive]} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <View style={[styles.movieFormatBadge, isActive && styles.movieFormatBadgeActive]}>
                      <Text style={[styles.movieFormatText, isActive && styles.movieFormatTextActive]}>
                        {item.format}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        )}

        {/* ── Canlı Bot & Çözücü Günlüğü (Ana Ekran) ── */}
        {logs.length > 0 && (
          <View style={[styles.modalLogContainer, { marginHorizontal: SPACING.md, marginBottom: 12, borderRadius: 8, borderWidth: 1, borderColor: '#30363D', overflow: 'hidden' }]}>
            <TouchableOpacity 
              style={styles.modalLogHeader} 
              onPress={() => setIsLogExpanded(prev => !prev)}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[styles.logStatusDot, { backgroundColor: logs.some(l => l.type === 'error') ? '#FF5555' : (logs.some(l => l.type === 'success') ? '#50FA7B' : '#00E5FF') }]} />
                <Text style={styles.modalLogTitle}>⚡ Canlı Bot Günlüğü ({logs.length})</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TouchableOpacity 
                  onPress={() => setLogs([])} 
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={{ color: '#FF79C6', fontSize: 11 }}>Temizle</Text>
                </TouchableOpacity>
                <Ionicons name={isLogExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#00E5FF" />
              </View>
            </TouchableOpacity>
            {isLogExpanded && (
              <ScrollView 
                style={styles.modalLogList} 
                contentContainerStyle={{ padding: 6 }}
                nestedScrollEnabled={true}
              >
                {logs.slice(0, 30).map((logItem) => (
                  <View key={logItem.id} style={styles.logRow}>
                    <Text style={styles.logTime}>[{logItem.time}]</Text>
                    <Text style={[
                      styles.logText,
                      logItem.type === 'success' && { color: '#50FA7B' },
                      logItem.type === 'warn' && { color: '#FFB86C' },
                      logItem.type === 'error' && { color: '#FF5555' },
                      logItem.type === 'info' && { color: '#8BE9FD' },
                    ]}>
                      {logItem.message}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* ── Episodes Grid ───────────────────────────── */}
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md }}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>
              {activeLabel} — {isCurrentSeasonUpcoming ? 'Yayın Bilgisi' : `Bölümler ${episodes.length > 0 ? `(${episodes.length})` : ''}`}
            </Text>
            {episodes.length > 0 && (
              <TouchableOpacity
                onPress={() => setIsJsonModalVisible(true)}
                style={styles.jsonBadgeBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="code-slash" size={13} color="#00E5FF" />
                <Text style={styles.jsonBadgeBtnText}>JSON ({episodes.length})</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Cloudflare blocked notice if needed */}
          {searchStatus === 'blocked' && episodes.length === 0 && !isCurrentSeasonUpcoming && (
            <View style={styles.blockedNoticeBox}>
              <Ionicons name="shield-outline" size={20} color="#FFB86C" />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.blockedNoticeTitle}>Cloudflare Doğrulaması</Text>
                <Text style={styles.blockedNoticeDesc}>
                  Bölüm listesini yükleyebilmek için lütfen doğrulamayı tamamlayın.
                </Text>
              </View>
              {WebView && (
                <TouchableOpacity
                  style={styles.solveChallengeBtn}
                  onPress={() => setIsChallengeModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.solveChallengeBtnText}>Doğrula</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {loadingEpisodes ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.accent} />
              <Text style={styles.loadingText}>Bölümler yükleniyor...</Text>
            </View>
          ) : isCurrentSeasonUpcoming ? (
            <View style={styles.upcomingCard}>
              <View style={styles.upcomingHeader}>
                <View style={styles.upcomingBadge}>
                  <Ionicons name="calendar-outline" size={13} color="#00E5FF" />
                  <Text style={styles.upcomingBadgeText}>HENÜZ YAYINLANMADI</Text>
                </View>
                <View style={styles.upcomingBellCircle}>
                  <Ionicons name="notifications" size={18} color={COLORS.accent} />
                </View>
              </View>

              <Text style={styles.upcomingDateTitle}>
                {releaseDateStr && releaseDateStr !== 'Yakında' ? `${releaseDateStr} Tarihinde Çıkacak` : 'Yakında Çıkacak'}
              </Text>
              
              <Text style={styles.upcomingDescription}>
                Bu anime henüz vizyona girmedi veya yayınlanmadı. Favorilerine ekle, ilk bölüm çıktığında ve yeni bölümleri geldiğinde sana anında bildirim gönderelim!
              </Text>

              <TouchableOpacity
                style={[
                  styles.upcomingFavBtn,
                  isFavorite && styles.upcomingFavBtnActive
                ]}
                onPress={handleToggleFavorite}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={isFavorite ? "heart" : "heart-outline"}
                  size={18}
                  color={isFavorite ? "#FFF" : "#000"}
                />
                <Text style={[
                  styles.upcomingFavBtnText,
                  isFavorite && styles.upcomingFavBtnTextActive
                ]}>
                  {isFavorite ? 'Favorilerinde (Bildirimler Açık)' : 'Favorile — Geldiğinde Bildirim Gönder'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : episodes.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="videocam-off-outline" size={40} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>Bu sezon için henüz oynatılabilir bölüm bulunamadı.</Text>
            </View>
          ) : (
            <Animated.View style={{ opacity: fadeAnim }}>
              {episodes.map((ep, epIdx) => (
                <View key={ep._id || `ep-${ep.episode_number}-${epIdx}`}>
                  {renderEpisodeCard({ item: ep })}
                </View>
              ))}
            </Animated.View>
          )}
        </View>

        {/* Bottom spacing */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Custom List Modal ─────────────────────────── */}
      <Modal
        visible={isListModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsListModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsListModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Listeye Ekle</Text>
            {customLists.length === 0 ? (
              <Text style={styles.modalEmptyText}>Henüz bir liste oluşturmadınız.</Text>
            ) : (
              customLists.map((list) => {
                const isInList = list.animes?.some(a => (a._id || a) === activeMongoId);
                return (
                  <TouchableOpacity
                    key={list._id}
                    style={styles.modalListItem}
                    onPress={() => handleToggleAnimeInList(list._id)}
                  >
                    <Ionicons
                      name={isInList ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={isInList ? COLORS.accent : COLORS.textSecondary}
                    />
                    <Text style={styles.modalListText}>{list.name}</Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Cloudflare Turnstile Solver Modal ── */}
      {WebView && (
        <Modal
          visible={isChallengeModalVisible}
          transparent={false}
          animationType="slide"
          onRequestClose={() => setIsChallengeModalVisible(false)}
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: '#0D1117' }}>
            <View style={styles.challengeModalHeader}>
              <TouchableOpacity
                onPress={() => setIsChallengeModalVisible(false)}
                style={styles.challengeCloseBtn}
              >
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
              <Text style={styles.challengeModalTitle}>Bot Koruması</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => {
                    addLog('⚡ [MANUEL ÇÖZÜCÜ] Bot çözücü zorla tetiklendi!', 'info');
                    webViewRef.current?.injectJavaScript(activeHeartbeatJs);
                  }}
                  style={[styles.challengeDoneBtn, { backgroundColor: '#00E5FF' }]}
                >
                  <Text style={[styles.challengeDoneBtnText, { color: '#000' }]}>⚡ Çöz</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    addLog('🔄 [WEBVIEW] Sayfa yeniden yükleniyor...', 'info');
                    webViewRef.current?.reload();
                  }}
                  style={styles.challengeDoneBtn}
                >
                  <Text style={styles.challengeDoneBtnText}>Yenile</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Canlı Bot & Çözücü Günlüğü (Log Konsolu) ── */}
            <View style={styles.modalLogContainer}>
              <TouchableOpacity 
                style={styles.modalLogHeader} 
                onPress={() => setIsLogExpanded(prev => !prev)}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[styles.logStatusDot, { backgroundColor: logs.some(l => l.type === 'error') ? '#FF5555' : (logs.some(l => l.type === 'success') ? '#50FA7B' : '#00E5FF') }]} />
                  <Text style={styles.modalLogTitle}>⚡ Canlı Bot Log Konsolu ({logs.length})</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <TouchableOpacity 
                    onPress={() => setLogs([])} 
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={{ color: '#FF79C6', fontSize: 11 }}>Temizle</Text>
                  </TouchableOpacity>
                  <Ionicons name={isLogExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#00E5FF" />
                </View>
              </TouchableOpacity>
              {isLogExpanded && (
                <ScrollView 
                  style={styles.modalLogList} 
                  contentContainerStyle={{ padding: 6 }}
                  nestedScrollEnabled={true}
                >
                  {logs.length === 0 ? (
                    <Text style={styles.emptyLogText}>Henüz log kaydı yok. Sayfa bekleniyor...</Text>
                  ) : (
                    logs.slice(0, 40).map((logItem) => (
                      <View key={logItem.id} style={styles.logRow}>
                        <Text style={styles.logTime}>[{logItem.time}]</Text>
                        <Text style={[
                          styles.logText,
                          logItem.type === 'success' && { color: '#50FA7B' },
                          logItem.type === 'warn' && { color: '#FFB86C' },
                          logItem.type === 'error' && { color: '#FF5555' },
                          logItem.type === 'info' && { color: '#8BE9FD' },
                        ]}>
                          {logItem.message}
                        </Text>
                      </View>
                    ))
                  )}
                </ScrollView>
              )}
            </View>

            <WebView
              ref={webViewRef}
              source={{ uri: challengeUrl || (() => {
                const ct = getCleanSearchQuery(anime?.title_romaji || anime?.title || initialTitle || 'anime');
                return `${BASE_URL}/arama/${encodeURIComponent(ct)}`;
              })() }}
              style={{ flex: 1 }}
              userAgent="Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36"
              sharedCookiesEnabled={true}
              thirdPartyCookiesEnabled={true}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              javaScriptCanOpenWindowsAutomatically={true}
              setSupportMultipleWindows={false}
              androidLayerType="hardware"
              mixedContentMode="always"
              injectedJavaScriptBeforeContentLoaded={activeHeartbeatJs}
              injectedJavaScript={activeHeartbeatJs}
              onLoadStart={() => {
                webViewRef.current?.injectJavaScript(activeHeartbeatJs);
              }}
              onLoadProgress={({ nativeEvent }) => {
                if (nativeEvent.progress > 0.3) {
                  webViewRef.current?.injectJavaScript(activeHeartbeatJs);
                }
              }}
              onLoadEnd={() => {
                webViewRef.current?.injectJavaScript(activeHeartbeatJs);
              }}
              onMessage={(event) => {
                try {
                  const data = JSON.parse(event.nativeEvent.data);
                  if (data.type === 'log') {
                    addLog(data.message, 'info');
                  } else if (data.type === 'network_challenge_detected') {
                    addLog(`🛡️ Bot koruma kontrolü: ${data.questionText}`, 'warn');
                  } else if (data.type === 'captcha_detected') {
                    addLog('🛡️ Bot koruması algılandı, doğrudan HTTP API ile çözülüyor...', 'warn');
                  } else if (data.type === 'captcha_solved') {
                    addLog(`🎉 Doğru görsel HTTP isteğiyle onaylandı! (Hash: ${data.hash ? data.hash.substring(0, 8) : ''}...)`, 'success');
                  } else if (data.type === 'candidates_extracted' && Array.isArray(data.candidates) && data.candidates.length > 0) {
                    // ARAMA SONUÇLARINI LİSTELEME — DOĞRUDAN İLK SONUCUN LİNKİNE GİT!
                    // KESİNLİKLE SPECIAL / OVA ADAYLARINI ELİYORUZ!
                    const currentSeason = (seasons && seasons.find(s => s && String(s._id) === String(activeMongoId))) || (seasons && seasons[0]) || null;
                    const currentAnimeData = anime || passedAnime;
                    const isTvOrMovie = (!currentAnimeData?.format || currentAnimeData.format === 'TV' || currentAnimeData.format === 'MOVIE');
                    const validCandidates = data.candidates.filter(c => !isSpecial(c));
                    const pool = isTvOrMovie ? validCandidates : (validCandidates.length > 0 ? validCandidates : data.candidates);
                    data.candidates = pool;
                    addLog(`🔍 WebView arama sonucu: ${data.candidates.length} aday bulundu, ilk sonuca gidiliyor...`, 'info');
                    allCandidatesRef.current = data.candidates;
                    const rawCandidateTargetT = currentSeason?.title || currentSeason?.label || currentAnimeData?.title_romaji || currentAnimeData?.title || initialTitle;
                    const seasonNum = currentSeason?.season_number || detectSeasonNumber(rawCandidateTargetT, 1);
                    const partNum = currentSeason?.part_number || detectPartNumber(rawCandidateTargetT, 1);
                    const isFinal = Boolean(currentSeason?.is_final || /(?:final\s*(?:season|sezon)|the\s*final|son\s*sezon|\(final\))/i.test(rawCandidateTargetT));

                    const animeMatchingPayload = {
                      title_romaji: currentSeason?.node?.title_romaji || currentAnimeData?.title_romaji || currentAnimeData?.titleRomaji || '',
                      title_english: currentSeason?.node?.title_english || currentAnimeData?.title_english || currentAnimeData?.titleEnglish || '',
                      title: currentSeason?.title || currentSeason?.label || currentAnimeData?.title || initialTitle || '',
                      orijinal_ad: currentSeason?.node?.orijinal_ad || currentAnimeData?.orijinal_ad || '',
                      synonyms: [
                        ...(currentSeason?.node?.synonyms || []),
                        ...(currentAnimeData?.synonyms || [])
                      ],
                      format: currentAnimeData?.format || 'TV',
                      part_number: partNum,
                      is_final: isFinal
                    };

                    // Otomatik sezon butonları (eğer mevcut sezon listesi 1 veya boşsa)
                    if (!seasons || seasons.length <= 1) {
                      const derived = extractSeasonsFromCandidates(data.candidates, activeMongoId);
                      if (derived.length > 1) {
                        setSeasons(derived);
                        const matchActive = derived.find(s => s.season_number === seasonNum) || derived[0];
                        if (matchActive && matchActive._id) {
                          setActiveMongoId(matchActive._id);
                        }
                      }
                    }

                    const matchedSeasonUrl = matchCandidateForSeason(data.candidates, seasonNum, animeMatchingPayload);
                    let targetUrl = matchedSeasonUrl;
                    if (!targetUrl && data.chosen && data.targetSeason === seasonNum && (!data.targetPart || data.targetPart === partNum)) {
                      targetUrl = data.chosen.url;
                    }
                    if (!targetUrl && seasonNum === 1 && partNum === 1 && Array.isArray(data.candidates)) {
                      const validS1Cand = data.candidates.find(c =>
                        !isSpecial(c) &&
                        !isMovie(c) &&
                        detectCandidateSeason(c.title, c.url) === 1 &&
                        detectPartNumber(c.title || c.url, 1) === 1
                      );
                      if (validS1Cand) {
                        targetUrl = validS1Cand.url;
                      }
                    }

                    if (targetUrl) {
                      const target = targetUrl.startsWith('http') ? targetUrl : `${BASE_URL}${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;
                      addLog(`🎯 [DOĞRU SEZONA GİDİLİYOR] Sezon ${seasonNum}${partNum > 1 ? ` (${partNum}. Kısım)` : ''} ➔ ${target}`, 'info');
                      setSelectedCandidateUrl(target);
                      setChallengeUrl(target);

                      // WebView'ı anime detay sayfasına yönlendir — bölümleri oradan çıkarsın!
                      if (webViewRef.current) {
                        webViewRef.current.injectJavaScript(`if (window.location.pathname.indexOf('/arama') !== -1 || window.location.href.indexOf('/arama') !== -1) { window.location.replace("${target}"); } true;`);
                      }
                    } else {
                      addLog(`⚠️ [SEZON BULUNAMADI] Sezon ${seasonNum}${partNum > 1 ? ` (${partNum}. Kısım)` : ''} için bu sayfada eşleşen aday yok. Otomatik sezona özel arama tetikleniyor...`, 'warn');
                      if ((seasonNum > 1 || partNum > 1 || isFinal) && webViewRef.current && !hasRetriedSeasonSearchRef.current[activeMongoId]) {
                        hasRetriedSeasonSearchRef.current[activeMongoId] = true;
                        let retryQuery = '';
                        if (isFinal && partNum > 1) {
                          retryQuery = `${targetTitleForJs} Final Sezon ${partNum}. Kısım`;
                        } else if (partNum > 1) {
                          retryQuery = `${targetTitleForJs} ${seasonNum}. Sezon ${partNum}. Kısım`;
                        } else if (isFinal) {
                          retryQuery = `${targetTitleForJs} Final Sezon`;
                        } else {
                          retryQuery = `${targetTitleForJs} ${seasonNum}. Sezon`;
                        }
                        const retryUrl = `${BASE_URL}/arama/${encodeURIComponent(retryQuery)}`;
                        addLog(`🔄 [ARAMA YENİLENİYOR] Sezon ${seasonNum}${partNum > 1 ? ` (${partNum}. Kısım)` : ''} için özel arama yapılıyor: ${retryUrl}`, 'info');
                        setSelectedCandidateUrl(retryUrl);
                        setChallengeUrl(retryUrl);
                        webViewRef.current.injectJavaScript(`window.location.replace("${retryUrl}"); true;`);
                      }
                    }
                  } else if (data.type === 'episodes_extracted' && Array.isArray(data.episodes) && data.episodes.length > 0) {
                    addLog(`🎉 WebView köprüsü üzerinden ${data.episodes.length} adet bölüm başarıyla çıkarıldı!`, 'success');
                    const currentSeason = (seasons && seasons.find(s => s && String(s._id) === String(activeMongoId))) || (seasons && seasons[0]) || null;
                    const currentAnimeData = anime || passedAnime;
                    const targetTotal = currentAnimeData?.episodes || currentSeason?.episodes || 0;
                    const targetTitle = currentSeason?.title || currentAnimeData?.title_romaji || currentAnimeData?.title || initialTitle || '';
                    const thumb = currentAnimeData?.banner_image || currentAnimeData?.cover_image || '';
                    const targetFormat = currentAnimeData?.format || 'TV';
                    let formatted = formatAndFilterEpisodes(data.episodes, activeMongoId, targetTotal, targetTitle, thumb, targetFormat);

                    if (!formatted || formatted.length === 0) {
                      // Güvenli Kurtarma Fallback'i: Eğer tümü filtrelendiyse bile data.episodes'u temel formatla kullan
                      formatted = data.episodes.map(e => ({
                        _id: `${activeMongoId || 'ep'}_${e.number}`,
                        episode_number: e.number,
                        episode_title: e.title || `${e.number}. Bölüm`,
                        url: e.url,
                        thumbnail: e.thumbnail || thumb || null,
                        release_date: e.release_date || null
                      }));
                    }

                    setEpisodes(formatted);
                    setLoadingEpisodes(false);
                    setIsChallengeModalVisible(false);
                    seasonCacheRef.current[activeMongoId] = {
                      anime: currentAnimeData,
                      episodes: formatted,
                      selectedCandidateUrl: challengeUrl || selectedCandidateUrl
                    };
                    addLog(`✅ [BAŞARILI] ${formatted.length} bölüm listelendi!`, 'success');
                  } else if (data.type === 'resolved') {
                    addLog('🎉 Doğrulama başarılı!', 'success');
                  }
                } catch(e) {}
              }}
              onShouldStartLoadWithRequest={(request) => {
                const url = (request.url || '').toLowerCase();
                const adKeywords = [
                  'syndication', 'clickadu', 'propellerads', 'adcash', 'adsterra',
                  'doubleclick', 'googleads', 'wargamings.net', 'maxihalisaha',
                  'deloplen', 'highcpmgate', 'monetag', 'cp-host', 'exdynsrv',
                  'popunder', 'betting', 'casino', 'popigram', 'bayigram',
                  'sosyalgram', 'sosyalevin', '1xbet'
                ];
                if (adKeywords.some(kw => url.includes(kw))) {
                  addLog(`🚫 [REKLAM ENGELLENDİ] ${request.url}`, 'info');
                  return false;
                }
                return true;
              }}
              onNavigationStateChange={(navState) => {
                addLog(`🌐 [WEBVIEW] URL: ${navState.url}`, 'info');
                if (navState.title && !navState.title.includes('Doğrulama') && !navState.title.includes('Just a moment')) {
                  addLog(`✅ [WEBVIEW] Sayfa: "${navState.title}"`, 'success');
                }
                webViewRef.current?.injectJavaScript(activeHeartbeatJs);
              }}
            />
          </SafeAreaView>
        </Modal>
      )}

      {/* ── Bölümler JSON İnceleme Modalı ── */}
      <Modal
        visible={isJsonModalVisible}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setIsJsonModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#0D1117' }}>
          <View style={styles.challengeModalHeader}>
            <TouchableOpacity
              onPress={() => setIsJsonModalVisible(false)}
              style={styles.challengeCloseBtn}
            >
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={[styles.challengeModalTitle, { flex: 1 }]}>Bölümler JSON ({episodes.length})</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                onPress={handleCopyJson}
                style={[
                  styles.challengeDoneBtn,
                  { 
                    backgroundColor: isJsonCopied ? '#50FA7B' : 'rgba(0, 229, 255, 0.2)',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 10
                  }
                ]}
              >
                <Ionicons name={isJsonCopied ? "checkmark" : "copy-outline"} size={13} color={isJsonCopied ? "#000" : "#00E5FF"} />
                <Text style={[styles.challengeDoneBtnText, { color: isJsonCopied ? "#000" : "#00E5FF" }]}>
                  {isJsonCopied ? 'Kopyalandı' : 'Kopyala'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleShareJson}
                style={[styles.challengeDoneBtn, { backgroundColor: 'rgba(255, 255, 255, 0.12)', paddingHorizontal: 8 }]}
              >
                <Ionicons name="share-social-outline" size={14} color="#FFF" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  console.log('=== EXTRACTED_EPISODES_JSON ===\n' + JSON.stringify(episodes, null, 2));
                  addLog('📋 JSON konsola ve terminale yazdırıldı!', 'info');
                }}
                style={styles.challengeDoneBtn}
              >
                <Text style={styles.challengeDoneBtnText}>Log'a Bas</Text>
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView style={{ flex: 1, padding: 12, backgroundColor: '#090D13' }}>
            <TextInput
              multiline
              editable={false}
              value={JSON.stringify(episodes, null, 2)}
              style={{
                color: '#50FA7B',
                fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                fontSize: 11,
                lineHeight: 16
              }}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  jsonBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    borderWidth: 1,
    borderColor: '#00E5FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  jsonBadgeBtnText: {
    color: '#00E5FF',
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.bold,
  },
  screen: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  scrollView: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.body,
  },

  // ── Banner ──────────────────────────────────────
  bannerContainer: {
    height: BANNER_HEIGHT + 80,
    position: 'relative',
  },
  bannerImage: {
    width: SCREEN_WIDTH,
    height: BANNER_HEIGHT,
    position: 'absolute',
    top: 0,
  },
  bannerPlaceholder: {
    backgroundColor: COLORS.bgElevated,
  },
  bannerGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: BANNER_HEIGHT + 80,
  },
  backButton: {
    position: 'absolute',
    top: SPACING.md,
    left: SPACING.lg,
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  headerOverlay: {
    position: 'absolute',
    bottom: 0,
    left: SPACING.lg,
    right: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING.lg,
  },

  // ── Poster ──────────────────────────────────────
  posterImage: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.bgPrimary,
  },
  posterPlaceholder: {
    backgroundColor: COLORS.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Title ───────────────────────────────────────
  titleContainer: {
    flex: 1,
    paddingBottom: SPACING.sm,
  },
  mainTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.heading,
    fontWeight: FONT_WEIGHTS.bold,
    lineHeight: 30,
  },
  jpTitleText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.small,
    marginTop: 4,
    fontStyle: 'italic',
  },
  typeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  typeBadge: {
    backgroundColor: 'rgba(255, 107, 0, 0.15)',
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 107, 0, 0.3)',
  },
  typeBadgeText: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 215, 0, 0.12)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  scoreText: {
    color: '#FFD700',
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
  },

  // ── Actions ─────────────────────────────────────
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    gap: SPACING.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.bgSecondary,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionText: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
  },

  // ── Description ─────────────────────────────────
  section: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md,
  },
  descriptionText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    lineHeight: 22,
  },
  showMoreText: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: SPACING.sm,
  },

  // ── Genres ──────────────────────────────────────
  genreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  genreChip: {
    backgroundColor: COLORS.bgSecondary,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  genreText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium,
  },

  // ── Season Pills ────────────────────────────────
  pillRow: {
    gap: SPACING.sm,
    paddingRight: SPACING.lg,
  },
  pill: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.pill,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillActive: {
    backgroundColor: 'rgba(255, 107, 0, 0.15)',
    borderColor: COLORS.accent,
  },
  pillText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
  },
  pillTextActive: {
    color: COLORS.accent,
    fontWeight: FONT_WEIGHTS.bold,
  },

  // ── Movie Cards ─────────────────────────────────
  movieListContent: {
    gap: SPACING.md,
    paddingRight: SPACING.lg,
  },
  movieCard: {
    width: 140,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  movieCardActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(255, 107, 0, 0.08)',
  },
  movieIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  movieTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    textAlign: 'center',
  },
  movieTitleActive: {
    color: COLORS.accent,
  },
  movieFormatBadge: {
    backgroundColor: 'rgba(147, 51, 234, 0.15)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  movieFormatBadgeActive: {
    backgroundColor: 'rgba(255, 107, 0, 0.15)',
  },
  movieFormatText: {
    color: '#9333EA',
    fontSize: 10,
    fontWeight: FONT_WEIGHTS.bold,
  },
  movieFormatTextActive: {
    color: COLORS.accent,
  },

  // ── Episodes ────────────────────────────────────
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xxxl,
    gap: SPACING.md,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xxxl,
    gap: SPACING.md,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.body,
  },
  episodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.md,
  },
  episodeThumbnailContainer: {
    width: 84,
    height: 54,
    borderRadius: BORDER_RADIUS.sm,
    overflow: 'hidden',
    backgroundColor: '#161B22',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodeThumbnail: {
    width: '100%',
    height: '100%',
  },
  episodeThumbnailOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  episodeThumbNumberBadge: {
    position: 'absolute',
    top: 3,
    left: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  episodeThumbNumberText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: FONT_WEIGHTS.bold,
  },
  episodeDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  episodeDateText: {
    color: '#8B949E',
    fontSize: 11,
  },
  episodeNumberBadge: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodeNumberText: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
  },
  episodeInfo: {
    flex: 1,
  },
  episodeTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    lineHeight: 18,
  },
  episodeMeta: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.small,
    marginTop: 2,
  },
  episodePlayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Modal ───────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.bgSecondary,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    padding: SPACING.xxl,
    maxHeight: '50%',
  },
  modalTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.title,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.lg,
  },
  modalEmptyText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.body,
    textAlign: 'center',
    paddingVertical: SPACING.xl,
  },
  modalListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  modalListText: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
  },

  // ── Fix & Season Management Modal ─────────────────
  fixActionButton: {
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.3)',
    backgroundColor: 'rgba(255, 107, 0, 0.08)',
  },
  emptyHealButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.lg,
  },
  emptyHealButtonText: {
    color: '#000',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },
  fixModalCard: {
    backgroundColor: COLORS.bgSecondary,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  fixModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  fixTabRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgPrimary,
    borderRadius: BORDER_RADIUS.md,
    padding: 4,
    marginBottom: SPACING.md,
    gap: 4,
  },
  fixTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.sm,
  },
  fixTabBtnActive: {
    backgroundColor: COLORS.accent,
  },
  fixTabText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  fixTabTextActive: {
    color: '#000',
    fontWeight: FONT_WEIGHTS.bold,
  },
  fixHelpText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.small,
    lineHeight: 18,
    marginBottom: SPACING.lg,
  },
  fixInputGroup: {
    marginBottom: SPACING.md,
  },
  fixInputLabel: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium,
    marginBottom: 6,
  },
  fixTextInput: {
    backgroundColor: COLORS.bgPrimary,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    fontSize: FONT_SIZES.body,
  },
  fixProgressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 0, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.3)',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginVertical: SPACING.sm,
  },
  fixProgressText: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium,
    flex: 1,
  },
  fixModalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  fixCancelBtn: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fixCancelBtnText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  fixSubmitBtn: {
    flex: 2,
    backgroundColor: COLORS.accent,
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fixSubmitBtnDisabled: {
    opacity: 0.6,
  },
  fixSubmitBtnText: {
    color: '#000',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },

  // ── Live Browser Preview & Error Styles ─────────
  liveBrowserBox: {
    width: '100%',
    height: 180,
    backgroundColor: '#000',
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.4)',
    marginVertical: SPACING.sm,
  },
  liveBrowserHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgElevated,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  liveBrowserTitle: {
    color: COLORS.textSecondary,
    fontSize: 11,
    flex: 1,
  },
  liveBrowserWebViewContainer: {
    flex: 1,
    backgroundColor: '#0D0D12',
  },
  errorBox: {
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.4)',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginVertical: SPACING.sm,
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  errorTitle: {
    color: COLORS.error,
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
  },
  errorContent: {
    color: '#FFF',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: SPACING.sm,
  },
  copyErrorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.3)',
    borderWidth: 1,
    borderColor: COLORS.error,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.sm,
  },
  copyErrorBtnText: {
    color: '#FFF',
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
  },

  // Mini browser header buttons
  browserMiniActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    marginLeft: 6,
  },
  browserMiniActionText: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.bold,
    marginLeft: 3,
  },
  browserMiniExpandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    marginLeft: 6,
  },
  browserMiniExpandText: {
    color: '#000',
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.bold,
    marginLeft: 3,
  },

  // Full Screen Browser Styles
  fullScreenBrowserContainer: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  fullScreenBrowserHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16161F',
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  browserHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.sm,
  },
  browserHeaderBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
    marginLeft: 4,
  },
  fullScreenBrowserUrl: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 12,
    paddingHorizontal: 4,
  },
  browserExtractBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.sm,
  },
  browserExtractBtnText: {
    color: '#000',
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.bold,
  },
  browserTopStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 0, 0.15)',
    paddingHorizontal: SPACING.lg,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 107, 0, 0.3)',
  },
  browserTopStatusText: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
  },

  // ── Tranimeizle Canlı İstek Konsolu Stilleri ──
  consoleWrapper: {
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.md,
    backgroundColor: '#0D1117',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: '#30363D',
    overflow: 'hidden',
  },
  consoleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#161B22',
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#30363D',
  },
  consoleHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  consoleTitle: {
    color: '#E6EDF3',
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.xs,
    backgroundColor: '#21262D',
  },
  statusBadgeSearching: {
    backgroundColor: 'rgba(88, 166, 255, 0.2)',
  },
  statusBadgeSuccess: {
    backgroundColor: 'rgba(80, 250, 123, 0.2)',
  },
  statusBadgeBlocked: {
    backgroundColor: 'rgba(255, 184, 108, 0.2)',
  },
  statusBadgeError: {
    backgroundColor: 'rgba(255, 85, 85, 0.2)',
  },
  statusBadgeText: {
    color: '#E6EDF3',
    fontSize: 10,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  consoleHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  consoleMiniBtn: {
    padding: 4,
    borderRadius: BORDER_RADIUS.xs,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  consoleSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161B22',
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#21262D',
  },
  consoleSearchInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 13,
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  consoleSearchBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.sm,
    marginLeft: 8,
  },
  consoleSearchBtnText: {
    color: '#000',
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.bold,
  },
  terminalBody: {
    backgroundColor: '#090D13',
    maxHeight: 180,
    minHeight: 80,
    padding: SPACING.sm,
  },
  terminalScroll: {
    flex: 1,
  },
  terminalEmptyText: {
    color: '#6E7681',
    fontSize: 11,
    fontStyle: 'italic',
    padding: 8,
    textAlign: 'center',
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  logTimestamp: {
    color: '#6E7681',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginRight: 6,
    marginTop: 1,
  },
  logText: {
    flex: 1,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 16,
  },
  blockedNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 184, 108, 0.12)',
    padding: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 184, 108, 0.3)',
  },
  blockedNoticeTitle: {
    color: '#FFB86C',
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.bold,
  },
  blockedNoticeDesc: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  solveChallengeBtn: {
    backgroundColor: '#FFB86C',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.sm,
    marginLeft: 8,
  },
  solveChallengeBtnText: {
    color: '#000',
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.bold,
  },

  // ── Candidate Cards Stilleri ──
  candidateSubTitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.caption,
    marginBottom: SPACING.sm,
  },
  candidateCard: {
    backgroundColor: '#161B22',
    borderWidth: 1,
    borderColor: '#30363D',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  candidateCardSelected: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(255, 107, 0, 0.08)',
  },
  candidateCardInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },
  candidateCardTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 4,
  },
  candidateCardUrl: {
    color: '#8B949E',
    fontSize: 11,
  },
  candidateSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.sm,
  },
  candidateSelectBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  candidateSelectBtnText: {
    color: '#000',
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.bold,
  },
  candidateSelectBtnTextActive: {
    color: COLORS.accent,
  },

  // Challenge Modal
  challengeModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#161B22',
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#30363D',
  },
  challengeCloseBtn: {
    padding: 4,
  },
  challengeModalTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },
  challengeDoneBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.sm,
  },
  challengeDoneBtnText: {
    color: '#000',
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.bold,
  },

  // Log Konsolu Stilleri
  modalLogContainer: {
    backgroundColor: '#0D1117',
    borderBottomWidth: 1,
    borderBottomColor: '#30363D',
    maxHeight: 180,
  },
  modalLogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#161B22',
  },
  modalLogTitle: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  logStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  modalLogList: {
    maxHeight: 135,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  emptyLogText: {
    color: '#8B949E',
    fontSize: 11,
    fontStyle: 'italic',
    padding: 6,
  },
  logRow: {
    flexDirection: 'row',
    marginBottom: 3,
    alignItems: 'flex-start',
  },
  logTime: {
    color: '#6272A4',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginRight: 6,
    marginTop: 1,
  },
  logText: {
    color: '#F8F8F2',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    flex: 1,
    lineHeight: 15,
  },

  // ── Çıkmamış Anime Özel Kart Stilleri ─────────────
  upcomingCard: {
    backgroundColor: '#161B22',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.25)',
    marginVertical: SPACING.sm,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  upcomingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  upcomingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 229, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.3)',
  },
  upcomingBadgeText: {
    color: '#00E5FF',
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 0.5,
  },
  upcomingBellCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 107, 0, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upcomingDateTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 8,
    lineHeight: 24,
  },
  upcomingDescription: {
    color: COLORS.textSecondary || '#8B949E',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  upcomingFavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    paddingVertical: 13,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  upcomingFavBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowOpacity: 0,
  },
  upcomingFavBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.bold,
  },
  upcomingFavBtnTextActive: {
    color: '#FFF',
  },
});
