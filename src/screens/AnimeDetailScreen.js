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
} from 'react-native';
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
  fetchHtml, 
  parseSearchResultsHtml, 
  isBotBlocked, 
  BASE_URL 
} from '../services/lightweightResolver';
import { fetchAnimeDetails as fetchAniListDetails } from '../services/anilistService';
import { scraperInjectedJs } from '../modules/ScraperScript';
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

  const initialId = passedAnime?._id || passedAnime?.id || passedEntry?.seasons?.[0]?.mongo_db_id;
  const initialTitle = passedAnime?.title || passedAnime?.anime_title || passedEntry?.main_title_en;

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
  
  // Pre-populate from passed entry to prevent slow loading flash
  const [seasons, setSeasons] = useState(passedEntry?.seasons?.map(s => ({
    _id: s.mongo_db_id,
    season_number: s.season_number,
    label: s.season_title,
    category: 'seasons',
    cover_image: passedEntry?.cover_image || null,
    banner_image: passedEntry?.banner_image || null
  })) || []);

  const [relatedMoviesOvas, setRelatedMoviesOvas] = useState(passedEntry?.related_movies_or_ovas?.map(m => ({
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
  const isAlertOpenRef = useRef(false);

  // ── Tranimeizle Canlı İstek & Arama Konsolu Durumları ────────
  const [logs, setLogs] = useState([]);
  const [searchStatus, setSearchStatus] = useState('idle'); // 'idle' | 'searching' | 'blocked' | 'success' | 'empty' | 'error'
  const [searchCandidates, setSearchCandidates] = useState([]);
  const [searchQueryInput, setSearchQueryInput] = useState('');
  const [isLogExpanded, setIsLogExpanded] = useState(true);
  const [selectedCandidateUrl, setSelectedCandidateUrl] = useState(null);
  const [isChallengeModalVisible, setIsChallengeModalVisible] = useState(false);
  const [challengeUrl, setChallengeUrl] = useState('');

  const addLog = useCallback((message, type = 'info') => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const newEntry = { id: `${Date.now()}_${Math.random()}`, time, message, type };
    setLogs(prev => [newEntry, ...prev.slice(0, 79)]);
  }, []);

  const loadEpisodesForUrl = useCallback(async (overviewUrl, candidateTitle = '') => {
    if (!overviewUrl) return;
    setLoadingEpisodes(true);
    setSelectedCandidateUrl(overviewUrl);
    addLog(`📥 [BÖLÜMLER] Sayfa yükleniyor: ${overviewUrl}`, 'info');

    try {
      const startTime = Date.now();
      const { status, html, size, error, ok } = await fetchHtml(overviewUrl, 12000);
      const duration = Date.now() - startTime;

      if (error) {
        addLog(`❌ [HATA] Bölüm sayfası isteği başarısız (${duration}ms): ${error}`, 'error');
        setLoadingEpisodes(false);
        return;
      }

      const titleMatch = html ? html.match(/<title>([^<]*)<\/title>/i) : null;
      const pageTitle = titleMatch ? titleMatch[1].trim() : 'Başlık yok';
      addLog(`📡 [HTTP] Durum: ${status} | Boyut: ${size} B | Süre: ${duration}ms | Başlık: "${pageTitle}"`, ok ? 'success' : 'warn');

      if (isBotBlocked(html, size) || status === 403) {
        addLog(`🛡️ [ENGEL] Bölüm sayfası Cloudflare/Bot doğrulamasına takıldı (HTTP ${status})`, 'warn');
      }

      const rawEps = await fetchEpisodesForAnime(overviewUrl);
      if (rawEps && rawEps.length > 0) {
        const formattedEps = rawEps.map(ep => ({
          _id: `${activeMongoId || 'ep'}_${ep.number}`,
          episode_number: ep.number,
          episode_title: ep.title,
          url: ep.url
        }));
        setEpisodes(formattedEps);
        addLog(`🎉 [TAMAMLANDI] ${formattedEps.length} adet bölüm listelendi!`, 'success');

        seasonCacheRef.current[activeMongoId] = {
          ...(seasonCacheRef.current[activeMongoId] || {}),
          episodes: formattedEps,
          selectedCandidateUrl: overviewUrl
        };
      } else {
        addLog(`⚠️ [UYARI] Bu sayfadan oynatılabilir bölüm ayrıştırılamadı.`, 'warn');
        setEpisodes([]);
      }
    } catch (err) {
      addLog(`❌ [HATA] Bölüm yüklenirken hata: ${err.message}`, 'error');
      setEpisodes([]);
    } finally {
      setLoadingEpisodes(false);
    }
  }, [activeMongoId, addLog]);

  const performTranimeizleSearch = useCallback(async (customQuery) => {
    const currentAnimeData = anime || passedAnime;
    const fallbackTitle = currentAnimeData?.orijinal_ad || currentAnimeData?.title || currentAnimeData?.title_romaji || initialTitle || '';
    const query = (typeof customQuery === 'string' ? customQuery : (searchQueryInput || fallbackTitle)).trim();

    if (!query) {
      addLog('⚠️ [ARAMA] Arama sorgusu boş!', 'warn');
      return;
    }

    setSearchStatus('searching');
    setLoadingEpisodes(true);
    addLog(`🔍 [ARAMA] Tranimeizle araması başlatılıyor: "${query}"`, 'info');

    const searchUrl = `${BASE_URL}/arama/${encodeURIComponent(query)}`;
    addLog(`🌐 [URL] ${searchUrl}`, 'info');

    try {
      const startTime = Date.now();
      const { status, html, size, error, ok } = await fetchHtml(searchUrl, 10000);
      const duration = Date.now() - startTime;

      if (error) {
        setSearchStatus('error');
        setLoadingEpisodes(false);
        addLog(`❌ [AĞ HATASI] ${error} (${duration}ms)`, 'error');
        return;
      }

      const titleMatch = html ? html.match(/<title>([^<]*)<\/title>/i) : null;
      const pageTitle = titleMatch ? titleMatch[1].trim() : 'Başlık yok';

      addLog(`📡 [HTTP] Durum: ${status} ${ok ? 'OK' : ''} | Boyut: ${size} B | Süre: ${duration}ms`, ok ? 'success' : 'warn');
      addLog(`📄 [SAYFA] Başlık: "${pageTitle}"`, 'info');

      const blocked = isBotBlocked(html, size) || status === 403;
      if (blocked) {
        setSearchStatus('blocked');
        addLog(`🛡️ [BOT KORUMASI] Cloudflare Turnstile / Bot Kontrolü devrede! (HTTP ${status})`, 'warn');
        if (html && (html.includes('cf-turnstile') || html.includes('turnstile') || html.includes('challenges.cloudflare.com'))) {
          addLog(`🔒 [TURNSTILE] Sayfada Cloudflare Turnstile Javascript challenge tespit edildi.`, 'warn');
        }
      }

      const candidates = parseSearchResultsHtml(html);
      addLog(`🔎 [SONUÇ] Ayrıştırılan aday sayısı: ${candidates.length}`, candidates.length > 0 ? 'success' : 'info');

      if (candidates.length > 0) {
        setSearchCandidates(candidates);
        setSearchStatus('success');
        candidates.forEach((cand, idx) => {
          addLog(`📌 [${idx + 1}] ${cand.title || 'Başlık'} ➔ ${cand.url}`, 'info');
        });

        addLog(`⚡ [OTOMATİK] 1. aday seçildi, bölümler yükleniyor...`, 'info');
        await loadEpisodesForUrl(candidates[0].url, candidates[0].title);
      } else {
        setSearchCandidates([]);
        if (!blocked) {
          setSearchStatus('empty');
          addLog(`ℹ️ [BOŞ] "${query}" aramasına uygun anime bulunamadı.`, 'info');
        }
        setLoadingEpisodes(false);
      }
    } catch (err) {
      setSearchStatus('error');
      setLoadingEpisodes(false);
      addLog(`❌ [İSTİSNA] Arama hatası: ${err.message}`, 'error');
    }
  }, [anime, passedAnime, searchQueryInput, initialTitle, addLog, loadEpisodesForUrl]);

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
        setEpisodes(cached.episodes);
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

        // 1. Fetch rich AniList details if anilistId is available
        if (anilistId && (!currentAnimeData || !currentAnimeData.synopsis)) {
          const aniData = await fetchAniListDetails(anilistId);
          if (aniData && !cancelled) {
            currentAnimeData = { ...currentAnimeData, ...aniData };
            setAnime(currentAnimeData);

            // Extract relations (Sequels/Prequels) as seasons
            if (aniData.relations && aniData.relations.length > 0) {
              const relSeasons = aniData.relations
                .filter(r => ['SEQUEL', 'PREQUEL', 'ALTERNATIVE', 'PARENT'].includes(r.relationType))
                .map((r, idx) => ({
                  _id: String(r.node.id),
                  anilist_id: r.node.id,
                  season_number: idx + 1,
                  label: r.node.title || r.node.orijinal_ad,
                  title: r.node.title,
                  category: 'seasons',
                  cover_image: r.node.coverImage,
                  banner_image: r.node.bannerImage,
                  node: r.node
                }));
              if (relSeasons.length > 0) setSeasons(relSeasons);
            }
          }
        }

        if (!cancelled) setLoading(false);

        // 2. Perform live search immediately on detail load!
        const targetTitle = currentAnimeData?.orijinal_ad || currentAnimeData?.title || currentAnimeData?.title_romaji || initialTitle;
        if (targetTitle) {
          setSearchQueryInput(targetTitle);
          addLog(`🚀 Detay sayfası yüklendi: "${targetTitle}" için arama başlatılıyor...`, 'info');
          if (!cancelled) {
            await performTranimeizleSearch(targetTitle);
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
  const handleSeasonSelect = (seasonId) => {
    if (seasonId === activeMongoId) return;
    setActiveMongoId(seasonId);
  };

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
  const renderEpisodeCard = useCallback(({ item }) => (
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
          episodeTitle: item.episode_title || `Bölüm ${item.episode_number}`,
          animeTitle: mainTitleEn,
          anilistId: anime?.anilist_id || null,
          fansubs: anime?.fansubs || [],
          episodeUrl: item.url,
          episodes: episodes
        });
      }}
    >
      <View style={styles.episodeNumberBadge}>
        <Text style={styles.episodeNumberText}>{item.episode_number}</Text>
      </View>
      <View style={styles.episodeInfo}>
        <Text style={styles.episodeTitle} numberOfLines={1}>
          {item.episode_title || `Bölüm ${item.episode_number}`}
        </Text>
        <Text style={styles.episodeMeta}>
          {item.source_url ? 'Hazır' : 'Kaynak yok'}
        </Text>
      </View>
      <View style={styles.episodePlayButton}>
        <Ionicons name="play" size={16} color={COLORS.accent} />
      </View>
    </TouchableOpacity>
  ), [activeMongoId, mainTitleEn, navigation, user]);

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

        {/* ── Related Movies/OVAs ─────────────────────── */}
        {relatedMoviesOvas && relatedMoviesOvas.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>İlgili Film & OVA'lar</Text>
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

        {/* ── Tranimeizle Canlı İstek & Log Konsolu ────────────────────── */}
        <View style={styles.consoleWrapper}>
          {/* Header */}
          <View style={styles.consoleHeader}>
            <View style={styles.consoleHeaderLeft}>
              <Ionicons name="terminal-outline" size={18} color="#00FF66" />
              <Text style={styles.consoleTitle}>Tranimeizle Canlı İstek</Text>
              <View style={[
                styles.statusBadge,
                searchStatus === 'searching' && styles.statusBadgeSearching,
                searchStatus === 'success' && styles.statusBadgeSuccess,
                searchStatus === 'blocked' && styles.statusBadgeBlocked,
                searchStatus === 'error' && styles.statusBadgeError,
              ]}>
                <Text style={styles.statusBadgeText}>
                  {searchStatus === 'searching' ? 'Aranıyor...' :
                   searchStatus === 'success' ? `${searchCandidates.length} Aday` :
                   searchStatus === 'blocked' ? 'Bot Koruması (403)' :
                   searchStatus === 'empty' ? 'Sonuç Yok' :
                   searchStatus === 'error' ? 'Hata' : 'Hazır'}
                </Text>
              </View>
            </View>

            <View style={styles.consoleHeaderRight}>
              <TouchableOpacity
                style={styles.consoleMiniBtn}
                onPress={() => setLogs([])}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={14} color={COLORS.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.consoleMiniBtn}
                onPress={() => setIsLogExpanded(!isLogExpanded)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isLogExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={COLORS.textPrimary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Search Query Input Bar */}
          <View style={styles.consoleSearchBar}>
            <Ionicons name="search" size={16} color={COLORS.textMuted} style={{ marginRight: 6 }} />
            <TextInput
              style={styles.consoleSearchInput}
              value={searchQueryInput}
              onChangeText={setSearchQueryInput}
              placeholder="Tranimeizle'de aranacak isim..."
              placeholderTextColor={COLORS.textMuted}
              returnKeyType="search"
              onSubmitEditing={() => performTranimeizleSearch(searchQueryInput)}
            />
            <TouchableOpacity
              style={styles.consoleSearchBtn}
              onPress={() => performTranimeizleSearch(searchQueryInput)}
              disabled={searchStatus === 'searching'}
              activeOpacity={0.7}
            >
              {searchStatus === 'searching' ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.consoleSearchBtnText}>Ara</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Log Window Terminal Screen */}
          {isLogExpanded && (
            <View style={styles.terminalBody}>
              <ScrollView
                style={styles.terminalScroll}
                nestedScrollEnabled
                showsVerticalScrollIndicator={true}
              >
                {logs.length === 0 ? (
                  <Text style={styles.terminalEmptyText}>
                    Henüz log kaydı yok. Arama yapıldığında istek ve yanıtlar burada listelenecektir.
                  </Text>
                ) : (
                  logs.map(log => {
                    const color =
                      log.type === 'error' ? '#FF5555' :
                      log.type === 'warn' ? '#FFB86C' :
                      log.type === 'success' ? '#50FA7B' :
                      '#8BE9FD';
                    return (
                      <View key={log.id} style={styles.logRow}>
                        <Text style={styles.logTimestamp}>[{log.time}]</Text>
                        <Text style={[styles.logText, { color }]}>{log.message}</Text>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          )}

          {/* If Bot Blocked: Helper notice */}
          {searchStatus === 'blocked' && (
            <View style={styles.blockedNoticeBox}>
              <Ionicons name="shield-alert-outline" size={20} color="#FFB86C" />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.blockedNoticeTitle}>Cloudflare Koruması Algılandı</Text>
                <Text style={styles.blockedNoticeDesc}>
                  Tranimeizle doğrudan HTTP isteklerini bot kontrolü (Turnstile/403) ile kısıtlamış olabilir.
                </Text>
              </View>
              {WebView && (
                <TouchableOpacity
                  style={styles.solveChallengeBtn}
                  onPress={() => {
                    setChallengeUrl(`${BASE_URL}/arama/${encodeURIComponent(searchQueryInput || mainTitleEn)}`);
                    setIsChallengeModalVisible(true);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.solveChallengeBtnText}>Doğrula</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* ── Found Candidate Cards ────────────────────────────────────── */}
        {searchCandidates.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Tranimeizle Eşleşenleri ({searchCandidates.length})
            </Text>
            <Text style={styles.candidateSubTitle}>
              Aşağıdaki anime sayfalarından birine tıklayarak bölümlerini getirebilirsiniz:
            </Text>
            {searchCandidates.map((cand, idx) => {
              const isSelected = selectedCandidateUrl === cand.url;
              return (
                <View
                  key={cand.url || idx}
                  style={[styles.candidateCard, isSelected && styles.candidateCardSelected]}
                >
                  <View style={styles.candidateCardInfo}>
                    <Text style={styles.candidateCardTitle} numberOfLines={2}>
                      {cand.title || 'İsimsiz Başlık'}
                    </Text>
                    <Text style={styles.candidateCardUrl} numberOfLines={1}>
                      {cand.url}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.candidateSelectBtn, isSelected && styles.candidateSelectBtnActive]}
                    onPress={() => loadEpisodesForUrl(cand.url, cand.title)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={isSelected ? "checkmark-circle" : "cloud-download-outline"}
                      size={16}
                      color={isSelected ? "#FFF" : "#000"}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={[styles.candidateSelectBtnText, isSelected && styles.candidateSelectBtnTextActive]}>
                      {isSelected ? "Aktif" : "Bölümleri Getir"}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Episodes Grid ───────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {activeLabel} — Bölümler {episodes.length > 0 ? `(${episodes.length})` : ''}
          </Text>

          {loadingEpisodes ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.accent} />
              <Text style={styles.loadingText}>Bölümler yükleniyor...</Text>
            </View>
          ) : episodes.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="videocam-off-outline" size={40} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>Bu sezon için henüz oynatılabilir bölüm bulunamadı.</Text>
            </View>
          ) : (
            <Animated.View style={{ opacity: fadeAnim }}>
              {episodes.map((ep) => (
                <View key={`ep-${ep.episode_number}`}>
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
              <Text style={styles.challengeModalTitle}>Cloudflare Doğrulaması</Text>
              <TouchableOpacity
                onPress={() => {
                  setIsChallengeModalVisible(false);
                  performTranimeizleSearch(searchQueryInput);
                }}
                style={styles.challengeDoneBtn}
              >
                <Text style={styles.challengeDoneBtnText}>Yeniden Dene</Text>
              </TouchableOpacity>
            </View>
            <WebView
              source={{ uri: challengeUrl || `${BASE_URL}/arama/${encodeURIComponent(searchQueryInput || mainTitleEn)}` }}
              style={{ flex: 1 }}
              userAgent="Mozilla/5.0 (Linux; Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0"
              injectedJavaScriptBeforeContentLoaded={scraperInjectedJs}
              injectedJavaScript={scraperInjectedJs}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              onMessage={(event) => {
                try {
                  const data = JSON.parse(event.nativeEvent.data);
                  if (data.type === 'log') {
                    addLog(data.message, 'info');
                  } else if (data.type === 'captcha_detected') {
                    addLog('🛡️ Bot koruması algılandı, otomatik çözülüyor...', 'warn');
                  } else if (data.type === 'resolved') {
                    addLog('🎉 Doğrulama başarılı!', 'success');
                  }
                } catch(e) {}
              }}
              onNavigationStateChange={(navState) => {
                addLog(`🌐 [WEBVIEW] URL: ${navState.url}`, 'info');
                if (navState.title && !navState.title.includes('Doğrulama') && !navState.title.includes('Just a moment')) {
                  addLog(`✅ [WEBVIEW] Sayfa: "${navState.title}"`, 'success');
                }
              }}
            />
          </SafeAreaView>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  episodeNumberBadge: {
    width: 40,
    height: 40,
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
});
