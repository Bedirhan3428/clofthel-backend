import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Animated,
  Platform,
  findNodeHandle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { fetchEpisodeVideoUrl, cacheEpisodeVideoUrl } from '../services/api';
import TouchInjector from '../modules/TouchInjector';
import { API_BASE_URL } from '../constants/config';
import { scraperInjectedJs } from '../modules/ScraperScript';

let WebView = null;
if (Platform.OS !== 'web') {
  try {
    WebView = require('react-native-webview').WebView;
  } catch (e) {
    console.warn('[ResolveScreen] react-native-webview not available:', e.message);
  }
}

const IS_WEB = Platform.OS === 'web';

export default function ResolveScreen({ route, navigation }) {
  const { animeId, episodeNumber, episodeTitle, animeTitle, startAt } = route.params;

  const [loading, setLoading] = useState(true);
  const [resolvingState, setResolvingState] = useState('Veritabanı kontrol ediliyor...');
  const [errorMsg, setErrorMsg] = useState(null);
  const [episodeUrl, setEpisodeUrl] = useState(null);
  const [progressPercent, setProgressPercent] = useState(10);
  const [showWebView, setShowWebView] = useState(false);

  const webViewRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const animatedProgress = useRef(new Animated.Value(10)).current;
  const [displayedPercent, setDisplayedPercent] = useState(10);

  // Pulse animation for loading indicator
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 1000,
          useNativeDriver: true,
        })
      ])
    ).start();
  }, []);

  // Smoothly animate progress bar and count up percentage text
  useEffect(() => {
    Animated.timing(animatedProgress, {
      toValue: progressPercent,
      duration: 1000, // 1 second smooth transition
      useNativeDriver: false,
    }).start();

    let start = displayedPercent;
    const end = progressPercent;
    if (start === end) return;

    const range = end - start;
    const stepTime = Math.max(Math.floor(1000 / Math.abs(range)), 15);

    const timer = setInterval(() => {
      start += (end > start ? 1 : -1);
      setDisplayedPercent(start);
      if (start === end) {
        clearInterval(timer);
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [progressPercent]);

  useEffect(() => {
    checkDatabaseCache();
  }, []);

  const checkDatabaseCache = async () => {
    setLoading(true);
    setErrorMsg(null);
    setEpisodeUrl(null);
    setProgressPercent(10);
    animatedProgress.setValue(10);
    setDisplayedPercent(10);
    setResolvingState('Veritabanı kontrol ediliyor...');

    if (!IS_WEB && !WebView) {
      setErrorMsg('HATA: WebView bileşeni yüklenemedi. (Native modül eksik)');
      setLoading(false);
      return;
    }

    try {
      const result = await fetchEpisodeVideoUrl(animeId, episodeNumber);
      console.log('[ResolveScreen] DB check result:', result);
      
      if (result.success && result.videoUrl) {
        setResolvingState('Video yükleniyor...');
        let finalUrl = result.videoUrl;
        if (finalUrl.startsWith('sibnet-direct:')) {
          finalUrl = finalUrl.replace('sibnet-direct:', '');
        } else if (finalUrl.startsWith('sibnet:')) {
          const sibnetId = finalUrl.replace('sibnet:', '');
          finalUrl = `${API_BASE_URL}/animes/sibnet-proxy?sibnetId=${sibnetId}`;
        }
        
        // Immediately replace with Player Watch screen
        navigation.replace('Watch', {
          animeId,
          episodeNumber,
          episodeTitle,
          animeTitle,
          videoUrl: finalUrl,
          startAt: startAt || 0
        });
      } else if (result.code === 'NOT_CACHED') {
        if (!result.episodeUrl) {
          setErrorMsg('Bölüm izleme linki bulunamadı.');
          setLoading(false);
          return;
        }
        console.log('[ResolveScreen] Loading WebView with URL:', result.episodeUrl);
        setEpisodeUrl(result.episodeUrl);
        setResolvingState('Video yükleniyor...');
      } else {
        setErrorMsg(result.error || 'Video adresi alınamadı.');
        setLoading(false);
      }
    } catch (err) {
      console.error('[ResolveScreen] Initial load error:', err);
      setErrorMsg('Ağ hatası oluştu. Lütfen tekrar deneyin.');
      setLoading(false);
    }
  };

  const handleWebViewMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'log') {
        console.log('[WebView Log]', data.message);
        const msg = data.message.toLowerCase();
        if (msg.includes('sayfa')) setProgressPercent(15);
        else if (msg.includes('iframe') || msg.includes('yok')) setProgressPercent(30);
        else if (msg.includes('captcha tespit')) setProgressPercent(45);
        else if (msg.includes('tekrar')) setProgressPercent(55);
        else if (msg.includes('farkli') || msg.includes('farklı')) setProgressPercent(70);
        else if (msg.includes('tiklaniyor') || msg.includes('tıklanıyor') || msg.includes('basildi')) setProgressPercent(85);
        
      } else if (data.type === 'resolved') {
        setProgressPercent(100);
        let finalUrl = data.videoUrl;
        
        // Cache in backend database
        await cacheEpisodeVideoUrl(animeId, episodeNumber, finalUrl);
        
        if (finalUrl.startsWith('sibnet-direct:')) {
          finalUrl = finalUrl.replace('sibnet-direct:', '');
        } else if (finalUrl.startsWith('sibnet:')) {
          const sibnetId = finalUrl.replace('sibnet:', '');
          finalUrl = `${API_BASE_URL}/animes/sibnet-proxy?sibnetId=${sibnetId}`;
        }
        
        // Replace with Watch player screen
        navigation.replace('Watch', {
          animeId,
          episodeNumber,
          episodeTitle,
          animeTitle,
          videoUrl: finalUrl,
          startAt: startAt || 0
        });
      } else if (data.type === 'noSource' || data.type === 'error') {
        setErrorMsg(data.message || 'Anime bulunamadı.');
        setLoading(false);
      } else if (data.type === 'native_touch') {
        const { x, y } = data;
        if (TouchInjector) {
          const reactTag = event.nativeEvent.target; // React Native'in gönderdiği gerçek View Tag'ı
          if (reactTag) {
            console.log(`[Native Touch] Injecting touch at X:${x} Y:${y} on tag: ${reactTag}`);
            TouchInjector.simulateTouch(reactTag, x, y)
              .then(res => console.log('[Native Touch Success]', res))
              .catch(err => console.error('[Native Touch Error]', err));
          } else {
            console.warn('[Native Touch] WebView reactTag could not be resolved from event.');
          }
        }
      }
    } catch (err) {
      console.error('[ResolveScreen Message Parse Error]', err);
    }
  };

  const injectedJs = scraperInjectedJs;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      
      {loading ? (
        episodeUrl ? (
          // Scraper/Automation is running (WebView runs in background, user sees a clean full-screen loading overlay)
          <SafeAreaView style={styles.resolvingContainer} edges={['top', 'left', 'right', 'bottom']}>
            <View style={{ flex: 1, position: 'relative' }}>
              <View style={styles.webViewContainer}>
                {IS_WEB ? (
                  <View style={{ flex: 1, width: '100%', height: '100%' }}>
                    <iframe
                      src={episodeUrl}
                      style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        backgroundColor: '#000',
                      }}
                      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                      title="Video Resolver"
                    />
                  </View>
                ) : WebView ? (
                  <WebView
                    ref={webViewRef}
                    source={{ uri: episodeUrl }}
                    injectedJavaScriptBeforeContentLoaded={injectedJs}
                    injectedJavaScript={injectedJs}
                    onMessage={handleWebViewMessage}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    mixedContentMode="always"
                    mediaPlaybackRequiresUserAction={false}
                    style={{ flex: 1, width: '100%', height: '100%' }}
                    onLoadStart={(e) => console.log('[WebView] Load Start:', e.nativeEvent.url)}
                    onLoad={(e) => console.log('[WebView] Loaded successfully')}
                    onLoadEnd={(e) => console.log('[WebView] Load End')}
                    onError={(e) => console.error('[WebView] Error:', e.nativeEvent)}
                    onHttpError={(e) => console.error('[WebView] HTTP Error:', e.nativeEvent)}
                    setSupportMultipleWindows={false}
                    onShouldStartLoadWithRequest={(request) => {
                      const url = request.url;
                      // Izin verilecek guvenilir domain listesi
                      const isTrAnime = url.includes('tranimeizle.io');
                      const isOptraco = url.includes('optraco.top');
                      const isSibnet = url.includes('sibnet.ru');
                      const isCaptcha = url.includes('Captcha') || url.includes('challenge');
                      const isGoogle = url.includes('google');
                      
                      if (isTrAnime || isOptraco || isSibnet || isCaptcha || isGoogle || url.startsWith('about:blank') || url.startsWith('data:')) {
                        return true;
                      }
                      
                      console.log('[Ad Blocker] Engellenen reklam yönlendirmesi:', url);
                      return false;
                    }}
                  />
                ) : null}
              </View>

              {/* Temiz Yükleme Perdesi (Full Screen Loading Overlay) */}
              {!showWebView ? (
                <View style={styles.webViewOverlay}>
                  <Text style={styles.overlayText}>Bölüm Yükleniyor...</Text>
                  <Text style={styles.overlayPercentText}>%{displayedPercent}</Text>
                  
                  <View style={styles.progressContainerCompact}>
                    <Animated.View style={[styles.progressBar, { width: animatedProgress.interpolate({
                      inputRange: [0, 100],
                      outputRange: ['0%', '100%'],
                    }) }]} />
                  </View>

                  <TouchableOpacity 
                    style={styles.cancelButtonOverlay}
                    onPress={() => {
                      navigation.goBack();
                    }}
                  >
                    <Text style={styles.cancelButtonText}>İptal Et</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity 
                  style={styles.floatingCloseDebugButton}
                  onPress={() => setShowWebView(false)}
                >
                  <Ionicons name="eye-off" size={20} color="#FFF" />
                  <Text style={{ color: '#FFF', marginLeft: 8, fontWeight: 'bold' }}>Tarayıcıyı Gizle</Text>
                </TouchableOpacity>
              )}
            </View>
          </SafeAreaView>
        ) : (
          // Initial Database/Cache check: Show standard loading screen
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.accent} style={{ marginBottom: 20 }} />
            <Text style={styles.loadingTitle}>{resolvingState}</Text>
          </View>
        )
      ) : errorMsg ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={80} color={COLORS.error} style={styles.errorIcon} />
          <Text style={styles.errorTitle}>Hata Oluştu</Text>
          <Text style={styles.errorText}>{errorMsg}</Text>
          
          <TouchableOpacity style={styles.retryButton} onPress={checkDatabaseCache}>
            <Text style={styles.retryButtonText}>Yeniden Dene</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
            <Text style={styles.backLinkText}>Geri Dön</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#09090E',
  },
  loadingOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxl,
    zIndex: 9999,
  },
  loadingTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.title + 2,
    fontWeight: FONT_WEIGHTS.bold,
    marginTop: 40,
    marginBottom: SPACING.sm,
    letterSpacing: 0.5,
  },
  loadingStateText: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.lg,
  },
  loadingSubtitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body - 1,
    textAlign: 'center',
    paddingHorizontal: SPACING.md,
    marginTop: 20,
    lineHeight: 18,
  },
  progressContainer: {
    height: 6,
    width: '70%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 10,
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 3,
  },
  cancelButton: {
    position: 'absolute',
    bottom: 50,
    padding: 10,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxl,
    backgroundColor: COLORS.bgPrimary,
  },
  errorIcon: {
    marginBottom: SPACING.lg,
    ...SHADOWS.glow,
  },
  errorTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.heading,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.sm,
  },
  errorText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    textAlign: 'center',
    marginBottom: SPACING.xxl,
    lineHeight: 20,
    paddingHorizontal: SPACING.md,
  },
  retryButton: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xxl,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.accent,
    ...SHADOWS.glow,
    marginBottom: SPACING.lg,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
  },
  backLink: {
    paddingVertical: SPACING.sm,
  },
  backLinkText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
  },
  resolvingContainer: {
    flex: 1,
    backgroundColor: '#09090E',
  },
  webViewContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000',
  },
  webViewOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#09090E',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    paddingHorizontal: 40,
  },
  overlayText: {
    color: '#FFF',
    fontSize: FONT_SIZES.heading,
    fontWeight: FONT_WEIGHTS.bold,
    textAlign: 'center',
    marginBottom: SPACING.xs,
    letterSpacing: 0.5,
  },
  overlayPercentText: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.heading + 6,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 30,
  },
  progressContainerCompact: {
    height: 8,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 40,
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 4,
  },
  cancelButtonOverlay: {
    position: 'absolute',
    bottom: 60,
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  cancelButtonText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  debugButtonOverlay: {
    marginBottom: 20,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  debugButtonText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: FONT_SIZES.body - 2,
    fontWeight: FONT_WEIGHTS.medium,
  },
  floatingCloseDebugButton: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    backgroundColor: 'rgba(255, 59, 48, 0.9)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
});
