import { Image } from 'expo-image';
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
  ScrollView,
  Platform,
  TouchableWithoutFeedback,
  FlatList,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { fetchAnimeDetail, fetchEpisodes, resetAnimeAnilistId, saveAnimeAnilistId, addToHistory } from '../services/api';
import { API_BASE_URL } from '../constants/config';
import * as ScreenOrientation from 'expo-screen-orientation';
import { getPerformanceProfile, getPlayerPreferences, savePlayerPreferences } from '../utils/preferences';
import { profileDevice } from '../utils/performanceProfiler';
import GestureLayer from '../components/player/GestureLayer';
import ControlLayer from '../components/player/ControlLayer';
import { useAlert } from '../context/AlertContext';

let WebView = null;
if (Platform.OS !== 'web') {
  try {
    WebView = require('react-native-webview').WebView;
  } catch (e) {
    console.warn('[WatchScreen] react-native-webview not available:', e.message);
  }
}

const IS_WEB = Platform.OS === 'web';
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function WatchScreen({ route, navigation }) {
  const { animeId, episodeNumber: initialEpisodeNumber, episodeTitle: initialEpisodeTitle, videoUrl, startAt } = route.params;
  const { showAlert } = useAlert();

  const [currentEpisodeNumber, setCurrentEpisodeNumber] = useState(initialEpisodeNumber);
  const [currentEpisodeTitle, setCurrentEpisodeTitle] = useState(initialEpisodeTitle);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('main'); // 'main' | 'quality' | 'speed' | 'advanced'
  const [qualityLevels, setQualityLevels] = useState([]);
  const [selectedQuality, setSelectedQuality] = useState(-1);
  const [selectedSpeed, setSelectedSpeed] = useState(1.0);
  const [currentQualityLabel, setCurrentQualityLabel] = useState('Otomatik');
  const [currentSpeedLabel, setCurrentSpeedLabel] = useState('1.0x');

  const [isLandscape, setIsLandscape] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isUltraClarityEnabled, setIsUltraClarityEnabled] = useState(false);

  // Native player states
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(startAt || 0);
  const [duration, setDuration] = useState(0);
  const [bufferedPosition, setBufferedPosition] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [deviceProfile, setDeviceProfile] = useState('mid');
  const [userPrefs, setUserPrefs] = useState({
    aiQuality: 'balanced',
    buttonSize: 'medium',
    skipInterval: 15,
    doubleTapEnabled: true,
    swipeSeekEnabled: true
  });

  const [episodes, setEpisodes] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [currentAnime, setCurrentAnime] = useState(null);
  const [isFixingAnilist, setIsFixingAnilist] = useState(false);

  const slideAnim = useRef(new Animated.Value(400)).current;
  const webViewRef = useRef(null);
  const currentVideoTimeRef = useRef(startAt || 0);
  const wasPausedBySettings = useRef(false);
  const saveIntervalRef = useRef(null);
  const controlsTimerRef = useRef(null);

  // Inactivity controls timeout
  const resetControlsTimeout = () => {
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }
    setControlsVisible(true);
    
    if (isPlaying && !isSettingsOpen) {
      controlsTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 3000);
    }
  };

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [isPlaying, isSettingsOpen]);

  // Load preferences and profile device on mount
  useEffect(() => {
    const profile = profileDevice();
    setDeviceProfile(profile);

    const prefs = getPlayerPreferences();
    setUserPrefs(prefs);

    if (profile === 'low') {
      setIsUltraClarityEnabled(false);
    } else if (profile === 'high') {
      setIsUltraClarityEnabled(prefs.aiQuality === 'directors-cut');
    } else {
      setIsUltraClarityEnabled(prefs.aiQuality === 'balanced');
    }
  }, []);

  useEffect(() => {
    const updateDimensions = () => {
      const { width, height } = Dimensions.get('window');
      setIsLandscape(width > height);
    };

    updateDimensions();
    const subscription = Dimensions.addEventListener('change', updateDimensions);
    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (isSettingsOpen) {
      wasPausedBySettings.current = true;
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 65,
        friction: 10,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 400,
        duration: 200,
        useNativeDriver: true,
      }).start();
      
      if (wasPausedBySettings.current) {
        sendControlCommand('playVideo', null);
        wasPausedBySettings.current = false;
      }
    }
  }, [isSettingsOpen]);

  useEffect(() => {
    return () => {
      if (Platform.OS !== 'web') {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(err => {
          console.warn('[WatchScreen] ScreenOrientation lock portrait failed on unmount:', err);
        });
        if (Platform.OS === 'android') {
          try {
            const NavigationBar = require('expo-navigation-bar');
            NavigationBar.setVisibilityAsync("visible").catch(() => {});
          } catch (e) {}
        }
      }
    };
  }, []);

  // Fetch clean episode title from AniList in the background
  useEffect(() => {
    loadEpisodeTitle();
  }, [currentEpisodeNumber]);

  const loadEpisodeTitle = async () => {
    try {
      const detail = await fetchAnimeDetail(animeId);
      if (detail && detail.streamingEpisodes) {
        const cleanSearchPattern = `episode ${currentEpisodeNumber}`;
        const foundEp = detail.streamingEpisodes.find(ep => {
          const cleanTitle = ep.title.toLowerCase();
          return cleanTitle.startsWith(cleanSearchPattern) || 
                 cleanTitle.includes(`episode ${currentEpisodeNumber} `) || 
                 cleanTitle === cleanSearchPattern;
        });
        
        if (foundEp) {
          let cleanTitle = foundEp.title;
          const prefixRegex = new RegExp(`^episode\\s+${currentEpisodeNumber}\\s*-\\s*`, 'i');
          cleanTitle = cleanTitle.replace(prefixRegex, '');
          const exactRegex = new RegExp(`^episode\\s+${currentEpisodeNumber}$`, 'i');
          if (exactRegex.test(cleanTitle)) {
            cleanTitle = `${currentEpisodeNumber}. Bölüm`;
          }

          if (cleanTitle && cleanTitle !== `${currentEpisodeNumber}. Bölüm`) {
            setCurrentEpisodeTitle(cleanTitle);
            try {
              await fetch(`${API_BASE_URL}/animes/${animeId}/currentEpisodeNumber/title`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: cleanTitle })
              });
            } catch (saveErr) {
              console.warn('[WatchScreen] Failed to save episode title:', saveErr);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[WatchScreen] AniList title fetch failed:', e);
    }
  };

  const loadAnimeData = async () => {
    try {
      const detail = await fetchAnimeDetail(animeId);
      if (detail) {
        setCurrentAnime(detail);
        if (detail.seasons) setSeasons(detail.seasons);
      }
      const epsData = await fetchEpisodes(animeId);
      if (epsData) setEpisodes(epsData);
    } catch (e) {
      console.warn('[WatchScreen] Failed to load anime data', e);
    }
  };

  useEffect(() => {
    loadAnimeData();

    // Her 15 saniyede bir izleme pozisyonunu backend'e kaydet
    saveIntervalRef.current = setInterval(() => {
      const time = currentVideoTimeRef.current;
      if (time > 5) {
        addToHistory(animeId, currentEpisodeNumber, Math.floor(time));
      }
    }, 15000);

    return () => {
      // Ekrandan çıkarken son pozisyonu kaydet
      const time = currentVideoTimeRef.current;
      if (time > 5) {
        addToHistory(animeId, currentEpisodeNumber, Math.floor(time));
      }
      if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);
    };
  }, [animeId, currentEpisodeNumber]);

  const handleFixAnilist = async () => {
    setIsFixingAnilist(true);
    try {
      const success = await resetAnimeAnilistId(animeId);
      if (success) {
        const detail = await fetchAnimeDetail(animeId);
        if (detail) {
          setCurrentAnime(detail);
          if (detail.seasons) setSeasons(detail.seasons);
          
          if (detail.anilist_id) {
            await saveAnimeAnilistId(animeId, detail.anilist_id, detail.coverImage, detail.bannerImage, detail.orijinal_ad, detail.format);
          }
        }
        const epsData = await fetchEpisodes(animeId);
        if (epsData) setEpisodes(epsData);
        
        showAlert("Başarılı", "Anime bilgileri AniList üzerinden düzeltildi ve veritabanına kaydedildi.");
      } else {
        showAlert("Hata", "Veriler sıfırlanamadı.");
      }
    } catch (e) {
      showAlert("Hata", "Bir sorun oluştu.");
    } finally {
      setIsFixingAnilist(false);
    }
  };

  const sendControlCommand = (command, val) => {
    if (Platform.OS === 'web') {
      try {
        if (webViewRef.current && webViewRef.current.contentWindow) {
          webViewRef.current.contentWindow.postMessage(
            JSON.stringify({ type: command, value: val }),
            '*'
          );
        }
      } catch (e) {
        console.warn('[WatchScreen] Failed to post message to web player:', e);
      }
    } else {
      webViewRef.current?.injectJavaScript(`
        (function() {
          try {
            window.dispatchEvent(new MessageEvent('message', {
              data: JSON.stringify({ type: "${command}", value: ${JSON.stringify(val)} })
            }));
          } catch(e) {
            console.error('injectJavaScript error:', e);
          }
        })();
        true;
      `);
    }
  };

  // WebView Message Broker
  const handleWebViewMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('[WebView Player Log]', data);

      if (data.type === 'fullscreen') {
        setIsFullscreen(data.isFullscreen);
        if (Platform.OS !== 'web') {
          try {
            if (data.isFullscreen) {
              await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
              if (Platform.OS === 'android') {
                try {
                  const NavigationBar = require('expo-navigation-bar');
                  await NavigationBar.setVisibilityAsync("hidden");
                  await NavigationBar.setBehaviorAsync("overlay-swipe");
                } catch (navErr) {
                  console.warn('[WatchScreen] Failed to hide navigation bar:', navErr);
                }
              }
            } else {
              await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
              if (Platform.OS === 'android') {
                try {
                  const NavigationBar = require('expo-navigation-bar');
                  await NavigationBar.setVisibilityAsync("visible");
                } catch (navErr) {
                  console.warn('[WatchScreen] Failed to show navigation bar:', navErr);
                }
              }
            }
          } catch (orientationErr) {
            console.warn('[WatchScreen] Orientation lock failed:', orientationErr);
          }
        }
      }

      if (data.type === 'statusChange') {
        if (data.isPlaying !== undefined) setIsPlaying(data.isPlaying);
        if (data.isBuffering !== undefined) setIsBuffering(data.isBuffering);
      }

      if (data.type === 'qualityLevels') {
        let levels = data.levels || [];
        if (deviceProfile === 'low') {
          levels = levels.filter(lvl => !lvl.height || lvl.height <= 720);
        } else if (deviceProfile === 'mid') {
          levels = levels.filter(lvl => !lvl.height || lvl.height <= 1080);
        }
        setQualityLevels(levels);
      }

      if (data.type === 'qualitySelected') {
        setSelectedQuality(data.index);
        setCurrentQualityLabel(data.label);
      }

      if (data.type === 'speedSelected') {
        setSelectedSpeed(data.speed);
        setCurrentSpeedLabel(data.label);
      }

      if (data.type === 'timeupdate') {
        setCurrentTime(data.currentTime);
        currentVideoTimeRef.current = data.currentTime;
      }

      if (data.type === 'bufferupdate') {
        setBufferedPosition(data.bufferedPosition);
      }

      if (data.type === 'duration') {
        setDuration(data.duration);
      }

      if (data.type === 'playerReady') {
        setIsBuffering(false);
        if (startAt > 0) {
          sendControlCommand('seekTo', startAt);
        }
        sendControlCommand('toggleUltraClarity', isUltraClarityEnabled);
        sendControlCommand('setPlaySpeed', selectedSpeed);
      }

      if (data.type === 'backgroundClick') {
        setIsSettingsOpen(false);
      }
    } catch (err) {
      console.error('[WebView Message Parse Error]', err);
    }
  };

  const handleNativeSeek = (seconds) => {
    setCurrentTime(seconds);
    currentVideoTimeRef.current = seconds;
    sendControlCommand('seekTo', seconds);
    resetControlsTimeout();
  };

  const handleNativePlayPause = () => {
    if (isPlaying) {
      sendControlCommand('pauseVideo', null);
      setIsPlaying(false);
    } else {
      sendControlCommand('playVideo', null);
      setIsPlaying(true);
    }
    resetControlsTimeout();
  };

  const handlePresetSelection = (presetId) => {
    savePlayerPreferences({ aiQuality: presetId });
    setUserPrefs(prev => ({ ...prev, aiQuality: presetId }));
    
    let enableClarity = false;
    if (presetId === 'directors-cut') {
      enableClarity = true;
    } else if (presetId === 'balanced') {
      enableClarity = deviceProfile !== 'low';
    }
    setIsUltraClarityEnabled(enableClarity);
    
    sendControlCommand('changePreset', presetId);
    sendControlCommand('toggleUltraClarity', enableClarity);
    sendControlCommand('selectQuality', -1);
    setSelectedQuality(-1);
    setCurrentQualityLabel('Otomatik');
  };

  const handleClarityToggle = (nextEnabled) => {
    setIsUltraClarityEnabled(nextEnabled);
    sendControlCommand('toggleUltraClarity', nextEnabled);
    
    let nextPreset = 'balanced';
    if (nextEnabled) {
      nextPreset = deviceProfile === 'high' ? 'directors-cut' : 'balanced';
    } else {
      nextPreset = 'battery-saver';
    }
    
    savePlayerPreferences({ aiQuality: nextPreset });
    setUserPrefs(prev => ({ ...prev, aiQuality: nextPreset }));
    sendControlCommand('changePreset', nextPreset);
  };

  const handleQualitySelection = (levelIndex, levelHeight) => {
    setSelectedQuality(levelIndex);
    setCurrentQualityLabel(levelHeight ? `${levelHeight}p` : 'Otomatik');
    sendControlCommand('selectQuality', levelIndex);
    
    if (levelHeight && levelHeight > 1080) {
      savePlayerPreferences({ aiQuality: 'directors-cut' });
      setUserPrefs(prev => ({ ...prev, aiQuality: 'directors-cut' }));
      sendControlCommand('changePreset', 'directors-cut');
      setIsUltraClarityEnabled(true);
      sendControlCommand('toggleUltraClarity', true);
    } else if (levelHeight && levelHeight > 720) {
      if (userPrefs.aiQuality === 'battery-saver') {
        savePlayerPreferences({ aiQuality: 'balanced' });
        setUserPrefs(prev => ({ ...prev, aiQuality: 'balanced' }));
        sendControlCommand('changePreset', 'balanced');
        const enableClarity = deviceProfile !== 'low';
        setIsUltraClarityEnabled(enableClarity);
        sendControlCommand('toggleUltraClarity', enableClarity);
      }
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" hidden={isFullscreen} />
      
      <SafeAreaView style={styles.playerWrapper} edges={isFullscreen ? [] : ['top', 'left', 'right']}>
        {/* Video Player Box */}
        <View style={[styles.videoPlayerBox, isFullscreen && styles.videoPlayerBoxFullscreen]}>
          {IS_WEB ? (
            <WebVideoPlayer
              videoUrl={videoUrl}
              onMessage={handleWebViewMessage}
              webViewRef={webViewRef}
              deviceProfile={deviceProfile}
              activePreset={userPrefs.aiQuality}
              startAt={currentVideoTimeRef.current}
            />
          ) : (
            <VideoPlayerWrapper
              videoUrl={videoUrl}
              onMessage={handleWebViewMessage}
              webViewRef={webViewRef}
              deviceProfile={deviceProfile}
              activePreset={userPrefs.aiQuality}
              startAt={currentVideoTimeRef.current}
            />
          )}

          {/* RN Custom Gesture Interception Layer */}
          <GestureLayer
            currentTime={currentTime}
            duration={duration}
            onSeek={handleNativeSeek}
            onPlayPause={handleNativePlayPause}
            skipInterval={userPrefs.skipInterval}
            doubleTapEnabled={userPrefs.doubleTapEnabled}
            swipeSeekEnabled={userPrefs.swipeSeekEnabled}
          />

          {/* RN Custom Control UI Layer */}
          <ControlLayer
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            bufferedPosition={bufferedPosition}
            isBuffering={isBuffering}
            isSettingsOpen={isSettingsOpen}
            isUltraClarityEnabled={isUltraClarityEnabled}
            currentQualityLabel={currentQualityLabel}
            currentSpeedLabel={currentSpeedLabel}
            buttonSize={userPrefs.buttonSize}
            skipInterval={userPrefs.skipInterval}
            visible={controlsVisible}
            onPlayPause={handleNativePlayPause}
            onSeek={handleNativeSeek}
            onOpenSettings={() => {
              setIsSettingsOpen(true);
              setSettingsTab('main');
            }}
          />
          
          {/* Overlay Back Button on Video */}
          {controlsVisible && (
            <TouchableOpacity
              style={styles.videoBackButton}
              activeOpacity={0.7}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="chevron-back" size={24} color="#FFF" />
            </TouchableOpacity>
          )}
        </View>
        
        {/* Details ScrollView */}
        {!isFullscreen && (
          <ScrollView style={styles.detailsScrollView} contentContainerStyle={styles.detailsContent} showsVerticalScrollIndicator={false}>
            <View style={styles.headerInfoContainer}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.detailsTitle}>
                    {currentEpisodeTitle && currentEpisodeTitle !== `${currentEpisodeNumber}. Bölüm` 
                      ? `${currentEpisodeNumber}. Bölüm - ${currentEpisodeTitle}`
                      : `${currentEpisodeNumber}. Bölüm`}
                  </Text>
                  <Text style={styles.detailsSubTitle}>
                    {currentAnime?.title || route.params.animeTitle || 'Anime'}
                  </Text>
                </View>
                <TouchableOpacity 
                  style={styles.fixAnilistButton} 
                  onPress={handleFixAnilist}
                  disabled={isFixingAnilist}
                >
                  {isFixingAnilist ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="sync-outline" size={16} color="#FFF" style={{ marginRight: 4 }} />
                      <Text style={styles.fixAnilistText}>Verileri Düzelt</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Episode Navigation Buttons */}
            <View style={styles.navigationWrapper}>
              <TouchableOpacity 
                style={[styles.navButton, currentEpisodeNumber <= 1 && styles.navButtonDisabled]}
                disabled={currentEpisodeNumber <= 1}
                onPress={() => {
                  const prevNum = currentEpisodeNumber - 1;
                  navigation.replace('Resolve', {
                    animeId,
                    episodeNumber: prevNum,
                    episodeTitle: `${prevNum}. Bölüm`,
                    animeTitle: route.params.animeTitle
                  });
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="play-back" size={20} color={currentEpisodeNumber <= 1 ? '#555' : '#FFF'} />
                <Text style={[styles.navButtonText, currentEpisodeNumber <= 1 && styles.navButtonTextDisabled]}>Önceki Bölüm</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.navButton}
                onPress={() => {
                  const nextNum = currentEpisodeNumber + 1;
                  navigation.replace('Resolve', {
                    animeId,
                    episodeNumber: nextNum,
                    episodeTitle: `${nextNum}. Bölüm`,
                    animeTitle: route.params.animeTitle
                  });
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.navButtonText}>Sonraki Bölüm</Text>
                <Ionicons name="play-forward" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.detailsDivider} />
            
            {/* Premium Diverse Features/Info Cards */}
            <View style={styles.featureGrid}>
              <View style={styles.featureCard}>
                <Ionicons name="film-outline" size={22} color={COLORS.accent} style={styles.featureCardIcon} />
                <Text style={styles.featureCardTitle}>Tür</Text>
                <Text style={styles.featureCardText}>
                  {currentAnime?.enrichedGenres?.length ? currentAnime.enrichedGenres.join(', ') : (route.params.genres ? route.params.genres.join(', ') : 'Belirtilmemiş')}
                </Text>
              </View>

              <View style={styles.featureCard}>
                <Ionicons name="calendar-outline" size={22} color={COLORS.accent} style={styles.featureCardIcon} />
                <Text style={styles.featureCardTitle}>Yayın Yılı</Text>
                <Text style={styles.featureCardText}>
                  {currentAnime?.seasonYear || route.params.year || 'Belirtilmemiş'}
                </Text>
              </View>
            </View>

            <View style={styles.infoInfoBox}>
              <View style={styles.infoTitleRow}>
                <Ionicons name="book-outline" size={20} color={COLORS.accent} style={{ marginRight: 6 }} />
                <Text style={styles.infoTitleText}>Konusu</Text>
              </View>
              <Text style={styles.infoBodyText}>
                {currentAnime?.description || route.params.description || 'Bu animenin konusu henüz eklenmemiş. Bölümü izleyerek maceraya hemen ortak olabilirsiniz.'}
              </Text>
            </View>

            <View style={styles.detailsDivider} />

            {/* Episodes List */}
            <Text style={styles.sectionTitle}>Bölümler</Text>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.episodesListContainer}
              data={episodes}
              keyExtractor={(ep, index) => ep._id ? String(ep._id) : (ep.episode_number ? String(ep.episode_number) : String(index))}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={5}
              renderItem={({ item: ep }) => {
                const isActive = currentEpisodeNumber === ep.episode_number;
                return (
                  <TouchableOpacity 
                    style={[styles.episodeCard, isActive && styles.episodeCardActive]}
                    onPress={() => {
                      if (isActive) return;
                      navigation.replace('Resolve', {
                        animeId,
                        episodeNumber: ep.episode_number,
                        episodeTitle: ep.episode_title,
                        animeTitle: currentAnime?.title || route.params.animeTitle
                      });
                    }}
                  >
                    <Image 
                      source={{ uri: currentAnime?.bannerImage || currentAnime?.coverImage || 'https://via.placeholder.com/150' }} 
                      style={styles.episodeImage} 
                    />
                    <View style={styles.episodeOverlay}>
                      <Text style={[styles.episodeCardTitle, isActive && styles.episodeCardTitleActive]} numberOfLines={2}>
                        {ep.episode_title}
                      </Text>
                      {isActive && <Ionicons name="play-circle" size={20} color={COLORS.accent} style={{ marginTop: 4 }} />}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />

            {/* Seasons Navigation */}
            {seasons && seasons.length > 1 && (
              <>
                <View style={styles.detailsDivider} />
                <Text style={styles.sectionTitle}>Sezonlar</Text>
                <View style={styles.seasonsGrid}>
                  {seasons.map((s, idx) => {
                    // Check if current anime is this season
                    // We can compare animeId with s._id
                    const isCurrentSeason = animeId === s._id;
                    return (
                      <TouchableOpacity
                        key={s._id}
                        style={[styles.seasonButton, isCurrentSeason && styles.seasonButtonActive]}
                        onPress={() => {
                          if (isCurrentSeason) return;
                          navigation.replace('AnimeDetail', { anime: { _id: s._id, title: s.label } });
                        }}
                      >
                        <Text style={[styles.seasonButtonText, isCurrentSeason && styles.seasonButtonTextActive]} numberOfLines={1}>
                          {s.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

          </ScrollView>
        )}
      </SafeAreaView>

      {/* Settings Bottom Sheet */}
      {isSettingsOpen && (
        <View style={styles.sheetContainer}>
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={() => {
              setIsSettingsOpen(false);
              sendControlCommand('playVideo', null);
            }}
          />
          <Animated.View style={[
            styles.bottomSheet,
            isFullscreen && styles.bottomSheetLandscape,
            { transform: [{ translateY: slideAnim }] }
          ]}>
            <ScrollView bounces={false}>
            {settingsTab === 'main' && (
              <View>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetHeaderText}>Oynatma Ayarları</Text>
                </View>
                
                <TouchableOpacity style={styles.sheetItem} onPress={() => setSettingsTab('preset')}>
                  <Text style={styles.sheetItemText}>Oynatma Modu</Text>
                  <Text style={styles.sheetItemValue}>
                    {userPrefs.aiQuality === 'battery-saver' && 'Ekonomik Mod'}
                    {userPrefs.aiQuality === 'balanced' && 'Dengeli Mod'}
                    {userPrefs.aiQuality === 'directors-cut' && 'Director\'s Cut'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.sheetItem} onPress={() => setSettingsTab('quality')}>
                  <Text style={styles.sheetItemText}>Kalite</Text>
                  <Text style={styles.sheetItemValue}>{currentQualityLabel}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.sheetItem} onPress={() => setSettingsTab('speed')}>
                  <Text style={styles.sheetItemText}>Oynatma Hızı</Text>
                  <Text style={styles.sheetItemValue}>{currentSpeedLabel}</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.sheetItem, deviceProfile === 'low' && { opacity: 0.5 }]} 
                  disabled={deviceProfile === 'low'}
                  onPress={() => {
                    handleClarityToggle(!isUltraClarityEnabled);
                  }}
                >
                  <Text style={styles.sheetItemText}>Ultra-Clarity (AI Native)</Text>
                  <Text style={[styles.sheetItemValue, isUltraClarityEnabled ? {color: COLORS.accent} : {}]}>
                    {deviceProfile === 'low' 
                      ? 'Desteklenmiyor (Düşük Donanım)' 
                      : (isUltraClarityEnabled ? 'Açık (4K HDR)' : 'Kapalı')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.sheetItem} onPress={() => setSettingsTab('advanced')}>
                  <Text style={styles.sheetItemText}>Gelişmiş Oynatıcı Ayarları</Text>
                  <Ionicons name="chevron-forward" size={16} color="#555" />
                </TouchableOpacity>
              </View>
            )}

            {settingsTab === 'preset' && (
              <View>
                <TouchableOpacity style={styles.sheetSubHeader} onPress={() => setSettingsTab('main')}>
                  <Ionicons name="chevron-back" size={20} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={styles.sheetHeaderText}>Oynatma Modu</Text>
                </TouchableOpacity>
                
                {[
                  { id: 'battery-saver', name: 'Ekonomik Mod', desc: 'Pil ve Veri tasarrufu, 720p limit, AI Kapalı' },
                  { id: 'balanced', name: 'Dengeli Mod', desc: 'Dengeli pil/performans, 1080p limit, AI Otomatik' },
                  { id: 'directors-cut', name: 'Director\'s Cut', desc: 'Premium 4K HDR netlik, Sınırsız, AI Açık' }
                ].map((preset) => {
                  const isActive = userPrefs.aiQuality === preset.id;
                  const isDisabled = deviceProfile === 'low' && preset.id === 'directors-cut';
                  return (
                    <TouchableOpacity
                      key={preset.id}
                      style={[
                        styles.sheetOption, 
                        isActive && styles.sheetOptionActive,
                        isDisabled && { opacity: 0.4 }
                      ]}
                      disabled={isDisabled}
                      onPress={() => {
                        handlePresetSelection(preset.id);
                        setIsSettingsOpen(false);
                        sendControlCommand('playVideo', null);
                      }}
                    >
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={styles.sheetOptionText}>{preset.name}</Text>
                        <Text style={styles.sheetOptionDesc}>{preset.desc}</Text>
                      </View>
                      {isActive && <Ionicons name="checkmark" size={18} color="#FFF" />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            
            {settingsTab === 'quality' && (
              <View>
                <TouchableOpacity style={styles.sheetSubHeader} onPress={() => setSettingsTab('main')}>
                  <Ionicons name="chevron-back" size={20} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={styles.sheetHeaderText}>Kalite Seçin</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.sheetOption, selectedQuality === -1 && styles.sheetOptionActive]}
                  onPress={() => {
                    handleQualitySelection(-1, null);
                    setIsSettingsOpen(false);
                    sendControlCommand('playVideo', null);
                  }}
                >
                  <Text style={styles.sheetOptionText}>Otomatik</Text>
                  {selectedQuality === -1 && <Ionicons name="checkmark" size={18} color="#FFF" />}
                </TouchableOpacity>

                {qualityLevels.map((lvl) => (
                  <TouchableOpacity
                    key={lvl.index}
                    style={[styles.sheetOption, selectedQuality === lvl.index && styles.sheetOptionActive]}
                    onPress={() => {
                      handleQualitySelection(lvl.index, lvl.height);
                      setIsSettingsOpen(false);
                      sendControlCommand('playVideo', null);
                    }}
                  >
                    <Text style={styles.sheetOptionText}>{lvl.height ? `${lvl.height}p` : `Kalite ${lvl.index + 1}`}</Text>
                    {selectedQuality === lvl.index && <Ionicons name="checkmark" size={18} color="#FFF" />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {settingsTab === 'speed' && (
              <View>
                <TouchableOpacity style={styles.sheetSubHeader} onPress={() => setSettingsTab('main')}>
                  <Ionicons name="chevron-back" size={20} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={styles.sheetHeaderText}>Hız Seçin</Text>
                </TouchableOpacity>

                {[0.5, 1.0, 1.25, 1.5, 2.0].map((speed) => (
                  <TouchableOpacity
                    key={speed}
                    style={[styles.sheetOption, selectedSpeed === speed && styles.sheetOptionActive]}
                    onPress={() => {
                      setSelectedSpeed(speed);
                      setCurrentSpeedLabel(speed === 1.0 ? 'Normal (1.0x)' : `${speed}x`);
                      sendControlCommand('setPlaySpeed', speed);
                      setIsSettingsOpen(false);
                      sendControlCommand('playVideo', null);
                    }}
                  >
                    <Text style={styles.sheetOptionText}>{speed === 1.0 ? 'Normal (1.0x)' : `${speed}x`}</Text>
                    {selectedSpeed === speed && <Ionicons name="checkmark" size={18} color="#FFF" />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {settingsTab === 'advanced' && (
              <View>
                <TouchableOpacity style={styles.sheetSubHeader} onPress={() => setSettingsTab('main')}>
                  <Ionicons name="chevron-back" size={20} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={styles.sheetHeaderText}>Gelişmiş Ayarlar</Text>
                </TouchableOpacity>

                <View style={styles.settingGroup}>
                  <Text style={styles.settingGroupTitle}>Buton Boyutları</Text>
                  <View style={styles.optionsRow}>
                    {['small', 'medium', 'large'].map((size) => {
                      const labelMap = { small: 'Küçük', medium: 'Orta', large: 'Büyük' };
                      const isActive = userPrefs.buttonSize === size;
                      return (
                        <TouchableOpacity
                          key={size}
                          style={[styles.optionBadge, isActive && styles.optionBadgeActive]}
                          onPress={() => {
                            savePlayerPreferences({ buttonSize: size });
                            setUserPrefs(prev => ({ ...prev, buttonSize: size }));
                          }}
                        >
                          <Text style={[styles.optionBadgeText, isActive && styles.optionBadgeTextActive]}>
                            {labelMap[size]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.settingGroup}>
                  <Text style={styles.settingGroupTitle}>Geri/İleri Atlama Süresi</Text>
                  <View style={styles.optionsRow}>
                    {[10, 15, 30].map((interval) => {
                      const isActive = userPrefs.skipInterval === interval;
                      return (
                        <TouchableOpacity
                          key={interval}
                          style={[styles.optionBadge, isActive && styles.optionBadgeActive]}
                          onPress={() => {
                            savePlayerPreferences({ skipInterval: interval });
                            setUserPrefs(prev => ({ ...prev, skipInterval: interval }));
                          }}
                        >
                          <Text style={[styles.optionBadgeText, isActive && styles.optionBadgeTextActive]}>
                            {interval}s
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.sheetItem}
                  onPress={() => {
                    const nextVal = !userPrefs.doubleTapEnabled;
                    savePlayerPreferences({ doubleTapEnabled: nextVal });
                    setUserPrefs(prev => ({ ...prev, doubleTapEnabled: nextVal }));
                  }}
                >
                  <Text style={styles.sheetItemText}>Çift Tıklayarak Atla</Text>
                  <Text style={[styles.sheetItemValue, userPrefs.doubleTapEnabled ? {color: COLORS.accent} : {}]}>
                    {userPrefs.doubleTapEnabled ? 'Açık' : 'Kapalı'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetItem}
                  onPress={() => {
                    const nextVal = !userPrefs.swipeSeekEnabled;
                    savePlayerPreferences({ swipeSeekEnabled: nextVal });
                    setUserPrefs(prev => ({ ...prev, swipeSeekEnabled: nextVal }));
                  }}
                >
                  <Text style={styles.sheetItemText}>Kaydırarak Sar</Text>
                  <Text style={[styles.sheetItemValue, userPrefs.swipeSeekEnabled ? {color: COLORS.accent} : {}]}>
                    {userPrefs.swipeSeekEnabled ? 'Açık' : 'Kapalı'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sheetItem, { marginTop: 12, borderBottomWidth: 0 }]}
                  onPress={() => {
                    const profile = profileDevice(true);
                    setDeviceProfile(profile);
                    setIsSettingsOpen(false);
                    showAlert("Benchmark Tamamlandı", `Cihazınız ${profile.toUpperCase()} sınıfı olarak tespit edildi.`);
                  }}
                >
                  <Text style={[styles.sheetItemText, { color: '#FF6B00', fontWeight: 'bold' }]}>Donanım Testini Yeniden Çalıştır</Text>
                  <Text style={styles.sheetItemValue}>{deviceProfile.toUpperCase()}</Text>
                </TouchableOpacity>
              </View>
            )}
            </ScrollView>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const getRefererForUrl = (url) => {
  if (!url) return 'https://optraco.top/';
  try {
    if (url.includes('sibnet.ru')) {
      return 'https://video.sibnet.ru/';
    }
    if (url.includes('/plateau/')) {
      const parts = url.split('/plateau/');
      const baseUrl = parts[0];
      const remaining = parts[1].split('/');
      const uuid = remaining[0];
      const hash = remaining[1].replace('.m3u8', '');
      return `${baseUrl}/explorer/${uuid}/${hash}`;
    }
  } catch (e) {
    console.error('Error generating referer:', e);
  }
  return 'https://optraco.top/';
};

const generatePlayerHtml = (videoUrl, isMp4, deviceProfile = 'mid', activePreset = 'balanced', startAt = 0) => {
  return `
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <title>Clofthel Video Player</title>
      <script src="https://cdn.jsdelivr.net/npm/hls.js@1.4.12/dist/hls.min.js"></script>
      <style>
        body, html {
          margin: 0; padding: 0; width: 100%; height: 100%;
          background-color: #000; overflow: hidden;
        }
        video {
          width: 100%; height: 100%; object-fit: contain;
        }
      </style>
    </head>
    <body>
      <!-- SVG Filter for 4K Ultra Clarity Sharpening -->
      <svg xmlns="http://www.w3.org/2000/svg" style="display:none; width:0; height:0;">
        <defs>
          <filter id="ultra-sharpen">
            <feConvolveMatrix order="3" kernelMatrix="-0.2 -0.8 -0.2 -0.8 5.0 -0.8 -0.2 -0.8 -0.2" preserveAlpha="true"/>
          </filter>
        </defs>
      </svg>
      <video id="player" playsinline></video>

      <script>
        const video = document.getElementById('player');
        const videoUrl = '${videoUrl}';
        const isMp4 = ${isMp4};
        let deviceProfile = '${deviceProfile}';
        let activePreset = '${activePreset}';
        
        let hlsInstance = null;
        
        function sendToParent(obj) {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify(obj));
          } else {
            window.parent.postMessage(JSON.stringify(obj), '*');
          }
        }

        // Notify parent React Native app of player state changes
        video.addEventListener('play', () => {
          sendToParent({ type: 'statusChange', isPlaying: true, isBuffering: false });
        });
        
        video.addEventListener('pause', () => {
          sendToParent({ type: 'statusChange', isPlaying: false });
        });
        
        video.addEventListener('waiting', () => {
          sendToParent({ type: 'statusChange', isBuffering: true });
        });
        
        video.addEventListener('playing', () => {
          sendToParent({ type: 'statusChange', isPlaying: true, isBuffering: false });
        });
        
        video.addEventListener('durationchange', () => {
          sendToParent({ type: 'duration', duration: video.duration });
        });
        
        video.addEventListener('loadedmetadata', () => {
          sendToParent({ type: 'duration', duration: video.duration });
          sendToParent({ type: 'playerReady' });
        });
        
        video.addEventListener('timeupdate', () => {
          sendToParent({ type: 'timeupdate', currentTime: video.currentTime });
        });
        
        video.addEventListener('progress', () => {
          if (video.duration > 0 && video.buffered.length > 0) {
            const bufferedEnd = video.buffered.end(video.buffered.length - 1);
            sendToParent({ type: 'bufferupdate', bufferedPosition: bufferedEnd });
          }
        });

        // Apply Ultra Clarity filters on video element
        function applyUltraClarity(enabled) {
          if (enabled) {
            video.style.filter = 'url(#ultra-sharpen) contrast(1.20) saturate(1.35) brightness(1.01)';
            video.style.imageRendering = '-webkit-optimize-contrast';
          } else {
            video.style.filter = 'none';
            video.style.imageRendering = 'auto';
          }
        }

        // Configure HLS options based on dynamic resource presets
        function getHlsOptions() {
          let hlsOpts = {
            maxMaxBufferLength: 30,
            maxBufferLength: 30,
            maxBufferSize: 60 * 1024 * 1024,
            capLevelToPlayerSize: true,
            lowLatencyMode: true
          };

          if (activePreset === 'directors-cut') {
            hlsOpts = {
              maxMaxBufferLength: 180,
              maxBufferLength: 60,
              maxBufferSize: 200 * 1024 * 1024,
              capLevelToPlayerSize: false,
              lowLatencyMode: false,
              maxStarvationDelay: 4,
              maxLoadingDelay: 4
            };
          } else if (activePreset === 'balanced') {
            hlsOpts = {
              maxMaxBufferLength: 60,
              maxBufferLength: 60,
              maxBufferSize: 120 * 1024 * 1024,
              capLevelToPlayerSize: false,
              lowLatencyMode: false
            };
          }
          return hlsOpts;
        }

        function initPlayer() {
          const shouldEnableClarity = activePreset === 'directors-cut' || 
            (activePreset === 'balanced' && deviceProfile !== 'low');
          applyUltraClarity(shouldEnableClarity);

          if (isMp4) {
            video.src = videoUrl;
            if (${startAt} > 0) video.currentTime = ${startAt};
            video.play().catch(e => console.log('Autoplay blocked:', e));
            sendToParent({ type: 'qualityLevels', levels: [] });
          } else if (Hls.isSupported()) {
            const options = getHlsOptions();
            const hls = new Hls(options);
            hlsInstance = hls;
            hls.loadSource(videoUrl);
            hls.attachMedia(video);
            
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
              // Filter levels based on device limits
              let levels = hls.levels || [];
              if (deviceProfile === 'low' || activePreset === 'battery-saver') {
                levels = levels.map((lvl, idx) => ({ ...lvl, index: idx })).filter(lvl => !lvl.height || lvl.height <= 720);
              } else if (deviceProfile === 'mid' || activePreset === 'balanced') {
                levels = levels.map((lvl, idx) => ({ ...lvl, index: idx })).filter(lvl => !lvl.height || lvl.height <= 1080);
              } else {
                levels = levels.map((lvl, idx) => ({ ...lvl, index: idx }));
              }

              populateQualityLevels(levels);

              if (shouldEnableClarity && hls.levels.length > 0) {
                selectQuality(hls.levels.length - 1);
              } else {
                sendToParent({ type: 'qualitySelected', index: -1, label: 'Otomatik' });
              }

              if (${startAt} > 0) {
                video.currentTime = ${startAt};
              }
              video.play().catch(e => console.log('Autoplay blocked:', e));
            });
            
            hls.on(Hls.Events.ERROR, function(event, data) {
              if (data.fatal) {
                switch(data.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    hls.startLoad();
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    hls.recoverMediaError();
                    break;
                }
              }
            });
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = videoUrl;
            if (${startAt} > 0) video.currentTime = ${startAt};
            video.play().catch(e => console.log('Autoplay blocked:', e));
          }
        }

        function populateQualityLevels(levels) {
          const formattedLevels = levels.map((lvl) => ({
            index: lvl.index,
            height: lvl.height
          }));
          sendToParent({ type: 'qualityLevels', levels: formattedLevels });
        }
        
        function selectQuality(index) {
          if (hlsInstance) {
            hlsInstance.nextLevel = index;
            const label = index === -1 ? 'Otomatik' : (hlsInstance.levels[index] && hlsInstance.levels[index].height ? hlsInstance.levels[index].height + 'p' : 'Seviye ' + (index + 1));
            sendToParent({ type: 'qualitySelected', index: index, label: label });
          }
        }
        
        function setPlaySpeed(speed) {
          video.playbackRate = speed;
          sendToParent({ type: 'speedSelected', speed: speed, label: speed === 1.0 ? 'Normal (1.0x)' : speed + 'x' });
        }

        window.addEventListener('message', (event) => {
          try {
            let data = event.data;
            if (typeof data === 'string') {
              data = JSON.parse(data);
            }
            if (data && data.type) {
              if (data.type === 'selectQuality') {
                selectQuality(data.value);
              } else if (data.type === 'setPlaySpeed') {
                setPlaySpeed(data.value);
              } else if (data.type === 'toggleUltraClarity') {
                applyUltraClarity(data.value);
              } else if (data.type === 'playVideo') {
                video.play().catch(() => {});
              } else if (data.type === 'pauseVideo') {
                video.pause();
              } else if (data.type === 'seekTo') {
                video.currentTime = data.value;
              } else if (data.type === 'changePreset') {
                activePreset = data.value;
                if (hlsInstance) {
                  const opts = getHlsOptions();
                  Object.assign(hlsInstance.config, opts);
                }
                const shouldEnableClarity = activePreset === 'directors-cut' || 
                  (activePreset === 'balanced' && deviceProfile !== 'low');
                applyUltraClarity(shouldEnableClarity);
              }
            }
          } catch (e) {
            console.error('Error handling parent message in iframe:', e);
          }
        });

        initPlayer();
      <\/script>
    </body>
    </html>
  `;
};

function VideoPlayerWrapper({ videoUrl, onMessage, webViewRef, deviceProfile, activePreset, startAt }) {
  const refererUrl = getRefererForUrl(videoUrl);
  console.log('[WatchScreen] Playing video directly with Referer baseUrl:', refererUrl);

  const isSibnet = videoUrl && (videoUrl.includes('sibnet.ru') || videoUrl.toLowerCase().includes('.mp4'));
  let videoSourceUrl = videoUrl;
  let isMp4 = false;

  if (isSibnet) {
    isMp4 = true;
    console.log('[WatchScreen] Playing Sibnet tokenized video via custom player:', videoSourceUrl);
  } else if (videoUrl && videoUrl.toLowerCase().includes('.mp4')) {
    isMp4 = true;
  }

  const [initialHtml] = useState(() => generatePlayerHtml(videoSourceUrl, isMp4, deviceProfile, activePreset, startAt));

  return (
    <WebView
      ref={webViewRef}
      source={{ html: initialHtml, baseUrl: refererUrl }}
      originWhitelist={['*']}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      allowsFullscreenVideo={true}
      mediaPlaybackRequiresUserAction={false}
      allowsInlineMediaPlayback={true}
      scrollEnabled={false}
      bounces={false}
      style={styles.videoPlayer}
      onMessage={onMessage}
    />
  );
}

function WebVideoPlayer({ videoUrl, onMessage, webViewRef, deviceProfile, activePreset, startAt }) {
  const isSibnet = videoUrl && (videoUrl.includes('sibnet.ru') || videoUrl.toLowerCase().includes('.mp4'));
  let videoSourceUrl = videoUrl;
  let isMp4 = false;

  if (isSibnet) {
    isMp4 = true;
  } else if (videoUrl && videoUrl.toLowerCase().includes('.mp4')) {
    isMp4 = true;
  }

  const [initialHtml] = useState(() => generatePlayerHtml(videoSourceUrl, isMp4, deviceProfile, activePreset, startAt));

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const handler = (event) => {
      try {
        let data = event.data;
        if (typeof data === 'string') {
          data = JSON.parse(data);
        }
        if (data && data.type) {
          onMessage({ nativeEvent: { data: JSON.stringify(data) } });
        }
      } catch (e) {
        // Ignore cross-origin or parse errors
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onMessage]);

  return (
    <View style={styles.videoPlayer}>
      <iframe
        ref={webViewRef}
        srcDoc={initialHtml}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          backgroundColor: '#000',
        }}
        sandbox="allow-scripts allow-same-origin allow-popups"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        title="Video Player"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  playerWrapper: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  videoPlayerBox: {
    width: '100%',
    height: SCREEN_WIDTH * 9 / 16,
    backgroundColor: '#000',
    position: 'relative',
    borderBottomLeftRadius: BORDER_RADIUS.md,
    borderBottomRightRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
  },
  videoPlayerBoxFullscreen: {
    width: '100%',
    height: '100%',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderRadius: 0,
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
  },
  videoBackButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  detailsScrollView: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  detailsContent: {
    padding: SPACING.xl,
  },
  detailsTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.title,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.xs,
    lineHeight: 28,
  },
  detailsSubTitle: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.md,
  },
  detailsDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginVertical: SPACING.md,
  },
  headerInfoContainer: {
    marginBottom: SPACING.md,
  },
  navigationWrapper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginVertical: SPACING.sm,
  },
  navButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  navButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  navButtonText: {
    color: '#FFF',
    fontSize: FONT_SIZES.body - 1,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  navButtonTextDisabled: {
    color: '#555',
  },
  featureGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: SPACING.md,
  },
  featureCard: {
    flex: 1,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
  },
  featureCardIcon: {
    marginBottom: 6,
  },
  featureCardTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.body - 1,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 4,
  },
  featureCardText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  infoInfoBox: {
    backgroundColor: 'rgba(255, 107, 0, 0.05)',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.15)',
  },
  infoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  infoTitleText: {
    color: '#FFF',
    fontSize: FONT_SIZES.body - 1,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  infoBodyText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  sheetContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  bottomSheet: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: SPACING.xl,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  bottomSheetLandscape: {
    maxHeight: '90%',
    paddingBottom: 16,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: SPACING.sm,
  },
  sheetSubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: SPACING.sm,
  },
  sheetHeaderText: {
    color: '#FFF',
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
  },
  sheetItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  sheetItemText: {
    color: '#FFF',
    fontSize: FONT_SIZES.body,
  },
  sheetItemValue: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body - 1,
  },
  sheetOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: SPACING.sm,
  },
  sheetOptionActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
  },
  sheetOptionText: {
    color: '#FFF',
    fontSize: FONT_SIZES.body,
  },
  sheetOptionDesc: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body - 3,
    marginTop: 2,
  },
  seasonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  seasonButton: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  seasonButtonActive: {
    backgroundColor: COLORS.accentGlowSubtle,
    borderColor: COLORS.borderAccent,
  },
  seasonButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  seasonButtonTextActive: {
    color: COLORS.accent,
  },
  sectionTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md,
    marginTop: SPACING.lg,
  },
  episodesListContainer: {
    paddingRight: SPACING.xl,
    gap: SPACING.sm,
  },
  episodeCard: {
    width: 160,
    height: 100,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: COLORS.bgSecondary,
  },
  episodeCardActive: {
    borderColor: COLORS.accent,
  },
  episodeImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    opacity: 0.6,
  },
  episodeOverlay: {
    ...StyleSheet.absoluteFillObject,
    padding: SPACING.sm,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  episodeCardTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium,
  },
  episodeCardTitleActive: {
    color: COLORS.accent,
    fontWeight: FONT_WEIGHTS.bold,
  },
});
