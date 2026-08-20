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
import { fetchAnimeDetail, fetchEpisodes, addToHistory, toggleFavorite, getProfileData, toggleAnimeInList, selfHealAnime, fixOrAddAnimeSeasonApi, clientAddAnimeApi } from '../services/api';
import { useAlert } from '../context/AlertContext';
import { AuthContext } from '../context/AuthContext';
import { animePageScraperInjectedJs } from '../modules/AnimePageScraperScript';
import { resolveTargetTranimeizleUrl, verifyTitleMatchClient } from '../utils/clientAnimeHealer';
import * as Clipboard from 'expo-clipboard';

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

  // Fix Season / Add Season Modal State
  const [isFixModalVisible, setIsFixModalVisible] = useState(false);
  const [fixMode, setFixMode] = useState('fix_season'); // 'fix_season' | 'add_season'
  const [customUrl, setCustomUrl] = useState('');
  const [animeTitleInput, setAnimeTitleInput] = useState('');
  const [targetSeasonNum, setTargetSeasonNum] = useState('');
  const [totalEpisodesInput, setTotalEpisodesInput] = useState('');
  const [isFixing, setIsFixing] = useState(false);
  const [fixStatusText, setFixStatusText] = useState('');
  const [clientScrapeUrl, setClientScrapeUrl] = useState(null);
  const [isFullScreenBrowser, setIsFullScreenBrowser] = useState(false);
  const [lastErrorMessage, setLastErrorMessage] = useState(null);
  const [posterTapCount, setPosterTapCount] = useState(0);
  const posterTapTimerRef = useRef(null);
  const clientWebViewRef = useRef(null);

  // Helper to extract a clean title from a URL or raw scraped title
  const extractCleanTitleFromUrl = (urlOrSlug, rawTitle = '') => {
    const isGeneric = !rawTitle || /^(tranimeizle|anime\s*izle|bağlantı\s*doğrulaması|cloudflare|ana\s*sayfa|yükleniyor|error|404)/i.test(String(rawTitle).trim());
    let title = (!isGeneric ? rawTitle : '')
      .replace(/\s*\d+\.\s*Bölüm\s*İzle.*$/i, '')
      .replace(/\s*Türkçe\s*(?:Altyazılı|Dublaj)?\s*İzle.*$/i, '')
      .replace(/\s*İzle.*$/i, '')
      .trim();

    if ((!title || isGeneric) && urlOrSlug) {
      try {
        let slug = decodeURIComponent(String(urlOrSlug))
          .split(/[?#]/)[0]
          .replace(/^https?:\/\/[^\/]+\/(?:anime\/)?/i, '')
          .replace(/-(?:\d+)-bolum.*$/i, '')
          .replace(/-izle.*$/i, '')
          .replace(/^\/+|\/+$/g, '')
          .trim();

        if (slug) {
          title = slug
            .replace(/-/g, ' ')
            .replace(/\b(izle|turkce|altyazi|altyazili|dublaj|dublajli|full|hd)\b/gi, '')
            .replace(/\b(\d+)\.?\s*sezon\b/gi, 'Season $1')
            .replace(/\bsezon\b/gi, 'Season')
            .replace(/\b(\d+)\.?\s*kisim\b/gi, 'Part $1')
            .replace(/\bkisim\b/gi, 'Part')
            .replace(/\bbolum\b/gi, 'Episode')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\b\w/g, c => c.toUpperCase());
        }
      } catch (e) {}
    }

    return title || rawTitle || '';
  };

  // Animation and Season Cache
  const useRefValue = useRef(new Animated.Value(0));
  const fadeAnim = useRefValue.current;
  const seasonCacheRef = useRef({});

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
  useEffect(() => {
    if (!activeMongoId) return;

    let cancelled = false;
    const cached = seasonCacheRef.current[activeMongoId];
    
    if (cached) {
      // Instant switch from local cache — zero wait, zero flicker!
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

    // 1. Fetch detail (includes orchestrator seasons list from backend)
    fetchAnimeDetail(activeMongoId).then(data => {
      if (cancelled) return;
      if (data) {
        setAnime(data);
        if (data.seasons && data.seasons.length > 0) {
          setSeasons(data.seasons);
        }
        if (data.related_movies_or_ovas) {
          setRelatedMoviesOvas(data.related_movies_or_ovas);
        }
        // Save to cache
        seasonCacheRef.current[activeMongoId] = {
          ...(seasonCacheRef.current[activeMongoId] || {}),
          anime: data
        };
      }
      setLoading(false);
    }).catch(err => {
      console.error('[Detail] Error loading detail:', err);
      if (!cancelled && !cached) setLoading(false);
    });

    // 2. Fetch episodes with automated on-demand self-healing
    fetchEpisodes(activeMongoId).then(async (eps) => {
      if (cancelled) return;
      if (eps && eps.length > 0) {
        setEpisodes(eps);
        setLoadingEpisodes(false);
        seasonCacheRef.current[activeMongoId] = {
          ...(seasonCacheRef.current[activeMongoId] || {}),
          episodes: eps
        };
      } else {
        const targetTitle = anime?.orijinal_ad || anime?.anime_title || initialTitle;
        console.log('[Detail] 0 episodes found. Triggering client-side self-heal for:', targetTitle);
        const healResult = await selfHealAnime(activeMongoId, anime?.tranimeizle_slug, targetTitle);
        if (!cancelled) {
          if (healResult?.success && healResult?.data?.episodes) {
            const healedEps = Object.keys(healResult.data.episodes).map(key => ({
              _id: `${healResult.data._id}_${key}`,
              episode_number: parseInt(key, 10),
              episode_title: `${key}. Bölüm`,
              url: healResult.data.episodes[key]
            })).sort((a, b) => a.episode_number - b.episode_number);
            setEpisodes(healedEps);
            seasonCacheRef.current[activeMongoId] = {
              ...(seasonCacheRef.current[activeMongoId] || {}),
              episodes: healedEps
            };
          } else if (!cached) {
            setEpisodes([]);
          }
        }
        setLoadingEpisodes(false);
      }

      // Animate fade-in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }).catch(async (err) => {
      console.error('[Detail] Error loading episodes:', err);
      if (!cached) {
        const targetTitle = anime?.orijinal_ad || anime?.anime_title || initialTitle;
        const healResult = await selfHealAnime(activeMongoId, anime?.tranimeizle_slug, targetTitle);
        if (!cancelled) {
          if (healResult?.success && healResult?.data?.episodes) {
            const healedEps = Object.keys(healResult.data.episodes).map(key => ({
              _id: `${healResult.data._id}_${key}`,
              episode_number: parseInt(key, 10),
              episode_title: `${key}. Bölüm`,
              url: healResult.data.episodes[key]
            })).sort((a, b) => a.episode_number - b.episode_number);
            setEpisodes(healedEps);
            seasonCacheRef.current[activeMongoId] = {
              ...(seasonCacheRef.current[activeMongoId] || {}),
              episodes: healedEps
            };
          }
          setLoadingEpisodes(false);
        }
      }
    });

    return () => { cancelled = true; };
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

  const handlePosterTap = () => {
    const nextCount = posterTapCount + 1;
    setPosterTapCount(nextCount);
    if (posterTapTimerRef.current) clearTimeout(posterTapTimerRef.current);
    posterTapTimerRef.current = setTimeout(() => {
      setPosterTapCount(0);
    }, 2500);

    if (nextCount >= 5) {
      setPosterTapCount(0);
      setLastErrorMessage(null);
      setIsFixModalVisible(true);
    }
  };

  const handleCopyError = async () => {
    if (lastErrorMessage) {
      try {
        await Clipboard.setStringAsync(String(lastErrorMessage));
        showAlert('Kopyalandı 📋', 'Hata kodu panoya kopyalandı.');
      } catch (err) {
        console.warn('Clipboard copy error:', err);
      }
    }
  };

  const handleManualScrape = () => {
    setIsFixing(true);
    setFixStatusText('Sayfadaki bölümler taranıp ayıklanıyor...');
    setLastErrorMessage(null);
    clientWebViewRef.current?.injectJavaScript('window.clofthelTriggerScrape ? window.clofthelTriggerScrape() : null; true;');
  };

  const handleFixOrAddSeason = async () => {
    if (fixMode === 'add_season' && !targetSeasonNum.trim()) {
      showAlert('Uyarı', 'Lütfen eklemek istediğiniz sezon numarasını girin (Örn: 2).');
      return;
    }

    setLastErrorMessage(null);
    setIsFixing(true);
    setFixStatusText(fixMode === 'add_season' ? 'Yeni sezon istemci tarayıcısında açılıyor...' : 'Mevcut sezon istemci tarayıcısında açılıyor...');

    const resolvedUrl = resolveTargetTranimeizleUrl(
      customUrl.trim() || mainTitleEn,
      fixMode === 'add_season' ? parseInt(targetSeasonNum, 10) : null
    );

    if (!resolvedUrl) {
      const err = 'Geçerli bir link veya arama sorgusu oluşturulamadı.';
      showAlert('Hata', err);
      setLastErrorMessage(err);
      setIsFixing(false);
      return;
    }

    setFixStatusText('Sayfa cihazınızda taranıyor...');
    setClientScrapeUrl(resolvedUrl);
  };

  const executeSaveScrapedData = async (scraped, customTitleToUse = null) => {
    const finalTitle = customTitleToUse || animeTitleInput.trim() || extractCleanTitleFromUrl(scraped?.url || clientScrapeUrl, scraped?.title);
    setFixStatusText(`"${finalTitle}" için ${scraped.totalEpisodes} bölüm ve AniList verileri kaydediliyor...`);
    setIsFixing(true);

    const saveRes = await clientAddAnimeApi({
      parsedData: {
        ...scraped,
        customTitle: finalTitle
      },
      mode: fixMode,
      targetAnimeId: activeMongoId,
      targetSeasonNumber: fixMode === 'add_season' ? parseInt(targetSeasonNum, 10) : null,
      totalEpisodesOverride: totalEpisodesInput.trim() ? parseInt(totalEpisodesInput, 10) : null
    });

    if (saveRes?.success) {
      showAlert('Başarılı 🚀', saveRes.message || `"${finalTitle}" başarıyla güncellendi ve AniList ile senkronize edildi!`);
      setIsFixModalVisible(false);
      setIsFullScreenBrowser(false);
      setCustomUrl('');
      setAnimeTitleInput('');
      setTargetSeasonNum('');
      setTotalEpisodesInput('');
      setClientScrapeUrl(null);
      setLastErrorMessage(null);
      setIsFixing(false);

      // Re-fetch detail to reload seasons & episodes immediately
      const updated = await fetchAnimeDetail(activeMongoId);
      if (updated) {
        setAnime(updated);
        if (updated.seasons && updated.seasons.length > 0) setSeasons(updated.seasons);
        if (updated.related_movies_or_ovas) setRelatedMoviesOvas(updated.related_movies_or_ovas);
        if (updated.episodes) {
          const epArray = Object.keys(updated.episodes).map(k => ({
            episode_number: parseInt(k, 10),
            episode_title: `${k}. Bölüm`,
            url: updated.episodes[k]
          })).sort((a, b) => a.episode_number - b.episode_number);
          setEpisodes(epArray);
        }
      }
    } else {
      const err = saveRes?.error || 'Kaydetme sırasında bir hata oluştu.';
      showAlert('Kayıt Hatası', err);
      setLastErrorMessage(err);
      setIsFixing(false);
    }
  };

  const handleClientScraperMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'page_navigated') {
        setFixStatusText(`Sayfa yüklendi: ${data.url || ''}`);
        // Auto extract title from page URL if title input is empty
        if (!animeTitleInput.trim()) {
          const autoTitle = extractCleanTitleFromUrl(data.url);
          if (autoTitle) setAnimeTitleInput(autoTitle);
        }
      } else if (data.type === 'cloudflare_detected') {
        setFixStatusText('Cloudflare doğrulaması tespit edildi! Lütfen ekrandaki doğrulama kutusuna dokunun.');
        setIsFullScreenBrowser(true);
      } else if (data.type === 'scraper_waiting') {
        setFixStatusText(`Bölümler aranıyor (Deneme ${data.retry || 1}/6)...`);
      } else if (data.type === 'search_result_found') {
        setFixStatusText(`Anime sayfası bulundu, yönlendiriliyor...`);
      } else if (data.type === 'anime_overview_scraped') {
        const scraped = data.data;
        if (!scraped || Object.keys(scraped.episodes || {}).length === 0) {
          const err = 'Sayfadan bölüm bilgisi otomatik bulunamadı. Lütfen tam ekranda sayfayı açıp kontrol edin veya "Ayıkla & Kaydet" butonuna basın.';
          setLastErrorMessage(err);
          setIsFixing(false);
          return;
        }

        const candidateTitle = animeTitleInput.trim() || extractCleanTitleFromUrl(scraped?.url || clientScrapeUrl, scraped?.title);
        if (!animeTitleInput.trim() && candidateTitle) {
          setAnimeTitleInput(candidateTitle);
        }

        // Confirm Anime Title & AniList Sync with user
        showAlert(
          'Anime İsmi & AniList Onayı 🏷️',
          `Ayıklanan Anime Başlığı:\n"${candidateTitle}"\n\nBu isimle kaydedilip AniList ID ve bilgileri güncellensin mi?`,
          [
            { text: 'İptal / Değiştir', style: 'cancel' },
            { 
              text: '⚡ Evet, Kaydet', 
              onPress: () => executeSaveScrapedData(scraped, candidateTitle) 
            }
          ]
        );
      } else if (data.type === 'scraper_error') {
        setLastErrorMessage(`[WebView Scraper error]: ${data.error}`);
        setIsFixing(false);
      }
    } catch (err) {
      console.warn('[AnimeDetailScreen client scraper] Parse error:', err);
      setLastErrorMessage(`[JSON Parse error]: ${err.message}`);
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
          fansubs: anime?.fansubs || []
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
            <TouchableOpacity activeOpacity={0.85} onPress={handlePosterTap}>
              {coverImage ? (
                <Image source={{ uri: coverImage }} style={styles.posterImage} contentFit="cover" />
              ) : (
                <View style={[styles.posterImage, styles.posterPlaceholder]}>
                  <Ionicons name="image-outline" size={40} color={COLORS.textMuted} />
                </View>
              )}
            </TouchableOpacity>

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
              <Text style={styles.emptyText}>Bu seçim için bölüm bulunamadı.</Text>
              <TouchableOpacity
                style={styles.emptyHealButton}
                onPress={() => setIsFixModalVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="sparkles-outline" size={18} color="#000" style={{ marginRight: 6 }} />
                <Text style={styles.emptyHealButtonText}>Animeyi Otomatik Tara & Düzelt</Text>
              </TouchableOpacity>
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

      {/* ── Fix & Add Season Modal ────────────────────── */}
      <Modal
        visible={isFixModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => !isFixing && setIsFixModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => !isFixing && setIsFixModalVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.fixModalCard}>
            <View style={styles.fixModalHeader}>
              <Ionicons name="construct-outline" size={24} color={COLORS.accent} style={{ marginRight: 8 }} />
              <Text style={styles.modalTitle}>Anime & Sezon Yönetimi</Text>
            </View>

            {/* Mode Switcher Tabs */}
            <View style={styles.fixTabRow}>
              <TouchableOpacity
                style={[styles.fixTabBtn, fixMode === 'fix_season' && styles.fixTabBtnActive]}
                onPress={() => setFixMode('fix_season')}
                disabled={isFixing}
              >
                <Ionicons name="sync-outline" size={16} color={fixMode === 'fix_season' ? '#000' : COLORS.textMuted} style={{ marginRight: 6 }} />
                <Text style={[styles.fixTabText, fixMode === 'fix_season' && styles.fixTabTextActive]}>Sezonu Düzelt</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.fixTabBtn, fixMode === 'add_season' && styles.fixTabBtnActive]}
                onPress={() => setFixMode('add_season')}
                disabled={isFixing}
              >
                <Ionicons name="add-circle-outline" size={16} color={fixMode === 'add_season' ? '#000' : COLORS.textMuted} style={{ marginRight: 6 }} />
                <Text style={[styles.fixTabText, fixMode === 'add_season' && styles.fixTabTextActive]}>Yeni Sezon Ekle</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fixHelpText}>
              {fixMode === 'add_season'
                ? 'Bu animeye yeni bir sezon eklemek için linki veya sezon numarasını girin. Link girilmezse anime adı ve sezon numarası otomatik taranacaktır.'
                : 'Mevcut sezonun linklerini ve bölümlerini yenilemek için linki yapıştırın veya boş bırakarak otomatik onarımı başlatın.'}
            </Text>

            {/* Season Number Input (Only for Add Season) */}
            {fixMode === 'add_season' && (
              <View style={styles.fixInputGroup}>
                <Text style={styles.fixInputLabel}>Sezon Numarası (Örn: 2, 3)</Text>
                <TextInput
                  style={styles.fixTextInput}
                  placeholder="Örn: 2"
                  placeholderTextColor={COLORS.textMuted}
                  value={targetSeasonNum}
                  onChangeText={setTargetSeasonNum}
                  keyboardType="numeric"
                  editable={!isFixing}
                />
              </View>
            )}

            {/* Anime Title / AniList Name Input */}
            <View style={styles.fixInputGroup}>
              <Text style={styles.fixInputLabel}>Anime Adı (AniList ve Veritabanı Başlığı)</Text>
              <TextInput
                style={styles.fixTextInput}
                placeholder="Örn: Solo Leveling Season 2"
                placeholderTextColor={COLORS.textMuted}
                value={animeTitleInput}
                onChangeText={setAnimeTitleInput}
                autoCapitalize="words"
                editable={!isFixing}
              />
            </View>

            {/* Tranimeizle URL Input */}
            <View style={styles.fixInputGroup}>
              <Text style={styles.fixInputLabel}>Tranimeizle Linki (İsteğe Bağlı)</Text>
              <TextInput
                style={styles.fixTextInput}
                placeholder="https://www.tranimeizle.io/anime/..."
                placeholderTextColor={COLORS.textMuted}
                value={customUrl}
                onChangeText={(text) => {
                  setCustomUrl(text);
                  const extracted = extractCleanTitleFromUrl(text);
                  if (extracted) {
                    setAnimeTitleInput(extracted);
                  }
                }}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isFixing}
              />
            </View>

            {/* Total Episodes Override Input */}
            <View style={styles.fixInputGroup}>
              <Text style={styles.fixInputLabel}>Toplam Bölüm Sayısı (İsteğe Bağlı)</Text>
              <TextInput
                style={styles.fixTextInput}
                placeholder="Örn: 12 veya 24 (Zorlama için)"
                placeholderTextColor={COLORS.textMuted}
                value={totalEpisodesInput}
                onChangeText={setTotalEpisodesInput}
                keyboardType="numeric"
                editable={!isFixing}
              />
            </View>

            {/* Status Progress */}
            {isFixing && (
              <View style={styles.fixProgressBox}>
                <ActivityIndicator size="small" color={COLORS.accent} style={{ marginRight: 10 }} />
                <Text style={styles.fixProgressText}>{fixStatusText}</Text>
              </View>
            )}

            {/* Live WebView Browser Preview */}
            {Platform.OS !== 'web' && WebView && clientScrapeUrl && (
              <View style={styles.liveBrowserBox}>
                <View style={styles.liveBrowserHeader}>
                  <Ionicons name="globe-outline" size={14} color={COLORS.accent} style={{ marginRight: 6 }} />
                  <Text style={styles.liveBrowserTitle} numberOfLines={1}>
                    {clientScrapeUrl}
                  </Text>
                  <TouchableOpacity 
                    style={styles.browserMiniActionBtn}
                    onPress={() => clientWebViewRef.current?.reload()}
                  >
                    <Ionicons name="reload" size={13} color="#FFF" />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.browserMiniActionBtn}
                    onPress={handleManualScrape}
                  >
                    <Ionicons name="flash" size={13} color={COLORS.accent} />
                    <Text style={styles.browserMiniActionText}>Ayıkla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.browserMiniExpandBtn}
                    onPress={() => setIsFullScreenBrowser(true)}
                  >
                    <Ionicons name="scan-outline" size={13} color="#FFF" />
                    <Text style={styles.browserMiniExpandText}>Tam Ekran</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.liveBrowserWebViewContainer}>
                  <WebView
                    ref={clientWebViewRef}
                    source={{ uri: clientScrapeUrl }}
                    injectedJavaScriptBeforeContentLoaded={animePageScraperInjectedJs}
                    injectedJavaScript={animePageScraperInjectedJs}
                    onLoadEnd={() => {
                      clientWebViewRef.current?.injectJavaScript('window.clofthelTriggerScrape ? window.clofthelTriggerScrape() : null; true;');
                    }}
                    onMessage={handleClientScraperMessage}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    mixedContentMode="always"
                    mediaPlaybackRequiresUserAction={false}
                    setSupportMultipleWindows={false}
                    onError={(e) => {
                      const err = `WebView Error: ${e.nativeEvent.description || 'Yükleme hatası'}`;
                      console.warn('[AnimeDetailScreen client scraper] WebView error:', err);
                      setFixStatusText(err);
                      setLastErrorMessage(err);
                      setIsFixing(false);
                    }}
                  />
                </View>
              </View>
            )}

            {/* Error Display with Copy Button */}
            {lastErrorMessage && (
              <View style={styles.errorBox}>
                <View style={styles.errorHeader}>
                  <Ionicons name="alert-circle" size={18} color={COLORS.error} style={{ marginRight: 6 }} />
                  <Text style={styles.errorTitle}>Hata / Bildirim</Text>
                </View>
                <Text style={styles.errorContent} selectable={true}>
                  {lastErrorMessage}
                </Text>
                <TouchableOpacity style={styles.copyErrorBtn} onPress={handleCopyError} activeOpacity={0.8}>
                  <Ionicons name="copy-outline" size={15} color="#FFF" style={{ marginRight: 6 }} />
                  <Text style={styles.copyErrorBtnText}>Hata Kodunu Kopyala</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Modal Action Buttons */}
            <View style={styles.fixModalActions}>
              <TouchableOpacity
                style={styles.fixCancelBtn}
                onPress={() => {
                  setIsFixModalVisible(false);
                  setClientScrapeUrl(null);
                  setLastErrorMessage(null);
                  setIsFullScreenBrowser(false);
                }}
                disabled={isFixing}
              >
                <Text style={styles.fixCancelBtnText}>Kapat</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.fixSubmitBtn, isFixing && styles.fixSubmitBtnDisabled]}
                onPress={handleFixOrAddSeason}
                disabled={isFixing}
              >
                <Text style={styles.fixSubmitBtnText}>
                  {fixMode === 'add_season' ? 'Sezonu Ekle & Tara' : 'Sezonu Tara & Düzelt'}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Full-Screen In-App Browser Modal ──────────────── */}
      <Modal 
        visible={isFullScreenBrowser && !!clientScrapeUrl} 
        animationType="slide" 
        transparent={false}
        onRequestClose={() => setIsFullScreenBrowser(false)}
      >
        <SafeAreaView style={styles.fullScreenBrowserContainer}>
          <View style={styles.fullScreenBrowserHeader}>
            <TouchableOpacity 
              style={styles.browserHeaderBtn} 
              onPress={() => setIsFullScreenBrowser(false)}
            >
              <Ionicons name="chevron-down" size={22} color="#FFF" />
              <Text style={styles.browserHeaderBtnText}>Küçült</Text>
            </TouchableOpacity>

            <Text style={styles.fullScreenBrowserUrl} numberOfLines={1}>
              {clientScrapeUrl}
            </Text>

            <TouchableOpacity 
              style={styles.browserHeaderBtn} 
              onPress={() => clientWebViewRef.current?.reload()}
            >
              <Ionicons name="reload" size={18} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.browserExtractBtn} 
              onPress={handleManualScrape}
              disabled={isFixing}
            >
              <Ionicons name="flash" size={15} color="#000" style={{ marginRight: 4 }} />
              <Text style={styles.browserExtractBtnText}>Ayıkla & Kaydet</Text>
            </TouchableOpacity>
          </View>

          {isFixing && (
            <View style={styles.browserTopStatusBar}>
              <ActivityIndicator size="small" color={COLORS.accent} style={{ marginRight: 8 }} />
              <Text style={styles.browserTopStatusText}>{fixStatusText}</Text>
            </View>
          )}

          <View style={{ flex: 1, backgroundColor: '#000' }}>
            <WebView
              ref={clientWebViewRef}
              source={{ uri: clientScrapeUrl }}
              injectedJavaScriptBeforeContentLoaded={animePageScraperInjectedJs}
              injectedJavaScript={animePageScraperInjectedJs}
              onMessage={handleClientScraperMessage}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              mixedContentMode="always"
              mediaPlaybackRequiresUserAction={false}
              setSupportMultipleWindows={false}
              onError={(e) => {
                const err = `WebView Error: ${e.nativeEvent.description || 'Yükleme hatası'}`;
                console.warn('[AnimeDetailScreen full browser] WebView error:', err);
                setFixStatusText(err);
                setLastErrorMessage(err);
                setIsFixing(false);
              }}
            />
          </View>
        </SafeAreaView>
      </Modal>
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
});
