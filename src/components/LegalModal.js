import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Linking, Image } from 'react-native';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SPACING } from '../constants/theme';

export default function LegalModal({ visible, onAccept }) {
  const openLink = (url) => {
    Linking.openURL(url).catch((err) => console.error("URL açılamadı:", err));
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={true}>
      <View style={[styles.container, { backgroundColor: 'rgba(0, 0, 0, 0.85)' }]}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>Hoş Geldiniz!</Text>
          <Text style={styles.description}>
            Clofthel'i kullanmaya başlamadan önce, topluluğumuzun bir parçası olmak ve güvenli bir deneyim yaşamak için aşağıdaki yasal metinlerimizi okuyup kabul etmeniz gerekmektedir.
          </Text>

          <View style={styles.linksContainer}>
            <TouchableOpacity style={styles.linkButton} onPress={() => openLink('https://clofthel.com.tr/terms-of-service')}>
              <Text style={styles.linkIcon}>📄</Text>
              <Text style={styles.linkText}>Hizmet Şartları</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.linkButton} onPress={() => openLink('https://clofthel.com.tr/privacy-policy')}>
              <Text style={styles.linkIcon}>🔒</Text>
              <Text style={styles.linkText}>Gizlilik Politikası</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.linkButton} onPress={() => openLink('https://clofthel.com.tr/security-policy')}>
              <Text style={styles.linkIcon}>🛡️</Text>
              <Text style={styles.linkText}>Güvenlik Politikası</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.acceptButton} onPress={onAccept}>
            <Text style={styles.acceptButtonText}>Kabul Ediyorum ve Devam Et</Text>
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
    padding: SPACING.lg,
  },
  modalContent: {
    width: '100%',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.xxl,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  description: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.md,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 22,
  },
  linksContainer: {
    width: '100%',
    marginBottom: SPACING.xl,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgPrimary,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  linkIcon: {
    fontSize: FONT_SIZES.lg,
    marginRight: SPACING.md,
  },
  linkText: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  acceptButton: {
    backgroundColor: COLORS.accent,
    width: '100%',
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#FFF',
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
});
