import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { getPlayerPreferences, savePlayerPreferences, DEFAULT_PREFERENCES } from '../utils/preferences';

export default function PlayerSettingsScreen({ navigation }) {
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPrefs = async () => {
      const prefs = await getPlayerPreferences();
      setPreferences(prefs);
      setLoading(false);
    };
    loadPrefs();
  }, []);

  const updatePreference = async (key, value) => {
    if (!preferences) return;
    const updated = { ...preferences, [key]: value };
    setPreferences(updated);
    await savePlayerPreferences(updated);
  };

  if (loading || !preferences) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Player Ayarları</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={COLORS.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const skipIntervalOptions = [5, 10, 15, 30, 85];
  const speedOptions = [0.5, 1.0, 1.25, 1.5, 2.0];
  const buttonSizeOptions = [
    { label: 'Küçük', value: 'small' },
    { label: 'Normal', value: 'medium' },
    { label: 'Büyük', value: 'large' }
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Player Ayarları</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* Gestures Section */}
        <Text style={styles.sectionTitle}>Kontroller & Hareketler</Text>

        <View style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingTextWrapper}>
              <Text style={styles.settingLabel}>Çift Dokunarak Sarma</Text>
              <Text style={styles.settingDescription}>Ekranın sol/sağ yarısına çift tıklayarak videoyu sarar.</Text>
            </View>
            <Switch
              value={preferences.doubleTapEnabled}
              onValueChange={(val) => updatePreference('doubleTapEnabled', val)}
              trackColor={{ false: COLORS.bgSecondary, true: COLORS.accentGlow }}
              thumbColor={preferences.doubleTapEnabled ? COLORS.accent : COLORS.textMuted}
            />
          </View>
        </View>

        <View style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingTextWrapper}>
              <Text style={styles.settingLabel}>Kaydırarak Sarma</Text>
              <Text style={styles.settingDescription}>Ekranda parmağınızı yatay kaydırarak videoyu sarar.</Text>
            </View>
            <Switch
              value={preferences.swipeSeekEnabled}
              onValueChange={(val) => updatePreference('swipeSeekEnabled', val)}
              trackColor={{ false: COLORS.bgSecondary, true: COLORS.accentGlow }}
              thumbColor={preferences.swipeSeekEnabled ? COLORS.accent : COLORS.textMuted}
            />
          </View>
        </View>

        {/* Configurations Section */}
        <Text style={styles.sectionTitle}>Sarma & Boyut Seçenekleri</Text>

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
                  onPress={() => updatePreference('skipInterval', option)}
                >
                  <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>{option}sn</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.settingCard}>
          <Text style={styles.settingLabel}>Buton Boyutu</Text>
          <Text style={[styles.settingDescription, { marginBottom: SPACING.md }]}>Oynatıcı arayüzündeki kontrol butonlarının büyüklüğü.</Text>
          <View style={styles.pillContainer}>
            {buttonSizeOptions.map((option) => {
              const isSelected = preferences.buttonSize === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.pillButton, isSelected && styles.pillButtonActive]}
                  onPress={() => updatePreference('buttonSize', option.value)}
                >
                  <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Video Defaults Section */}
        <Text style={styles.sectionTitle}>Varsayılan Video Ayarları</Text>

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
                  onPress={() => updatePreference('defaultSpeed', option)}
                >
                  <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>{option === 1.0 ? 'Normal' : `${option}x`}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingTextWrapper}>
              <Text style={styles.settingLabel}>Varsayılan Ultra-Clarity (AI)</Text>
              <Text style={styles.settingDescription}>Videoları otomatik olarak 4K AI keskinleştirme modu aktif olarak açar.</Text>
            </View>
            <Switch
              value={preferences.ultraClarityEnabled}
              onValueChange={(val) => updatePreference('ultraClarityEnabled', val)}
              trackColor={{ false: COLORS.bgSecondary, true: COLORS.accentGlow }}
              thumbColor={preferences.ultraClarityEnabled ? COLORS.accent : COLORS.textMuted}
            />
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  content: {
    padding: SPACING.lg,
  },
  sectionTitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
    paddingLeft: SPACING.sm,
  },
  settingCard: {
    backgroundColor: COLORS.bgElevated,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.divider,
    ...SHADOWS.card,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  settingTextWrapper: {
    flex: 1,
  },
  settingLabel: {
    color: '#FFF',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 4,
  },
  settingDescription: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  pillContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pillButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm - 2,
    borderRadius: BORDER_RADIUS.pill,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  pillButtonActive: {
    backgroundColor: COLORS.accentGlowSubtle,
    borderColor: COLORS.accent,
  },
  pillText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.medium,
  },
  pillTextActive: {
    color: COLORS.accent,
    fontWeight: FONT_WEIGHTS.bold,
  },
});
