import { Image } from 'expo-image';
import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  StatusBar,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, useAnimatedScrollHandler } from 'react-native-reanimated';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { APP_VERSION } from '../constants/config';
import {
  fetchRecentAnimes,
  fetchTrendingAnimes,
  fetchAnimesByGenre,
  checkAppUpdate,
} from '../services/api';
import { AuthContext } from '../context/AuthContext';
import { useAlert } from '../context/AlertContext';

import Header from '../components/Header';
import HeroBanner from '../components/HeroBanner';
import AnimeRow from '../components/AnimeRow';
import AnimeLandscapeRow from '../components/AnimeLandscapeRow';
import AnimeGrid from '../components/AnimeGrid';
import AnimeAnimatedCardRow from '../components/AnimeAnimatedCardRow';
import AnimeStoryRow from '../components/AnimeStoryRow';

const GENRES = [
  { name: 'Aksiyon', query: 'Aksiyon', icon: 'flash', color: '#FF3D57', bgColors: ['rgba(255, 61, 87, 0.12)', 'rgba(255, 61, 87, 0.03)'] },
  { name: 'Macera', query: 'Macera', icon: 'compass', color: '#00C853', bgColors: ['rgba(0, 200, 83, 0.12)', 'rgba(0, 200, 83, 0.03)'] },
  { name: 'Komedi', query: 'Komedi', icon: 'happy', color: '#FFB300', bgColors: ['rgba(255, 179, 0, 0.12)', 'rgba(255, 179, 0, 0.03)'] },
  { name: 'Fantastik', query: 'Fantastik', icon: 'sparkles', color: '#da22ff', bgColors: ['rgba(218, 34, 255, 0.12)', 'rgba(218, 34, 255, 0.03)'] },
  { name: 'Drama', query: 'Drama', icon: 'sad', color: '#3a7bd5', bgColors: ['rgba(58, 123, 213, 0.12)', 'rgba(58, 123, 213, 0.03)'] },
  { name: 'Romantik', query: 'Romantik', icon: 'heart', color: '#ff0844', bgColors: ['rgba(255, 8, 68, 0.12)', 'rgba(255, 8, 68, 0.03)'] },
  { name: 'Sci-Fi', query: 'Bilim Kurgu', icon: 'planet', color: '#00c6ff', bgColors: ['rgba(0, 198, 255, 0.12)', 'rgba(0, 198, 255, 0.03)'] },
  { name: 'Gizem', query: 'Gizem', icon: 'eye', color: '#8F8F9D', bgColors: ['rgba(143, 143, 157, 0.12)', 'rgba(143, 143, 157, 0.03)'] },
];

function AiPulseIcon() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    scale.value = withRepeat(withTiming(1.4, { duration: 1500 }), -1, false);
    opacity.value = withRepeat(withTiming(0, { duration: 1500 }), -1, false);
  }, []);

  const animatedRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={styles.aiIconWrapper}>
      <Animated.View style={[styles.aiPulseRing, animatedRingStyle]} />
      <View style={styles.aiIconBox}>
        <Ionicons name="sparkles" size={18} color="#FFF" />
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useContext(AuthContext);
  const { showAlert } = useAlert();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [featuredList, setFeaturedList] = useState([]);
  const [recentlyAdded, setRecentlyAdded] = useState([]);
  const [trending, setTrending] = useState([]);
  
  // Yeni Kategori Listeleri
  const [actionAnimes, setActionAnimes] = useState([]);
  const [fantasyAnimes, setFantasyAnimes] = useState([]);
  const [comedyAnimes, setComedyAnimes] = useState([]);
  const [romanceAnimes, setRomanceAnimes] = useState([]);

  // Lazy rendering state
  const [showDeferred, setShowDeferred] = useState(false);

  // Uygulama Sürüm Kontrolü
  const performUpdateCheck = useCallback(async () => {
    try {
      const res = await checkAppUpdate();
      if (res && res.success && res.latestVersion) {
        // Semver karşılaştırma yardımcısı
        const isVersionOlder = (curr, latest) => {
          const cParts = curr.split('.').map(Number);
          const lParts = latest.split('.').map(Number);
          for (let i = 0; i < Math.max(cParts.length, lParts.length); i++) {
            const c = cParts[i] || 0;
            const l = lParts[i] || 0;
            if (c < l) return true;
            if (c > l) return false;
          }
          return false;
        };

        if (isVersionOlder(APP_VERSION, res.latestVersion)) {
          const isMandatory = isVersionOlder(APP_VERSION, res.minRequiredVersion) || res.forceUpdate;
          if (isMandatory) {
            showAlert(
              'Zorunlu Güncelleme ⚠️',
              `Uygulamayı kullanmaya devam etmek için yeni sürümü yüklemelisiniz.\nSürüm: ${res.latestVersion}\n\nYenilikler: ${res.releaseNotes}`,
              [
                {
                  text: 'Güncelle',
                  onPress: () => {
                    Linking.openURL(res.updateUrl);
                    // Modal kapatılamasın diye tekrar tetikle
                    setTimeout(() => performUpdateCheck(), 2000);
                  }
                }
              ],
              { cancelable: false }
            );
          } else {
            showAlert(
              'Yeni Sürüm Mevcut 🚀',
              `Uygulamanın yeni bir sürümü yayınlandı.\nSürüm: ${res.latestVersion}\n\nYenilikler: ${res.releaseNotes}`,
              [
                { text: 'Daha Sonra', style: 'cancel' },
                {
                  text: 'Güncelle',
                  onPress: () => Linking.openURL(res.updateUrl)
                }
              ]
            );
          }
        }
      }
    } catch (err) {
      console.warn('[HomeScreen] Update check failed:', err);
    }
  }, [showAlert]);

  useEffect(() => {
    // Uygulama yüklendikten hemen sonra sürüm kontrolünü yap
    performUpdateCheck();
  }, [performUpdateCheck]);

  const loadData = useCallback(async () => {
    try {
      const [recent, trend, action, fantasy, comedy, romance] = await Promise.all([
        fetchRecentAnimes(50),
        fetchTrendingAnimes(50),
        fetchAnimesByGenre('Aksiyon'),
        fetchAnimesByGenre('Fantastik'),
        fetchAnimesByGenre('Komedi'),
        fetchAnimesByGenre('Romantik'),
      ]);

      const getUniqueListByBaseSlug = (list, count = null) => {
        if (!list) return [];
        const seen = new Set();
        const unique = [];
        for (const item of list) {
          if (!item) continue;
          let slug = item.tranimeizle_slug || '';
          
          // Sezon, part, tv, izle gibi takıları temizleyip kök adı (base slug) bulalım
          let baseSlug = slug
            .replace(/-izle$/i, '')
            .replace(/-tv$/i, '')
            .replace(/-tv-izle$/i, '')
            .replace(/-\d+-sezon$/i, '')
            .replace(/-sezon-\d+$/i, '')
            .replace(/-part-\d+$/i, '')
            .replace(/-\d+$/i, ''); // Sonundaki sayıyı da sil (sezon sayısı olabilir)

          const key = item.comparable_base_slug || baseSlug || item.id || item._id;

          if (!seen.has(key)) {
            seen.add(key);
            unique.push(item);
            if (count && unique.length >= count) break;
          }
        }
        return unique;
      };

      // Featured: tüm animeler arasından en yüksek puanlı ilk 5 animeyi seç
      const allAnimes = [...recent, ...trend];
      const uniqueAllAnimes = getUniqueListByBaseSlug(allAnimes);
      const sortedByScore = uniqueAllAnimes.sort(
        (a, b) => (b.averageScore || 0) - (a.averageScore || 0)
      );
      
      const featured = getUniqueListByBaseSlug(sortedByScore, 5);
      setFeaturedList(featured);

      // Son Eklenenler (maks 15 benzersiz)
      const recentUnique = getUniqueListByBaseSlug(recent, 15);
      setRecentlyAdded(recentUnique);

      // Trendler (maks 20 benzersiz)
      const trendingUnique = getUniqueListByBaseSlug(trend, 20);
      setTrending(trendingUnique);

      // Türlere göre kategorize et (doğrudan API'den gelen verileri satıra özel mükerrer filtresiyle temizleyelim)
      const actions = getUniqueListByBaseSlug(action, 12);
      const fantasies = getUniqueListByBaseSlug(fantasy, 12);
      const comedies = getUniqueListByBaseSlug(comedy, 12);
      const romances = getUniqueListByBaseSlug(romance, 12);

      setActionAnimes(actions);
      setFantasyAnimes(fantasies);
      setComedyAnimes(comedies);
      setRomanceAnimes(romances);
    } catch (error) {
      console.error('[HomeScreen] Failed to load data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      // Gecikmeli render'ı başlatarak ilk geçişi hızlandırıyoruz
      setTimeout(() => {
        setShowDeferred(true);
      }, 150);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setShowDeferred(false);
    loadData();
  }, [loadData]);

  const handleAnimePress = useCallback((anime) => {
    if (!user) {
      navigation.navigate('Login');
      return;
    }
    navigation.navigate('AnimeDetail', { anime });
  }, [navigation, user]);

  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const [splashVisible, setSplashVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSplashVisible(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const animatedHeaderStyle = useAnimatedStyle(() => {
    const val = Math.max(0, scrollY.value);
    const opacity = val > 100 ? 0.95 : (val / 100) * 0.95;
    return {
      backgroundColor: `rgba(9, 9, 14, ${opacity})`,
    };
  });

  if (splashVisible && loading && !refreshing) {
    return (
      <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bgPrimary }]}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />
        
        {/* Arka plan ışıması */}
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <LinearGradient
            colors={['rgba(255, 107, 0, 0.1)', 'transparent']}
            style={{ position: 'absolute', width: 400, height: 400, borderRadius: 200, top: '30%', left: '50%', transform: [{ translateX: -200 }, { translateY: -200 }] }}
          />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Image 
            source={require('../../assets/mainLogo.png')} 
            style={{ width: 64, height: 64 }} 
            contentFit="contain" 
          />
          <Text style={{ fontSize: 44, fontWeight: 'bold', color: COLORS.textPrimary, marginLeft: -6 }}>
            lof<Text style={{ color: COLORS.accent }}>thel</Text>
          </Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />

      {/* Arka Plan Aura Işımaları */}
      <View style={styles.ambientGlowContainer} pointerEvents="none">
        <LinearGradient
          colors={['rgba(255, 107, 0, 0.07)', 'rgba(9, 9, 14, 0)']}
          style={styles.ambientGlowOrange}
        />
        <LinearGradient
          colors={['rgba(108, 92, 231, 0.08)', 'rgba(9, 9, 14, 0)']}
          style={styles.ambientGlowPurple}
        />
      </View>

      {/* ── Sticky Header ──────────────────────── */}
      <Animated.View style={[styles.stickyHeader, animatedHeaderStyle, { paddingTop: insets.top }]}>
        {/* Üstteki hafif karartma için LinearGradient (sadece scroll tepedeyken bile Header okunabilsin diye) */}
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'transparent']}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <Header />
      </Animated.View>

      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.accent}
            colors={[COLORS.accent]}
            progressBackgroundColor={COLORS.bgSecondary}
            progressViewOffset={80} // header'ın altında görünmesi için
          />
        }
      >
        {/* ── Hero Banner (Carousel) ──────────────── */}
        <HeroBanner animes={featuredList} onPress={handleAnimePress} />

        {/* ── AI Assistant Banner ─────────────────── */}
        <TouchableOpacity 
          style={styles.aiBannerContainer}
          activeOpacity={0.95}
          onPress={() => navigation.navigate('AiRecommendation')}
        >
          <LinearGradient
            colors={['rgba(108, 92, 231, 0.3)', 'rgba(255, 107, 0, 0.1)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.aiBanner}
          >
            <View style={styles.aiBadge}>
              <Text style={styles.aiBadgeText}>AI</Text>
            </View>
            <AiPulseIcon />
            <View style={styles.aiBannerTextContainer}>
              <Text style={styles.aiBannerTitle}>Yapay Zeka Asistanı ✨</Text>
              <Text style={styles.aiBannerSubtitle}>Ne izleyeceğini bilmiyor musun? Groq AI senin için bulsun!</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textPrimary} style={{ opacity: 0.7 }} />
          </LinearGradient>
        </TouchableOpacity>

        {/* ── Türler (Genre Pills Quick Grid) ──────── */}
        <View style={styles.genresSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.accentBar} />
              <Text style={styles.sectionTitle}>Türler</Text>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.genresList}
          >
            {GENRES.map((genre, idx) => (
              <TouchableOpacity
                key={idx}
                activeOpacity={0.8}
                style={[styles.genreCard, { borderColor: `${genre.color}25` }]}
                onPress={() => navigation.navigate('Genre', { genre: genre.query })}
              >
                <LinearGradient
                  colors={genre.bgColors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.genreGradient}
                >
                  <Ionicons name={genre.icon} size={14} color={genre.color} />
                  <Text style={[styles.genreName, { color: genre.color }]}>{genre.name}</Text>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Son Eklenen Bölümler (Portrait) ─────── */}
        <AnimeRow
          title="Son Eklenen Bölümler"
          data={recentlyAdded}
          loading={loading}
          onAnimePress={handleAnimePress}
          onSeeAll={() => navigation.navigate('Search', { initialQuery: '' })}
        />

        {/* ── Haftalık Popülerler (Landscape) ──────── */}
        <AnimeLandscapeRow
          title="Haftalık Popülerler"
          data={trending.slice(0, 10)}
          loading={loading}
          onAnimePress={handleAnimePress}
          onSeeAll={() => navigation.navigate('Search', { initialQuery: '' })}
        />

        {/* ── Gecikmeli Render Edilen Alt Bölümler ── */}
        {showDeferred && (
          <>
            {/* ── Trend Seriler (Portrait) ────────────── */}
            <AnimeRow
              title="Trend Seriler"
              data={trending.slice(10, 20)}
              loading={loading}
              onAnimePress={handleAnimePress}
              onSeeAll={() => navigation.navigate('Search', { initialQuery: '' })}
            />

            {/* ── Ekstra Kategoriler ───────────────────── */}
            {actionAnimes.length > 0 && (
              <AnimeGrid
                title="Aksiyon Dolu Seriler"
                titleStyle={styles.actionTitleStyle}
                data={actionAnimes}
                loading={loading}
                onAnimePress={handleAnimePress}
                onSeeAll={() => navigation.navigate('Genre', { genre: 'Aksiyon' })}
              />
            )}

            {fantasyAnimes.length > 0 && (
              <AnimeAnimatedCardRow
                title="Fantastik Dünyalar"
                titleStyle={styles.fantasyTitleStyle}
                data={fantasyAnimes}
                loading={loading}
                onAnimePress={handleAnimePress}
                onSeeAll={() => navigation.navigate('Genre', { genre: 'Fantastik' })}
              />
            )}

            {comedyAnimes.length > 0 && (
              <AnimeLandscapeRow
                title="Eğlenceli Komediler"
                titleStyle={styles.comedyTitleStyle}
                data={comedyAnimes}
                loading={loading}
                onAnimePress={handleAnimePress}
                onSeeAll={() => navigation.navigate('Genre', { genre: 'Komedi' })}
              />
            )}

            {romanceAnimes.length > 0 && (
              <AnimeStoryRow
                title="Romantik Klasikler"
                titleStyle={styles.romanceTitleStyle}
                data={romanceAnimes}
                loading={loading}
                onAnimePress={handleAnimePress}
                onSeeAll={() => navigation.navigate('Genre', { genre: 'Romantik' })}
              />
            )}
          </>
        )}

        {/* ── Bottom Padding ──────────────────────── */}
        <View style={styles.bottomSpacer} />
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    // safe area padding will be handled by Header or safe area view implicitly, but since we are absolute inside SafeAreaView, it's under the safe area. 
    // Wait, if we use translucent StatusBar and no top edge, it needs padding. We used edges=['top', 'left', 'right'], so top safe area is handled by the wrapper.
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 0,
  },
  bottomSpacer: {
    height: SPACING.xxxl,
  },

  // ── Ambient Glows ────────────────────────────
  ambientGlowContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: -1,
  },
  ambientGlowOrange: {
    position: 'absolute',
    top: -120,
    left: -100,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(255, 107, 0, 0.08)',
  },
  ambientGlowPurple: {
    position: 'absolute',
    top: 250,
    right: -100,
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: 'rgba(108, 92, 231, 0.08)',
  },

  // ── Section Header ───────────────────────────
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
    letterSpacing: -0.3,
  },

  // ── Genres Section ───────────────────────────
  genresSection: {
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
  },

  // ── AI Banner ───────────────────────────
  aiBannerContainer: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    // Android'de elevation gri dikdörtgen hatasına sebep olduğu için kaldırıldı
  },
  aiBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderWidth: 1.5,
    borderColor: 'rgba(108, 92, 231, 0.35)',
    borderRadius: BORDER_RADIUS.lg,
    position: 'relative',
    overflow: 'hidden',
  },
  aiIconWrapper: {
    position: 'relative',
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  aiPulseRing: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(108, 92, 231, 0.5)',
  },
  aiIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6C5CE7',
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.glow,
  },
  aiBadge: {
    position: 'absolute',
    top: -1,
    right: 12,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    zIndex: 10,
  },
  aiBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  aiBannerTextContainer: {
    flex: 1,
  },
  aiBannerTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  aiBannerSubtitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.caption,
    lineHeight: 16,
  },

  // ── Genres List ───────────────────────────
  genresList: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  genreCard: {
    borderRadius: BORDER_RADIUS.pill,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    ...SHADOWS.subtle,
  },
  genreGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 2,
    paddingHorizontal: SPACING.md + 4,
    paddingVertical: SPACING.sm + 1,
  },
  genreName: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    letterSpacing: 0.2,
  },
  // Custom Typography for Genres
  actionTitleStyle: {
    color: '#FF3D57',
    fontStyle: 'italic',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    textShadowColor: 'rgba(255, 61, 87, 0.45)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  fantasyTitleStyle: {
    color: '#DA22FF',
    fontStyle: 'italic',
    fontWeight: '700',
    letterSpacing: 0.6,
    textShadowColor: 'rgba(218, 34, 255, 0.40)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  comedyTitleStyle: {
    color: '#FFB300',
    fontWeight: '800',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(255, 179, 0, 0.35)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  romanceTitleStyle: {
    color: '#FF5C8A',
    fontStyle: 'italic',
    fontWeight: '600',
    letterSpacing: 0.8,
    textShadowColor: 'rgba(255, 92, 138, 0.30)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
});
