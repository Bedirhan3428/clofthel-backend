import { Image } from 'expo-image';
import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Dimensions,
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_SIZE = SCREEN_WIDTH * 0.72;
const SPACING_ITEM = 10;
const FULL_SIZE = ITEM_SIZE + SPACING_ITEM * 2;

export default function AnimeAnimatedCardRow({ title, data, loading, onAnimePress, onSeeAll, titleStyle }) {
  const scrollX = useRef(new Animated.Value(0)).current;

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <View style={styles.accentBar} />
            <Text style={[styles.sectionTitle, titleStyle]}>{title}</Text>
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
          <Text style={[styles.sectionTitle, titleStyle]}>{title}</Text>
        </View>
        {onSeeAll && (
          <TouchableOpacity activeOpacity={0.7} style={styles.seeAllButton} onPress={onSeeAll}>
            <Text style={styles.seeAllText}>Tümü</Text>
            <Ionicons name="chevron-forward" size={16} color={COLORS.accent} />
          </TouchableOpacity>
        )}
      </View>

      <Animated.FlatList
        data={data}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={FULL_SIZE}
        decelerationRate="fast"
        bounces={false}
        removeClippedSubviews={true}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={3}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: (SCREEN_WIDTH - ITEM_SIZE) / 2 }}
        keyExtractor={(item, index) => item._id || item.id || index.toString()}
        renderItem={({ item, index }) => {
          const inputRange = [
            (index - 1) * FULL_SIZE,
            index * FULL_SIZE,
            (index + 1) * FULL_SIZE,
          ];

          const scale = scrollX.interpolate({
            inputRange,
            outputRange: [0.85, 1, 0.85],
            extrapolate: 'clamp',
          });

          const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.6, 1, 0.6],
            extrapolate: 'clamp',
          });

          const imageSource = item.coverImage || item.bannerImage;

          return (
            <View style={{ width: FULL_SIZE, alignItems: 'center' }}>
              <Animated.View style={[styles.cardContainer, { transform: [{ scale }], opacity }]}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => onAnimePress && onAnimePress(item)}
                  style={styles.card}
                >
                  {imageSource ? (
                    <Image source={{ uri: imageSource }} style={styles.image} contentFit="cover" />
                  ) : (
                    <View style={[styles.image, styles.placeholder]} />
                  )}

                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.95)']}
                    style={styles.gradient}
                  />

                  <View style={styles.cardContent}>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {item.title || item.anime_title}
                    </Text>
                    {item.averageScore > 0 && (
                      <View style={styles.scoreRow}>
                        <Ionicons name="star" size={14} color={COLORS.accent} />
                        <Text style={styles.scoreText}>{item.averageScore}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              </Animated.View>
            </View>
          );
        }}
      />
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
  cardContainer: {
    width: ITEM_SIZE,
    height: ITEM_SIZE * 1.2,
  },
  card: {
    flex: 1,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.bgCard,
    ...SHADOWS.card,
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
    height: '50%',
  },
  cardContent: {
    position: 'absolute',
    bottom: SPACING.md,
    left: SPACING.md,
    right: SPACING.md,
  },
  cardTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.heavy,
    marginBottom: SPACING.xs,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scoreText: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },
  loadingRow: {
    height: ITEM_SIZE * 1.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },
});
