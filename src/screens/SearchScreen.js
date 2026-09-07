import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  StatusBar,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../constants/theme';
import { searchAnimes as searchAniList } from '../services/anilistService';
import { detectSeasonNumber, detectPartNumber } from '../services/lightweightResolver';

// ── Format badge colors ────────────────────────────────────────
const FORMAT_COLORS = {
  TV: { bg: 'rgba(255, 107, 0, 0.15)', border: 'rgba(255, 107, 0, 0.3)', text: COLORS.accent },
  MOVIE: { bg: 'rgba(147, 51, 234, 0.15)', border: 'rgba(147, 51, 234, 0.3)', text: '#9333EA' },
  Movie: { bg: 'rgba(147, 51, 234, 0.15)', border: 'rgba(147, 51, 234, 0.3)', text: '#9333EA' },
  OVA: { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.3)', text: '#3B82F6' },
  ONA: { bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.3)', text: '#10B981' },
  SPECIAL: { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.3)', text: '#F59E0B' },
  Special: { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.3)', text: '#F59E0B' },
};

function getFormatStyle(type) {
  return FORMAT_COLORS[type] || FORMAT_COLORS.TV;
}

export default function SearchScreen({ route, navigation }) {
  const [query, setQuery] = useState(route?.params?.initialQuery || '');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (route?.params?.initialQuery) {
      setQuery(route.params.initialQuery);
    }
  }, [route?.params?.initialQuery]);

  // ── Pure AniList GraphQL Search with Zero-Tolerance Season Priority ──
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    if (trimmed.toLowerCase() === 'localapp') {
      Linking.openURL('http://192.168.1.13:23504');
      return;
    }

    let cancelled = false;
    setIsSearching(true);

    const timer = setTimeout(async () => {
      try {
        const detectedSeason = detectSeasonNumber(trimmed, 0);
        const detectedPart = detectPartNumber(trimmed, 0);
        const isTargetFinal = /(?:final\s*(?:season|sezon)|the\s*final|son\s*sezon|\(final\))/i.test(trimmed);
        const cleanQuery = trimmed
          .replace(/\b(\d+)\s*\.?\s*(?:sezon|season)\b/gi, '')
          .replace(/\b(?:sezon|season)\s*(\d+)\b/gi, '')
          .replace(/\b(?:1st|2nd|3rd|4th|5th)\s*(?:sezon|season)\b/gi, '')
          .replace(/\b(?:part|cour|kısım|kisim)\s*(\d+)\b/gi, '')
          .replace(/\b(\d+)\s*\.?\s*(?:part|cour|kısım|kisim)\b/gi, '')
          .replace(/\b(?:the\s+)?final\s*(?:season|sezon)?\b/gi, '')
          .trim();

        let aniListMatches = await searchAniList(trimmed, 1, 30);
        if (cancelled) return;

        // Turkish "X. Sezon" or "X. Kısım" return 0 results on AniList -> fallback to clean query
        if ((!aniListMatches || aniListMatches.length === 0) && cleanQuery && cleanQuery !== trimmed && cleanQuery.length >= 2) {
          aniListMatches = await searchAniList(cleanQuery, 1, 30);
          if (cancelled) return;
        }

        if (Array.isArray(aniListMatches)) {
          // KULLANICI KESİN KURALI: Film ve TV dışında hiçbir OVA, ONA, Special, Recap listelenmez!
          const cleanMatches = aniListMatches.filter(item => {
            if (!item) return false;
            const fmt = (item.format || '').toUpperCase();
            if (!['TV', 'MOVIE'].includes(fmt)) return false;
            const fullTitle = `${item.title || ''} ${item.title_romaji || ''} ${item.title_english || ''} ${item.title_native || ''}`.toLowerCase();
            if (/(?:özel|ozel|özet|offline|chibi|omake|picture drama|audio drama|drama cd|side story|tokubetsu|soushuuhen|parody|parodi|petit|puchi|bonus|extras|short anime|kısa anime|kisa anime|\b(?:ova|oad|ona|sp|special|specials|recap)\b)/i.test(fullTitle)) {
              return false;
            }
            return true;
          });

          let sorted = cleanMatches;
          if (detectedSeason > 0 || detectedPart > 0 || isTargetFinal) {
            const matching = cleanMatches.filter(item => {
              const fullT = `${item.title || ''} ${item.title_romaji || ''} ${item.title_english || ''}`;
              const s = detectSeasonNumber(fullT, 1);
              const p = detectPartNumber(fullT, 1);
              const itemFinal = /(?:final\s*(?:season|sezon)|the\s*final|son\s*sezon|\(final\)|\bfinal\b)/i.test(fullT);
              const seasonMatch = detectedSeason > 0 ? s === detectedSeason : true;
              const partMatch = detectedPart > 0 ? p === detectedPart : true;
              const finalMatch = isTargetFinal ? itemFinal : true;
              return seasonMatch && partMatch && finalMatch;
            });
            const others = cleanMatches.filter(item => !matching.includes(item));
            if (matching.length > 0) {
              sorted = [...matching, ...others];
            }
          }
          setResults(sorted);
        } else {
          setResults([]);
        }
      } catch (err) {
        console.warn('[SearchScreen] AniList search error:', err.message);
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const renderSearchItem = useCallback(({ item }) => {
    const itemType = item.format || 'TV';
    const formatStyle = getFormatStyle(itemType);
    const titleText = item.title || item.orijinal_ad || 'İsimsiz Anime';
    const subTitle = item.title_native || item.title_english || '';
    const coverUrl = item.coverImage || item.poster;
    const totalEps = item.total_episodes || item.totalEpisodes;

    return (
      <TouchableOpacity
        style={styles.searchCard}
        activeOpacity={0.8}
        onPress={() => {
          navigation.navigate('AnimeDetail', { anime: item });
        }}
      >
        {/* Cover image or fallback type icon */}
        {coverUrl ? (
          <Image
            source={{ uri: coverUrl }}
            style={styles.typeIcon}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.typeIcon, { backgroundColor: formatStyle.bg, borderColor: formatStyle.border }]}>
            <Ionicons
              name={itemType === 'MOVIE' || itemType === 'Movie' ? 'film-outline' : 'tv-outline'}
              size={22}
              color={formatStyle.text}
            />
          </View>
        )}

        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {titleText}
          </Text>
          <View style={styles.metaRow}>
            <View style={[styles.formatBadge, { backgroundColor: formatStyle.bg, borderColor: formatStyle.border }]}>
              <Text style={[styles.formatText, { color: formatStyle.text }]}>{itemType}</Text>
            </View>
            {totalEps ? (
              <Text style={styles.metaText}>
                {totalEps} Bölüm
              </Text>
            ) : null}
            {item.rating && (
              <Text style={[styles.metaText, { color: '#FFD700' }]}>
                ★ {item.rating}
              </Text>
            )}
          </View>
          {subTitle && subTitle !== titleText && (
            <Text style={styles.jpTitle} numberOfLines={1}>
              {subTitle}
            </Text>
          )}
        </View>

        <View style={styles.arrowButton}>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textSecondary} />
        </View>
      </TouchableOpacity>
    );
  }, [navigation]);

  const handleSearchSubmit = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) return;

    if (results && results.length > 0) {
      navigation.navigate('AnimeDetail', { anime: results[0] });
      return;
    }

    setIsSearching(true);
    try {
      const detectedSeason = detectSeasonNumber(trimmed, 0);
      const cleanQuery = trimmed
        .replace(/\b(\d+)\s*\.?\s*(?:sezon|season)\b/gi, '')
        .replace(/\b(?:sezon|season)\s*(\d+)\b/gi, '')
        .replace(/\b(?:1st|2nd|3rd|4th|5th)\s*(?:sezon|season)\b/gi, '')
        .trim();

      let matches = await searchAniList(trimmed, 1, 10);
      if ((!matches || matches.length === 0) && cleanQuery && cleanQuery !== trimmed && cleanQuery.length >= 2) {
        matches = await searchAniList(cleanQuery, 1, 10);
      }

      if (matches && matches.length > 0) {
        let best = matches[0];
        if (detectedSeason > 0) {
          const matchSeason = matches.find(item => {
            const s = detectSeasonNumber(item.title || item.title_romaji || item.title_english, 1);
            return s === detectedSeason;
          });
          if (matchSeason) best = matchSeason;
        }
        navigation.navigate('AnimeDetail', { anime: best });
      }
    } catch (err) {
      console.warn('[SearchScreen] Submit search error:', err.message);
    } finally {
      setIsSearching(false);
    }
  }, [query, results, navigation]);

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
            placeholder="Anime ara ve git..."
            placeholderTextColor={COLORS.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            clearButtonMode="while-editing"
            returnKeyType="search"
            onSubmitEditing={handleSearchSubmit}
          />
          {query.trim().length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} style={styles.clearButton}>
              <Ionicons name="close-circle" size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleSearchSubmit}
            style={styles.submitArrowButton}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-forward" size={18} color={COLORS.accent} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Content ────────────────────────────────── */}
      {isSearching && results.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={[styles.infoSubtitle, { marginTop: 12 }]}>AniList aranıyor...</Text>
        </View>
      ) : query.trim().length < 2 ? (
        <View style={styles.centerContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="search-outline" size={48} color={COLORS.accent} />
          </View>
          <Text style={styles.infoTitle}>Anime Ara</Text>
          <Text style={styles.infoSubtitle}>
            AniList kataloğundaki on binlerce anime arasından hemen ara!
          </Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.centerContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="film-outline" size={48} color={COLORS.textMuted} />
          </View>
          <Text style={styles.infoTitle}>Sonuç Bulunamadı</Text>
          <Text style={styles.infoSubtitle}>
            "{query}" aramasına uygun hiçbir anime bulunamadı.
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item, index) => String(item.id || item._id || item.anilist_id || index)}
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
  submitArrowButton: {
    padding: 4,
    marginLeft: 6,
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
