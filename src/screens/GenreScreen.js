import { Image } from 'expo-image';
import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { fetchAnimesByGenre } from '../services/api';
import { AuthContext } from '../context/AuthContext';

export default function GenreScreen({ route, navigation }) {
  const { user } = useContext(AuthContext);
  const genre = route?.params?.genre || 'Kategori';
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadGenreAnimes = async () => {
      setLoading(true);
      try {
        const data = await fetchAnimesByGenre(genre);
        
        const seen = new Set();
        const uniqueData = [];
        for (const item of data) {
          const key = item.comparable_base_slug || item.id || item._id;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueData.push(item);
          }
        }

        if (isMounted) setResults(uniqueData);
      } catch (err) {
        console.error('[GenreScreen] Error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadGenreAnimes();
    return () => { isMounted = false; };
  }, [genre]);

  const renderItem = useCallback(({ item, index }) => {
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => {
          if (!user) {
            navigation.navigate('Login');
            return;
          }
          navigation.navigate('AnimeDetail', { anime: item });
        }}
      >
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>#{index + 1}</Text>
        </View>

        {item.coverImage ? (
          <Image source={{ uri: item.coverImage }} style={styles.cardImage} contentFit="cover" />
        ) : (
          <View style={[styles.cardImage, styles.imagePlaceholder]}>
            <Ionicons name="image-outline" size={32} color={COLORS.textMuted} />
          </View>
        )}

        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.title || item.anime_title}
          </Text>
          <View style={styles.metaRow}>
            {item.averageScore > 0 && (
              <View style={styles.scoreRow}>
                <Ionicons name="star" size={12} color={COLORS.accent} />
                <Text style={styles.scoreText}>{item.averageScore}</Text>
              </View>
            )}
            {!!item.format && (
              <View style={styles.formatBadge}>
                <Text style={styles.formatText}>{item.format}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [navigation]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bgPrimary} />
      
      {/* ── Header ───────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{genre}</Text>
          <Text style={styles.headerSubtitle}>En Popüler Seriler</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* ── Content ────────────────────────────────── */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.infoText}>Yükleniyor...</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.centerContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="film-outline" size={48} color={COLORS.textMuted} />
          </View>
          <Text style={styles.infoTitle}>Sonuç Bulunamadı</Text>
          <Text style={styles.infoSubtitle}>
            "{genre}" türünde sistemimizde kayıtlı bir seri bulunamadı.
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.title,
    fontWeight: FONT_WEIGHTS.bold,
  },
  headerSubtitle: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xxxl,
    gap: SPACING.md,
  },
  iconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: COLORS.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.title,
    fontWeight: FONT_WEIGHTS.bold,
    textAlign: 'center',
  },
  infoSubtitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    textAlign: 'center',
    lineHeight: 20,
  },
  infoText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    marginTop: SPACING.sm,
  },
  listContent: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.md,
  },
  rankBadge: {
    position: 'absolute',
    top: -5,
    left: -5,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
    zIndex: 10,
    ...SHADOWS.glow,
  },
  rankText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: FONT_WEIGHTS.heavy,
  },
  cardImage: {
    width: 60,
    height: 85,
    borderRadius: BORDER_RADIUS.sm,
  },
  imagePlaceholder: {
    backgroundColor: COLORS.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  cardTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scoreText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.bold,
  },
  formatBadge: {
    backgroundColor: 'rgba(255, 107, 0, 0.15)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 107, 0, 0.3)',
  },
  formatText: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: FONT_WEIGHTS.bold,
  },
});
