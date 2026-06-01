import { Image } from 'expo-image';
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
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
const CARD_WIDTH = 150;
const CARD_HEIGHT = 225;

const formatDisplay = (format) => {
  if (!format) return '';
  const f = format.toUpperCase();
  if (f === 'MOVIE') return 'Film';
  if (f === 'SPECIAL') return 'Özel';
  if (f === 'OVA') return 'OVA';
  if (f === 'ONA') return 'ONA';
  return f;
};

function AnimeCard({ item, onPress }) {
  const episodesCount = item.total_episodes || item.totalEpisodes || (item.episodes ? Object.keys(item.episodes).length : null);
  
  return (
    <TouchableOpacity
      style={styles.cardWrapper}
      activeOpacity={0.85}
      onPress={() => onPress && onPress(item)}
    >
      {/* ── Card Container ─────────────────────────── */}
      <View style={styles.card}>
        {item.coverImage ? (
          <Image
            source={{ uri: item.coverImage }}
            style={styles.cardImage}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.cardImage, styles.cardPlaceholder]}>
            <Ionicons name="image-outline" size={32} color={COLORS.textMuted} />
          </View>
        )}

        {/* Bottom gradient for readability */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.85)']}
          style={styles.cardGradient}
        />

        {/* Format badge (Top Left) */}
        {item.format && (
          <View style={styles.formatBadge}>
            <Text style={styles.formatText}>{formatDisplay(item.format)}</Text>
          </View>
        )}

        {/* Score badge (Top Right) */}
        {item.averageScore > 0 && (
          <View style={styles.scoreBadge}>
            <Ionicons name="star" size={10} color={COLORS.accent} />
            <Text style={styles.scoreText}>{item.averageScore}</Text>
          </View>
        )}

        {/* Episode count badge (Bottom Left) */}
        {episodesCount ? (
          <View style={styles.episodeBadge}>
            <Text style={styles.episodeText}>{episodesCount} Bölüm</Text>
          </View>
        ) : (item.format === 'MOVIE' && (
          <View style={styles.episodeBadge}>
            <Text style={styles.episodeText}>Tek Bölüm</Text>
          </View>
        ))}
      </View>

      {/* ── Title below card ───────────────────────── */}
      <Text style={styles.cardTitle} numberOfLines={2}>
        {item.title || item.anime_title}
      </Text>
      {(item.enrichedGenres || item.genres || []).length > 0 && (
        <Text style={styles.cardGenre} numberOfLines={1}>
          {(item.enrichedGenres || item.genres).slice(0, 2).join(' • ')}
        </Text>
      )}
    </TouchableOpacity>
  );
}
export default function AnimeRow({ title, data, loading, onAnimePress, onSeeAll }) {
  return (
    <View style={styles.container}>
      {/* ── Section Header ─────────────────────────── */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <View style={styles.accentBar} />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {onSeeAll && (
          <TouchableOpacity activeOpacity={0.7} style={styles.seeAllButton} onPress={onSeeAll}>
            <Text style={styles.seeAllText}>Tümü</Text>
            <Ionicons name="chevron-forward" size={16} color={COLORS.accent} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Content ────────────────────────────────── */}
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingText}>Yükleniyor…</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item._id || item.id || `${item.anilist_id}`}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews={true}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={3}
          renderItem={({ item }) => (
            <AnimeCard item={item} onPress={onAnimePress} />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.xxl,
  },

  // ── Section Header ───────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
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
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.title,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: -0.3,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },

  // ── FlatList ─────────────────────────────────
  listContent: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
  },

  // ── Card ─────────────────────────────────────
  cardWrapper: {
    width: CARD_WIDTH,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    position: 'relative',
    ...SHADOWS.card,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgElevated,
  },
  cardGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '40%',
  },
  episodeBadge: {
    position: 'absolute',
    bottom: SPACING.sm,
    left: SPACING.sm,
    backgroundColor: 'rgba(255, 107, 0, 0.90)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.sm,
  },
  episodeText: {
    color: '#FFF',
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 0.3,
  },
  scoreBadge: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.70)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.sm,
  },
  scoreText: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.bold,
  },
  formatBadge: {
    position: 'absolute',
    top: SPACING.sm,
    left: SPACING.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.70)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  formatText: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.caption - 2,
    fontWeight: FONT_WEIGHTS.bold,
  },

  // ── Card Footer Text ─────────────────────────
  cardTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: SPACING.sm,
    lineHeight: 16,
  },
  cardGenre: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.regular,
    marginTop: 2,
  },

  // ── Loading ──────────────────────────────────
  loadingRow: {
    height: CARD_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
  },
});
