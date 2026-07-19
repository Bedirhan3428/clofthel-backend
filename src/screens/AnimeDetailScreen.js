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
import { fetchAnimeDetail, fetchEpisodes, addToHistory, toggleFavorite, getProfileData, toggleAnimeInList } from '../services/api';
import { useAlert } from '../context/AlertContext';
import { AuthContext } from '../context/AuthContext';

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
  const [seasons, setSeasons] = useState([]);
  const [relatedMoviesOvas, setRelatedMoviesOvas] = useState([]);
  const [showFullDescription, setShowFullDescription] = useState(false);

  // User-related state
  const [isFavorite, setIsFavorite] = useState(false);
  const [customLists, setCustomLists] = useState([]);
  const [isListModalVisible, setIsListModalVisible] = useState(false);

  // Animation
  const fadeAnim = useRef(new Animated.Value(0)).current;

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
    setLoading(true);
    setLoadingEpisodes(true);
    fadeAnim.setValue(0);

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
      }
      setLoading(false);
    }).catch(err => {
      console.error('[Detail] Error loading detail:', err);
      if (!cancelled) setLoading(false);
    });

    // 2. Fetch episodes
    fetchEpisodes(activeMongoId).then(eps => {
      if (cancelled) return;
      setEpisodes(eps || []);
      setLoadingEpisodes(false);

      // Animate fade-in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }).catch(err => {
      console.error('[Detail] Error loading episodes:', err);
      if (!cancelled) setLoadingEpisodes(false);
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

  // ── Derived dynamic values ───────────────────────────────────
  const mainTitleEn = anime?.title || anime?.anime_title || initialTitle || 'Loading...';
  const mainTitleJp = anime?.romajiTitle || anime?.orijinal_ad || '';
  const animeType = anime?.format || 'TV';
  const bannerImage = anime?.banner_image || anime?.bannerImage || null;
  const coverImage = anime?.cover_image || anime?.coverImage || null;
  const description = anime?.description
    ? anime.description.replace(/<[^>]+>/g, '').replace(/\n+/g, ' ').trim()
    : null;
  const genres = anime?.genres || anime?.enrichedGenres || [];
  const averageScore = anime?.averageScore || anime?.average_score || null;

  // Active Label resolution
  const activeLabel = seasons.find(s => String(s._id) === String(activeMongoId))?.label ||
                      relatedMoviesOvas.find(m => String(m._id) === String(activeMongoId))?.title ||
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
            {coverImage ? (
              <Image source={{ uri: coverImage }} style={styles.posterImage} contentFit="cover" />
            ) : (
              <View style={[styles.posterImage, styles.posterPlaceholder]}>
                <Ionicons name="image-outline" size={40} color={COLORS.textMuted} />
              </View>
            )}

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
        {seasons.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sezonlar</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
              {seasons.map((season, index) => {
                const isActive = String(season._id) === String(activeMongoId);
                return (
                  <TouchableOpacity
                    key={season._id || index}
                    style={[styles.pill, isActive && styles.pillActive]}
                    onPress={() => handleSeasonSelect(season._id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
                      {season.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Related Movies/OVAs ─────────────────────── */}
        {relatedMoviesOvas.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>İlgili Film & OVA'lar</Text>
            <FlatList
              horizontal
              data={relatedMoviesOvas}
              keyExtractor={(item, i) => item._id || `movie-${i}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.movieListContent}
              renderItem={({ item }) => {
                const isActive = String(item._id) === String(activeMongoId);
                return (
                  <TouchableOpacity
                    style={[styles.movieCard, isActive && styles.movieCardActive]}
                    onPress={() => handleSeasonSelect(item._id)}
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
});
