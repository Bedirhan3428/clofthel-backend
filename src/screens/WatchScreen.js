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
import { UltraClarityView } from '../../modules/ultra-clarity/src';
import { getQualitySettings, saveQualitySettings } from '../utils/qualitySettings';
import { getPlayerPreferences } from '../utils/preferences';
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
  const [settingsTab, setSettingsTab] = useState('main'); // 'main' | 'quality' | 'speed'
  const [qualityLevels, setQualityLevels] = useState([]);
  const [selectedQuality, setSelectedQuality] = useState(-1);
  const [selectedSpeed, setSelectedSpeed] = useState(1.0);
  const [currentQualityLabel, setCurrentQualityLabel] = useState('Otomatik');
  const [currentSpeedLabel, setCurrentSpeedLabel] = useState('1.0x');

  const [isLandscape, setIsLandscape] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [clarityMode, setClarityMode] = useState('off');

  const [episodes, setEpisodes] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [currentAnime, setCurrentAnime] = useState(null);
  const [isFixingAnilist, setIsFixingAnilist] = useState(false);
  const [playerPrefs, setPlayerPrefs] = useState(null);

  useEffect(() => {
    const loadPrefs = async () => {
      try {
        const prefs = await getPlayerPreferences();
        setPlayerPrefs(prefs);
        setClarityMode(prefs.clarityMode);
        setSelectedSpeed(prefs.defaultSpeed);
        setCurrentSpeedLabel(prefs.defaultSpeed === 1.0 ? 'Normal (1.0x)' : `${prefs.defaultSpeed}x`);
      } catch (err) {
        console.warn('[WatchScreen] Failed to load player preferences:', err);
      }
    };
    loadPrefs();
  }, []);

  const slideAnim = useRef(new Animated.Value(400)).current;
  const webViewRef = useRef(null);
  const currentVideoTimeRef = useRef(startAt || 0);
  const wasPausedBySettings = useRef(false);
  const saveIntervalRef = useRef(null);

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
      webViewRef.current?.injectJavaScript(`${command}(${val}); true;`);
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

      if (data.type === 'openSettings') {
        setIsSettingsOpen(true);
        setSettingsTab('main');
      }

      if (data.type === 'qualityLevels') {
        setQualityLevels(data.levels || []);
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
        currentVideoTimeRef.current = data.currentTime;
      }

      if (data.type === 'playerReady' && startAt > 0) {
        // Video hazır olduğunda kaldığı yerden devam ettir
        sendControlCommand('seekTo', startAt);
      }

      if (data.type === 'backgroundClick') {
        setIsSettingsOpen(false);
      }
    } catch (err) {
      console.error('[WebView Message Parse Error]', err);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" hidden={isFullscreen} />
      
      <SafeAreaView style={styles.playerWrapper} edges={isFullscreen ? [] : ['top', 'left', 'right']}>
        {/* Video Player Box */}
        <View style={[styles.videoPlayerBox, isFullscreen && styles.videoPlayerBoxFullscreen]}>
          {playerPrefs ? (
            IS_WEB ? (
              <WebVideoPlayer
                videoUrl={videoUrl}
                onMessage={handleWebViewMessage}
                webViewRef={webViewRef}
                clarityMode={clarityMode}
                startAt={currentVideoTimeRef.current}
                playerPrefs={playerPrefs}
              />
            ) : (
              <VideoPlayerWrapper
                videoUrl={videoUrl}
                onMessage={handleWebViewMessage}
                webViewRef={webViewRef}
                clarityMode={clarityMode}
                startAt={currentVideoTimeRef.current}
                playerPrefs={playerPrefs}
              />
            )
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
              <ActivityIndicator color={COLORS.accent} />
            </View>
          )}
          
          {/* Overlay Back Button on Video */}
          <TouchableOpacity
            style={styles.videoBackButton}
            activeOpacity={0.7}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={24} color="#FFF" />
          </TouchableOpacity>
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
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            {settingsTab === 'main' && (
              <View>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetHeaderText}>Oynatma Ayarları</Text>
                </View>
                <TouchableOpacity style={styles.sheetItem} onPress={() => setSettingsTab('quality')}>
                  <Text style={styles.sheetItemText}>Kalite</Text>
                  <Text style={styles.sheetItemValue}>{currentQualityLabel}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetItem} onPress={() => setSettingsTab('speed')}>
                  <Text style={styles.sheetItemText}>Oynatma Hızı</Text>
                  <Text style={styles.sheetItemValue}>{currentSpeedLabel}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetItem} onPress={() => setSettingsTab('clarity')}>
                  <Text style={styles.sheetItemText}>Görüntü Netliği (AI)</Text>
                  <Text style={[styles.sheetItemValue, clarityMode !== 'off' ? {color: COLORS.accent} : {}]}>
                    {clarityMode === 'off' && 'Kapalı'}
                    {clarityMode === 'performance' && 'Performans'}
                    {clarityMode === 'balanced' && 'Dengeli'}
                    {clarityMode === 'ai-native' && 'AI Native'}
                  </Text>
                </TouchableOpacity>
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
                    setSelectedQuality(-1);
                    setCurrentQualityLabel('Otomatik');
                    sendControlCommand('selectQuality', -1);
                    setIsSettingsOpen(false);
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
                      setSelectedQuality(lvl.index);
                      setCurrentQualityLabel(lvl.height ? `${lvl.height}p` : `Kalite ${lvl.index + 1}`);
                      sendControlCommand('selectQuality', lvl.index);
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

                {[0.5, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0, 5.0].map((speed) => (
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

            {settingsTab === 'clarity' && (
              <View>
                <TouchableOpacity style={styles.sheetSubHeader} onPress={() => setSettingsTab('main')}>
                  <Ionicons name="chevron-back" size={20} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={styles.sheetHeaderText}>Netlik Modu Seçin</Text>
                </TouchableOpacity>

                {[
                  { label: 'Kapalı (Orijinal)', value: 'off' },
                  { label: 'Performans (Düşük Güç)', value: 'performance' },
                  { label: 'Dengeli (Önerilen)', value: 'balanced' },
                  { label: 'AI Native (Maksimum)', value: 'ai-native' }
                ].map((mode) => (
                  <TouchableOpacity
                    key={mode.value}
                    style={[styles.sheetOption, clarityMode === mode.value && styles.sheetOptionActive]}
                    onPress={() => {
                      setClarityMode(mode.value);
                      sendControlCommand('setClarityMode', mode.value);
                      setIsSettingsOpen(false);
                      sendControlCommand('playVideo', null);
                    }}
                  >
                    <Text style={styles.sheetOptionText}>{mode.label}</Text>
                    {clarityMode === mode.value && <Ionicons name="checkmark" size={18} color="#FFF" />}
                  </TouchableOpacity>
                ))}
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
    console.error('[getRefererForUrl] Error:', e);
  }
  return 'https://optraco.top/';
};

const generatePlayerHtml = (videoUrl, isMp4, clarityMode = 'off', startAt = 0, playerPrefs = {}) => {
  const prefs = {
    doubleTapEnabled: true,
    swipeSeekEnabled: true,
    skipInterval: 10,
    buttonSize: 'medium',
    defaultSpeed: 1.0,
    clarityMode: 'off',
    ...playerPrefs
  };
  let btnSizeMultiplier = 1.0;
  if (prefs.buttonSize === 'small') btnSizeMultiplier = 0.8;
  if (prefs.buttonSize === 'large') btnSizeMultiplier = 1.25;

  // Resolve active clarity mode: use passed clarityMode or preference fallback
  const activeClarity = clarityMode || prefs.clarityMode || 'off';

  return `
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <title>Premium Video Player</title>
      <script src="https://cdn.jsdelivr.net/npm/hls.js@1.4.12/dist/hls.min.js"></script>
      <script src="https://unpkg.com/lucide@latest"></script>
      <style>
        :root {
          --accent-color: #FF6B00;
          --btn-size-multiplier: ${btnSizeMultiplier};
        }
        * {
          -webkit-tap-highlight-color: transparent;
          outline: none;
        }
        body, html {
          margin: 0; padding: 0; width: 100%; height: 100%;
          background-color: #000; overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          user-select: none; -webkit-user-select: none;
        }
        .player-container {
          position: relative; width: 100%; height: 100%;
          background: #000; display: flex; justify-content: center; align-items: center;
          overflow: hidden;
        }
        video {
          width: 100%; height: 100%; object-fit: contain; z-index: 1;
          image-rendering: -webkit-optimize-contrast;
          image-rendering: crisp-edges;
          ${activeClarity === 'performance' ? `
            filter: contrast(1.08) saturate(1.15);
          ` : ''}
          ${activeClarity === 'balanced' ? `
            filter: url(#balanced-sharpen) contrast(1.12) saturate(1.22);
          ` : ''}
          ${activeClarity === 'ai-native' ? `
            filter: url(#ultra-sharpen) contrast(1.20) saturate(1.35) brightness(1.01);
          ` : ''}
          ${activeClarity === 'off' ? `
            filter: none;
          ` : ''}
        }
        .click-backdrop {
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          z-index: 5; background: transparent; pointer-events: auto;
        }
        .loading-overlay {
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          background: #000; z-index: 50; display: flex; flex-direction: column;
          justify-content: center; align-items: center; pointer-events: none;
          transition: opacity 0.3s;
        }
        .spinner {
          width: 44px; height: 44px; border: 3px solid rgba(255,255,255,0.1);
          border-top-color: var(--accent-color); border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 12px;
        }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .loading-text {
          color: #fff; font-size: 14px; font-weight: 500; opacity: 0.8;
          font-family: system-ui, -apple-system, sans-serif; letter-spacing: 0.5px;
        }
        .controls-overlay {
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          z-index: 10; opacity: 1; visibility: visible;
          transition: opacity 0.3s cubic-bezier(0.25, 1, 0.5, 1), visibility 0.3s;
          pointer-events: auto;
          background: rgba(0, 0, 0, 0.45);
        }
        .controls-overlay.hidden {
          opacity: 0; visibility: hidden; pointer-events: none !important;
        }
        .controls-overlay.hidden * {
          pointer-events: none !important;
        }
        .top-controls {
          position: absolute; top: 16px; right: 16px;
          display: flex; align-items: center; gap: 12px; z-index: 20;
        }
        .control-btn {
          background: transparent; border: none; color: #fff; cursor: pointer;
          padding: 8px; border-radius: 50%; display: flex; align-items: center;
          justify-content: center; transition: background 0.2s, opacity 0.2s, transform 0.1s;
          outline: none;
        }
        .control-btn svg, .control-btn .lucide {
          width: 24px; height: 24px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
          transition: transform 0.3s ease;
        }
        .control-btn:hover {
          background: rgba(255, 255, 255, 0.15);
        }
        .control-btn:active {
          transform: scale(0.95);
        }
        #btn-settings:active svg, #btn-settings:active .lucide {
          transform: rotate(30deg);
        }
        .center-controls {
          position: absolute; top: 50%; left: 50%;
          transform: translate(-50%, -50%); display: flex; align-items: center;
          gap: 36px; z-index: 15;
        }
        .center-btn {
          opacity: 0.6; transition: opacity 0.2s, background 0.2s, transform 0.2s;
          background: rgba(0, 0, 0, 0.5); border: 1px solid rgba(255, 255, 255, 0.15);
          width: calc(58px * var(--btn-size-multiplier)); height: calc(58px * var(--btn-size-multiplier)); border-radius: 50%;
          position: relative; display: flex; align-items: center; justify-content: center;
        }
        .center-btn:hover {
          opacity: 1.0; background: rgba(0, 0, 0, 0.85);
        }
        .center-btn svg, .center-btn .lucide {
          width: calc(28px * var(--btn-size-multiplier)); height: calc(28px * var(--btn-size-multiplier));
        }
        .center-btn .btn-label {
          position: absolute;
          font-size: calc(8px * var(--btn-size-multiplier));
          font-weight: 800;
          color: #fff;
          top: 53%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-family: system-ui, -apple-system, sans-serif;
          letter-spacing: -0.5px;
        }
        .play-btn {
          width: calc(68px * var(--btn-size-multiplier)); height: calc(68px * var(--btn-size-multiplier));
        }
        .play-btn svg, .play-btn .lucide {
          width: calc(34px * var(--btn-size-multiplier)); height: calc(34px * var(--btn-size-multiplier));
        }
        .bottom-controls {
          position: absolute;
          bottom: 16px;
          left: 0; width: 100%;
          display: flex; flex-direction: column; z-index: 15;
          padding: 0 16px;
          box-sizing: border-box;
        }
        .time-display {
          color: #fff; font-size: 13px; font-weight: 500;
          margin-bottom: 8px; pointer-events: none;
          text-shadow: 0 1px 3px rgba(0,0,0,0.8); letter-spacing: 0.5px;
        }
        .progress-bar-container {
          position: relative; width: 100%; height: 6px;
          background: rgba(255, 255, 255, 0.2); cursor: pointer;
          transition: height 0.15s ease, background 0.15s; pointer-events: auto;
          border-radius: 4px;
        }
        .progress-bar-container:hover {
          height: 8px;
          background: rgba(255, 255, 255, 0.25);
        }
        .progress-fill {
          position: absolute; top: 0; left: 0; height: 100%; width: 0%;
          background: var(--accent-color); z-index: 2;
          border-radius: 4px;
          box-shadow: 0 0 8px var(--accent-color);
        }
        .buffer-fill {
          position: absolute; top: 0; left: 0; height: 100%; width: 0%;
          background: rgba(255, 255, 255, 0.35); z-index: 1;
          border-radius: 4px;
        }
        .progress-knob {
          position: absolute;
          top: 50%;
          left: 0%;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid var(--accent-color);
          box-shadow: 0 2px 6px rgba(0,0,0,0.4);
          z-index: 5;
          transform: translate(-50%, -50%) scale(0);
          transition: transform 0.15s ease;
        }
        .progress-bar-container:hover .progress-knob,
        .progress-bar-container.seeking .progress-knob {
          transform: translate(-50%, -50%) scale(1);
        }
        .progress-tooltip {
          position: absolute;
          bottom: 20px;
          background: rgba(0, 0, 0, 0.85);
          color: #fff;
          padding: 6px 10px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          font-family: system-ui, -apple-system, sans-serif;
          pointer-events: none;
          display: none;
          z-index: 100;
          transform: translateX(-50%);
          border: 1px solid rgba(255, 255, 255, 0.15);
          box-shadow: 0 4px 10px rgba(0,0,0,0.5);
          white-space: nowrap;
        }

        /* Double Tap & Swipe Seek HUD Styles */
        .double-tap-overlay {
          position: absolute; top: 0; bottom: 0; width: 35%;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          z-index: 8; opacity: 0; pointer-events: none;
          background: radial-gradient(circle, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0) 70%);
          transition: opacity 0.2s ease;
        }
        .double-tap-overlay.left { left: 0; border-radius: 0 50% 50% 0; }
        .double-tap-overlay.right { right: 0; border-radius: 50% 0 0 50%; }
        .double-tap-overlay.active { opacity: 1; }
        
        .ripple-container {
          position: absolute; width: 100px; height: 100px; display: flex; align-items: center; justify-content: center;
        }
        .ripple-circle {
          position: absolute; width: 100%; height: 100%; border-radius: 50%;
          background: rgba(255, 255, 255, 0.2); transform: scale(0);
        }
        .double-tap-overlay.active .ripple-circle:nth-child(1) {
          animation: rippleEffect 0.6s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
        }
        .double-tap-overlay.active .ripple-circle:nth-child(2) {
          animation: rippleEffect 0.6s cubic-bezier(0.1, 0.8, 0.3, 1) 0.15s forwards;
        }
        .double-tap-overlay.active .ripple-circle:nth-child(3) {
          animation: rippleEffect 0.6s cubic-bezier(0.1, 0.8, 0.3, 1) 0.3s forwards;
        }
        @keyframes rippleEffect {
          0% { transform: scale(0.2); opacity: 1; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        .double-tap-text {
          display: flex; flex-direction: row; align-items: center; gap: 4px;
          color: #fff; font-size: 14px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.8);
          z-index: 9;
        }
        .double-tap-text svg, .double-tap-text .lucide {
          width: 20px; height: 20px;
        }

        .swipe-hud {
          position: absolute; top: 24px; left: 50%;
          transform: translateX(-50%) scale(0.9);
          background: rgba(0, 0, 0, 0.85); border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px; padding: 8px 16px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          z-index: 40; pointer-events: none; opacity: 0;
          transition: opacity 0.15s, transform 0.15s;
          box-shadow: 0 4px 15px rgba(0,0,0,0.6);
        }
        .swipe-hud.active {
          opacity: 1; transform: translateX(-50%) scale(1);
        }
        .swipe-hud-time {
          color: #fff; font-size: 16px; font-weight: 700;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .swipe-hud-change {
          color: var(--accent-color); font-size: 12px; font-weight: 600; margin-top: 2px;
          font-family: system-ui, -apple-system, sans-serif;
        }
      </style>
    </head>
    <body>
      <div class="player-container" id="player-container">
        <!-- SVG Filter for 4K Ultra Clarity Sharpening -->
        <svg xmlns="http://www.w3.org/2000/svg" style="display:none; width:0; height:0;">
          <defs>
            <filter id="ultra-sharpen">
              <feConvolveMatrix order="3" kernelMatrix="-0.2 -0.8 -0.2 -0.8 5.0 -0.8 -0.2 -0.8 -0.2" preserveAlpha="true"/>
            </filter>
            <filter id="balanced-sharpen">
              <feConvolveMatrix order="3" kernelMatrix="-0.1 -0.4 -0.1 -0.4 3.0 -0.4 -0.1 -0.4 -0.1" preserveAlpha="true"/>
            </filter>
          </defs>
        </svg>
        <video id="player" playsinline></video>
        <div class="loading-overlay" id="loading-overlay">
          <div class="spinner"></div>
          <div class="loading-text">Yükleniyor...</div>
        </div>
        <div class="click-backdrop" id="click-backdrop"></div>
        <div class="controls-overlay" id="controls-overlay">
          <div class="top-controls">
            <button class="control-btn" id="btn-settings" aria-label="Ayarlar">
              <i data-lucide="settings"></i>
            </button>
            <button class="control-btn" id="btn-fullscreen" aria-label="Tam Ekran">
              <i data-lucide="maximize" id="fs-icon-maximize"></i>
              <i data-lucide="minimize" id="fs-icon-minimize" style="display: none;"></i>
            </button>
          </div>
          
          <div class="center-controls">
            <button class="control-btn center-btn" id="btn-rewind" aria-label="${prefs.skipInterval} Saniye Geri">
              <i data-lucide="rotate-ccw"></i>
              <span class="btn-label">${prefs.skipInterval}</span>
            </button>
            <button class="control-btn center-btn play-btn" id="btn-play-pause" aria-label="Oynat/Duraklat">
              <i data-lucide="play" id="play-icon"></i>
              <i data-lucide="pause" id="pause-icon" style="display: none;"></i>
            </button>
            <button class="control-btn center-btn" id="btn-forward" aria-label="${prefs.skipInterval} Saniye İleri">
              <i data-lucide="rotate-cw"></i>
              <span class="btn-label">${prefs.skipInterval}</span>
            </button>
          </div>
          
          <div class="bottom-controls">
            <div class="time-display" id="time-display">00:00 / 00:00</div>
            <div class="progress-bar-container" id="progress-bar">
              <div class="buffer-fill" id="buffer-fill"></div>
              <div class="progress-fill" id="progress-fill"></div>
              <div class="progress-knob" id="progress-knob"></div>
              <div class="progress-tooltip" id="progress-tooltip">00:00</div>
            </div>
          </div>
        </div>

        <!-- Double Tap Seek Overlays -->
        <div class="double-tap-overlay left" id="double-tap-left">
          <div class="ripple-container">
            <div class="ripple-circle"></div>
            <div class="ripple-circle"></div>
            <div class="ripple-circle"></div>
          </div>
          <div class="double-tap-text">
            <i data-lucide="chevrons-left"></i>
            <span>${prefs.skipInterval}s</span>
          </div>
        </div>
        <div class="double-tap-overlay right" id="double-tap-right">
          <div class="ripple-container">
            <div class="ripple-circle"></div>
            <div class="ripple-circle"></div>
            <div class="ripple-circle"></div>
          </div>
          <div class="double-tap-text">
            <span>${prefs.skipInterval}s</span>
            <i data-lucide="chevrons-right"></i>
          </div>
        </div>

        <!-- Swipe Seek HUD Overlay -->
        <div class="swipe-hud" id="swipe-hud">
          <div class="swipe-hud-time" id="swipe-hud-time">00:00</div>
          <div class="swipe-hud-change" id="swipe-hud-change">[+0:00]</div>
        </div>
      </div>
      
      <script>
        lucide.createIcons();

        const video = document.getElementById('player');
        const videoUrl = '${videoUrl}';
        const isMp4 = ${isMp4};
        
        let hlsInstance = null;
        
        function sendToParent(obj) {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify(obj));
          } else {
            window.parent.postMessage(JSON.stringify(obj), '*');
          }
        }
        
        const loadingOverlay = document.getElementById('loading-overlay');
        let hasStartedPlaying = false;
        
        video.addEventListener('waiting', () => {
          if (!hasStartedPlaying) {
            loadingOverlay.style.opacity = '1';
          }
        });
        
        video.addEventListener('playing', () => {
          loadingOverlay.style.opacity = '0';
          hasStartedPlaying = true;
        });
        
        video.addEventListener('canplay', () => {
          loadingOverlay.style.opacity = '0';
        });
        
        function initPlayer() {
          const defaultSpeed = ${prefs.defaultSpeed};
          if (isMp4) {
            video.src = videoUrl;
            video.addEventListener('loadedmetadata', function() {
              if (${startAt} > 0) video.currentTime = ${startAt};
              video.playbackRate = defaultSpeed;
              video.play().catch(e => console.log('Autoplay blocked:', e));
            });
            sendToParent({ type: 'qualityLevels', levels: [] });
            sendToParent({ type: 'qualitySelected', index: -1, label: 'Otomatik' });
            sendToParent({ type: 'speedSelected', speed: defaultSpeed, label: defaultSpeed === 1.0 ? 'Normal (1.0x)' : defaultSpeed + 'x' });
          } else if (Hls.isSupported()) {
            const hlsOptions = ${isUltraClarityEnabled} ? {
              maxMaxBufferLength: 180,
              maxBufferLength: 60,
              maxBufferSize: 200 * 1024 * 1024,
              capLevelToPlayerSize: false,
              lowLatencyMode: false,
              maxStarvationDelay: 4,
              maxLoadingDelay: 4
            } : {
              maxMaxBufferLength: 30,
              capLevelToPlayerSize: true,
              lowLatencyMode: true
            };
            const hls = new Hls(hlsOptions);
            hlsInstance = hls;
            hls.loadSource(videoUrl);
            hls.attachMedia(video);
            
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
              populateQualityLevels(hls.levels);
              if (${isUltraClarityEnabled}) {
                selectQuality(hls.levels.length - 1);
              } else {
                sendToParent({ type: 'qualitySelected', index: -1, label: 'Otomatik' });
              }
              video.playbackRate = defaultSpeed;
              sendToParent({ type: 'speedSelected', speed: defaultSpeed, label: defaultSpeed === 1.0 ? 'Normal (1.0x)' : defaultSpeed + 'x' });
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
            video.addEventListener('loadedmetadata', function() {
              if (${startAt} > 0) video.currentTime = ${startAt};
              video.playbackRate = defaultSpeed;
              video.play().catch(e => console.log('Autoplay blocked:', e));
            });
            sendToParent({ type: 'qualityLevels', levels: [] });
            sendToParent({ type: 'qualitySelected', index: -1, label: 'Otomatik' });
            sendToParent({ type: 'speedSelected', speed: defaultSpeed, label: defaultSpeed === 1.0 ? 'Normal (1.0x)' : defaultSpeed + 'x' });
          }
        }
        
        function populateQualityLevels(levels) {
          const formattedLevels = levels.map((lvl, idx) => ({
            index: idx,
            height: lvl.height
          }));
          sendToParent({ type: 'qualityLevels', levels: formattedLevels });
        }
        
        function selectQuality(index) {
          if (hlsInstance) {
            hlsInstance.nextLevel = index;
            const label = index === -1 ? 'Otomatik' : (hlsInstance.levels[index].height ? hlsInstance.levels[index].height + 'p' : 'Seviye ' + (index + 1));
            sendToParent({ type: 'qualitySelected', index: index, label: label });
          }
        }
        
        function setPlaySpeed(speed) {
          video.playbackRate = speed;
          sendToParent({ type: 'speedSelected', speed: speed, label: speed === 1.0 ? 'Normal (1.0x)' : speed + 'x' });
        }
        
        const btnPlayPause = document.getElementById('btn-play-pause');
        const playIcon = document.getElementById('play-icon');
        const pauseIcon = document.getElementById('pause-icon');
        
        btnPlayPause.addEventListener('click', (e) => {
          e.stopPropagation();
          togglePlay();
        });
        
        function togglePlay() {
          if (video.paused) {
            video.play().catch(e => console.log('Playback error:', e));
          } else {
            video.pause();
          }
          resetControlsTimeout();
        }
        
        video.addEventListener('play', () => {
          playIcon.style.display = 'none';
          pauseIcon.style.display = 'block';
          resetControlsTimeout();
        });
        
        video.addEventListener('pause', () => {
          playIcon.style.display = 'block';
          pauseIcon.style.display = 'none';
          showControls();
        });
        
        const btnRewind = document.getElementById('btn-rewind');
        const btnForward = document.getElementById('btn-forward');
        const skipInterval = ${prefs.skipInterval};
        
        btnRewind.addEventListener('click', (e) => {
          e.stopPropagation();
          video.currentTime = Math.max(0, video.currentTime - skipInterval);
          resetControlsTimeout();
        });
        
        btnForward.addEventListener('click', (e) => {
          e.stopPropagation();
          video.currentTime = Math.min(video.duration || 0, video.currentTime + skipInterval);
          resetControlsTimeout();
        });
        
        const btnFullscreen = document.getElementById('btn-fullscreen');
        const container = document.getElementById('player-container');
        
        btnFullscreen.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleFullscreen();
        });
        
        let _isFullscreenLocal = false;
        function toggleFullscreen() {
          if (window.ReactNativeWebView) {
            _isFullscreenLocal = !_isFullscreenLocal;
            updateFullscreenIcons(_isFullscreenLocal);
            sendToParent({ type: 'fullscreen', isFullscreen: _isFullscreenLocal });
          } else {
            if (!document.fullscreenElement &&
                !document.mozFullScreenElement &&
                !document.webkitFullscreenElement &&
                !document.msFullscreenElement) {
              if (container.requestFullscreen) {
                container.requestFullscreen();
              } else if (container.msRequestFullscreen) {
                container.msRequestFullscreen();
              } else if (container.mozRequestFullScreen) {
                container.mozRequestFullScreen();
              } else if (container.webkitRequestFullscreen) {
                container.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
              }
            } else {
              if (document.exitFullscreen) {
                document.exitFullscreen();
              } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
              } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
              } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
              }
            }
          }
          resetControlsTimeout();
        }

        function updateFullscreenIcons(isFS) {
          const maxIcon = document.getElementById('fs-icon-maximize');
          const minIcon = document.getElementById('fs-icon-minimize');
          if (maxIcon && minIcon) {
            if (isFS) {
              maxIcon.style.display = 'none';
              minIcon.style.display = 'block';
            } else {
              maxIcon.style.display = 'block';
              minIcon.style.display = 'none';
            }
          }
        }

        function onFullscreenChange() {
          const isFS = document.fullscreenElement ||
                       document.webkitFullscreenElement ||
                       document.mozFullScreenElement ||
                       document.msFullscreenElement;
          updateFullscreenIcons(isFS);
          sendToParent({ type: 'fullscreen', isFullscreen: !!isFS });
        }

        document.addEventListener('fullscreenchange', onFullscreenChange);
        document.addEventListener('webkitfullscreenchange', onFullscreenChange);
        document.addEventListener('mozfullscreenchange', onFullscreenChange);
        document.addEventListener('MSFullscreenChange', onFullscreenChange);
        
        const timeDisplay = document.getElementById('time-display');
        const progressFill = document.getElementById('progress-fill');
        const bufferFill = document.getElementById('buffer-fill');
        const progressBar = document.getElementById('progress-bar');
        const progressKnob = document.getElementById('progress-knob');
        
        function formatTime(seconds) {
          if (isNaN(seconds) || seconds === Infinity) return '00:00';
          const s = Math.floor(seconds % 60);
          const m = Math.floor((seconds / 60) % 60);
          const h = Math.floor(seconds / 3600);
          const pad = (n) => n.toString().padStart(2, '0');
          if (h > 0) return pad(h) + ':' + pad(m) + ':' + pad(s);
          return pad(m) + ':' + pad(s);
        }
        
        let lastSentTime = 0;
        video.addEventListener('timeupdate', () => {
          const current = video.currentTime;
          const duration = video.duration || 0;
          timeDisplay.textContent = formatTime(current) + ' / ' + formatTime(duration);
          
          if (duration > 0) {
            const pct = (current / duration) * 100;
            progressFill.style.width = pct + '%';
            if (!isSeeking) {
              progressKnob.style.left = pct + '%';
            }
          }

          if (Math.abs(current - lastSentTime) > 1) {
            sendToParent({ type: 'timeupdate', currentTime: current });
            lastSentTime = current;
          }
        });
        
        video.addEventListener('progress', () => {
          const duration = video.duration || 0;
          if (duration > 0 && video.buffered.length > 0) {
            const bufferedEnd = video.buffered.end(video.buffered.length - 1);
            bufferFill.style.width = (bufferedEnd / duration) * 100 + '%';
          }
        });
        
        video.addEventListener('loadedmetadata', () => {
          timeDisplay.textContent = '00:00 / ' + formatTime(video.duration || 0);
        });
        
        let isSeeking = false;
        const progressTooltip = document.getElementById('progress-tooltip');
        
        function seekTo(event) {
          const rect = progressBar.getBoundingClientRect();
          let pct = (event.clientX - rect.left) / rect.width;
          pct = Math.max(0, Math.min(1, pct));
          const duration = video.duration || 0;
          const targetTime = pct * duration;
          video.currentTime = targetTime;
          progressFill.style.width = (pct * 100) + '%';
          progressKnob.style.left = (pct * 100) + '%';
          resetControlsTimeout();
          
          updateTooltip(event.clientX, rect.left, rect.width, targetTime);
        }

        function updateTooltip(clientX, rectLeft, rectWidth, time) {
          progressTooltip.style.display = 'block';
          progressTooltip.textContent = formatTime(time);
          
          const relativeX = clientX - rectLeft;
          const posX = Math.max(0, Math.min(rectWidth, relativeX));
          progressTooltip.style.left = posX + 'px';
        }

        function hideTooltip() {
          progressTooltip.style.display = 'none';
        }
        
        progressBar.addEventListener('click', (e) => {
          e.stopPropagation();
          seekTo(e);
          setTimeout(hideTooltip, 1000);
        });
        
        progressBar.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          isSeeking = true;
          progressBar.classList.add('seeking');
          seekTo(e);
        });
        
        progressBar.addEventListener('mousemove', (e) => {
          if (!isSeeking) {
            const rect = progressBar.getBoundingClientRect();
            let pct = (e.clientX - rect.left) / rect.width;
            pct = Math.max(0, Math.min(1, pct));
            const duration = video.duration || 0;
            updateTooltip(e.clientX, rect.left, rect.width, pct * duration);
          }
        });
        
        progressBar.addEventListener('mouseleave', () => {
          if (!isSeeking) hideTooltip();
        });
 
        document.addEventListener('mousemove', (e) => {
          if (isSeeking) seekTo(e);
        });
        
        document.addEventListener('mouseup', () => {
          if (isSeeking) {
            isSeeking = false;
            progressBar.classList.remove('seeking');
            hideTooltip();
          }
        });
        
        progressBar.addEventListener('touchstart', (e) => {
          e.stopPropagation();
          isSeeking = true;
          progressBar.classList.add('seeking');
          seekTo(e.touches[0]);
        }, { passive: true });
        
        document.addEventListener('touchmove', (e) => {
          if (isSeeking) seekTo(e.touches[0]);
        }, { passive: false });
        
        document.addEventListener('touchend', () => {
          if (isSeeking) {
            isSeeking = false;
            progressBar.classList.remove('seeking');
            hideTooltip();
          }
        });
        
        const btnSettings = document.getElementById('btn-settings');
        btnSettings.addEventListener('click', (e) => {
          e.stopPropagation();
          video.pause();
          sendToParent({ type: 'openSettings' });
          resetControlsTimeout();
        });
        
        const controlsOverlay = document.getElementById('controls-overlay');
        const clickBackdrop = document.getElementById('click-backdrop');
        let controlsTimer = null;
        
        function showControls() {
          controlsOverlay.classList.remove('hidden');
          resetControlsTimeout();
        }
        
        function hideControls() {
          if (!video.paused) {
            controlsOverlay.classList.add('hidden');
          }
        }
        
        function resetControlsTimeout() {
          clearTimeout(controlsTimer);
          if (!video.paused) {
            controlsTimer = setTimeout(hideControls, 3000);
          }
        }
        
        let dtTimerLeft = null;
        let dtTimerRight = null;
        function triggerDoubleTapFeedback(side) {
          const overlay = document.getElementById('double-tap-' + side);
          if (side === 'left') {
            clearTimeout(dtTimerLeft);
            overlay.classList.remove('active');
            void overlay.offsetWidth; // Trigger reflow
            overlay.classList.add('active');
            dtTimerLeft = setTimeout(() => overlay.classList.remove('active'), 650);
          } else {
            clearTimeout(dtTimerRight);
            overlay.classList.remove('active');
            void overlay.offsetWidth; // Trigger reflow
            overlay.classList.add('active');
            dtTimerRight = setTimeout(() => overlay.classList.remove('active'), 650);
          }
        }

        let lastTap = 0;
        let tapTimeout = null;
        function handleBackgroundClick(e) {
          const currentTime = new Date().getTime();
          const tapLength = currentTime - lastTap;
          
          const isInteractive = e.target.closest('button, .progress-bar-container');
          if (isInteractive) return;

          if (${prefs.doubleTapEnabled}) {
            if (tapLength < 300 && tapLength > 0) {
              clearTimeout(tapTimeout);
              e.preventDefault();
              
              const rect = document.getElementById('player-container').getBoundingClientRect();
              const touchX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0) || (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : 0);
              const relativeX = touchX - rect.left;
              
              if (relativeX < rect.width / 2) {
                video.currentTime = Math.max(0, video.currentTime - skipInterval);
                triggerDoubleTapFeedback('left');
              } else {
                video.currentTime = Math.min(video.duration || 0, video.currentTime + skipInterval);
                triggerDoubleTapFeedback('right');
              }
              
              lastTap = 0;
              return;
            }
            
            lastTap = currentTime;
            
            tapTimeout = setTimeout(() => {
              sendToParent({ type: 'backgroundClick' });
              if (controlsOverlay.classList.contains('hidden')) {
                showControls();
              } else {
                hideControls();
              }
            }, 300);
          } else {
            if (tapLength < 300 && tapLength > 0) {
              e.preventDefault();
              toggleFullscreen();
              lastTap = currentTime;
              return;
            }
            lastTap = currentTime;
            sendToParent({ type: 'backgroundClick' });
            if (controlsOverlay.classList.contains('hidden')) {
              showControls();
            } else {
              hideControls();
            }
          }
        }
        
        clickBackdrop.addEventListener('click', handleBackgroundClick);
        controlsOverlay.addEventListener('click', handleBackgroundClick);
        
        controlsOverlay.addEventListener('mousemove', resetControlsTimeout);
        controlsOverlay.addEventListener('touchstart', resetControlsTimeout, { passive: true });

        // Swipe to Seek functionality
        const swipeHud = document.getElementById('swipe-hud');
        const swipeHudTime = document.getElementById('swipe-hud-time');
        const swipeHudChange = document.getElementById('swipe-hud-change');
        
        function showSwipeHud(targetTime, delta) {
          swipeHudTime.textContent = formatTime(targetTime);
          const sign = delta >= 0 ? '+' : '';
          swipeHudChange.textContent = '[' + sign + formatTime(delta) + ']';
          swipeHud.classList.add('active');
        }
        
        function hideSwipeHud() {
          swipeHud.classList.remove('active');
        }

        let swipeStartX = 0;
        let swipeStartY = 0;
        let isSwiping = false;
        let swipeInitialTime = 0;
        let swipeCurrentTargetTime = 0;
        
        function handleSwipeStart(e) {
          if (!${prefs.swipeSeekEnabled}) return;
          const isInteractive = e.target.closest('button, .progress-bar-container');
          if (isInteractive) return;
          const touch = e.touches[0];
          swipeStartX = touch.clientX;
          swipeStartY = touch.clientY;
          swipeInitialTime = video.currentTime;
          isSwiping = false;
        }

        function handleSwipeMove(e) {
          if (!${prefs.swipeSeekEnabled} || swipeStartX === 0) return;
          const touch = e.touches[0];
          const deltaX = touch.clientX - swipeStartX;
          const deltaY = touch.clientY - swipeStartY;
          
          if (!isSwiping && Math.abs(deltaX) > 15 && Math.abs(deltaX) > Math.abs(deltaY)) {
            isSwiping = true;
            video.pause();
            showControls();
            clearTimeout(controlsTimer);
          }
          
          if (isSwiping) {
            e.preventDefault();
            const rect = clickBackdrop.getBoundingClientRect();
            const swipeSensitivity = 180; 
            // Invert deltaX horizontal scrubbing direction by multiplying by -1
            const deltaSeconds = -(deltaX / rect.width) * swipeSensitivity;
            swipeCurrentTargetTime = Math.max(0, Math.min(video.duration || 0, swipeInitialTime + deltaSeconds));
            showSwipeHud(swipeCurrentTargetTime, deltaSeconds);
          }
        }

        function handleSwipeEnd(e) {
          if (!${prefs.swipeSeekEnabled} || !isSwiping) {
            swipeStartX = 0;
            return;
          }
          video.currentTime = swipeCurrentTargetTime;
          hideSwipeHud();
          video.play().catch(err => console.log('Swipe play resume fail:', err));
          isSwiping = false;
          swipeStartX = 0;
          resetControlsTimeout();
        }

        clickBackdrop.addEventListener('touchstart', handleSwipeStart, { passive: true });
        clickBackdrop.addEventListener('touchmove', handleSwipeMove, { passive: false });
        clickBackdrop.addEventListener('touchend', handleSwipeEnd, { passive: true });

        controlsOverlay.addEventListener('touchstart', handleSwipeStart, { passive: true });
        controlsOverlay.addEventListener('touchmove', handleSwipeMove, { passive: false });
        controlsOverlay.addEventListener('touchend', handleSwipeEnd, { passive: true });
        
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
              } else if (data.type === 'setClarityMode') {
                if (window.setClarityMode) window.setClarityMode(data.value);
              } else if (data.type === 'playVideo') {
                if (window.playVideo) window.playVideo();
              }
            }
          } catch (e) {
            console.error('Error handling parent message in iframe:', e);
          }
        });
        
        window.playVideo = function() {
          const vid = document.getElementById('player');
          if (vid && vid.paused) vid.play();
        };

        window.setClarityMode = function(mode) {
          const vid = document.getElementById('player');
          if (!vid) return;
          
          // Clear current filters
          vid.style.filter = 'none';
          vid.style.imageRendering = 'auto';
          
          if (mode === 'performance') {
            vid.style.filter = 'contrast(1.08) saturate(1.15)';
            vid.style.imageRendering = '-webkit-optimize-contrast';
          } else if (mode === 'balanced') {
            vid.style.filter = 'url(#balanced-sharpen) contrast(1.12) saturate(1.22)';
            vid.style.imageRendering = '-webkit-optimize-contrast';
            if (hlsInstance) {
              hlsInstance.config.maxMaxBufferLength = 90;
              hlsInstance.config.maxBufferLength = 45;
              hlsInstance.config.maxBufferSize = 120 * 1024 * 1024;
              hlsInstance.config.capLevelToPlayerSize = false;
              hlsInstance.config.lowLatencyMode = false;
            }
          } else if (mode === 'ai-native') {
            vid.style.filter = 'url(#ultra-sharpen) contrast(1.20) saturate(1.35) brightness(1.01)';
            vid.style.imageRendering = '-webkit-optimize-contrast';
            if (hlsInstance) {
              hlsInstance.config.maxMaxBufferLength = 180;
              hlsInstance.config.maxBufferLength = 60;
              hlsInstance.config.maxBufferSize = 200 * 1024 * 1024;
              hlsInstance.config.capLevelToPlayerSize = false;
              hlsInstance.config.lowLatencyMode = false;
              selectQuality(hlsInstance.levels.length - 1);
            }
          } else {
            // off
            vid.style.filter = 'none';
            vid.style.imageRendering = 'auto';
            if (hlsInstance) {
              hlsInstance.config.maxMaxBufferLength = 30;
              hlsInstance.config.maxBufferLength = 30;
              hlsInstance.config.maxBufferSize = 60 * 1024 * 1024;
              hlsInstance.config.capLevelToPlayerSize = true;
              hlsInstance.config.lowLatencyMode = true;
              selectQuality(-1);
            }
          }
        };

        initPlayer();
        showControls();
      <\/script>
    </body>
    </html>
  `;
};

function VideoPlayerWrapper({ videoUrl, onMessage, webViewRef, clarityMode, startAt, playerPrefs }) {
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

  const [initialHtml] = useState(() => generatePlayerHtml(videoSourceUrl, isMp4, clarityMode, startAt, playerPrefs));

  useEffect(() => {
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`if(window.setClarityMode) { window.setClarityMode('${clarityMode}'); } true;`);
    }
  }, [clarityMode]);

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

function WebVideoPlayer({ videoUrl, onMessage, webViewRef, clarityMode, startAt, playerPrefs }) {
  const isSibnet = videoUrl && (videoUrl.includes('sibnet.ru') || videoUrl.toLowerCase().includes('.mp4'));
  let videoSourceUrl = videoUrl;
  let isMp4 = false;

  if (isSibnet) {
    isMp4 = true;
  } else if (videoUrl && videoUrl.toLowerCase().includes('.mp4')) {
    isMp4 = true;
  }

  const [initialHtml] = useState(() => generatePlayerHtml(videoSourceUrl, isMp4, clarityMode, startAt, playerPrefs));

  useEffect(() => {
    if (webViewRef.current && webViewRef.current.contentWindow) {
      webViewRef.current.contentWindow.postMessage(JSON.stringify({ type: 'setClarityMode', value: clarityMode }), '*');
    }
  }, [clarityMode]);

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
