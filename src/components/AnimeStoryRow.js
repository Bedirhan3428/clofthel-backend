import { Image } from 'expo-image';
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import {
  COLORS,
  SPACING,
  FONT_SIZES,
  FONT_WEIGHTS,
  BORDER_RADIUS,
  SHADOWS,
} from '../constants/theme';

const STORY_SIZE = 80;

function StoryItem({ item, onPress }) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.9);
  };
  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  const imageSource = item.coverImage || item.bannerImage;

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={() => onPress && onPress(item)}
      style={styles.storyContainer}
    >
      <Animated.View style={[styles.imageWrapper, animatedStyle]}>
        {imageSource ? (
          <Image source={{ uri: imageSource }} style={styles.storyImage} />
        ) : (
          <View style={[styles.storyImage, styles.placeholder]} />
        )}
      </Animated.View>
      <Text style={styles.storyTitle} numberOfLines={1}>
        {item.title || item.anime_title}
      </Text>
    </TouchableOpacity>
  );
}

export default function AnimeStoryRow({ title, data, loading, onAnimePress, onSeeAll, titleStyle }) {
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

      <FlatList
        data={data}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        removeClippedSubviews={true}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={3}
        keyExtractor={(item, index) => item._id || item.id || index.toString()}
        renderItem={({ item }) => <StoryItem item={item} onPress={onAnimePress} />}
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
  listContent: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
  },
  storyContainer: {
    alignItems: 'center',
    width: STORY_SIZE,
  },
  imageWrapper: {
    width: STORY_SIZE,
    height: STORY_SIZE,
    borderRadius: STORY_SIZE / 2,
    borderWidth: 2,
    borderColor: COLORS.accent,
    padding: 2,
    marginBottom: SPACING.sm,
  },
  storyImage: {
    width: '100%',
    height: '100%',
    borderRadius: STORY_SIZE / 2,
  },
  placeholder: {
    backgroundColor: COLORS.bgElevated,
  },
  storyTitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.caption,
    textAlign: 'center',
  },
  loadingRow: {
    height: STORY_SIZE + 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },
});
