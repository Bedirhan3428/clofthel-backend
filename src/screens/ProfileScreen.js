import React, { useContext, useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Platform,
  Alert,
  Modal,
  TextInput,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthContext } from '../context/AuthContext';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { getProfileData, createCustomList, deleteCustomList, updateAvatar, toggleFavoritesNotificationsApi, toggleListNotificationsApi, checkAnimeExistsApi, clientAddAnimeApi, clientIngestBatchApi } from '../services/api';
import { AVATAR_LIST } from '../constants/avatars';
import { APP_VERSION } from '../constants/config';
import { animePageScraperInjectedJs } from '../modules/AnimePageScraperScript';
import { resolveTargetTranimeizleUrl } from '../utils/clientAnimeHealer';
import { useAnimeDirectory } from '../context/AnimeDirectoryContext';
import * as Clipboard from 'expo-clipboard';

let WebView = null;
if (Platform.OS !== 'web') {
  try {
    WebView = require('react-native-webview').WebView;
  } catch (e) {
    console.warn('[ProfileScreen] react-native-webview not available:', e.message);
  }
}

export default function ProfileScreen({ navigation }) {
  const { user, logout, updateUserAvatar } = useContext(AuthContext);
  const { directory, forceRefresh } = useAnimeDirectory();
  const [profileData, setProfileData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [isRefreshingCache, setIsRefreshingCache] = useState(false);

  const [isModalVisible, setModalVisible] = React.useState(false);
  const [newListName, setNewListName] = React.useState('');

  const [isAvatarModalVisible, setAvatarModalVisible] = React.useState(false);

  // Client-Side Add Anime Modal State
  const [isAddAnimeModalVisible, setAddAnimeModalVisible] = useState(false);
  const [animeInputUrl, setAnimeInputUrl] = useState('');
  const [animeTitleInput, setAnimeTitleInput] = useState('');
  const [totalEpisodesInput, setTotalEpisodesInput] = useState('');
  const [isAddingAnime, setIsAddingAnime] = useState(false);
  const [scrapeStatusText, setScrapeStatusText] = useState('');
  const [lastErrorMessage, setLastErrorMessage] = useState(null);
  const [clientScrapeUrl, setClientScrapeUrl] = useState(null);
  const [isFullScreenBrowser, setIsFullScreenBrowser] = useState(false);
  const clientWebViewRef = useRef(null);

  // Secret Developer Scraper Browser State (10-tap gesture)
  const [devTapCount, setDevTapCount] = useState(0);
  const devTapTimerRef = useRef(null);
  const [isScraperBrowserVisible, setIsScraperBrowserVisible] = useState(false);
  const [scraperBrowserUrl, setScraperBrowserUrl] = useState('https://www.tranimeizle.io/listeler/yenibolum/sayfa-1');
  const [scraperUrlInput, setScraperUrlInput] = useState('https://www.tranimeizle.io/listeler/yenibolum/sayfa-1');
  const [isIngestingBatch, setIsIngestingBatch] = useState(false);
  const [batchStatusText, setBatchStatusText] = useState('');
  const scraperBrowserWebviewRef = useRef(null);

  // Helper to extract a clean title from a URL or raw scraped title
  const extractCleanTitleFromUrl = (urlOrSlug, rawTitle = '') => {
    const isGeneric = !rawTitle || /^(tranimeizle|anime\s*izle|bağlantı\s*doğrulaması|cloudflare|ana\s*sayfa|yükleniyor|error|404)/i.test(String(rawTitle).trim());
    let title = (!isGeneric ? rawTitle : '')
      .replace(/\s*\d+\.\s*Bölüm\s*İzle.*$/i, '')
      .replace(/\s*Türkçe\s*(?:Altyazılı|Dublaj)?\s*İzle.*$/i, '')
      .replace(/\s*İzle.*$/i, '')
      .trim();

    if ((!title || isGeneric) && urlOrSlug) {
      try {
        let slug = decodeURIComponent(String(urlOrSlug))
          .split(/[?#]/)[0]
          .replace(/^https?:\/\/[^\/]+\/(?:anime\/)?/i, '')
          .replace(/-(?:\d+)-bolum.*$/i, '')
          .replace(/-izle.*$/i, '')
          .replace(/^\/+|\/+$/g, '')
          .trim();

        if (slug) {
          title = slug
            .replace(/-/g, ' ')
            .replace(/\b(izle|turkce|altyazi|altyazili|dublaj|dublajli|full|hd)\b/gi, '')
            .replace(/\b(\d+)\.?\s*sezon\b/gi, 'Season $1')
            .replace(/\bsezon\b/gi, 'Season')
            .replace(/\b(\d+)\.?\s*kisim\b/gi, 'Part $1')
            .replace(/\bkisim\b/gi, 'Part')
            .replace(/\bbolum\b/gi, 'Episode')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\b\w/g, c => c.toUpperCase());
        }
      } catch (e) {}
    }

    return title || rawTitle || '';
  };

  const handleCopyError = async () => {
    if (lastErrorMessage) {
      try {
        await Clipboard.setStringAsync(String(lastErrorMessage));
        Alert.alert('Kopyalandı 📋', 'Hata kodu panoya kopyalandı.');
      } catch (err) {
        console.warn('Clipboard copy error:', err);
      }
    }
  };

  const handleManualScrape = () => {
    setIsAddingAnime(true);
    setScrapeStatusText('Sayfadaki anime ve bölümler ayıklanıyor...');
    setLastErrorMessage(null);
    clientWebViewRef.current?.injectJavaScript(animePageScraperInjectedJs);
  };

  const fetchProfile = async () => {
    if (user) {
      setLoading(true);
      const data = await getProfileData();
      if (data) setProfileData(data);
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchProfile();
  }, [user]);

  const handleCreateList = async () => {
    if (!newListName.trim()) return;
    const res = await createCustomList(newListName);
    if (res) {
      setNewListName('');
      setModalVisible(false);
      fetchProfile();
    }
  };

  const handleDeleteList = async (listId) => {
    const res = await deleteCustomList(listId);
    if (res) {
      fetchProfile();
    }
  };

  const handleSelectAvatar = async (imageUrl) => {
    const res = await updateAvatar(imageUrl);
    if (res) {
      setAvatarModalVisible(false);
      updateUserAvatar(imageUrl);
      fetchProfile();
    }
  };

  const startAddAnimeScrape = async () => {
    const rawInput = animeInputUrl.trim();
    if (!rawInput) {
      Alert.alert('Uyarı', 'Lütfen bir anime sayfası linki veya anime adı girin.');
      return;
    }

    setLastErrorMessage(null);
    setIsAddingAnime(true);
    setScrapeStatusText('Veritabanı kontrol ediliyor...');

    try {
      // 1. Check if already in DB
      const existsRes = await checkAnimeExistsApi({ url: rawInput, slug: rawInput, title: rawInput });
      if (existsRes?.exists && existsRes.anime) {
        Alert.alert(
          'Anime Zaten Mevcut',
          `"${existsRes.anime.title}" zaten veritabanında mevcut (${existsRes.anime.total_episodes} Bölüm).\nYine de taranıp güncellensin mi?`,
          [
            {
              text: 'İptal',
              style: 'cancel',
              onPress: () => {
                setIsAddingAnime(false);
                setScrapeStatusText('');
              }
            },
            {
              text: 'Güncelle',
              onPress: () => {
                const targetUrl = resolveTargetTranimeizleUrl(rawInput);
                proceedWithClientScrape(targetUrl);
              }
            }
          ]
        );
        return;
      }

      // 2. Resolve URL and start client scraping
      const targetUrl = resolveTargetTranimeizleUrl(rawInput);
      proceedWithClientScrape(targetUrl);
    } catch (err) {
      console.warn('[startAddAnimeScrape] Check error:', err.message);
      const targetUrl = resolveTargetTranimeizleUrl(rawInput);
      proceedWithClientScrape(targetUrl);
    }
  };

  const proceedWithClientScrape = (url) => {
    setScrapeStatusText('İstemci tarayıcısı telefonda açılıyor...');
    setClientScrapeUrl(url);
  };

  const executeSaveNewAnime = async (scraped, customTitleToUse = null) => {
    const finalTitle = customTitleToUse || animeTitleInput.trim() || extractCleanTitleFromUrl(scraped?.url || clientScrapeUrl, scraped?.title);
    setScrapeStatusText(`"${finalTitle}" için ${scraped.totalEpisodes} bölüm ve AniList verileri kaydediliyor...`);
    setIsAddingAnime(true);

    const saveRes = await clientAddAnimeApi({
      parsedData: {
        ...scraped,
        customTitle: finalTitle
      },
      mode: 'new_anime',
      totalEpisodesOverride: totalEpisodesInput.trim() ? parseInt(totalEpisodesInput, 10) : null
    });

    if (saveRes?.success) {
      setScrapeStatusText('Başarıyla eklendi! 🎉');
      Alert.alert('Başarılı 🚀', `"${finalTitle}" başarıyla veritabanına eklendi ve AniList ile senkronize edildi (${scraped.totalEpisodes} Bölüm)!`);
      setAddAnimeModalVisible(false);
      setIsFullScreenBrowser(false);
      setAnimeInputUrl('');
      setAnimeTitleInput('');
      setTotalEpisodesInput('');
      setClientScrapeUrl(null);
      setLastErrorMessage(null);
      setIsAddingAnime(false);
      fetchProfile();
    } else {
      const err = saveRes?.error || 'Anime kaydedilemedi.';
      Alert.alert('Hata', err);
      setLastErrorMessage(`[POST /client-add-anime error]: ${err}`);
      setIsAddingAnime(false);
    }
  };

  const handleClientScraperMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'page_navigated') {
        setScrapeStatusText(`Sayfa yüklendi: ${data.url || ''}`);
        if (!animeTitleInput.trim()) {
          const autoTitle = extractCleanTitleFromUrl(data.url);
          if (autoTitle) setAnimeTitleInput(autoTitle);
        }
      } else if (data.type === 'search_result_found') {
        setScrapeStatusText(`Anime bulundu, sayfaya geçiliyor...`);
      } else if (data.type === 'anime_overview_scraped') {
        const scraped = data.data;
        if (!scraped || Object.keys(scraped.episodes || {}).length === 0) {
          const err = 'Sayfadan bölüm bilgisi otomatik bulunamadı. Lütfen tam ekranda sayfayı açıp kontrol edin veya "Ayıkla & Kaydet" butonuna basın.';
          setLastErrorMessage(err);
          setIsAddingAnime(false);
          return;
        }

        const candidateTitle = animeTitleInput.trim() || extractCleanTitleFromUrl(scraped?.url || clientScrapeUrl, scraped?.title);
        if (!animeTitleInput.trim() && candidateTitle) {
          setAnimeTitleInput(candidateTitle);
        }

        // Confirm title & AniList sync with user
        Alert.alert(
          'Anime İsmi & AniList Onayı 🏷️',
          `Ayıklanan Anime Başlığı:\n"${candidateTitle}"\n\nBu isimle kaydedilip AniList ID ve bilgileri otomatik güncellensin mi?`,
          [
            { text: 'İptal / Değiştir', style: 'cancel' },
            { 
              text: '⚡ Evet, Kaydet', 
              onPress: () => executeSaveNewAnime(scraped, candidateTitle) 
            }
          ]
        );
      } else if (data.type === 'scraper_error') {
        setLastErrorMessage(`[WebView Scraper error]: ${data.error}`);
        setIsAddingAnime(false);
      }
    } catch (err) {
      console.warn('[handleClientScraperMessage] Parse error:', err);
      setLastErrorMessage(`[JSON Parse error]: ${err.message}`);
    }
  };

  const toggleFavoritesNotifications = async (newValue) => {
    try {
      // Optimistic update
      setProfileData(prev => ({ ...prev, notifyOnFavorites: newValue }));
      await toggleFavoritesNotificationsApi(newValue);
    } catch (err) {
      console.log('Error toggling favorites notifications:', err.message);
      // Revert on error
      setProfileData(prev => ({ ...prev, notifyOnFavorites: !newValue }));
    }
  };

  const toggleListNotifications = async (listId, newValue) => {
    try {
      // Optimistic update
      setProfileData(prev => {
        const updatedLists = prev.customLists.map(l => 
          l._id === listId ? { ...l, notificationsEnabled: newValue } : l
        );
        return { ...prev, customLists: updatedLists };
      });
      await toggleListNotificationsApi(listId, newValue);
    } catch (err) {
      console.log('Error toggling list notifications:', err.message);
      // Revert on error
      fetchProfile();
    }
  };

  const handleRefreshOrchestratorCache = async () => {
    setIsRefreshingCache(true);
    try {
      const res = await forceRefresh();
      if (res?.success) {
        Alert.alert(
          'Orkestra Önbelleği Yenilendi 🎭',
          `Yerel orkestra ve anime dizini başarıyla güncellendi!\n\nToplam ${res.count} anime başlığı ve sezonu cihazınıza aktarıldı.`
        );
      } else {
        Alert.alert('Bilgi', 'Önbellek güncellendi. (Mevcut dizin boyutu: ' + (directory?.length || 0) + ')');
      }
    } catch (err) {
      Alert.alert('Hata', 'Önbellek güncellenirken bir sorun oluştu: ' + err.message);
    } finally {
      setIsRefreshingCache(false);
    }
  };

  const handleDevLogoTap = () => {
    const nextCount = devTapCount + 1;
    setDevTapCount(nextCount);
    if (devTapTimerRef.current) clearTimeout(devTapTimerRef.current);
    devTapTimerRef.current = setTimeout(() => setDevTapCount(0), 3000);

    if (nextCount >= 10) {
      setDevTapCount(0);
      setIsScraperBrowserVisible(true);
      Alert.alert(
        '⚡ Scraper Tarayıcısı Açıldı! 🌐',
        'Tranimeizle sayfalarında özgürce gezinebilir, Cloudflare doğrulamasını çözebilir ve "Bu Sayfadaki Bölümleri Çek" butonuna basarak tüm yeni bölümleri tek dokunuşla veritabanına ve orkestraya aktarabilirsiniz.'
      );
    }
  };

  const handleScraperBrowserMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'page_navigated') {
        setScraperUrlInput(data.url || '');
      } else if (data.type === 'batch_list_scraped') {
        const items = data.items || [];
        if (items.length === 0) {
          Alert.alert('Bilgi', 'Bu sayfada çekilecek bölüm linki bulunamadı.');
          setIsIngestingBatch(false);
          return;
        }
        setIsIngestingBatch(true);
        setBatchStatusText(`${items.length} bölüm sunucuya aktarılıyor...`);

        const res = await clientIngestBatchApi(items);
        setIsIngestingBatch(false);
        if (res?.success) {
          Alert.alert('🎉 Başarılı!', `${res.message || 'Bölümler aktarıldı.'}`);
          fetchProfile();
        } else {
          Alert.alert('Hata', res?.error || 'Aktarım başarısız.');
        }
      } else if (data.type === 'anime_overview_scraped' && data.data && Object.keys(data.data.episodes || {}).length > 0) {
        // Also allow single overview ingestion from the browser
        const scraped = data.data;
        const candidateTitle = extractCleanTitleFromUrl(scraped.url, scraped.title);
        Alert.alert(
          'Sayfadaki Animeyi Ekle 🎬',
          `"${candidateTitle}" (${scraped.totalEpisodes} Bölüm) veritabanına eklensin mi?`,
          [
            { text: 'İptal', style: 'cancel' },
            { 
              text: '⚡ Evet, Ekle', 
              onPress: () => executeSaveNewAnime(scraped, candidateTitle) 
            }
          ]
        );
      }
    } catch (e) {
      console.warn('Scraper browser message parse error:', e);
      setIsIngestingBatch(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigation.replace('Home');
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Giriş yapmadınız.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profilim</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Info */}
        <View style={styles.profileCard}>
          <TouchableOpacity style={styles.avatarWrapper} onPress={() => setAvatarModalVisible(true)}>
            {profileData?.avatar ? (
              <Image source={{ uri: profileData.avatar }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>
                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </Text>
            )}
            <View style={styles.editAvatarBadge}>
              <Ionicons name="camera" size={12} color="#FFF" />
            </View>
          </TouchableOpacity>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user.name || 'Kullanıcı'}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
          </View>
        </View>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>İzlemeye Devam Et</Text>
          {loading ? (
            <ActivityIndicator color={COLORS.accent} />
          ) : profileData?.watchHistory?.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.lg }}>
              {profileData.watchHistory.map((item, index) => {
                const anime = item.anime;
                if (!anime) return null;
                const animeName = anime.orijinal_ad || anime.tranimeizle_slug?.replace(/-/g, ' ') || 'Bilinmeyen Anime';
                const animeImage = anime.coverImage || anime.cover_image || anime.bannerImage || anime.banner_image;
                return (
                  <TouchableOpacity key={index} style={styles.animeCard} onPress={() => navigation.navigate('Resolve', {
                    animeId: anime._id,
                    episodeNumber: item.episode,
                    episodeTitle: `${item.episode}. Bölüm`,
                    animeTitle: animeName,
                    startAt: item.currentTime || 0
                  })}>
                    <Image source={{ uri: animeImage }} style={styles.animeImage} />
                    <Text style={styles.animeTitle} numberOfLines={1}>{animeName}</Text>
                    <Text style={styles.animeSubtitle}>Bölüm {item.episode}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <Text style={styles.emptyTextSm}>Henüz bir geçmiş bulunmuyor.</Text>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs }}>
            <Text style={styles.sectionTitle}>Favorilerim</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 12, marginRight: 6 }}>Bildirimler</Text>
              <Switch
                value={profileData?.notifyOnFavorites !== false}
                onValueChange={toggleFavoritesNotifications}
                trackColor={{ false: COLORS.bgSecondary, true: COLORS.accentGlow }}
                thumbColor={profileData?.notifyOnFavorites !== false ? COLORS.accent : COLORS.textMuted}
                style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
              />
            </View>
          </View>
          {loading ? (
            <ActivityIndicator color={COLORS.accent} />
          ) : profileData?.favorites?.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.lg }}>
              {profileData.favorites.map((anime, index) => {
                if (!anime) return null;
                const animeName = anime.orijinal_ad || anime.tranimeizle_slug?.replace(/-/g, ' ') || 'Bilinmeyen Anime';
                const animeImage = anime.coverImage || anime.cover_image || anime.bannerImage || anime.banner_image;
                return (
                  <TouchableOpacity key={index} style={styles.animeCard} onPress={() => navigation.navigate('AnimeDetail', { anime: { _id: anime._id, title: animeName } })}>
                    <Image source={{ uri: animeImage }} style={styles.animeImage} />
                    <Text style={styles.animeTitle} numberOfLines={1}>{animeName}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <Text style={styles.emptyTextSm}>Listeniz boş.</Text>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md }}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Özel Listelerim</Text>
            <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addListBtn}>
              <Ionicons name="add" size={18} color={COLORS.accent} />
              <Text style={styles.addListBtnText}>Yeni Liste</Text>
            </TouchableOpacity>
          </View>
          
          {loading ? (
            <ActivityIndicator color={COLORS.accent} />
          ) : profileData?.customLists?.length > 0 ? (
            profileData.customLists.map((list, listIndex) => (
              <View key={listIndex} style={styles.customListContainer}>
                <View style={styles.customListHeader}>
                  <Text style={styles.customListTitle}>{list.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="notifications-outline" size={16} color={COLORS.textMuted} style={{ marginRight: 4 }} />
                    <Switch
                      value={list.notificationsEnabled}
                      onValueChange={(val) => toggleListNotifications(list._id, val)}
                      trackColor={{ false: COLORS.bgSecondary, true: COLORS.accentGlow }}
                      thumbColor={list.notificationsEnabled ? COLORS.accent : COLORS.textMuted}
                      style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }], marginRight: 10 }}
                    />
                    <TouchableOpacity onPress={() => handleDeleteList(list._id)}>
                      <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                    </TouchableOpacity>
                  </View>
                </View>
                {list.animes && list.animes.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.md }}>
                    {list.animes.map((anime, index) => {
                      if (!anime) return null;
                      const animeName = anime.orijinal_ad || anime.tranimeizle_slug?.replace(/-/g, ' ') || 'Bilinmeyen Anime';
                      const animeImage = anime.coverImage || anime.cover_image || anime.bannerImage || anime.banner_image;
                      return (
                        <TouchableOpacity key={index} style={styles.animeCard} onPress={() => navigation.navigate('AnimeDetail', { anime: { _id: anime._id, title: animeName } })}>
                          <Image source={{ uri: animeImage }} style={styles.animeImage} />
                          <Text style={styles.animeTitle} numberOfLines={1}>{animeName}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <Text style={styles.emptyTextSm}>Bu liste boş.</Text>
                )}
              </View>
            ))
          ) : (
            <Text style={styles.emptyTextSm}>Henüz özel liste oluşturmadınız.</Text>
          )}

          <Text style={styles.sectionTitle}>Ayarlar</Text>

          <TouchableOpacity style={[styles.menuItem, styles.addAnimeMenuItem]} onPress={() => setAddAnimeModalVisible(true)}>
            <View style={[styles.menuIconWrapper, { backgroundColor: 'rgba(255, 107, 0, 0.15)' }]}>
              <Ionicons name="add-circle" size={20} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuText, { color: COLORS.accent, fontWeight: FONT_WEIGHTS.bold }]}>Yeni Anime Ekle</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>Tranimeizle linki veya isimle cihazınızda arayıp ekleyin</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.accent} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.menuItem} 
            onPress={handleRefreshOrchestratorCache}
            disabled={isRefreshingCache}
            activeOpacity={0.8}
          >
            <View style={[styles.menuIconWrapper, { backgroundColor: 'rgba(0, 200, 255, 0.12)' }]}>
              {isRefreshingCache ? (
                <ActivityIndicator size="small" color="#00C8FF" />
              ) : (
                <Ionicons name="refresh-circle-outline" size={22} color="#00C8FF" />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuText, { color: '#00C8FF', fontWeight: FONT_WEIGHTS.semibold }]}>Yerel Orkestra Önbelleğini Güncelle</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 11 }}>
                {directory.length > 0 ? `${directory.length} anime dizini yüklü (Dokunarak yenileyin)` : 'Dizini sunucudan yeniden çek'}
              </Text>
            </View>
            <Ionicons name="cloud-download-outline" size={18} color="#00C8FF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('AccountSettings')}>
            <View style={styles.menuIconWrapper}>
              <Ionicons name="settings-outline" size={20} color={COLORS.textSecondary} />
            </View>
            <Text style={styles.menuText}>Hesap Ayarları</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('PlayerSettings')}>
            <View style={styles.menuIconWrapper}>
              <Ionicons name="play-outline" size={20} color={COLORS.textSecondary} />
            </View>
            <Text style={styles.menuText}>Player Ayarları</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color="#FF3B30" />
          <Text style={styles.logoutText}>Çıkış Yap</Text>
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.7} onPress={handleDevLogoTap}>
          <Text style={styles.versionText}>Clofthel v{APP_VERSION} (Dokun: {devTapCount > 0 ? `${devTapCount}/10` : 'v' + APP_VERSION})</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Create List Modal */}
      <Modal visible={isModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Yeni Liste Oluştur</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Örn: Binge Watch"
              placeholderTextColor={COLORS.textMuted}
              value={newListName}
              onChangeText={setNewListName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalBtnCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnSave} onPress={handleCreateList}>
                <Text style={styles.modalBtnSaveText}>Oluştur</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Anime Modal */}
      <Modal visible={isAddAnimeModalVisible} transparent animationType="slide" onRequestClose={() => !isAddingAnime && setAddAnimeModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => !isAddingAnime && setAddAnimeModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.addAnimeModalCard}>
            <View style={styles.addAnimeHeader}>
              <Ionicons name="cloud-download-outline" size={24} color={COLORS.accent} style={{ marginRight: 8 }} />
              <Text style={styles.modalTitle}>Yeni Anime Ekle</Text>
            </View>

            <Text style={styles.addAnimeHelpText}>
              Tranimeizle anime sayfa linkini (Örn: https://www.tranimeizle.io/anime/...) veya doğrudan anime adını girin. Tarama işlemi doğrudan cihazınızdaki tarayıcı motoru üzerinden gerçekleştirilir.
            </Text>

            <View style={styles.addAnimeInputGroup}>
              <Text style={styles.addAnimeInputLabel}>Anime Adı (AniList ve Veritabanı Başlığı)</Text>
              <TextInput
                style={styles.addAnimeTextInput}
                placeholder="Örn: Solo Leveling Season 2"
                placeholderTextColor={COLORS.textMuted}
                value={animeTitleInput}
                onChangeText={setAnimeTitleInput}
                autoCapitalize="words"
                editable={!isAddingAnime}
              />
            </View>

            <View style={styles.addAnimeInputGroup}>
              <Text style={styles.addAnimeInputLabel}>Tranimeizle Linki veya Arama Adresi</Text>
              <TextInput
                style={styles.addAnimeTextInput}
                placeholder="https://www.tranimeizle.io/anime/... veya Anime Adı"
                placeholderTextColor={COLORS.textMuted}
                value={animeInputUrl}
                onChangeText={(text) => {
                  setAnimeInputUrl(text);
                  const extracted = extractCleanTitleFromUrl(text);
                  if (extracted) {
                    setAnimeTitleInput(extracted);
                  }
                }}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isAddingAnime}
              />
            </View>

            <View style={styles.addAnimeInputGroup}>
              <Text style={styles.addAnimeInputLabel}>Toplam Bölüm Sayısı (İsteğe Bağlı)</Text>
              <TextInput
                style={styles.addAnimeTextInput}
                placeholder="Örn: 12 veya 24 (Zorlama için)"
                placeholderTextColor={COLORS.textMuted}
                value={totalEpisodesInput}
                onChangeText={setTotalEpisodesInput}
                keyboardType="numeric"
                editable={!isAddingAnime}
              />
            </View>

            {isAddingAnime && (
              <View style={styles.addAnimeProgressBox}>
                <ActivityIndicator size="small" color={COLORS.accent} style={{ marginRight: 10 }} />
                <Text style={styles.addAnimeProgressText}>{scrapeStatusText}</Text>
              </View>
            )}

            {/* Live WebView Browser Preview */}
            {Platform.OS !== 'web' && WebView && clientScrapeUrl && (
              <View style={styles.liveBrowserBox}>
                <View style={styles.liveBrowserHeader}>
                  <Ionicons name="globe-outline" size={14} color={COLORS.accent} style={{ marginRight: 6 }} />
                  <Text style={styles.liveBrowserTitle} numberOfLines={1}>
                    {clientScrapeUrl}
                  </Text>
                  <TouchableOpacity 
                    style={styles.browserMiniActionBtn}
                    onPress={() => clientWebViewRef.current?.reload()}
                  >
                    <Ionicons name="reload" size={13} color="#FFF" />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.browserMiniActionBtn}
                    onPress={handleManualScrape}
                  >
                    <Ionicons name="flash" size={13} color={COLORS.accent} />
                    <Text style={styles.browserMiniActionText}>Ayıkla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.browserMiniExpandBtn}
                    onPress={() => setIsFullScreenBrowser(true)}
                  >
                    <Ionicons name="scan-outline" size={13} color="#FFF" />
                    <Text style={styles.browserMiniExpandText}>Tam Ekran</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.liveBrowserWebViewContainer}>
                  <WebView
                    ref={clientWebViewRef}
                    source={{ uri: clientScrapeUrl }}
                    injectedJavaScriptBeforeContentLoaded={animePageScraperInjectedJs}
                    injectedJavaScript={animePageScraperInjectedJs}
                    onMessage={handleClientScraperMessage}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    mixedContentMode="always"
                    mediaPlaybackRequiresUserAction={false}
                    setSupportMultipleWindows={false}
                    onError={(e) => {
                      const err = `WebView Error: ${e.nativeEvent.description || 'Yükleme hatası'}`;
                      console.warn('[Client Anime Scraper] WebView load error:', err);
                      setScrapeStatusText(err);
                      setLastErrorMessage(err);
                      setIsAddingAnime(false);
                    }}
                  />
                </View>
              </View>
            )}

            {/* Error Display with Copy Button */}
            {lastErrorMessage && (
              <View style={styles.errorBox}>
                <View style={styles.errorHeader}>
                  <Ionicons name="alert-circle" size={18} color={COLORS.error} style={{ marginRight: 6 }} />
                  <Text style={styles.errorTitle}>Hata / Bildirim</Text>
                </View>
                <Text style={styles.errorContent} selectable={true}>
                  {lastErrorMessage}
                </Text>
                <TouchableOpacity style={styles.copyErrorBtn} onPress={handleCopyError} activeOpacity={0.8}>
                  <Ionicons name="copy-outline" size={15} color="#FFF" style={{ marginRight: 6 }} />
                  <Text style={styles.copyErrorBtnText}>Hata Kodunu Kopyala</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.addAnimeModalActions}>
              <TouchableOpacity
                style={styles.addAnimeCancelBtn}
                onPress={() => {
                  setAddAnimeModalVisible(false);
                  setClientScrapeUrl(null);
                  setLastErrorMessage(null);
                  setIsFullScreenBrowser(false);
                }}
                disabled={isAddingAnime}
              >
                <Text style={styles.addAnimeCancelBtnText}>Kapat</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.addAnimeSubmitBtn, isAddingAnime && styles.addAnimeSubmitBtnDisabled]}
                onPress={startAddAnimeScrape}
                disabled={isAddingAnime}
              >
                <Text style={styles.addAnimeSubmitBtnText}>Taramayı Başlat & Ekle</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Full-Screen In-App Browser Modal (Add Anime) ──────────────── */}
      <Modal 
        visible={isFullScreenBrowser && !!clientScrapeUrl} 
        animationType="slide" 
        transparent={false}
        onRequestClose={() => setIsFullScreenBrowser(false)}
      >
        <SafeAreaView style={styles.fullScreenBrowserContainer}>
          <View style={styles.fullScreenBrowserHeader}>
            <TouchableOpacity 
              style={styles.browserHeaderBtn} 
              onPress={() => setIsFullScreenBrowser(false)}
            >
              <Ionicons name="chevron-down" size={22} color="#FFF" />
              <Text style={styles.browserHeaderBtnText}>Küçült</Text>
            </TouchableOpacity>

            <Text style={styles.fullScreenBrowserUrl} numberOfLines={1}>
              {clientScrapeUrl}
            </Text>

            <TouchableOpacity 
              style={styles.browserHeaderBtn} 
              onPress={() => clientWebViewRef.current?.reload()}
            >
              <Ionicons name="reload" size={18} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.browserExtractBtn} 
              onPress={handleManualScrape}
              disabled={isAddingAnime}
            >
              <Ionicons name="flash" size={15} color="#000" style={{ marginRight: 4 }} />
              <Text style={styles.browserExtractBtnText}>Ayıkla & Ekle</Text>
            </TouchableOpacity>
          </View>

          {isAddingAnime && (
            <View style={styles.browserTopStatusBar}>
              <ActivityIndicator size="small" color={COLORS.accent} style={{ marginRight: 8 }} />
              <Text style={styles.browserTopStatusText}>{scrapeStatusText}</Text>
            </View>
          )}

          <View style={{ flex: 1, backgroundColor: '#000' }}>
            <WebView
              ref={clientWebViewRef}
              source={{ uri: clientScrapeUrl }}
              injectedJavaScriptBeforeContentLoaded={animePageScraperInjectedJs}
              injectedJavaScript={animePageScraperInjectedJs}
              onMessage={handleClientScraperMessage}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              mixedContentMode="always"
              mediaPlaybackRequiresUserAction={false}
              setSupportMultipleWindows={false}
              onError={(e) => {
                const err = `WebView Error: ${e.nativeEvent.description || 'Yükleme hatası'}`;
                console.warn('[ProfileScreen full browser] WebView load error:', err);
                setScrapeStatusText(err);
                setLastErrorMessage(err);
                setIsAddingAnime(false);
              }}
            />
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── Secret Developer Scraper Browser Modal (10-Tap Gesture) ─── */}
      <Modal
        visible={isScraperBrowserVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setIsScraperBrowserVisible(false)}
      >
        <SafeAreaView style={styles.fullScreenBrowserContainer}>
          {/* Address & Navigation Bar */}
          <View style={styles.fullScreenBrowserHeader}>
            <TouchableOpacity 
              style={styles.browserHeaderBtn} 
              onPress={() => setIsScraperBrowserVisible(false)}
            >
              <Ionicons name="close" size={20} color="#FFF" />
              <Text style={styles.browserHeaderBtnText}>Kapat</Text>
            </TouchableOpacity>

            <TextInput
              style={[styles.fullScreenBrowserUrl, { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8 }]}
              value={scraperUrlInput}
              onChangeText={setScraperUrlInput}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="https://www.tranimeizle.io/..."
              placeholderTextColor={COLORS.textMuted}
              onSubmitEditing={() => {
                let target = scraperUrlInput.trim();
                if (!target.startsWith('http')) target = `https://www.tranimeizle.io/arama?q=${encodeURIComponent(target)}`;
                setScraperBrowserUrl(target);
              }}
            />

            <TouchableOpacity 
              style={[styles.browserHeaderBtn, { backgroundColor: COLORS.accent }]} 
              onPress={() => {
                let target = scraperUrlInput.trim();
                if (!target.startsWith('http')) target = `https://www.tranimeizle.io/arama?q=${encodeURIComponent(target)}`;
                setScraperBrowserUrl(target);
              }}
            >
              <Ionicons name="arrow-forward" size={16} color="#000" />
            </TouchableOpacity>
          </View>

          {/* Quick Links & Browser Nav Controls */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#13131C', paddingHorizontal: 12, paddingVertical: 6, gap: 6 }}>
            <TouchableOpacity 
              style={{ paddingHorizontal: 6, paddingVertical: 4 }} 
              onPress={() => scraperBrowserWebviewRef.current?.goBack()}
            >
              <Ionicons name="arrow-back" size={18} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={{ paddingHorizontal: 6, paddingVertical: 4 }} 
              onPress={() => scraperBrowserWebviewRef.current?.goForward()}
            >
              <Ionicons name="arrow-forward" size={18} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={{ paddingHorizontal: 6, paddingVertical: 4 }} 
              onPress={() => scraperBrowserWebviewRef.current?.reload()}
            >
              <Ionicons name="reload" size={16} color="#FFF" />
            </TouchableOpacity>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingLeft: 6 }}>
              <TouchableOpacity 
                style={{ backgroundColor: 'rgba(255, 107, 0, 0.15)', borderWidth: 1, borderColor: COLORS.accent, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}
                onPress={() => {
                  const url = 'https://www.tranimeizle.io/listeler/yenibolum/sayfa-1';
                  setScraperUrlInput(url);
                  setScraperBrowserUrl(url);
                }}
              >
                <Text style={{ color: COLORS.accent, fontSize: 11, fontWeight: '700' }}>🔥 Yeni Bölümler</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ backgroundColor: 'rgba(0, 200, 255, 0.15)', borderWidth: 1, borderColor: '#00C8FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}
                onPress={() => {
                  const url = 'https://www.tranimeizle.io/listeler/populer';
                  setScraperUrlInput(url);
                  setScraperBrowserUrl(url);
                }}
              >
                <Text style={{ color: '#00C8FF', fontSize: 11, fontWeight: '700' }}>⭐ Popüler</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}
                onPress={() => {
                  const url = 'https://www.tranimeizle.io/anime/';
                  setScraperUrlInput(url);
                  setScraperBrowserUrl(url);
                }}
              >
                <Text style={{ color: '#FFF', fontSize: 11 }}>🎬 Tüm Animeler</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* Status Bar if ingesting */}
          {isIngestingBatch && (
            <View style={styles.browserTopStatusBar}>
              <ActivityIndicator size="small" color={COLORS.accent} style={{ marginRight: 8 }} />
              <Text style={styles.browserTopStatusText}>{batchStatusText || 'Bölümler işleniyor...'}</Text>
            </View>
          )}

          {/* Interactive Browser WebView */}
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            {Platform.OS !== 'web' && WebView && (
              <WebView
                ref={scraperBrowserWebviewRef}
                source={{ uri: scraperBrowserUrl }}
                injectedJavaScriptBeforeContentLoaded={animePageScraperInjectedJs}
                injectedJavaScript={animePageScraperInjectedJs}
                onMessage={handleScraperBrowserMessage}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                mixedContentMode="always"
                mediaPlaybackRequiresUserAction={false}
                setSupportMultipleWindows={false}
                onError={(e) => console.warn('[Scraper Browser] error:', e.nativeEvent.description)}
              />
            )}
          </View>

          {/* Bottom Floating Trigger Bar */}
          <View style={{ padding: 12, backgroundColor: '#16161F', borderTopWidth: 1, borderTopColor: COLORS.border, flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: COLORS.accent, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }}
              onPress={() => {
                setIsIngestingBatch(true);
                setBatchStatusText('Sayfadaki bölümler ayıklanıyor...');
                scraperBrowserWebviewRef.current?.injectJavaScript('window.clofthelTriggerBatchScrape ? window.clofthelTriggerBatchScrape() : (window.clofthelTriggerScrape && window.clofthelTriggerScrape()); true;');
              }}
              disabled={isIngestingBatch}
            >
              <Ionicons name="flash" size={18} color="#000" style={{ marginRight: 6 }} />
              <Text style={{ color: '#000', fontSize: 14, fontWeight: '800' }}>⚡ Bu Sayfadaki Bölümleri Çek & DB'ye Kaydet</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Avatar Selection Modal */}
      <Modal visible={isAvatarModalVisible} transparent animationType="slide">
        <View style={styles.avatarModalOverlay}>
          <View style={styles.avatarModalContent}>
            <View style={styles.avatarModalHeader}>
              <Text style={styles.avatarModalTitle}>Avatar Seç</Text>
              <TouchableOpacity onPress={() => setAvatarModalVisible(false)}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {AVATAR_LIST.map((animeGrp, index) => (
                <View key={index} style={styles.avatarGroupContainer}>
                  <Text style={styles.avatarGroupTitle}>{animeGrp.category}</Text>
                  <View style={styles.avatarGrid}>
                    {animeGrp.characters.map((char, charIdx) => {
                      const isSelected = profileData?.avatar === char.imageUrl;
                      return (
                        <TouchableOpacity 
                          key={charIdx} 
                          style={[styles.avatarChoiceWrapper, isSelected && styles.avatarChoiceSelected]} 
                          onPress={() => handleSelectAvatar(char.imageUrl)}
                        >
                          <Image source={{ uri: char.imageUrl }} style={styles.avatarChoiceImage} />
                          {isSelected && (
                            <View style={styles.avatarCheckBadge}>
                              <Ionicons name="checkmark" size={14} color="#FFF" />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.bgSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.title,
    fontWeight: FONT_WEIGHTS.bold,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
  },
  content: {
    padding: SPACING.lg,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgElevated,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.xxl,
    borderWidth: 1,
    borderColor: COLORS.divider,
    ...SHADOWS.card,
  },
  avatarWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.lg,
    position: 'relative',
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarText: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: FONT_WEIGHTS.heavy,
  },
  editAvatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: COLORS.bgElevated,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.bgPrimary,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: '#FFF',
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 4,
  },
  userEmail: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
  },
  animeTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.medium,
    marginBottom: 2,
  },
  animeSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 10,
  },
  addListBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 0, 0.1)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: BORDER_RADIUS.md,
  },
  addListBtnText: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.bold,
    marginLeft: 4,
  },
  customListContainer: {
    marginBottom: SPACING.xl,
  },
  customListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    paddingLeft: SPACING.sm,
  },
  customListTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  modalContent: {
    width: '100%',
    backgroundColor: COLORS.bgElevated,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    ...SHADOWS.card,
  },
  modalTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.lg,
  },
  modalInput: {
    backgroundColor: COLORS.bgSecondary,
    color: '#FFF',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: FONT_SIZES.body,
    marginBottom: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalBtnCancel: {
    padding: SPACING.md,
    marginRight: SPACING.sm,
  },
  modalBtnCancelText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
  },
  modalBtnSave: {
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
  },
  modalBtnSaveText: {
    color: '#FFF',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },
  avatarModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  avatarModalContent: {
    backgroundColor: COLORS.bgPrimary,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    height: '80%',
  },
  avatarModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  avatarModalTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.heading,
    fontWeight: FONT_WEIGHTS.bold,
  },
  avatarGroupContainer: {
    marginBottom: SPACING.lg,
  },
  avatarGroupTitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.sm,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  avatarChoiceWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
    position: 'relative',
  },
  avatarChoiceSelected: {
    borderColor: COLORS.accent,
  },
  avatarChoiceImage: {
    width: '100%',
    height: '100%',
    borderRadius: 36,
  },
  avatarCheckBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: COLORS.accent,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuSection: {
    marginBottom: SPACING.xxxl,
  },
  sectionTitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.md,
    paddingLeft: SPACING.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
  },
  menuIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  menuText: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.3)',
    marginBottom: SPACING.xxxl,
  },
  logoutText: {
    color: '#FF3B30',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    marginLeft: SPACING.sm,
  },
  versionText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.caption,
    textAlign: 'center',
  },
  emptyTextSm: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    marginBottom: SPACING.xl,
    paddingLeft: SPACING.sm,
  },
  animeCard: {
    width: 120,
    marginRight: SPACING.md,
  },
  animeImage: {
    width: '100%',
    height: 180,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.bgElevated,
    marginBottom: SPACING.xs,
  },
  animeTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.medium,
  },
  animeSubtitle: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.caption - 2,
    fontWeight: FONT_WEIGHTS.bold,
  },

  // ── Add Anime Modal Styles ────────────────────────
  addAnimeMenuItem: {
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.3)',
    backgroundColor: 'rgba(255, 107, 0, 0.05)',
  },
  addAnimeModalCard: {
    width: '100%',
    backgroundColor: COLORS.bgElevated,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  addAnimeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  addAnimeHelpText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.small,
    lineHeight: 18,
    marginBottom: SPACING.lg,
  },
  addAnimeInputGroup: {
    marginBottom: SPACING.md,
  },
  addAnimeInputLabel: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium,
    marginBottom: 6,
  },
  addAnimeTextInput: {
    backgroundColor: COLORS.bgSecondary,
    color: '#FFF',
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    fontSize: FONT_SIZES.body,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  addAnimeProgressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 0, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.3)',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginVertical: SPACING.sm,
  },
  addAnimeProgressText: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium,
    flex: 1,
  },
  addAnimeModalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  addAnimeCancelBtn: {
    flex: 1,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addAnimeCancelBtnText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  addAnimeSubmitBtn: {
    flex: 2,
    backgroundColor: COLORS.accent,
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addAnimeSubmitBtnDisabled: {
    opacity: 0.6,
  },
  addAnimeSubmitBtnText: {
    color: '#000',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },

  // ── Live Browser Preview & Error Styles ─────────
  liveBrowserBox: {
    width: '100%',
    height: 180,
    backgroundColor: '#000',
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.4)',
    marginVertical: SPACING.sm,
  },
  liveBrowserHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgElevated,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  liveBrowserTitle: {
    color: COLORS.textSecondary,
    fontSize: 11,
    flex: 1,
  },
  liveBrowserWebViewContainer: {
    flex: 1,
    backgroundColor: '#0D0D12',
  },
  errorBox: {
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.4)',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginVertical: SPACING.sm,
  },
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  errorTitle: {
    color: COLORS.error,
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
  },
  errorContent: {
    color: '#FFF',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: SPACING.sm,
  },
  copyErrorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.3)',
    borderWidth: 1,
    borderColor: COLORS.error,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.sm,
  },
  copyErrorBtnText: {
    color: '#FFF',
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold,
  },

  // Mini browser header buttons
  browserMiniActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    marginLeft: 6,
  },
  browserMiniActionText: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.bold,
    marginLeft: 3,
  },
  browserMiniExpandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    marginLeft: 6,
  },
  browserMiniExpandText: {
    color: '#000',
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.bold,
    marginLeft: 3,
  },

  // Full Screen Browser Styles
  fullScreenBrowserContainer: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  fullScreenBrowserHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16161F',
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  browserHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.sm,
  },
  browserHeaderBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
    marginLeft: 4,
  },
  fullScreenBrowserUrl: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 12,
    paddingHorizontal: 4,
  },
  browserExtractBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.sm,
  },
  browserExtractBtnText: {
    color: '#000',
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.bold,
  },
  browserTopStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 0, 0.15)',
    paddingHorizontal: SPACING.lg,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 107, 0, 0.3)',
  },
  browserTopStatusText: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});
