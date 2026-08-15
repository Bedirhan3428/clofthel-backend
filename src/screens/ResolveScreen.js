import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  PixelRatio,
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
import NetworkChallengeResolver from '../components/NetworkChallengeResolver';

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
  const { animeId, episodeNumber, episodeTitle, animeTitle, anilistId, fansubs, startAt } = route.params;

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

  const [debugMode, setDebugMode] = useState(false);
  const [debugTapCount, setDebugTapCount] = useState(0);
  const [lastTouchCoords, setLastTouchCoords] = useState(null);
  const [showManualButton, setShowManualButton] = useState(false);
  const [debugToastMsg, setDebugToastMsg] = useState(null);

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

  const handlePercentTap = () => {
    const nextCount = debugTapCount + 1;
    setDebugTapCount(nextCount);
    if (nextCount >= 7) {
      const nextState = !debugMode;
      setDebugMode(nextState);
      setDebugTapCount(0);
      setDebugToastMsg(nextState ? '🐞 HATA AYIKLAMA MODU AÇILDI (DEBUG MODE ON)' : '🔒 Hata Ayıklama Modu Kapatıldı');
      setTimeout(() => setDebugToastMsg(null), 3000);
    } else if (nextCount >= 3) {
      setDebugToastMsg(`Hata Ayıklama Modu için ${7 - nextCount} dokunuş kaldı...`);
      setTimeout(() => setDebugToastMsg(null), 1500);
    }
  };

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
          fansub: result.fansub || null,
          fansubs: fansubs || result.fansubs || [],
          anilistId: anilistId || result.anilist_id || null,
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
        else if (msg.includes('captcha tespit')) { setProgressPercent(45); setShowManualButton(true); }
        else if (msg.includes('tekrar')) setProgressPercent(55);
        else if (msg.includes('farkli') || msg.includes('farklı')) setProgressPercent(70);
        else if (msg.includes('tiklaniyor') || msg.includes('tıklanıyor') || msg.includes('basildi')) setProgressPercent(85);
        
      } else if (data.type === 'captcha_detected' || data.type === 'captcha_failed') {
        setShowManualButton(true);
        if (data.type === 'captcha_failed') {
          setResolvingState('Otomatik Geçiş Tamamlanamadı (Manuel Geçiş Yapabilirsiniz)');
        }
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
          fansub: data.fansub || null,
          fansubs: fansubs || [],
          anilistId: anilistId || null,
          startAt: startAt || 0
        });
      } else if (data.type === 'noSource' || data.type === 'error') {
        setErrorMsg(data.message || 'Anime bulunamadı.');
        setLoading(false);
      } else if (data.type === 'native_touch') {
        const { x, y, cssX, cssY, dpr, url } = data;
        if (TouchInjector && webViewRef.current) {
          
          const reactTag = findNodeHandle(webViewRef.current); 

          if (reactTag) {
            const scale = PixelRatio.get();
            const scaledX = x / scale;
            const scaledY = y / scale;

            console.log(`[Resolve Touch Fix] Density: ${scale} | DPR: ${dpr} | Orijinal X:${x} Y:${y} -> Scaled X:${scaledX} Y:${scaledY}`);
            
            // Save coordinates to debug state
            setLastTouchCoords({ 
              x: Math.round(x), 
              y: Math.round(y), 
              scaledX: Math.round(scaledX), 
              scaledY: Math.round(scaledY), 
              cssX, 
              cssY, 
              scale, 
              dpr 
            });

            // Send debug report to backend MongoDB
            fetch(`${API_BASE_URL}/internal/debug-log`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'captcha_touch_event',
                x: Math.round(x),
                y: Math.round(y),
                scaledX: Math.round(scaledX),
                scaledY: Math.round(scaledY),
                cssX,
                cssY,
                scale,
                dpr,
                url,
                animeId,
                episodeNumber,
                timestamp: Date.now()
              })
            }).catch(err => console.log('[Debug Log Report Error]', err.message));

            setTimeout(() => {
              TouchInjector.simulateTouch(reactTag, scaledX, scaledY)
                .then(res => console.log('[Resolve Touch Success]', res))
                .catch(err => console.error('[Resolve Touch Error]', err));
            }, 25);

          } else {
            console.warn('[Resolve Touch] WebView reactTag findNodeHandle ile çözülemedi.');
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
          <SafeAreaView style={styles.resolvingContainer} edges={['top', 'left', 'right', 'bottom']}>
            <NetworkChallengeResolver
              targetUrl={episodeUrl}
              visible={true}
              onResolved={async (data) => {
                let finalUrl = data.videoUrl;
                const detectedFansub = data.fansub || null;
                await cacheEpisodeVideoUrl(animeId, episodeNumber, finalUrl, detectedFansub);
                if (finalUrl.startsWith('sibnet-direct:')) {
                  finalUrl = finalUrl.replace('sibnet-direct:', '');
                } else if (finalUrl.startsWith('sibnet:')) {
                  const sibnetId = finalUrl.replace('sibnet:', '');
                  finalUrl = `${API_BASE_URL}/animes/sibnet-proxy?sibnetId=${sibnetId}`;
                }
                navigation.replace('Watch', {
                  animeId,
                  episodeNumber,
                  episodeTitle,
                  animeTitle,
                  videoUrl: finalUrl,
                  fansub: detectedFansub,
                  fansubs: fansubs || [],
                  anilistId: anilistId || null,
                  startAt: startAt || 0
                });
              }}
              onError={(err) => {
                setErrorMsg(err || 'Video adresi alınamadı.');
                setLoading(false);
              }}
              onClose={() => navigation.goBack()}
            />
          </SafeAreaView>
        ) : (
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
  buttonRowOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    bottom: 50,
    width: '100%',
  },
  cancelButtonOverlay: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    marginRight: 10,
  },
  cancelButtonText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  manualButtonOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 229, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.4)',
  },
  manualButtonHighlighted: {
    backgroundColor: 'rgba(0, 229, 255, 0.25)',
    borderColor: '#00E5FF',
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 4,
  },
  manualButtonText: {
    color: '#00E5FF',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },
  debugBanner: {
    position: 'absolute',
    top: 30,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(20, 20, 30, 0.95)',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#00E5FF',
    zIndex: 999,
  },
  debugBannerTitle: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  debugBannerSubtext: {
    color: '#0F0',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 2,
  },
  debugToast: {
    position: 'absolute',
    top: 90,
    backgroundColor: '#00E5FF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    zIndex: 1000,
  },
  debugToastText: {
    color: '#000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  debugTouchIndicator: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#00E5FF',
    marginBottom: 8,
  },
  debugTouchText: {
    color: '#0F0',
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
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
