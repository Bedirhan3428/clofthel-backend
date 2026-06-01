import { Image } from 'expo-image';
import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { searchAnimes } from '../services/api';
import { AuthContext } from '../context/AuthContext';

export default function SearchScreen({ route, navigation }) {
  const { user } = useContext(AuthContext);
  const [query, setQuery] = useState(route?.params?.initialQuery || '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (route?.params?.initialQuery) {
      setQuery(route.params.initialQuery);
    }
  }, [route?.params?.initialQuery]);

  useEffect(() => {
    let isActive = true;

    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const delayDebounce = setTimeout(async () => {
      try {
        const data = await searchAnimes(query.trim());
        const seen = new Set();
        const uniqueData = [];
        for (const item of data) {
          const key = item.comparable_base_slug || item.id || item._id;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueData.push(item);
          }
        }
        if (isActive) {
          setResults(uniqueData);
        }
      } catch (err) {
        console.error('[SearchScreen] Error:', err);
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }, 400); // 400ms debounce

    return () => {
      isActive = false;
      clearTimeout(delayDebounce);
    };
  }, [query]);

  const renderSearchItem = useCallback(({ item }) => {
    return (
      <TouchableOpacity
        style={styles.searchCard}
        activeOpacity={0.8}
        onPress={() => {
          if (!user) {
            navigation.navigate('Login');
            return;
          }
          navigation.navigate('AnimeDetail', { anime: item });
        }}
      >
        {item.coverImage ? (
          <Image source={{ uri: item.coverImage }} style={styles.cardImage} contentFit="cover" />
        ) : (
          <View style={[styles.cardImage, styles.imagePlaceholder]}>
            <Ionicons name="image-outline" size={24} color={COLORS.textMuted} />
          </View>
        )}

        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.title || item.anime_title}
          </Text>
          <View style={styles.metaRow}>
            {!!item.format && (
              <View style={styles.formatBadge}>
                <Text style={styles.formatText}>{item.format}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.arrowButton}>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textSecondary} />
        </View>
      </TouchableOpacity>
    );
  }, [navigation]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bgPrimary} />
      
      {/* ── Search Header ───────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>

        <View style={styles.inputContainer}>
          <Ionicons name="search" size={18} color={COLORS.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={styles.input}
            placeholder="Anime adı ara..."
            placeholderTextColor={COLORS.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
          {query.trim().length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} style={styles.clearButton}>
              <Ionicons name="close-circle" size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Content ────────────────────────────────── */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.infoText}>Sonuçlar aranıyor...</Text>
        </View>
      ) : query.trim() === '' ? (
        <View style={styles.centerContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="search-outline" size={48} color={COLORS.accent} />
          </View>
          <Text style={styles.infoTitle}>Anime Ara</Text>
          <Text style={styles.infoSubtitle}>
            5000'den fazla anime başlığı arasından dilediğini ara ve hemen izlemeye başla!
          </Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.centerContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="film-outline" size={48} color={COLORS.textMuted} />
          </View>
          <Text style={styles.infoTitle}>Sonuç Bulunamadı</Text>
          <Text style={styles.infoSubtitle}>
            "{query}" aramasına uygun hiçbir anime bulunamadı. Lütfen kelimeleri kontrol edin.
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item._id}
          renderItem={renderSearchItem}
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
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    gap: SPACING.md,
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
  inputContainer: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.bgSecondary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchIcon: {
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.body,
    padding: 0,
  },
  clearButton: {
    padding: 4,
  },
  listContent: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.md,
  },
  cardImage: {
    width: 50,
    height: 70,
    borderRadius: BORDER_RADIUS.sm,
  },
  imagePlaceholder: {
    backgroundColor: COLORS.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
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
  metaText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.small,
  },
  arrowButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
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
  },
});
