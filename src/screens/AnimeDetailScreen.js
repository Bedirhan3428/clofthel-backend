import { Image } from 'expo-image';
import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  FlatList,
  Linking
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
  SHADOWS,
} from '../constants/theme';
import { fetchAnimeDetail, fetchEpisodes, resetAnimeAnilistId, saveAnimeAnilistId, addToHistory, toggleFavorite, getProfileData, toggleAnimeInList } from '../services/api';
import { Modal } from 'react-native';
import { useAlert } from '../context/AlertContext';
import { AuthContext } from '../context/AuthContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COVER_HEIGHT = 420;

export default function AnimeDetailScreen({ route, navigation }) {
  const { showAlert } = useAlert();
  
  const handleOpenURL = async (url) => {
    if (!url) {
      showAlert('Hata', 'Bu bölümün izleme adresi bulunamadı.');
      return;
    }
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        showAlert('Hata', 'Bu adres cihazınız tarafından desteklenmiyor: ' + url);
      }
    } catch (error) {
      showAlert('Hata', 'Bağlantı açılırken bir sorun oluştu.');
    }
  };

  const { anime: passedAnime } = route.params;

  const [anime, setAnime] = useState(passedAnime);
  const [episodes, setEpisodes] = useState([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(true);
  const [isFixingAnilist, setIsFixingAnilist] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [customLists, setCustomLists] = useState([]);
  const [isListModalVisible, setIsListModalVisible] = useState(false);

  const [lastWatchedEntry, setLastWatchedEntry] = useState(null);

  const { user } = useContext(AuthContext);

  useEffect(() => {
    const checkUserData = async () => {
      if (user) {
        const data = await getProfileData();
        if (data) {
          if (data.favorites) {
            const favObj = data.favorites.find(f => f._id === anime._id || f === anime._id);
            setIsFavorite(!!favObj);
          }
          if (data.customLists) {
            setCustomLists(data.customLists);
          }
          if (data.watchHistory) {
            const historyObj = data.watchHistory.find(
              h => h.anime && (h.anime._id === anime._id || h.anime === anime._id)
            );
            if (historyObj) {
              setLastWatchedEntry(historyObj);
            }
          }
        }
      }
    };
    checkUserData();
  }, [anime._id, user]);

  const handleToggleFavorite = async () => {
    if (!user) {
      showAlert('Giriş Gerekli', 'Favorilere eklemek için lütfen giriş yapın.');
      return;
    }
    const res = await toggleFavorite(anime._id);
    if (res && res.success) {
      setIsFavorite(res.isFavorite);
    }
  };

  const handleToggleAnimeInList = async (listId) => {
    const res = await toggleAnimeInList(listId, anime._id);
    if (res && res.success) {
      setCustomLists(res.customLists);
    }
  };

  const seasonsList = (anime.seasons || []).filter(s => s.category === 'seasons' || !s.category);
  const moviesList = (anime.seasons || []).filter(s => s.category === 'movies');
  const ovasList = (anime.seasons || []).filter(s => s.category === 'ovas');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Eğer detaylı veri veya sezon listesi yoksa backend'den çek
      if ((!anime.description || !anime.seasons) && anime._id) {
        const detail = await fetchAnimeDetail(anime._id);
        if (detail) setAnime(detail);
      }

      // Bölümleri çek
      const animeId = anime._id || anime.id;
      if (animeId) {
        const eps = await fetchEpisodes(animeId);
        setEpisodes(eps);
      }
    } catch (error) {
      console.error('[AnimeDetail] Error:', error);
    } finally {
      setLoadingEpisodes(false);
    }
  };

  const handleSeasonSelect = async (selectedId) => {
    if (selectedId === anime._id) return;
    setLoadingEpisodes(true);
    
    // Instantly update the cover image for a seamless premium feel
    const targetSeason = (anime.seasons || []).find(s => s._id === selectedId);
    if (targetSeason && targetSeason.cover_image) {
      setAnime(prev => ({ ...prev, coverImage: targetSeason.cover_image }));
    }

    try {
      const detail = await fetchAnimeDetail(selectedId);
      if (detail) {
        // Keep the original seasons list structure intact to prevent UI jumping
        detail.seasons = anime.seasons;
        setAnime(detail);
      }
      const eps = await fetchEpisodes(selectedId);
      setEpisodes(eps);
    } catch (error) {
      console.error('[handleSeasonSelect] Error:', error);
    } finally {
      setLoadingEpisodes(false);
    }
  };

  const handleFixAnilist = async () => {
    if (isFixingAnilist) return;
    setIsFixingAnilist(true);
    try {
      await resetAnimeAnilistId(anime._id);
      const detail = await fetchAnimeDetail(anime._id);
      if (detail) {
        detail.seasons = anime.seasons; // keep original seasons structure
        setAnime(detail);
        if (detail.anilist_id) {
          await saveAnimeAnilistId(anime._id, detail.anilist_id, detail.coverImage, detail.bannerImage, detail.orijinal_ad, detail.format);
        }
      }
    } catch (error) {
      console.warn('[AnimeDetail] Error fixing anilist', error);
    } finally {
      setIsFixingAnilist(false);
    }
  };

  const cleanDescription = anime.description
    ? anime.description.replace(/<[^>]+>/g, '').replace(/\n+/g, ' ').trim()
    : null;

  const renderEpisodeItem = useCallback(({ item }) => (
    <TouchableOpacity
      style={styles.episodeCard}
      activeOpacity={0.8}
      onPress={() => {
        if (user) {
          addToHistory(anime._id, item.episode_number);
        }
        navigation.navigate('Resolve', {
          animeId: anime._id,
          episodeNumber: item.episode_number,
          episodeTitle: item.episode_title || `Bölüm ${item.episode_number}`,
          animeTitle: anime.title || anime.anime_title
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
        <Text style={styles.episodeMeta} numberOfLines={1}>
          {item.source_url ? 'Hazır' : 'Kaynak yok'}
        </Text>
      </View>
      <View style={styles.episodePlayButton}>
        <Ionicons name="play" size={16} color={COLORS.accent} />
      </View>
    </TouchableOpacity>
  ), [anime, navigation]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Cover Image ────────────────────────────── */}
        <View style={styles.coverContainer}>
          {anime.coverImage ? (
            <Image
              source={{ uri: anime.coverImage }}
              style={styles.coverImage}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.coverImage, styles.coverPlaceholder]}>
              <Ionicons name="image-outline" size={64} color={COLORS.textMuted} />
            </View>
          )}

          {/* Gradient overlay */}
          <LinearGradient
            colors={[
              'rgba(9, 9, 14, 0.20)',
              'rgba(9, 9, 14, 0.50)',
              'rgba(9, 9, 14, 0.85)',
              COLORS.bgPrimary,
            ]}
            locations={[0, 0.4, 0.7, 1]}
            style={styles.coverGradient}
          />

          {/* Back button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.infoContainer}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text style={[styles.title, { flex: 1, paddingRight: 10 }]} numberOfLines={3}>
              {anime.title || anime.anime_title}
            </Text>
            
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity 
                style={styles.fixAnilistButton} 
                onPress={handleFixAnilist}
                disabled={isFixingAnilist}
              >
                {isFixingAnilist ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="sync-outline" size={14} color="#FFF" style={{ marginRight: 4 }} />
                    <Text style={styles.fixAnilistText}>Güncelle</Text>
                  </>
                )}
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.favoriteButton} 
                onPress={handleToggleFavorite}
              >
                <Ionicons 
                  name={isFavorite ? "heart" : "heart-outline"} 
                  size={24} 
                  color={isFavorite ? "#FF3B30" : COLORS.textSecondary} 
                />
              </TouchableOpacity>
            </View>
          </View>

          {!!anime.romajiTitle && anime.romajiTitle !== anime.title && (
            <Text style={styles.romajiTitle} numberOfLines={1}>
              {anime.romajiTitle}
            </Text>
          )}

          <View style={styles.metaRow}>
            {anime.averageScore > 0 && (
              <View style={styles.scoreBadge}>
                <Ionicons name="star" size={14} color={COLORS.accent} />
                <Text style={styles.scoreText}>{anime.averageScore}%</Text>
              </View>
            )}
            {!!anime.status && (
              <View style={[
                styles.statusBadge,
                anime.status === 'Devam Ediyor' && styles.statusOngoing,
              ]}>
                <Text style={styles.statusText}>{anime.status}</Text>
              </View>
            )}
            {!loadingEpisodes && episodes.length > 0 ? (
              <Text style={styles.metaText}>{episodes.length} Bölüm</Text>
            ) : anime.totalEpisodes ? (
              <Text style={styles.metaText}>{anime.totalEpisodes} Bölüm</Text>
            ) : null}
            {anime.seasonYear > 0 && (
              <Text style={styles.metaText}>{anime.seasonYear}</Text>
            )}
          </View>

          {(anime.enrichedGenres || anime.genres || []).length > 0 && (
            <View style={styles.genreRow}>
              {(anime.enrichedGenres || anime.genres).slice(0, 5).map((genre, idx) => (
                <View key={idx} style={styles.genreBadge}>
                  <Text style={styles.genreText}>{genre}</Text>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={styles.watchButton}
            activeOpacity={0.85}
            onPress={() => {
              if (lastWatchedEntry) {
                navigation.navigate('Resolve', {
                  animeId: anime._id,
                  episodeNumber: lastWatchedEntry.episode,
                  episodeTitle: `${lastWatchedEntry.episode}. Bölüm`,
                  animeTitle: anime.title || anime.anime_title,
                  startAt: lastWatchedEntry.currentTime || 0
                });
              } else {
                const firstEp = episodes[0];
                if (firstEp) {
                  navigation.navigate('Resolve', {
                    animeId: anime._id,
                    episodeNumber: firstEp.episode_number,
                    episodeTitle: firstEp.episode_title || `Bölüm ${firstEp.episode_number}`,
                    animeTitle: anime.title || anime.anime_title
                  });
                } else if (anime.tranimeizle_url) {
                  navigation.navigate('Resolve', {
                    animeId: anime._id,
                    episodeNumber: 1,
                    episodeTitle: anime.title || anime.anime_title,
                    animeTitle: anime.title || anime.anime_title
                  });
                }
              }
            }}
          >
            <LinearGradient
              colors={[COLORS.accent, COLORS.accentDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.watchButtonGradient}
            >
              <Ionicons name={lastWatchedEntry ? "play-forward" : "play"} size={20} color="#FFF" />
              <Text style={styles.watchButtonText}>
                {lastWatchedEntry 
                  ? `İzlemeye Devam Et (${lastWatchedEntry.episode}. Bölüm)` 
                  : 'İzlemeye Başla'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.actionRow}>
            <TouchableOpacity 
              style={[styles.actionButton, isFavorite && styles.actionButtonActive]} 
              onPress={handleToggleFavorite}
            >
              <Ionicons name={isFavorite ? "heart" : "heart-outline"} size={20} color={isFavorite ? "#FF3B30" : "#FFF"} />
              <Text style={[styles.actionButtonText, isFavorite && { color: "#FF3B30" }]}>Favori</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionButton} 
              onPress={() => {
                if (!user) {
                  showAlert('Giriş Gerekli', 'Listeye eklemek için giriş yapın.');
                } else {
                  setIsListModalVisible(true);
                }
              }}
            >
              <Ionicons name="list" size={20} color="#FFF" />
              <Text style={styles.actionButtonText}>Listeye Ekle</Text>
            </TouchableOpacity>
          </View>

          {cleanDescription && (
            <View style={styles.descriptionContainer}>
              <Text style={styles.sectionLabel}>Özet</Text>
              <Text
                style={styles.descriptionText}
                numberOfLines={showFullDescription ? undefined : 4}
              >
                {cleanDescription}
              </Text>
              {cleanDescription.length > 200 && (
                <TouchableOpacity
                  onPress={() => setShowFullDescription(!showFullDescription)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.readMoreText}>
                    {showFullDescription ? 'Daha az göster' : 'Devamını oku'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={styles.episodesSection}>
            {seasonsList.length > 0 && seasonsList.length !== (anime.seasons || []).length && (
              <View style={styles.groupContainer}>
                <Text style={styles.groupLabel}>Sezonlar</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.seasonSelectorScroll}
                >
                  {seasonsList.map((season) => {
                    const isSelected = season._id === anime._id;
                    return (
                      <TouchableOpacity
                        key={season._id}
                        style={[
                          styles.seasonTab,
                          isSelected && styles.seasonTabSelected,
                        ]}
                        activeOpacity={0.7}
                        onPress={() => handleSeasonSelect(season._id)}
                      >
                        <Text
                          style={[
                            styles.seasonTabText,
                            isSelected && styles.seasonTabTextSelected,
                          ]}
                        >
                          {season.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {moviesList.length > 0 && (
              <View style={styles.groupContainer}>
                <Text style={styles.groupLabel}>Filmler</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.seasonSelectorScroll}
                >
                  {moviesList.map((season) => {
                    const isSelected = season._id === anime._id;
                    return (
                      <TouchableOpacity
                        key={season._id}
                        style={[
                          styles.seasonTab,
                          isSelected && styles.seasonTabSelected,
                        ]}
                        activeOpacity={0.7}
                        onPress={() => handleSeasonSelect(season._id)}
                      >
                        <Text
                          style={[
                            styles.seasonTabText,
                            isSelected && styles.seasonTabTextSelected,
                          ]}
                        >
                          {season.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {ovasList.length > 0 && (
              <View style={styles.groupContainer}>
                <Text style={styles.groupLabel}>OVA & Özel Bölümler</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.seasonSelectorScroll}
                >
                  {ovasList.map((season) => {
                    const isSelected = season._id === anime._id;
                    return (
                      <TouchableOpacity
                        key={season._id}
                        style={[
                          styles.seasonTab,
                          isSelected && styles.seasonTabSelected,
                        ]}
                        activeOpacity={0.7}
                        onPress={() => handleSeasonSelect(season._id)}
                      >
                        <Text
                          style={[
                            styles.seasonTabText,
                            isSelected && styles.seasonTabTextSelected,
                          ]}
                        >
                          {season.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {anime.seasons && anime.seasons.length > 1 && 
             (seasonsList.length === anime.seasons.length || 
              moviesList.length === anime.seasons.length || 
              ovasList.length === anime.seasons.length) && (
              <View style={styles.seasonSelectorContainer}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.seasonSelectorScroll}
                >
                  {anime.seasons.map((season) => {
                    const isSelected = season._id === anime._id;
                    return (
                      <TouchableOpacity
                        key={season._id}
                        style={[
                          styles.seasonTab,
                          isSelected && styles.seasonTabSelected,
                        ]}
                        activeOpacity={0.7}
                        onPress={() => handleSeasonSelect(season._id)}
                      >
                        <Text
                          style={[
                            styles.seasonTabText,
                            isSelected && styles.seasonTabTextSelected,
                          ]}
                        >
                          {season.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <View style={styles.episodesHeader}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.accentBar} />
                <Text style={styles.sectionLabel}>Bölümler</Text>
              </View>
              <Text style={styles.episodeCount}>
                {loadingEpisodes ? '...' : `${episodes.length} bölüm`}
              </Text>
            </View>

            {loadingEpisodes ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.accent} />
                <Text style={styles.loadingText}>Bölümler yükleniyor…</Text>
              </View>
            ) : episodes.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="film-outline" size={48} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>Henüz bölüm eklenmemiş</Text>
              </View>
            ) : (
              <FlatList
                data={episodes}
                keyExtractor={(item) => item._id || `${item.episode_number}`}
                renderItem={renderEpisodeItem}
                scrollEnabled={false}
                contentContainerStyle={styles.episodeList}
              />
            )}
          </View>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>

      <Modal visible={isListModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Listeye Ekle</Text>
              <TouchableOpacity onPress={() => setIsListModalVisible(false)}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalListScroll}>
              {customLists.map(list => {
                const isAdded = list.animes && list.animes.some(a => (a._id || a) === anime._id);
                return (
                  <TouchableOpacity 
                    key={list._id} 
                    style={styles.modalListItem}
                    onPress={() => handleToggleAnimeInList(list._id)}
                  >
                    <Text style={styles.modalListItemText}>{list.name}</Text>
                    <Ionicons 
                      name={isAdded ? "checkmark-circle" : "ellipse-outline"} 
                      size={24} 
                      color={isAdded ? COLORS.accent : COLORS.textMuted} 
                    />
                  </TouchableOpacity>
                );
              })}
              {customLists.length === 0 && (
                <Text style={styles.emptyTextSm}>Henüz özel liste oluşturmadınız. Profil sekmesinden oluşturabilirsiniz.</Text>
              )}
            </ScrollView>
          </View>
        </View>
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

  coverContainer: {
    width: SCREEN_WIDTH,
    height: COVER_HEIGHT,
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    backgroundColor: COLORS.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '100%',
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: SPACING.lg,
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.50)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.divider,
  },

  infoContainer: {
    paddingHorizontal: SPACING.xl,
    marginTop: -SPACING.xxxl,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.heading,
    fontWeight: FONT_WEIGHTS.heavy,
    lineHeight: 32,
    letterSpacing: -0.5,
    marginBottom: SPACING.xs,
  },
  romajiTitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
    marginBottom: SPACING.md,
    fontStyle: 'italic',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accentGlowSubtle,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  scoreText: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  statusOngoing: {
    backgroundColor: 'rgba(0, 200, 83, 0.15)',
  },
  statusText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  metaText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
  },
  genreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  genreBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.pill,
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.25)',
  },
  genreText: {
    color: COLORS.accentLight,
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.semibold,
  },

  watchButton: {
    marginBottom: SPACING.xxl,
    ...SHADOWS.card,
  },
  watchButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md + 2,
    borderRadius: BORDER_RADIUS.lg,
  },
  watchButtonText: {
    color: '#FFF',
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 0.3,
  },
  fixAnilistText: {
    color: '#FFF',
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.bold,
  },
  favoriteButton: {
    padding: SPACING.sm,
    marginLeft: SPACING.xs,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: BORDER_RADIUS.pill,
  },

  // ── Description ──────────────────────────────
  descriptionContainer: {
    marginBottom: SPACING.xxl,
  },
  sectionLabel: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.title,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md,
    letterSpacing: -0.3,
  },
  descriptionText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    lineHeight: 22,
  },
  readMoreText: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: SPACING.sm,
  },

  // ── Episodes ─────────────────────────────────
  episodesSection: {
    marginBottom: SPACING.xxxl,
  },
  episodesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  accentBar: {
    width: 4,
    height: 20,
    borderRadius: 2,
    backgroundColor: COLORS.accent,
    ...SHADOWS.glow,
  },
  episodeCount: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
  },
  episodeList: {
    gap: SPACING.sm,
  },

  // ── Episode Card ─────────────────────────────
  episodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.md,
  },
  episodeNumberBadge: {
    width: 42,
    height: 42,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.accentGlowSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderAccent,
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
    marginBottom: 2,
  },
  episodeMeta: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.regular,
  },
  episodePlayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accentGlowSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Season Selector ──────────────────────────
  seasonSelectorContainer: {
    marginBottom: SPACING.lg,
  },
  seasonSelectorScroll: {
    gap: SPACING.sm,
    paddingRight: SPACING.xl,
  },
  seasonTab: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  seasonTabSelected: {
    backgroundColor: COLORS.accentGlowSubtle,
    borderColor: COLORS.borderAccent,
  },
  seasonTabText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  seasonTabTextSelected: {
    color: COLORS.accent,
  },
  groupContainer: {
    marginBottom: SPACING.lg,
  },
  groupLabel: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.lg,
  },

  // ── Loading / Empty ──────────────────────────
  loadingContainer: {
    paddingVertical: SPACING.xxxl,
    alignItems: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
  },
  emptyContainer: {
    paddingVertical: SPACING.xxxl,
    alignItems: 'center',
    gap: SPACING.md,
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.md,
    marginTop: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgElevated,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    flex: 1,
  },
  actionButtonActive: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
    marginLeft: SPACING.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.bgPrimary,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    paddingBottom: SPACING.xl + 32, // Alt kısımdan ekstra boşluk
    maxHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  modalTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
  },
  modalListScroll: {
    marginBottom: SPACING.md,
  },
  modalListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  modalListItemText: {
    color: '#FFF',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
  },
  emptyTextSm: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    textAlign: 'center',
    marginTop: SPACING.xl,
  },
});
