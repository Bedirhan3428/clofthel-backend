import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PixelRatio,
  Platform,
  Animated,
  findNodeHandle,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { API_BASE_URL } from '../constants/config';
import TouchInjector from '../modules/TouchInjector';
import { scraperInjectedJs } from '../modules/ScraperScript';

let WebView = null;
if (Platform.OS !== 'web') {
  try {
    WebView = require('react-native-webview').WebView;
  } catch (e) {
    console.warn('[NetworkChallengeResolver] WebView not available:', e.message);
  }
}

export default function NetworkChallengeResolver({
  targetUrl,
  visible = true,
  onResolved,
  onError,
  onClose,
}) {
  const [resolvingState, setResolvingState] = useState('Sayfa yükleniyor...');
  const [progressPercent, setProgressPercent] = useState(10);
  const [displayedPercent, setDisplayedPercent] = useState(10);
  const [showWebView, setShowWebView] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [debugTapCount, setDebugTapCount] = useState(0);
  const [lastTouchCoords, setLastTouchCoords] = useState(null);
  const [challengeData, setChallengeData] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);

  const webViewRef = useRef(null);
  const animatedProgress = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.timing(animatedProgress, {
      toValue: progressPercent,
      duration: 800,
      useNativeDriver: false,
    }).start();

    let start = displayedPercent;
    const end = progressPercent;
    if (start === end) return;

    const range = end - start;
    const stepTime = Math.max(Math.floor(800 / Math.abs(range)), 15);

    const timer = setInterval(() => {
      start += (end > start ? 1 : -1);
      setDisplayedPercent(start);
      if (start === end) clearInterval(timer);
    }, stepTime);

    return () => clearInterval(timer);
  }, [progressPercent]);

  const handlePercentTap = () => {
    const nextCount = debugTapCount + 1;
    setDebugTapCount(nextCount);
    if (nextCount >= 7) {
      setDebugMode(!debugMode);
      setDebugTapCount(0);
      setStatusMessage(!debugMode ? '🐞 Hata Ayıklama Modu Açıldı' : '🔒 Hata Ayıklama Modu Kapatıldı');
      setTimeout(() => setStatusMessage(null), 2500);
    }
  };

  const executeJNITouch = (physicalX, physicalY, label = '') => {
    if (!TouchInjector || !webViewRef.current) return;
    const reactTag = findNodeHandle(webViewRef.current);
    if (!reactTag) return;

    const scale = PixelRatio.get();
    const scaledX = physicalX / scale;
    const scaledY = physicalY / scale;

    console.log(`[JNI Touch] ${label} -> Physical X:${physicalX} Y:${physicalY} | Scaled X:${scaledX} Y:${scaledY}`);
    setLastTouchCoords({ scaledX: Math.round(scaledX), scaledY: Math.round(scaledY), scale, label });

    setTimeout(() => {
      TouchInjector.simulateTouch(reactTag, scaledX, scaledY)
        .then(res => console.log(`[JNI Touch Success] ${label}:`, res))
        .catch(err => console.error(`[JNI Touch Error] ${label}:`, err.message));
    }, 30);
  };

  const solveChallengeHybrid = async (data) => {
    setChallengeData(data);
    const { questionText, questionImageUrl, options } = data;
    const optionStr = (options || []).map(o => (o.text || '').trim().toLowerCase()).sort().join('|');
    const questionHash = `hash_${(questionText || '').trim().toLowerCase()}_${optionStr}`;

    // 1. Check Device Local Cache (0ms)
    try {
      const cachedOptionId = await AsyncStorage.getItem(`challenge_cache_${questionHash}`);
      if (cachedOptionId) {
        console.log(`⚡ [HYBRID PIPELINE] Found in Device Local Cache: ${cachedOptionId}`);
        const matchedOption = options.find(o => o.id === cachedOptionId);
        if (matchedOption) {
          setStatusMessage('⚡ Yerel Hafızadan Çözüldü (0ms)');
          executeJNITouch(matchedOption.physicalX, matchedOption.physicalY, 'Select Option (Local Cache)');
          return;
        }
      }
    } catch (e) {}

    // 2. Query Central DB Pool & Llama 8B Service
    setResolvingState('Soru yapay zeka & soru havuzuna soruluyor...');
    try {
      const response = await fetch(`${API_BASE_URL}/v1/challenge/solve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionText, questionImageUrl, options, clientHash: questionHash })
      });
      const resData = await response.json();

      if (resData.success && resData.correctOptionId) {
        const correctId = resData.correctOptionId;
        console.log(`✨ [HYBRID PIPELINE] Solved via ${resData.source}: ${resData.correctOptionText} (${correctId})`);
        
        // Save to Local Cache
        await AsyncStorage.setItem(`challenge_cache_${questionHash}`, correctId);
        setStatusMessage(`🤖 ${resData.source === 'llama_8b' ? 'Llama 8B AI' : 'Merkezi Havuz'} Çözdü`);

        const matchedOption = options.find(o => o.id === correctId);
        if (matchedOption) {
          executeJNITouch(matchedOption.physicalX, matchedOption.physicalY, `Select Option (${resData.source})`);
        }
      }
    } catch (err) {
      console.error('[HYBRID PIPELINE] Solve request error:', err.message);
      setStatusMessage('Manuel geçiş gereklidir.');
      setShowWebView(true);
    }
  };

  const handleWebViewMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'log') {
        console.log('[ChallengeResolver Log]', data.message);
        const msg = data.message.toLowerCase();
        if (msg.includes('baslatildi')) setProgressPercent(15);
        else if (msg.includes('challenge')) setProgressPercent(40);
        else if (msg.includes('turnstile')) setProgressPercent(70);
        else if (msg.includes('submit')) setProgressPercent(90);

      } else if (data.type === 'network_challenge_detected') {
        setProgressPercent(50);
        setResolvingState('Güvenlik Sorusu Çözülüyor...');
        solveChallengeHybrid(data);

      } else if (data.type === 'resolved') {
        setProgressPercent(100);
        if (onResolved) onResolved(data);

      } else if (data.type === 'native_touch') {
        const { x, y } = data;
        executeJNITouch(x, y, 'Native Auto Touch');

      } else if (data.type === 'error' || data.type === 'noSource') {
        if (onError) onError(data.message);
      }
    } catch (err) {
      console.error('[ChallengeResolver Message Parse Error]', err);
    }
  };

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <View style={styles.webViewContainer}>
        {WebView ? (
          <WebView
            ref={webViewRef}
            source={{ uri: targetUrl }}
            injectedJavaScriptBeforeContentLoaded={scraperInjectedJs}
            injectedJavaScript={scraperInjectedJs}
            onMessage={handleWebViewMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            mixedContentMode="always"
            mediaPlaybackRequiresUserAction={false}
            style={{ flex: 1, width: '100%', height: '100%' }}
          />
        ) : null}
      </View>

      {!showWebView ? (
        <View style={styles.overlay}>
          {statusMessage && (
            <View style={styles.statusToast}>
              <Text style={styles.statusToastText}>{statusMessage}</Text>
            </View>
          )}

          {debugMode && (
            <View style={styles.debugBanner}>
              <Text style={styles.debugTitle}>🐞 JNI HATA AYIKLAMA (DEBUG MODE)</Text>
              <Text style={styles.debugText}>Scale: {PixelRatio.get()}</Text>
              {lastTouchCoords && (
                <Text style={styles.debugText}>
                  Son Dokunuş ({lastTouchCoords.label}): Scaled DP({lastTouchCoords.scaledX}, {lastTouchCoords.scaledY})
                </Text>
              )}
            </View>
          )}

          <Text style={styles.overlayTitle}>{resolvingState}</Text>

          <TouchableOpacity activeOpacity={0.7} onPress={handlePercentTap}>
            <Text style={styles.percentText}>%{displayedPercent}</Text>
          </TouchableOpacity>

          <View style={styles.progressContainer}>
            <Animated.View
              style={[
                styles.progressBar,
                {
                  width: animatedProgress.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>

          {/* Interactive Challenge Options Quick Bar */}
          {challengeData && challengeData.options && (
            <View style={styles.optionsContainer}>
              <Text style={styles.optionsTitle}>{challengeData.questionText}</Text>
              <View style={styles.optionsRow}>
                {challengeData.options.map((opt) => (
                  <TouchableOpacity
                    key={opt.id}
                    style={styles.optionButton}
                    onPress={() => executeJNITouch(opt.physicalX, opt.physicalY, `Manual Choice (${opt.text})`)}
                  >
                    <Text style={styles.optionText}>{opt.text}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>İptal Et</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.manualButton}
              onPress={() => setShowWebView(true)}
            >
              <Ionicons name="finger-print" size={18} color="#00E5FF" style={{ marginRight: 6 }} />
              <Text style={styles.manualButtonText}>Tarayıcıyı Göster</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.floatingCloseContainer}>
          <TouchableOpacity style={styles.floatingCloseButton} onPress={() => setShowWebView(false)}>
            <Ionicons name="eye-off" size={20} color="#FFF" />
            <Text style={styles.floatingCloseText}>Tarayıcıyı Gizle</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  webViewContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#09090E',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    paddingHorizontal: 30,
  },
  overlayTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.heading,
    fontWeight: FONT_WEIGHTS.bold,
    textAlign: 'center',
    marginBottom: 8,
  },
  percentText: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.heading + 8,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 20,
  },
  progressContainer: {
    height: 8,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 30,
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.accent,
  },
  optionsContainer: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BORDER_RADIUS.md,
    padding: 14,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  optionsTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.body - 1,
    fontWeight: FONT_WEIGHTS.medium,
    marginBottom: 10,
    textAlign: 'center',
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  optionButton: {
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    borderWidth: 1,
    borderColor: '#00E5FF',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    margin: 4,
  },
  optionText: {
    color: '#00E5FF',
    fontSize: FONT_SIZES.body - 1,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    bottom: 40,
    width: '100%',
  },
  cancelButton: {
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
  manualButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    borderWidth: 1,
    borderColor: '#00E5FF',
  },
  manualButtonText: {
    color: '#00E5FF',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },
  statusToast: {
    position: 'absolute',
    top: 50,
    backgroundColor: '#00E5FF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    zIndex: 1000,
  },
  statusToastText: {
    color: '#000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  debugBanner: {
    position: 'absolute',
    top: 90,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(20, 20, 30, 0.95)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00E5FF',
  },
  debugTitle: {
    color: '#00E5FF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  debugText: {
    color: '#0F0',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 2,
  },
  floatingCloseContainer: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    zIndex: 999,
  },
  floatingCloseButton: {
    backgroundColor: 'rgba(255, 59, 48, 0.9)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  floatingCloseText: {
    color: '#FFF',
    marginLeft: 8,
    fontWeight: 'bold',
  },
});
