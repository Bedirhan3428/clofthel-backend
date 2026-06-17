import { Image } from 'expo-image';
import React, { useState, useEffect, useCallback, useContext, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  StatusBar,
  TouchableOpacity,
  Linking,
  Platform,
  findNodeHandle,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import TouchInjector from '../modules/TouchInjector';

let WebView = null;
if (Platform.OS !== 'web') {
  try {
    WebView = require('react-native-webview').WebView;
  } catch (e) {
    console.warn('[HomeScreen] react-native-webview not available:', e.message);
  }
}

const injectedBypassJs = `
  try {
    (function() {
      if (window.__bypass_initialized) return;
      window.__bypass_initialized = true;

      // --- PERFORMANCE OPTIMIZATION: SUBRESOURCE BLOCKING ---
      try {
        var originalSetAttribute = Element.prototype.setAttribute;
        Element.prototype.setAttribute = function(name, value) {
          var tagName = this.tagName.toLowerCase();
          if (name === 'src' && tagName === 'img') {
            if (value && typeof value === 'string' && !value.toLowerCase().includes('captcha')) {
              return;
            }
          }
          if (name === 'href' && tagName === 'link') {
            if (value && typeof value === 'string' && (value.includes('.css') || this.rel === 'stylesheet')) {
              return;
            }
          }
          if (name === 'src' && tagName === 'iframe') {
            if (value && typeof value === 'string') {
              var valLower = value.toLowerCase();
              var isAllowed = valLower.includes('optraco.top') || 
                                valLower.includes('sibnet.ru') || 
                                valLower.includes('captcha') || 
                                valLower.includes('challenge') || 
                                valLower.includes('tranimeizle.io') ||
                                valLower.startsWith('about:blank') ||
                                valLower.startsWith('javascript:');
              if (!isAllowed) {
                return;
              }
            }
          }
          return originalSetAttribute.call(this, name, value);
        };

        Object.defineProperty(HTMLImageElement.prototype, 'src', {
          set: function(value) {
            if (value && typeof value === 'string' && !value.toLowerCase().includes('captcha')) {
              return;
            }
            this.setAttribute('src', value);
          },
          get: function() {
            return this.getAttribute('src');
          }
        });

        Object.defineProperty(HTMLLinkElement.prototype, 'href', {
          set: function(value) {
            if (value && typeof value === 'string' && (value.includes('.css') || this.rel === 'stylesheet')) {
              return;
            }
            this.setAttribute('href', value);
          },
          get: function() {
            return this.getAttribute('href');
          }
        });

        Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
          set: function(value) {
            if (value && typeof value === 'string') {
              var valLower = value.toLowerCase();
              var isAllowed = valLower.includes('optraco.top') || 
                                valLower.includes('sibnet.ru') || 
                                valLower.includes('captcha') || 
                                valLower.includes('challenge') || 
                                valLower.includes('tranimeizle.io') ||
                                valLower.startsWith('about:blank') ||
                                valLower.startsWith('javascript:');
              if (!isAllowed) {
                return;
              }
            }
            this.setAttribute('src', value);
          },
          get: function() {
            return this.getAttribute('src');
          }
        });

        var styleEl = document.createElement('style');
        styleEl.innerHTML = "img:not([src*='captcha']):not([src*='Captcha']):not(.captcha-image) { display: none !important; } " +
                            "iframe:not([src*='optraco']):not([src*='sibnet']):not([src*='captcha']):not([src*='challenge']) { display: none !important; }";
        var targetNode = document.head || document.documentElement;
        if (targetNode) {
          targetNode.appendChild(styleEl);
        }
      } catch(e) {}

      try {
        if (navigator.userActivation === undefined || !navigator.userActivation.hasBeenActive) {
          Object.defineProperty(navigator, 'userActivation', {
            get: function() { return { hasBeenActive: true, isActive: true }; }
          });
        }
        Object.defineProperty(navigator, 'webdriver', { get: function() { return false; } });
      } catch(e) {}

      function sendToNative(obj) {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify(obj));
        }
      }

      sendToNative({ type: 'log', message: 'Silent Bypass: Script started...' });

      var _resolved = false;
      var captchaChecked = false;
      var detectionTime = 0;

      function checkBypass() {
        if (_resolved) return;
        var title = (document.title || '').toLowerCase();
        var hasCaptcha = document.querySelectorAll('.captcha-image').length > 0;
        
        if (!hasCaptcha && title && !title.includes('moment') && !title.includes('wait') && !title.includes('cloudflare') && !title.includes('challenge')) {
          _resolved = true;
          sendToNative({ type: 'bypass_complete', reason: 'already_passed' });
        }
      }

      function requestNativeTouch(el) {
        try {
          if (el.scrollIntoView) {
            el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
          }
        } catch(e){}

        setTimeout(function() {
          try {
            var rect = el.getBoundingClientRect();
            var x = rect.left + (rect.width / 2);
            var y = rect.top + (rect.height / 2);
            
            if (x === 0 || y === 0 || rect.width === 0) return;
            
            var physicalX = x * window.devicePixelRatio;
            var physicalY = y * window.devicePixelRatio;

            sendToNative({ type: 'native_touch', x: physicalX, y: physicalY });
          } catch(e) {}
        }, 100);
      }

      var checkCount = 0;
      var runBypassAutomation = function() {
        checkCount++;
        checkBypass();
        if (_resolved) return;

        var captchaImgs = [];
        try {
          captchaImgs = Array.from(document.querySelectorAll('.captcha-image'));
          if (captchaImgs.length === 0) {
            var allImgs = Array.from(document.querySelectorAll('img'));
            captchaImgs = allImgs.filter(function(img) {
              var src = img.src || img.getAttribute('src') || '';
              return src.toLowerCase().includes('captcha') && (src.includes('hash=') || src.includes('cid='));
            });
          }
        } catch(e) {}

        if (captchaImgs.length === 5 && !captchaChecked) {
          captchaChecked = true;
          detectionTime = Date.now();
          sendToNative({ type: 'log', message: 'Silent Bypass: Captcha detected. Resolving...' });

          var imageSizes = [];
          var fetchPromises = [];

          for (var k = 0; k < captchaImgs.length; k++) {
            (function(img, index) {
              var srcUrl = img.src || img.getAttribute('src') || '';
              if (srcUrl) {
                try {
                  var absoluteUrl = new URL(srcUrl, window.location.href).href;
                  fetchPromises.push(
                    fetch(absoluteUrl)
                      .then(function(res) { return res.blob(); })
                      .then(function(blob) {
                        imageSizes.push({ index: index, size: blob.size, element: img });
                      })
                      .catch(function() {})
                  );
                } catch(e) {}
              }
            })(captchaImgs[k], k);
          }

          Promise.all(fetchPromises).then(function() {
            if (imageSizes.length < 5) {
              captchaChecked = false;
              return;
            }

            var sizesArray = imageSizes.map(function(img) { return img.size; }).sort(function(a, b) { return a - b; });
            var medianSize = sizesArray[2];

            var maxDiff = -1;
            var outlierImg = null;
            imageSizes.forEach(function(img) {
              var diff = Math.abs(img.size - medianSize);
              if (diff > maxDiff) {
                maxDiff = diff;
                outlierImg = img;
              }
            });

            if (outlierImg && maxDiff > 0) {
              var targetEl = outlierImg.element;
              var timeElapsed = Date.now() - detectionTime;
              var remainingDelay = Math.max(0, 2500 - timeElapsed);

              setTimeout(function() {
                requestNativeTouch(targetEl);
                
                setTimeout(function() {
                  if (!_resolved) {
                    window.location.reload();
                  }
                }, 4000);
              }, remainingDelay);
            } else {
              captchaChecked = false;
            }
          }).catch(function() {
            captchaChecked = false;
          });
        }
      };

      setInterval(runBypassAutomation, 1000);
    })();
  } catch(err) {}
  true;
`;
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, useAnimatedScrollHandler } from 'react-native-reanimated';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { APP_VERSION } from '../constants/config';
import {
  fetchRecentAnimes,
  fetchTrendingAnimes,
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

  // Silent background bot bypass state & ref
  const silentWebViewRef = useRef(null);
  const [bypassActive, setBypassActive] = useState(true);

  const handleSilentMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'log') {
        console.log('[Silent Bypass Log]', data.message);
      } else if (data.type === 'bypass_complete') {
        console.log('[Silent Bypass] Bot protection bypassed successfully:', data.reason);
        // Wait 5 seconds if captcha was resolved to let cookies settle, or 0s if already passed
        const delay = data.reason === 'already_passed' ? 0 : 5000;
        setTimeout(() => {
          setBypassActive(false);
        }, delay);
      } else if (data.type === 'native_touch') {
        const { x, y } = data;
        if (TouchInjector) {
          const reactTag = findNodeHandle(silentWebViewRef.current);
          if (reactTag) {
            console.log(`[Silent Native Touch] Injecting touch at X:${x} Y:${y} on tag: ${reactTag}`);
            TouchInjector.simulateTouch(reactTag, x, y)
              .then(res => console.log('[Silent Native Touch Success]', res))
              .catch(err => console.error('[Silent Native Touch Error]', err));
          } else {
            console.warn('[Silent Native Touch] silentWebViewRef reactTag could not be resolved.');
          }
        }
      }
    } catch (err) {
      console.error('[HomeScreen Silent WebView Message Parse Error]', err);
    }
  };

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
      const [recent, trend] = await Promise.all([
        fetchRecentAnimes(40),
        fetchTrendingAnimes(40),
      ]);

      const globalSeen = new Set();
      const getUniqueAndMark = (list, count = null) => {
        const unique = [];
        for (const item of list) {
          let slug = item.tranimeizle_slug || '';
          
          // Sezon, part, tv, izle gibi takıları temizleyip kök adı (base slug) bulalım
          let baseSlug = slug
            .replace(/-izle$/i, '')
            .replace(/-\d+-sezon$/i, '')
            .replace(/-sezon-\d+$/i, '')
            .replace(/-part-\d+$/i, '')
            .replace(/-tv$/i, '')
            .replace(/-tv-izle$/i, '')
            .replace(/-\d+$/i, ''); // Sonundaki sayıyı da sil (sezon sayısı olabilir)

          const key = item.comparable_base_slug || baseSlug || item.id || item._id;

          if (!globalSeen.has(key)) {
            globalSeen.add(key);
            unique.push(item);
            if (count && unique.length >= count) break;
          }
        }
        return unique;
      };

      // Featured: tüm animeler arasından en yüksek puanlı ilk 5 animeyi seç
      const allAnimes = [...recent, ...trend];
      
      const tempSeen = new Set();
      const uniqueAnimes = [];
      for (const item of allAnimes) {
        let slug = item.tranimeizle_slug || '';
        let baseSlug = slug
          .replace(/-izle$/i, '')
          .replace(/-\d+-sezon$/i, '')
          .replace(/-sezon-\d+$/i, '')
          .replace(/-part-\d+$/i, '')
          .replace(/-tv$/i, '')
          .replace(/-tv-izle$/i, '')
          .replace(/-\d+$/i, '');

        const key = item.comparable_base_slug || baseSlug || item.id || item._id;
        if (!tempSeen.has(key)) {
          tempSeen.add(key);
          uniqueAnimes.push(item);
        }
      }

      const sortedByScore = uniqueAnimes.sort(
        (a, b) => (b.averageScore || 0) - (a.averageScore || 0)
      );
      
      const featured = getUniqueAndMark(sortedByScore, 5);
      setFeaturedList(featured);

      // Son Eklenenler (maks 15 benzersiz)
      const recentUnique = getUniqueAndMark(recent, 15);
      setRecentlyAdded(recentUnique);

      // Trendler (maks 20 benzersiz)
      const trendingUnique = getUniqueAndMark(trend, 20);
      setTrending(trendingUnique);

      // Türlere göre kategorize et (önceki listelerde kullanılmayanlardan)
      const actions = getUniqueAndMark(allAnimes.filter(a => {
        const g = a.enrichedGenres || a.genres || [];
        return g.includes('Action') || g.includes('Aksiyon');
      }), 10);

      const fantasies = getUniqueAndMark(allAnimes.filter(a => {
        const g = a.enrichedGenres || a.genres || [];
        return g.includes('Fantasy') || g.includes('Fantastik');
      }), 10);

      const comedies = getUniqueAndMark(allAnimes.filter(a => {
        const g = a.enrichedGenres || a.genres || [];
        return g.includes('Comedy') || g.includes('Komedi');
      }), 10);

      const romances = getUniqueAndMark(allAnimes.filter(a => {
        const g = a.enrichedGenres || a.genres || [];
        return g.includes('Romance') || g.includes('Romantik');
      }), 10);

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
                data={actionAnimes}
                loading={loading}
                onAnimePress={handleAnimePress}
                onSeeAll={() => navigation.navigate('Genre', { genre: 'Aksiyon' })}
              />
            )}

            {fantasyAnimes.length > 0 && (
              <AnimeAnimatedCardRow
                title="Fantastik Dünyalar"
                data={fantasyAnimes}
                loading={loading}
                onAnimePress={handleAnimePress}
                onSeeAll={() => navigation.navigate('Genre', { genre: 'Fantastik' })}
              />
            )}

            {comedyAnimes.length > 0 && (
              <AnimeLandscapeRow
                title="Eğlenceli Komediler"
                data={comedyAnimes}
                loading={loading}
                onAnimePress={handleAnimePress}
                onSeeAll={() => navigation.navigate('Genre', { genre: 'Komedi' })}
              />
            )}

            {romanceAnimes.length > 0 && (
              <AnimeStoryRow
                title="Romantik Klasikler"
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

      {/* Background Silent Bot Bypass WebView */}
      {Platform.OS !== 'web' && WebView && bypassActive && (
        <View style={styles.silentWebViewContainer}>
          <WebView
            ref={silentWebViewRef}
            source={{ uri: 'https://www.tranimeizle.io/' }}
            injectedJavaScriptBeforeContentLoaded={injectedBypassJs}
            injectedJavaScript={injectedBypassJs}
            onMessage={handleSilentMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            mixedContentMode="always"
            mediaPlaybackRequiresUserAction={false}
            style={{ flex: 1 }}
            onShouldStartLoadWithRequest={(request) => {
              const url = request.url;
              const isTrAnime = url.includes('tranimeizle.io');
              const isCaptcha = url.includes('Captcha') || url.includes('challenge');
              const isGoogle = url.includes('google');
              
              if (isTrAnime || isCaptcha || isGoogle || url.startsWith('about:blank') || url.startsWith('data:')) {
                return true;
              }
              console.log('[Silent Bypass Ad Blocker] Engellenen reklam yönlendirmesi:', url);
              return false;
            }}
          />
        </View>
      )}
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
  silentWebViewContainer: {
    position: 'absolute',
    top: 9999,
    left: 9999,
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
    opacity: 0.01,
  },
});
