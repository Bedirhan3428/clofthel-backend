import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../constants/theme';
import { useAnimeDirectory } from '../context/AnimeDirectoryContext';
import { AuthContext } from '../context/AuthContext';

// ── Format badge colors ────────────────────────────────────────
const FORMAT_COLORS = {
  TV: { bg: 'rgba(255, 107, 0, 0.15)', border: 'rgba(255, 107, 0, 0.3)', text: COLORS.accent },
  Movie: { bg: 'rgba(147, 51, 234, 0.15)', border: 'rgba(147, 51, 234, 0.3)', text: '#9333EA' },
  OVA: { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.3)', text: '#3B82F6' },
  ONA: { bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.3)', text: '#10B981' },
  Special: { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.3)', text: '#F59E0B' },
};

function getFormatStyle(type) {
  return FORMAT_COLORS[type] || FORMAT_COLORS.TV;
}

export default function SearchScreen({ route, navigation }) {
  const { user } = useContext(AuthContext);
  const { searchAnime, isLoading: directoryLoading } = useAnimeDirectory();
  const [query, setQuery] = useState(route?.params?.initialQuery || '');
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (route?.params?.initialQuery) {
      setQuery(route.params.initialQuery);
    }
  }, [route?.params?.initialQuery]);

  // ── Instant local search (zero network latency) ──────────────
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      return;
    }

    // Synchronous fuzzy search — no debounce needed
    const matches = searchAnime(query.trim());
    setResults(matches);
  }, [query, searchAnime]);

  const renderSearchItem = useCallback(({ item }) => {
    const formatStyle = getFormatStyle(item.type);
    const seasonCount = (item.seasons || []).length;
    const movieCount = (item.related_movies_or_ovas || []).length;

    return (
      <TouchableOpacity
        style={styles.searchCard}
        activeOpacity={0.8}
        onPress={() => {
          if (!user) {
            navigation.navigate('Login');
            return;
          }
          navigation.navigate('AnimeDetail', { orchestratorEntry: item });
        }}
      >
        {/* Cover image or fallback type icon */}
        {item.cover_image ? (
          <Image
            source={{ uri: item.cover_image }}
            style={styles.typeIcon}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.typeIcon, { backgroundColor: formatStyle.bg, borderColor: formatStyle.border }]}>
            <Ionicons
              name={item.type === 'Movie' ? 'film-outline' : 'tv-outline'}
              size={22}
              color={formatStyle.text}
            />
          </View>
        )}

        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.main_title_en}
          </Text>
          <View style={styles.metaRow}>
            <View style={[styles.formatBadge, { backgroundColor: formatStyle.bg, borderColor: formatStyle.border }]}>
              <Text style={[styles.formatText, { color: formatStyle.text }]}>{item.type}</Text>
            </View>
            {seasonCount > 0 && (
              <Text style={styles.metaText}>
                {seasonCount} Sezon
              </Text>
            )}
            {movieCount > 0 && (
              <Text style={styles.metaText}>
                • {movieCount} Film/OVA
              </Text>
            )}
          </View>
          {item.main_title_jp && item.main_title_jp !== item.main_title_en && (
            <Text style={styles.jpTitle} numberOfLines={1}>
              {item.main_title_jp}
            </Text>
          )}
        </View>

        <View style={styles.arrowButton}>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textSecondary} />
        </View>
      </TouchableOpacity>
    );
  }, [navigation, user]);

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
      {directoryLoading ? (
        <View style={styles.centerContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="cloud-download-outline" size={48} color={COLORS.accent} />
          </View>
          <Text style={styles.infoTitle}>Katalog Yükleniyor</Text>
          <Text style={styles.infoSubtitle}>
            Anime kataloğu hazırlanıyor, lütfen bekleyin...
          </Text>
        </View>
      ) : query.trim().length < 2 ? (
        <View style={styles.centerContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="search-outline" size={48} color={COLORS.accent} />
          </View>
          <Text style={styles.infoTitle}>Anime Ara</Text>
          <Text style={styles.infoSubtitle}>
            3899 anime başlığı arasından anında ara ve hemen izlemeye başla!
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
          keyExtractor={(item) => item._key}
          renderItem={renderSearchItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
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
  typeIcon: {
    width: 50,
    height: 50,
    borderRadius: BORDER_RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
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
  jpTitle: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.small,
    marginTop: 2,
    fontStyle: 'italic',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  formatBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 0.5,
  },
  formatText: {
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
});
