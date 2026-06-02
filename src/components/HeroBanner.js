import { Image } from 'expo-image';
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  FlatList,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeIn, SlideInDown, SlideInRight } from 'react-native-reanimated';
import {
  COLORS,
  SPACING,
  FONT_SIZES,
  FONT_WEIGHTS,
  BORDER_RADIUS,
  SHADOWS,
} from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BANNER_HEIGHT = 500;

// Türlere göre dinamik font stilleri
const getTitleStyleByGenre = (genres) => {
  const genreList = genres || [];
  if (genreList.includes('Aksiyon') || genreList.includes('Action')) {
    return {
      fontFamily: Platform.OS === 'android' ? 'sans-serif-condensed' : 'HelveticaNeue-CondensedBold',
      fontStyle: 'italic',
      textTransform: 'uppercase',
      fontWeight: '900',
      letterSpacing: 1,
    };
  }
  if (genreList.includes('Romantik') || genreList.includes('Romance')) {
    return {
      fontFamily: Platform.OS === 'android' ? 'serif' : 'Baskerville',
      fontWeight: '600',
      letterSpacing: 0.5,
    };
  }
  if (genreList.includes('Bilim Kurgu') || genreList.includes('Sci-Fi')) {
    return {
      fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo',
      fontWeight: 'bold',
      letterSpacing: -0.5,
      textTransform: 'uppercase',
    };
  }
  if (genreList.includes('Fantastik') || genreList.includes('Fantasy')) {
    return {
      fontFamily: Platform.OS === 'android' ? 'serif' : 'Palatino',
      fontWeight: '700',
      fontStyle: 'italic',
      letterSpacing: 0,
    };
  }
  // Default premium style
  return {
    fontWeight: FONT_WEIGHTS.heavy,
    letterSpacing: -0.5,
  };
};

function SlideItem({ anime, onPress, isActive }) {
  const navigation = useNavigation();
  const imageSource = anime.coverImage || anime.bannerImage;
  const genres = anime.enrichedGenres || anime.genres || [];
  const dynamicTitleStyle = getTitleStyleByGenre(genres);

  return (
    <View style={[styles.slide, { backgroundColor: '#000' }]}>
      {/* ── Background Poster (Fade In Yavaşça) ───────────────────────── */}
      {isActive && imageSource ? (
        <Animated.View
          entering={FadeIn.duration(1200)}
          style={styles.posterImage}
        >
          <Image
            source={{ uri: imageSource }}
            style={{ width: '100%', height: '100%', opacity: 0.85 }}
            contentFit="cover"
          />
        </Animated.View>
      ) : (
        <View style={[styles.poster, styles.posterPlaceholder]} />
      )}

      {/* ── Gradient Overlay ────────────────────────── */}
      <LinearGradient
        colors={[
          'rgba(9, 9, 14, 0.3)',
          'rgba(9, 9, 14, 0.6)',
          'rgba(9, 9, 14, 0.90)',
          'rgba(9, 9, 14, 0.98)',
          COLORS.bgPrimary,
        ]}
        locations={[0, 0.3, 0.55, 0.78, 1]}
        style={styles.gradient}
      />

      {/* ── Content Over Image ──────────────────────── */}
      {isActive && (
        <View style={styles.contentOverlay}>
          {/* Genre badges */}
          {genres.length > 0 && (
            <Animated.View entering={SlideInDown.duration(600).delay(200)} style={styles.genreRow}>
              {genres.slice(0, 3).map((genre, idx) => (
                <TouchableOpacity 
                  key={idx} 
                  style={styles.genreBadge}
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate('Genre', { genre })}
                >
                  <Text style={styles.genreText}>{genre}</Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          )}

          {/* Title */}
          <Animated.Text 
            entering={SlideInDown.duration(700).delay(300).springify()}
            style={[styles.title, dynamicTitleStyle]} 
            numberOfLines={2}
          >
            {anime.title || anime.anime_title}
          </Animated.Text>

          {/* Subtitle row */}
          <Animated.View entering={SlideInDown.duration(600).delay(400)} style={styles.metaRow}>
            {anime.averageScore > 0 && (
              <View style={styles.scoreBadge}>
                <Ionicons name="star" size={13} color={COLORS.accent} />
                <Text style={styles.scoreText}>{anime.averageScore}%</Text>
              </View>
            )}
            {anime.seasonYear > 0 && (
              <Text style={styles.metaText}>{anime.seasonYear}</Text>
            )}
            {anime.format && (
              <View style={styles.formatBadge}>
                <Text style={styles.formatText}>{anime.format}</Text>
              </View>
            )}
          </Animated.View>

          {/* Description snippet */}
          {anime.description && (
            <Animated.Text entering={FadeIn.duration(800).delay(500)} style={styles.description} numberOfLines={2}>
              {anime.description.replace(/<[^>]+>/g, '').trim()}
            </Animated.Text>
          )}

          {/* Action buttons */}
          <Animated.View entering={SlideInRight.duration(600).delay(600)} style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.watchButton}
              activeOpacity={0.85}
              onPress={() => onPress && onPress(anime)}
            >
              <LinearGradient
                colors={[COLORS.accent, COLORS.accentDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.watchButtonGradient}
              >
                <Ionicons name="play" size={18} color="#FFF" />
                <Text style={styles.watchButtonText}>Hemen İzle ⚡</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

export default function HeroBanner({ animes, onPress }) {
  const [activeIndex, setActiveIndex] = useState(0);

  const onScroll = useCallback((event) => {
    const slideSize = event.nativeEvent.layoutMeasurement.width;
    if (slideSize <= 0) return;
    const index = event.nativeEvent.contentOffset.x / slideSize;
    const roundIndex = Math.round(index);
    if (roundIndex !== activeIndex) {
      setActiveIndex(roundIndex);
    }
  }, [activeIndex]);

  if (!animes || animes.length === 0) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  // En fazla 5 tane göster
  const sliderAnimes = animes.slice(0, 5);

  return (
    <View style={styles.container}>
      <FlatList
        data={sliderAnimes}
        keyExtractor={(item) => item._id || item.id || `${item.anilist_id}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={SCREEN_WIDTH}
        onScroll={onScroll}
        scrollEventThrottle={16}
        removeClippedSubviews={Platform.OS === 'android'}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={3}
        renderItem={({ item, index }) => (
          <SlideItem anime={item} onPress={onPress} isActive={index === activeIndex} />
        )}
      />

      {/* Pagination Indicator */}
      {sliderAnimes.length > 1 && (
        <View style={styles.pagination}>
          {sliderAnimes.map((_, idx) => (
            <View
              key={idx}
              style={[
                styles.paginationDot,
                idx === activeIndex && styles.paginationDotActive,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: BANNER_HEIGHT,
    position: 'relative',
    marginBottom: SPACING.md,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgSecondary,
  },
  slide: {
    width: SCREEN_WIDTH,
    height: BANNER_HEIGHT,
    position: 'relative',
  },
  posterImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  posterPlaceholder: {
    backgroundColor: COLORS.bgSecondary,
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '100%',
  },
  contentOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.xl,
    paddingBottom: 40, // Pagination noktaları için alt boşluğu artırdık
  },
  genreRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  genreBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.pill,
    backgroundColor: 'rgba(255, 107, 0, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.30)',
  },
  genreText: {
    color: COLORS.accentLight,
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.semibold,
    letterSpacing: 0.3,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.hero - 2,
    fontWeight: FONT_WEIGHTS.heavy,
    lineHeight: 34,
    marginBottom: SPACING.sm,
    letterSpacing: -0.5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scoreText: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },
  metaText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
  },
  formatBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  formatText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.bold,
  },
  description: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  watchButton: {
    flex: 1,
    ...SHADOWS.glow,
  },
  watchButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
  watchButtonText: {
    color: '#FFF',
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 0.3,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Pagination Dot Styles
  pagination: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  paginationDotActive: {
    width: 18,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },
});
