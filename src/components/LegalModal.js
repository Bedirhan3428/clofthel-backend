import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SPACING, SHADOWS } from '../constants/theme';

export default function LegalModal({ visible, onAccept }) {
  const [checked, setChecked] = useState(false);

  const openLink = (url) => {
    Linking.openURL(url).catch((err) => console.error("URL açılamadı:", err));
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={true}>
      <View style={[styles.container, { backgroundColor: 'rgba(4, 4, 8, 0.95)' }]}>
        
        {/* Ambient Glows */}
        <View style={styles.ambientGlow} pointerEvents="none">
          <LinearGradient
            colors={['rgba(255, 107, 0, 0.15)', 'transparent']}
            style={styles.glowOrange}
          />
        </View>

        <View style={styles.modalContent}>
          {/* Top Shield Header */}
          <View style={styles.iconCircle}>
            <LinearGradient
              colors={['rgba(255, 107, 0, 0.2)', 'rgba(255, 107, 0, 0.02)']}
              style={StyleSheet.absoluteFillObject}
            />
            <Ionicons name="shield-checkmark-sharp" size={36} color={COLORS.accent} />
          </View>

          <Text style={styles.title}>Yasal Onay Gerekli</Text>
          
          <Text style={styles.description}>
            Uygulamamızı kullanmaya başlamadan önce, güvenliğiniz ve topluluk kurallarımız gereği yasal sözleşmeleri okuyup onaylamanız gerekmektedir.
          </Text>

          {/* Documents Row List */}
          <View style={styles.linksContainer}>
            <TouchableOpacity 
              style={styles.linkRow} 
              activeOpacity={0.7}
              onPress={() => openLink('https://clofthel.com.tr/terms-of-services')}
            >
              <View style={styles.linkLeft}>
                <View style={styles.iconWrapper}>
                  <Ionicons name="document-text" size={18} color={COLORS.accent} />
                </View>
                <Text style={styles.linkText}>Hizmet Şartları</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.linkRow} 
              activeOpacity={0.7}
              onPress={() => openLink('https://clofthel.com.tr/privacy-policy')}
            >
              <View style={styles.linkLeft}>
                <View style={styles.iconWrapper}>
                  <Ionicons name="lock-closed" size={18} color={COLORS.accent} />
                </View>
                <Text style={styles.linkText}>Gizlilik Politikası</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.linkRow} 
              activeOpacity={0.7}
              onPress={() => openLink('https://clofthel.com.tr/security-policy')}
            >
              <View style={styles.linkLeft}>
                <View style={styles.iconWrapper}>
                  <Ionicons name="shield" size={18} color={COLORS.accent} />
                </View>
                <Text style={styles.linkText}>Güvenlik Politikası</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Custom Checkbox (Tickbox) */}
          <TouchableOpacity 
            style={styles.checkboxRow} 
            activeOpacity={0.8}
            onPress={() => setChecked(!checked)}
          >
            <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
              {checked && <Ionicons name="checkmark-sharp" size={14} color="#FFF" />}
            </View>
            <Text style={styles.checkboxText}>
              Yukarıda belirtilen tüm yasal şartları, gizlilik ve güvenlik politikalarını okudum ve onaylıyorum.
            </Text>
          </TouchableOpacity>

          {/* Accept Action Button */}
          <TouchableOpacity 
            style={[styles.acceptButton, !checked && styles.acceptButtonDisabled]} 
            onPress={onAccept}
            disabled={!checked}
          >
            <LinearGradient
              colors={checked ? [COLORS.accent, COLORS.accentDark] : ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.04)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.acceptGradient}
            >
              <Text style={[styles.acceptButtonText, !checked && styles.acceptButtonTextDisabled]}>
                Onayla ve Devam Et
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  ambientGlow: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: -1,
  },
  glowOrange: {
    width: 300,
    height: 300,
    borderRadius: 150,
    opacity: 0.8,
  },
  modalContent: {
    width: '100%',
    backgroundColor: 'rgba(18, 18, 30, 0.90)',
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.xl,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 107, 0, 0.25)',
    ...SHADOWS.glow,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 107, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: FONT_WEIGHTS.heavy,
    marginBottom: SPACING.sm,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  description: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 20,
    paddingHorizontal: SPACING.sm,
  },
  linksContainer: {
    width: '100%',
    marginBottom: SPACING.xl,
    gap: SPACING.sm,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  linkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  iconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 107, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
    paddingHorizontal: SPACING.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent,
  },
  checkboxText: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  acceptButton: {
    width: '100%',
    height: 54,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.glow,
  },
  acceptButtonDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  acceptGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#FFF',
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
  },
  acceptButtonTextDisabled: {
    color: 'rgba(255, 255, 255, 0.25)',
  },
});
