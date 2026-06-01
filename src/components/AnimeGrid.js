import { Image } from 'expo-image';
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import {
  COLORS,
  SPACING,
  FONT_SIZES,
  FONT_WEIGHTS,
  BORDER_RADIUS,
  SHADOWS,
} from '../constants/theme';

export default function AnimeGrid({ title, data, loading, onAnimePress, onSeeAll }) {
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <View style={styles.accentBar} />
            <Text style={styles.sectionTitle}>{title}</Text>
          </View>
        </View>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingText}>Yükleniyor…</Text>
        </View>
      </View>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <View style={styles.container}>
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

      <View style={styles.gridContainer}>
        {data.slice(0, 4).map((item, index) => {
          const imageSource = item.bannerImage || item.coverImage;
          return (
            <Animated.View
              key={item._id || item.id || index}
              entering={FadeInUp.delay(index * 150).duration(500)}
              style={styles.gridItemWrapper}
            >
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => onAnimePress && onAnimePress(item)}
                style={styles.card}
              >
                {imageSource ? (
                  <Image source={{ uri: imageSource }} style={styles.image} contentFit="cover" />
                ) : (
                  <View style={[styles.image, styles.placeholder]} />
                )}
                
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.9)']}
                  style={styles.gradient}
                />
                
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {item.title || item.anime_title}
                  </Text>
                  {item.averageScore > 0 && (
                    <View style={styles.scoreRow}>
                      <Ionicons name="star" size={12} color={COLORS.accent} />
                      <Text style={styles.scoreText}>{item.averageScore}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
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
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  seeAllText: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.lg,
    justifyContent: 'space-between',
  },
  gridItemWrapper: {
    width: '48%', // 2 columns
    marginBottom: SPACING.md,
  },
  card: {
    width: '100%',
    height: 140,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    backgroundColor: COLORS.bgCard,
    ...SHADOWS.subtle,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    backgroundColor: COLORS.bgElevated,
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  cardContent: {
    position: 'absolute',
    bottom: SPACING.sm,
    left: SPACING.sm,
    right: SPACING.sm,
  },
  cardTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 2,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scoreText: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.bold,
  },
  loadingRow: {
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },
});
