import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  Modal,
  Linking,
  Platform,
  BackHandler
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { APP_VERSION } from '../constants/config';
import { checkAppUpdate } from '../services/api';
import { AuthContext } from '../context/AuthContext';
import { useAlert } from '../context/AlertContext';
import { getPlayerPreferences, savePlayerPreferences, DEFAULT_PREFERENCES } from '../utils/preferences';
import AsyncStorage from '@react-native-async-storage/async-storage';

const POLICY_DATA = {
  terms: {
    title: 'Hizmet Şartları',
    tag: 'Kullanım Koşulları',
    url: 'https://clofthel.com.tr/terms-of-service',
    sections: [
      {
        number: '01',
        title: 'Hizmetin Kapsamı',
        content: 'Clofthel, kullanıcıların anime keşfetmesini, özel listeler oluşturmasını, izleme geçmişini takip etmesini ve yapay zeka tabanlı öneriler almasını sağlayan modern bir anime platformudur.'
      },
      {
        number: '02',
        title: 'Kullanıcı Sorumlulukları',
        content: '• Uygulama yasadışı, hileli veya topluluk kurallarına aykırı amaçlarla kullanılamaz.\n• Tersine mühendislik, kaynak kodlarını kırma (decompile) ve sunucu güvenliğini tehdit edici eylemlerde bulunulamaz.\n• Sunucularımıza aşırı yük bindirecek bot, script veya izinsiz veri kazıma araçları kullanılamaz. İhlal durumunda hesap ve IP adresi engellenir.'
      },
      {
        number: '03',
        title: 'Fikri Mülkiyet ve İçerikler',
        content: 'Clofthel yazılım mimarisi, tasarımı ve kod tabanı bize aittir.\nUygulama içerisindeki afişler, açıklamalar ve metadata bilgileri Kitsu, AniList ve kamuya açık kaynaklardan temin edilmektedir. Clofthel bu üçüncü parti içerikler üzerinde telif hakkı iddia etmez.'
      },
      {
        number: '04',
        title: 'Hesap Askıya Alma ve Silme',
        content: 'Hizmet şartlarının veya güvenlik politikalarının ihlali durumunda, Clofthel ön bildirimde bulunmaksızın hesabı dondurma veya kalıcı olarak silme hakkını saklı tutar.'
      },
      {
        number: '05',
        title: 'Sorumluluk Reddi',
        content: 'Hizmet "olduğu gibi" sağlanır. Bakım, güncelleme veya sunucu kaynaklı geçici kesintilerden ya da kullanıcı kaynaklı veri kayıplarından platform sorumlu tutulamaz.'
      }
    ]
  },
  privacy: {
    title: 'Gizlilik Politikası',
    tag: 'Veri Koruma & KVKK',
    url: 'https://clofthel.com.tr/privacy-policy',
    sections: [
      {
        number: '01',
        title: 'Toplanan Veriler',
        content: '• Hesap Bilgileri: Kullanıcı adı, e-posta adresi ve şifre (kriptolanmış şekilde saklanır).\n• Kullanım Verileri: Favori animeler, izleme geçmişi, oluşturulan listeler ve oynatıcı tercihleri.\n• Cihaz Verileri: Cihaz işletim sistemi, uygulama sürümü ve bildirim token\'ı.'
      },
      {
        number: '02',
        title: 'Verilerin Kullanım Amacı',
        content: '• Uygulama hizmetlerini sunmak ve cihazlar arasında senkronize etmek.\n• Yapay zeka anime asistanı ile size en uygun içerikleri önermek.\n• Güvenliği sağlamak, hesap kurtarma işlemlerini yönetmek ve siber saldırıları önlemek.'
      },
      {
        number: '03',
        title: 'Veri Güvenliği ve Şifreleme',
        content: '• Şifreleriniz sunucularda asla düz metin olarak tutulmaz; güçlü bcrypt algoritmaları ile tuzlanarak korunur.\n• İstemci ile sunucu arasındaki tüm iletişim SSL/HTTPS ve dinamik HMAC-SHA256 imzaları ile şifrelenir.\n• Kişisel verileriniz asla reklam şirketlerine satılmaz veya pazarlama amacıyla paylaşılmaz.'
      },
      {
        number: '04',
        title: 'Kullanıcı Hakları',
        content: 'Dilediğiniz zaman hesap bilgilerinizi güncelleyebilir veya hesabınızı silebilirsiniz. Hesap silindiğinde tüm kişisel verileriniz ve izleme geçmişiniz geri döndürülemez biçimde temizlenir.'
      }
    ]
  },
  security: {
    title: 'Güvenlik Politikası',
    tag: 'Sistem Mimarisi',
    url: 'https://clofthel.com.tr/security-policy',
    sections: [
      {
        number: '01',
        title: 'Zero Hardcoded Secrets Mimarisi',
        content: 'Uygulamanın kaynak kodunda veya istemci paketlerinde hassas veritabanı şifreleri ya da sunucu sırları çıplak metin olarak bulunmaz.'
      },
      {
        number: '02',
        title: 'HMAC İstek Doğrulama',
        content: 'Her API isteği dinamik zaman damgası ve benzersiz anahtarlarla imzalanır. Tekrar oynatma (replay attack) ve araya girme (MitM) saldırıları anında filtrelenir.'
      },
      {
        number: '03',
        title: 'Güvenlik Açığı Bildirimi',
        content: 'Sistemde herhangi bir potansiyel güvenlik açığı tespit ederseniz, lütfen bunu kamuya açıklamadan önce doğrudan destek ekibimize bildiriniz. Bildirimler hızla incelenip yamalanır.'
      }
    ]
  },
  dmca: {
    title: 'Telif Hakkı & DMCA Bildirimi',
    tag: 'Telif Hakları',
    url: 'https://clofthel.com.tr',
    sections: [
      {
        number: '01',
        title: 'Telif Hakları Uyarısı',
        content: 'Clofthel, sunucularında herhangi bir video veya medya dosyası barındırmaz. Uygulama, internet üzerindeki kamuya açık kaynaklardan içerik bağlantılarını derleyen bir arama ve keşif arayüzüdür.'
      },
      {
        number: '02',
        title: 'DMCA & Telif İhlali Bildirimi',
        content: 'Telif hakkı sahibiyseniz veya yetkili temsilcisiyseniz ve bir içeriğin kaldırılmasını talep ediyorsanız, telif belgesiyle birlikte telif@clofthel.com.tr adresine başvurabilirsiniz. İlgili bağlantılar incelenip 48 saat içerisinde sistemden kaldırılacaktır.'
      }
    ]
  }
};

export default function SettingsScreen({ navigation }) {
  const { user, logout } = useContext(AuthContext);
  const { showAlert } = useAlert();

  // Parent-Child View Controller
  // null: Parent Menu | 'account' | 'player' | 'info' | 'legal'
  const [currentSection, setCurrentSection] = useState(null);

  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  // Policy Detail Modal
  const [selectedPolicyKey, setSelectedPolicyKey] = useState(null);

  useEffect(() => {
    loadPreferences();
  }, []);

  // Android Back button handler: return from child to parent first
  useEffect(() => {
    const onBackPress = () => {
      if (selectedPolicyKey) {
        setSelectedPolicyKey(null);
        return true;
      }
      if (currentSection !== null) {
        setCurrentSection(null);
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [currentSection, selectedPolicyKey]);

  const loadPreferences = async () => {
    try {
      const prefs = await getPlayerPreferences();
      setPreferences(prefs);
    } catch (err) {
      console.warn('[SettingsScreen] Preferences load error:', err);
    } finally {
      setLoadingPrefs(false);
    }
  };

  const updatePreference = async (key, value) => {
    if (!preferences) return;
    const updated = { ...preferences, [key]: value };
    setPreferences(updated);
    await savePlayerPreferences(updated);
  };

  const handleResetPreferences = () => {
    showAlert(
      'Varsayılanlara Dön',
      'Tüm oynatıcı ayarlarınız varsayılan değerlere sıfırlanacaktır. Emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sıfırla',
          style: 'destructive',
          onPress: async () => {
            setPreferences(DEFAULT_PREFERENCES);
            await savePlayerPreferences(DEFAULT_PREFERENCES);
            showAlert('Başarılı', 'Oynatıcı ayarları varsayılan değerlere döndürüldü.');
          }
        }
      ]
    );
  };

  const handleClearCache = async () => {
    showAlert(
      'Önbelleği Temizle',
      'Geçici arama önbelleği, sayfa önbellekleri ve hafızadaki video kayıtları temizlenecektir. Oturumunuz açık kalacaktır.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Temizle',
          onPress: async () => {
            setIsClearingCache(true);
            try {
              const allKeys = await AsyncStorage.getAllKeys();
              const keysToRemove = allKeys.filter(k => 
                !k.includes('userToken') && 
                !k.includes('hasAcceptedLegal') &&
                !k.includes('@clofthel_player_preferences')
              );
              if (keysToRemove.length > 0) {
                await AsyncStorage.multiRemove(keysToRemove);
              }
              showAlert('Başarılı ✨', `Önbellek temizlendi. ${keysToRemove.length} geçici girdi silindi.`);
            } catch (err) {
              showAlert('Hata', 'Önbellek temizlenirken bir sorun oluştu.');
            } finally {
              setIsClearingCache(false);
            }
          }
        }
      ]
    );
  };

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    try {
      const res = await checkAppUpdate();
      if (res && res.success && res.latestVersion) {
        if (res.latestVersion !== APP_VERSION) {
          showAlert(
            'Yeni Sürüm Mevcut! 🚀',
            `Güncel Sürüm: ${res.latestVersion}\nMevcut Sürüm: ${APP_VERSION}\n\nYenilikler:\n${res.releaseNotes || 'Performans iyileştirmeleri ve hata düzeltmeleri yapıldı.'}`,
            [
              { text: 'Kapat', style: 'cancel' },
              {
                text: 'Güncelle',
                onPress: () => {
                  if (res.updateUrl) Linking.openURL(res.updateUrl);
                }
              }
            ]
          );
        } else {
          showAlert('Güncel 🎉', `Clofthel v${APP_VERSION} en son sürümdedir.`);
        }
      } else {
        showAlert('Bilgi', `Clofthel v${APP_VERSION} sürümünü kullanıyorsunuz. Uygulama güncel.`);
      }
    } catch (err) {
      showAlert('Hata', 'Güncelleme sunucusuna ulaşılamadı.');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleLogoutPress = () => {
    showAlert(
      'Çıkış Yap',
      'Hesabınızdan çıkış yapmak istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Çıkış Yap',
          style: 'destructive',
          onPress: async () => {
            await logout();
            showAlert('Bilgi', 'Başarıyla çıkış yapıldı.');
          }
        }
      ]
    );
  };

  const openExternalLink = (url) => {
    Linking.openURL(url).catch(() => {
      showAlert('Hata', 'Bağlantı açılamadı: ' + url);
    });
  };

  const skipIntervalOptions = [5, 10, 15, 30, 85];
  const speedOptions = [0.5, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0, 5.0];
  const buttonSizeOptions = [
    { label: 'Küçük', value: 'small' },
    { label: 'Normal', value: 'medium' },
    { label: 'Büyük', value: 'large' }
  ];
  const clarityOptions = [
    { label: 'Kapalı', value: 'off' },
    { label: 'Performans', value: 'performance' },
    { label: 'Dengeli', value: 'balanced' },
    { label: 'AI Native', value: 'ai-native' }
  ];

  const availableFansubs = [
    'TRanimeizle',
    'seicode',
    'BabaPro Fansub',
    'TAÇE',
    'FGL Çeviri',
    'Anisekai',
    'Tempura',
    'Aoi Fansub',
    'Animeou',
    'Puzzle'
  ];

  const platformLabel = Platform.OS === 'web' 
    ? 'Web Tarayıcı' 
    : Platform.OS === 'android' 
      ? 'Android Uygulama' 
      : 'iOS Uygulama';

  const selectedPolicy = selectedPolicyKey ? POLICY_DATA[selectedPolicyKey] : null;

  // Header back action: if in child, go to parent menu; if in parent menu, go back to caller
  const handleHeaderBack = () => {
    if (currentSection !== null) {
      setCurrentSection(null);
    } else {
      navigation.goBack();
    }
  };

  // Header Title
  const getHeaderTitle = () => {
    switch (currentSection) {
      case 'account': return 'Hesap Bilgileri';
      case 'player': return 'Player Ayarları';
      case 'info': return 'Uygulama Bilgileri';
      case 'legal': return 'Politikalar & Yasal';
      default: return 'Ayarlar';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* ── Top Bar ────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          activeOpacity={0.7}
          onPress={handleHeaderBack}
        >
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{getHeaderTitle()}</Text>
          {currentSection === null && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>v{APP_VERSION}</Text>
            </View>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* ══════════════════════════════════════════════════════ */}
        {/* PARENT VIEW: ANA AYARLAR MENÜSÜ                     */}
        {/* ══════════════════════════════════════════════════════ */}
        {currentSection === null && (
          <View style={styles.parentMenuContainer}>
            <View style={styles.menuGroupCard}>
              {/* 1. Hesap Bilgileri */}
              <TouchableOpacity
                style={styles.menuRowItem}
                activeOpacity={0.65}
                onPress={() => setCurrentSection('account')}
              >
                <View style={styles.menuIconBox}>
                  <Ionicons name="person-outline" size={20} color="#D0D0D8" />
                </View>
                <View style={styles.menuRowTextWrapper}>
                  <Text style={styles.menuRowTitle}>Hesap Bilgileri</Text>
                  <Text style={styles.menuRowSubtitle} numberOfLines={1}>
                    {user ? `${user.name || user.email} • Profil ve önbellek` : 'Giriş ve kayıt işlemleri'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>

              <View style={styles.menuRowDivider} />

              {/* 2. Player Ayarları */}
              <TouchableOpacity
                style={styles.menuRowItem}
                activeOpacity={0.65}
                onPress={() => setCurrentSection('player')}
              >
                <View style={styles.menuIconBox}>
                  <Ionicons name="play-outline" size={20} color="#D0D0D8" />
                </View>
                <View style={styles.menuRowTextWrapper}>
                  <Text style={styles.menuRowTitle}>Player Ayarları</Text>
                  <Text style={styles.menuRowSubtitle} numberOfLines={1}>
                    Sarma, intro atlama, hız ve kontroller
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>

              <View style={styles.menuRowDivider} />

              {/* 3. Uygulama Bilgileri */}
              <TouchableOpacity
                style={styles.menuRowItem}
                activeOpacity={0.65}
                onPress={() => setCurrentSection('info')}
              >
                <View style={styles.menuIconBox}>
                  <Ionicons name="information-circle-outline" size={20} color="#D0D0D8" />
                </View>
                <View style={styles.menuRowTextWrapper}>
                  <Text style={styles.menuRowTitle}>Uygulama Bilgileri</Text>
                  <Text style={styles.menuRowSubtitle} numberOfLines={1}>
                    v{APP_VERSION} • {platformLabel} • Güncellemeler
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>

              <View style={styles.menuRowDivider} />

              {/* 4. Politikalar & Yasal */}
              <TouchableOpacity
                style={styles.menuRowItem}
                activeOpacity={0.65}
                onPress={() => setCurrentSection('legal')}
              >
                <View style={styles.menuIconBox}>
                  <Ionicons name="shield-checkmark-outline" size={20} color="#D0D0D8" />
                </View>
                <View style={styles.menuRowTextWrapper}>
                  <Text style={styles.menuRowTitle}>Politikalar & Yasal</Text>
                  <Text style={styles.menuRowSubtitle} numberOfLines={1}>
                    Hizmet şartları, gizlilik ve telif hakları
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* CHILD 1: HESAP BİLGİLERİ                             */}
        {/* ══════════════════════════════════════════════════════ */}
        {currentSection === 'account' && (
          <View style={styles.childContainer}>
            {user ? (
              <View style={styles.profileCard}>
                <View style={styles.profileRow}>
                  <View style={styles.avatarWrapper}>
                    {user?.avatar && user.avatar !== 'no-photo.jpg' && user.avatar.startsWith('http') && !avatarError ? (
                      <Image 
                        source={{ uri: user.avatar }} 
                        style={styles.avatarImage} 
                        onError={() => setAvatarError(true)}
                      />
                    ) : (
                      <Text style={styles.avatarLetter}>
                        {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
                      </Text>
                    )}
                  </View>
                  <View style={styles.profileInfo}>
                    <Text style={styles.profileName}>{user.name || 'İsimsiz Kullanıcı'}</Text>
                    <Text style={styles.profileEmail}>{user.email}</Text>
                    <View style={styles.verifiedBadge}>
                      <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                      <Text style={styles.verifiedText}>Aktif Üyelik</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.cardDivider} />

                <View style={styles.profileActions}>
                  <TouchableOpacity
                    style={styles.actionBtnSecondary}
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate('AccountSettings')}
                  >
                    <Ionicons name="create-outline" size={17} color="#FFF" style={{ marginRight: 6 }} />
                    <Text style={styles.actionBtnText}>Bilgileri Düzenle</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionBtnDanger}
                    activeOpacity={0.7}
                    onPress={handleLogoutPress}
                  >
                    <Ionicons name="log-out-outline" size={17} color="#FF4D4D" style={{ marginRight: 6 }} />
                    <Text style={styles.actionBtnTextDanger}>Çıkış Yap</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.guestCard}>
                <View style={styles.guestIconCircle}>
                  <Ionicons name="person-outline" size={26} color={COLORS.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.guestTitle}>Misafir Kullanıcı</Text>
                  <Text style={styles.guestSubtitle}>İzleme geçmişinizi ve listelerinizi senkronize etmek için giriş yapın.</Text>
                </View>
                <TouchableOpacity
                  style={styles.guestLoginButton}
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate('Login')}
                >
                  <Text style={styles.guestLoginText}>Giriş Yap</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Önbellek ve Veri Yönetimi */}
            <View style={styles.settingCard}>
              <View style={styles.settingRow}>
                <View style={styles.settingTextWrapper}>
                  <Text style={styles.settingLabel}>Önbellek & Depolama</Text>
                  <Text style={styles.settingDescription}>
                    Kayıtlı resim önbelleklerini ve geçici tarama verilerini temizleyerek hafızada yer açar.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.cacheButton}
                  activeOpacity={0.75}
                  disabled={isClearingCache}
                  onPress={handleClearCache}
                >
                  {isClearingCache ? (
                    <ActivityIndicator size="small" color={COLORS.accent} />
                  ) : (
                    <>
                      <Ionicons name="trash-bin-outline" size={16} color={COLORS.accent} style={{ marginRight: 6 }} />
                      <Text style={styles.cacheButtonText}>Temizle</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* CHILD 2: PLAYER AYARLARI                             */}
        {/* ══════════════════════════════════════════════════════ */}
        {currentSection === 'player' && (
          <View style={styles.childContainer}>
            {loadingPrefs ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={COLORS.accent} />
              </View>
            ) : (
              <>
                {/* Switches (Bitişik Grup) */}
                <View style={styles.menuGroupCard}>
                  <View style={styles.settingRowBitisik}>
                    <View style={styles.settingTextWrapper}>
                      <Text style={styles.settingLabel}>Çift Dokunarak Sarma</Text>
                      <Text style={styles.settingDescription}>Ekranın sol/sağ kenarına çift tıklayarak sarar.</Text>
                    </View>
                    <Switch
                      value={preferences.doubleTapEnabled}
                      onValueChange={(val) => updatePreference('doubleTapEnabled', val)}
                      trackColor={{ false: 'rgba(255,255,255,0.1)', true: COLORS.accent }}
                      thumbColor="#FFF"
                    />
                  </View>

                  <View style={styles.menuRowDividerFull} />

                  <View style={styles.settingRowBitisik}>
                    <View style={styles.settingTextWrapper}>
                      <Text style={styles.settingLabel}>Kaydırarak Sarma (Swipe Seek)</Text>
                      <Text style={styles.settingDescription}>Ekranda parmağınızı yatay kaydırarak sarar.</Text>
                    </View>
                    <Switch
                      value={preferences.swipeSeekEnabled}
                      onValueChange={(val) => updatePreference('swipeSeekEnabled', val)}
                      trackColor={{ false: 'rgba(255,255,255,0.1)', true: COLORS.accent }}
                      thumbColor="#FFF"
                    />
                  </View>

                  <View style={styles.menuRowDividerFull} />

                  <View style={styles.settingRowBitisik}>
                    <View style={styles.settingTextWrapper}>
                      <Text style={styles.settingLabel}>Otomatik İntro Atlama</Text>
                      <Text style={styles.settingDescription}>AniSkip ve fansub ofset verisiyle introyu geçer.</Text>
                    </View>
                    <Switch
                      value={!!preferences.autoSkipIntro}
                      onValueChange={(val) => updatePreference('autoSkipIntro', val)}
                      trackColor={{ false: 'rgba(255,255,255,0.1)', true: COLORS.accent }}
                      thumbColor="#FFF"
                    />
                  </View>
                </View>

                {/* Sarma Süresi */}
                <View style={styles.settingCard}>
                  <Text style={styles.settingLabel}>Sarma Süresi</Text>
                  <Text style={[styles.settingDescription, { marginBottom: SPACING.md }]}>Geri/ileri sarma butonlarının ve çift dokunmanın atlama süresi.</Text>
                  <View style={styles.pillContainer}>
                    {skipIntervalOptions.map((option) => {
                      const isSelected = preferences.skipInterval === option;
                      return (
                        <TouchableOpacity
                          key={option}
                          style={[styles.pillButton, isSelected && styles.pillButtonActive]}
                          activeOpacity={0.7}
                          onPress={() => updatePreference('skipInterval', option)}
                        >
                          <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>{option}sn</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Buton Boyutu */}
                <View style={styles.settingCard}>
                  <Text style={styles.settingLabel}>Oynatıcı Buton Boyutu</Text>
                  <Text style={[styles.settingDescription, { marginBottom: SPACING.md }]}>Oynatıcı arayüzündeki medya kontrollerinin büyüklüğü.</Text>
                  <View style={styles.pillContainer}>
                    {buttonSizeOptions.map((option) => {
                      const isSelected = preferences.buttonSize === option.value;
                      return (
                        <TouchableOpacity
                          key={option.value}
                          style={[styles.pillButton, isSelected && styles.pillButtonActive]}
                          activeOpacity={0.7}
                          onPress={() => updatePreference('buttonSize', option.value)}
                        >
                          <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>{option.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Varsayılan Hız */}
                <View style={styles.settingCard}>
                  <Text style={styles.settingLabel}>Varsayılan Oynatma Hızı</Text>
                  <Text style={[styles.settingDescription, { marginBottom: SPACING.md }]}>Videoların otomatik olarak başlayacağı oynatma hızı.</Text>
                  <View style={styles.pillContainer}>
                    {speedOptions.map((option) => {
                      const isSelected = preferences.defaultSpeed === option;
                      return (
                        <TouchableOpacity
                          key={option}
                          style={[styles.pillButton, isSelected && styles.pillButtonActive]}
                          activeOpacity={0.7}
                          onPress={() => updatePreference('defaultSpeed', option)}
                        >
                          <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>{option === 1.0 ? 'Normal' : `${option}x`}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Video Netlik / AI Filtre */}
                <View style={styles.settingCard}>
                  <Text style={styles.settingLabel}>Video Netlik & AI Filtre Modu</Text>
                  <Text style={[styles.settingDescription, { marginBottom: SPACING.md }]}>Videoların otomatik olarak başlatılacağı keskinleştirme filtresi düzeyi.</Text>
                  <View style={styles.pillContainer}>
                    {clarityOptions.map((option) => {
                      const isSelected = preferences.clarityMode === option.value;
                      return (
                        <TouchableOpacity
                          key={option.value}
                          style={[styles.pillButton, isSelected && styles.pillButtonActive]}
                          activeOpacity={0.7}
                          onPress={() => updatePreference('clarityMode', option.value)}
                        >
                          <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>{option.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Fansub Önceliği */}
                <View style={styles.settingCard}>
                  <Text style={styles.settingLabel}>Fansub Öncelik Sıralaması</Text>
                  <Text style={[styles.settingDescription, { marginBottom: SPACING.md }]}>
                    Bölüm açılırken ilk 3 önceliğinize göre fansub aranır ve otomatik seçilir.
                  </Text>
                  {[0, 1, 2].map((slotIndex) => {
                    const currentPriority = (preferences.fansubPriority && preferences.fansubPriority[slotIndex]) || DEFAULT_PREFERENCES.fansubPriority[slotIndex] || 'TRanimeizle';
                    return (
                      <View key={slotIndex} style={{ marginBottom: slotIndex < 2 ? SPACING.md : 0 }}>
                        <Text style={styles.subSlotLabel}>
                          <Text style={{ color: COLORS.accent, fontWeight: 'bold' }}>{slotIndex + 1}.</Text> Öncelikli Fansub ({currentPriority})
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                          {availableFansubs.map((fs) => {
                            const isSelected = currentPriority.toLowerCase() === fs.toLowerCase();
                            return (
                              <TouchableOpacity
                                key={fs}
                                style={[styles.pillButton, isSelected && styles.pillButtonActive]}
                                activeOpacity={0.7}
                                onPress={() => {
                                  const newPriority = [...(preferences.fansubPriority || DEFAULT_PREFERENCES.fansubPriority)];
                                  newPriority[slotIndex] = fs;
                                  updatePreference('fansubPriority', newPriority);
                                }}
                              >
                                <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>{fs}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    );
                  })}
                </View>

                {/* Sıfırla Butonu */}
                <TouchableOpacity
                  style={styles.resetPrefsButton}
                  activeOpacity={0.75}
                  onPress={handleResetPreferences}
                >
                  <Ionicons name="refresh-outline" size={17} color={COLORS.accent} style={{ marginRight: 6 }} />
                  <Text style={styles.resetPrefsText}>Oynatıcı Ayarlarını Varsayılana Sıfırla</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* CHILD 3: UYGULAMA BİLGİLERİ                         */}
        {/* ══════════════════════════════════════════════════════ */}
        {currentSection === 'info' && (
          <View style={styles.childContainer}>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Uygulama Adı</Text>
                <Text style={styles.infoValHighlight}>Clofthel</Text>
              </View>
              <View style={styles.cardDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Mevcut Sürüm</Text>
                <View style={styles.versionPill}>
                  <Text style={styles.versionPillText}>v{APP_VERSION}</Text>
                </View>
              </View>
              <View style={styles.cardDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Çalışma Ortamı</Text>
                <Text style={styles.infoVal}>{platformLabel}</Text>
              </View>
              <View style={styles.cardDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Geliştirici</Text>
                <Text style={styles.infoVal}>Clofthel Core Team</Text>
              </View>
              <View style={styles.cardDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Altyapı</Text>
                <Text style={styles.infoVal}>React Native / Expo 54</Text>
              </View>
            </View>

            {/* Güncellemeleri Denetle Butonu */}
            <TouchableOpacity
              style={styles.updateCheckButton}
              activeOpacity={0.8}
              disabled={isCheckingUpdate}
              onPress={handleCheckUpdate}
            >
              {isCheckingUpdate ? (
                <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 8 }} />
              ) : (
                <Ionicons name="cloud-download-outline" size={19} color="#D0D0D8" style={{ marginRight: 8 }} />
              )}
              <Text style={styles.updateButtonText}>
                {isCheckingUpdate ? 'Kontrol Ediliyor...' : 'Güncellemeleri Denetle'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.websiteLinkButton}
              activeOpacity={0.75}
              onPress={() => openExternalLink('https://clofthel.com.tr')}
            >
              <Ionicons name="globe-outline" size={18} color={COLORS.textSecondary} style={{ marginRight: 8 }} />
              <Text style={styles.websiteLinkText}>clofthel.com.tr Resmi Web Sitesi</Text>
              <Ionicons name="open-outline" size={16} color={COLORS.textSecondary} style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* CHILD 4: POLİTİKALAR & YASAL                         */}
        {/* ══════════════════════════════════════════════════════ */}
        {currentSection === 'legal' && (
          <View style={styles.childContainer}>
            <View style={styles.policyListCard}>
              {[
                { key: 'terms', title: 'Hizmet Şartları', desc: 'Kullanım koşulları ve kullanıcı sorumlulukları', icon: 'document-text-outline' },
                { key: 'privacy', title: 'Gizlilik Politikası', desc: 'Kişisel verilerin toplanması ve korunması', icon: 'lock-closed-outline' },
                { key: 'security', title: 'Güvenlik Politikası', desc: 'HMAC şifreleme ve sistem güvenlik mimarisi', icon: 'shield-outline' },
                { key: 'dmca', title: 'Telif Hakkı & DMCA', desc: 'Telif hakları bildirimi ve içerik kaldırma süreci', icon: 'alert-circle-outline' }
              ].map((item, index, arr) => (
                <React.Fragment key={item.key}>
                  <TouchableOpacity
                    style={styles.policyRow}
                    activeOpacity={0.7}
                    onPress={() => setSelectedPolicyKey(item.key)}
                  >
                    <View style={styles.policyIconBox}>
                      <Ionicons name={item.icon} size={19} color="#D0D0D8" />
                    </View>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.policyRowTitle}>{item.title}</Text>
                      <Text style={styles.policyRowDesc}>{item.desc}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                  {index < arr.length - 1 && <View style={styles.cardDivider} />}
                </React.Fragment>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Policy Viewer Modal ────────────────────────────── */}
      <Modal
        visible={!!selectedPolicy}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedPolicyKey(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTag}>{selectedPolicy?.tag}</Text>
                <Text style={styles.modalTitle}>{selectedPolicy?.title}</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseButton}
                activeOpacity={0.7}
                onPress={() => setSelectedPolicyKey(null)}
              >
                <Ionicons name="close" size={22} color="#FFF" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
              {selectedPolicy?.sections?.map(sec => (
                <View key={sec.number} style={styles.policySectionCard}>
                  <View style={styles.secHeaderRow}>
                    <Text style={styles.secNumber}>{sec.number}</Text>
                    <Text style={styles.secTitle}>{sec.title}</Text>
                  </View>
                  <Text style={styles.secContent}>{sec.content}</Text>
                </View>
              ))}

              {selectedPolicy?.url && (
                <TouchableOpacity
                  style={styles.externalLinkButton}
                  activeOpacity={0.8}
                  onPress={() => openExternalLink(selectedPolicy.url)}
                >
                  <Ionicons name="globe-outline" size={18} color={COLORS.accent} style={{ marginRight: 8 }} />
                  <Text style={styles.externalLinkText}>Web Sitesinde Görüntüle (clofthel.com.tr)</Text>
                  <Ionicons name="open-outline" size={16} color={COLORS.accent} style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              )}
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
    borderRadius: 12,
    backgroundColor: COLORS.bgSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.title,
    fontWeight: FONT_WEIGHTS.heavy,
  },
  headerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerBadgeText: {
    color: '#A0A0AA',
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  scrollContent: {
    padding: SPACING.lg,
  },
  parentMenuContainer: {
    paddingTop: 2,
  },
  menuGroupCard: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.divider,
    overflow: 'hidden',
  },
  menuRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
  },
  menuIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuRowTextWrapper: {
    flex: 1,
  },
  menuRowTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 2,
  },
  menuRowSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  menuRowDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginLeft: 66,
  },
  menuRowDividerFull: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginHorizontal: 16,
  },
  settingRowBitisik: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  childContainer: {
    gap: SPACING.md,
  },
  profileCard: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.divider,
    ...SHADOWS.card,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  avatarWrapper: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.accentGlowSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.borderAccent,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarLetter: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: FONT_WEIGHTS.bold,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    color: '#FFF',
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 2,
  },
  profileEmail: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.small,
    marginBottom: 6,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  verifiedText: {
    color: COLORS.success,
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  cardDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginVertical: SPACING.md,
  },
  profileActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  actionBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  actionBtnDanger: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: 'rgba(255, 77, 77, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 77, 77, 0.3)',
  },
  actionBtnTextDanger: {
    color: '#FF4D4D',
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  guestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  guestIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  guestTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },
  guestSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  guestLoginButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.accent,
  },
  guestLoginText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.bold,
  },
  settingCard: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  settingTextWrapper: {
    flex: 1,
    paddingRight: SPACING.sm,
  },
  settingLabel: {
    color: '#FFF',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 4,
  },
  settingDescription: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.small,
    lineHeight: 18,
  },
  subSlotLabel: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
    marginBottom: 6,
  },
  pillContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pillButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  pillButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  pillText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
  },
  pillTextActive: {
    color: '#FFF',
    fontWeight: FONT_WEIGHTS.bold,
  },
  cacheButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  cacheButtonText: {
    color: '#E0E0E6',
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  resetPrefsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginTop: 4,
  },
  resetPrefsText: {
    color: '#D0D0D8',
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  infoCard: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoKey: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  infoVal: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.medium,
  },
  infoValHighlight: {
    color: COLORS.accent,
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.bold,
  },
  versionPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  versionPillText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.bold,
  },
  updateCheckButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  updateButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  websiteLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  websiteLinkText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  policyListCard: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: BORDER_RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  policyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    gap: 12,
  },
  policyIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  policyRowTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 2,
  },
  policyRowDesc: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
  },
  loadingBox: {
    padding: SPACING.xxl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 4, 8, 0.85)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#12121E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  modalTag: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: FONT_WEIGHTS.heavy,
    marginTop: 2,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScrollContent: {
    padding: SPACING.lg,
    gap: 12,
  },
  policySectionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 14,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  secHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  secNumber: {
    color: COLORS.accent,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.heavy,
    backgroundColor: COLORS.accentGlowSubtle,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  secTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.bold,
  },
  secContent: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    whiteSpace: 'pre-line',
  },
  externalLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: COLORS.accentGlowSubtle,
    borderWidth: 1,
    borderColor: COLORS.borderAccent,
    marginTop: 8,
    marginBottom: 20,
  },
  externalLinkText: {
    color: COLORS.accent,
    fontSize: 13.5,
    fontWeight: FONT_WEIGHTS.bold,
  },
});
