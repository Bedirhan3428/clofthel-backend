import React, { useState, useContext } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthContext } from '../context/AuthContext';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { useAlert } from '../context/AlertContext';
import { updateName, updateEmail } from '../services/api';

export default function AccountSettingsScreen({ navigation }) {
  const { user, updateUserName, logout } = useContext(AuthContext);
  const { showAlert } = useAlert();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [isNameLoading, setIsNameLoading] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);

  const handleUpdateName = async () => {
    if (!name.trim()) {
      showAlert('Hata', 'İsim alanı boş bırakılamaz.');
      return;
    }

    setIsNameLoading(true);
    const res = await updateName(name.trim());
    setIsNameLoading(false);

    if (res && res.success) {
      updateUserName(name.trim());
      showAlert('Başarılı', 'İsminiz başarıyla güncellendi.');
    } else {
      showAlert('Hata', res?.error || 'İsim güncellenirken bir hata oluştu.');
    }
  };

  const handleUpdateEmail = async () => {
    if (!email.trim()) {
      showAlert('Hata', 'E-posta alanı boş bırakılamaz.');
      return;
    }

    const newEmail = email.toLowerCase().trim();
    if (newEmail === user?.email?.toLowerCase()) {
      showAlert('Hata', 'Lütfen mevcut e-posta adresinizden farklı bir adres girin.');
      return;
    }

    // Callout warning before email modification
    showAlert(
      'E-posta Değişikliği',
      'E-posta adresinizi değiştirdiğinizde hesabınız geçici olarak devre dışı bırakılacaktır. Yeni e-postanıza gönderilecek doğrulama koduyla hesabınızı tekrar aktifleştirmeniz gerekecektir. Devam etmek istiyor musunuz?',
      [
        { text: 'İptal', style: 'cancel' },
        { 
          text: 'Evet, Güncelle', 
          style: 'destructive',
          onPress: async () => {
            setIsEmailLoading(true);
            const res = await updateEmail(newEmail);
            setIsEmailLoading(false);

            if (res && res.success) {
              showAlert(
                'Kod Gönderildi',
                'E-posta adresiniz başarıyla güncellendi. Lütfen yeni adresinize gönderilen 6 haneli kodu doğrulayın.',
                [
                  {
                    text: 'Tamam',
                    onPress: async () => {
                      // 1. Log out the user (clears AsyncStorage and context token)
                      await logout();
                      // 2. Redirect to verification screen with the new email
                      navigation.reset({
                        index: 0,
                        routes: [{ name: 'Verification', params: { email: newEmail } }],
                      });
                    }
                  }
                ]
              );
            } else {
              showAlert('Hata', res?.error || 'E-posta güncellenirken bir hata oluştu.');
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hesap Ayarları</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 80}
      >
        <ScrollView 
          contentContainerStyle={styles.content} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* İsim Güncelleme Kartı */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Profil Bilgileri</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Görünen İsim</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="İsminiz"
                  placeholderTextColor={COLORS.textMuted}
                  value={name}
                  onChangeText={setName}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.button, isNameLoading && styles.buttonDisabled]}
              onPress={handleUpdateName}
              disabled={isNameLoading}
            >
              {isNameLoading ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.buttonText}>İsmi Güncelle</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* E-posta Güncelleme Kartı */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Hesap Güvenliği</Text>

            {/* Bilgilendirme Kutusu (Callout Alert) */}
            <View style={styles.warningBox}>
              <View style={styles.warningHeader}>
                <Ionicons name="warning-outline" size={18} color={COLORS.warning} />
                <Text style={styles.warningTitle}>Önemli Uyarı</Text>
              </View>
              <Text style={styles.warningText}>
                E-posta adresinizi değiştirdiğinizde hesabınız doğrulanmamış duruma geçecek ve yeni adrese doğrulama maili gönderilecektir. Hesabınızı tekrar doğrulamadan sistemi kullanamazsınız.
              </Text>
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>E-posta Adresi</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="E-posta adresiniz"
                  placeholderTextColor={COLORS.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.button, isEmailLoading && styles.buttonDisabled]}
              onPress={handleUpdateEmail}
              disabled={isEmailLoading}
            >
              {isEmailLoading ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.buttonText}>E-postayı Güncelle</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  content: {
    padding: SPACING.lg,
    gap: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.bgElevated,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.divider,
    ...SHADOWS.card,
  },
  cardTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.lg,
  },
  inputGroup: {
    marginBottom: SPACING.lg,
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    height: 50,
  },
  inputIcon: {
    marginRight: SPACING.md,
  },
  input: {
    flex: 1,
    color: '#FFF',
    fontSize: FONT_SIZES.body,
    height: '100%',
  },
  button: {
    backgroundColor: COLORS.accent,
    height: 48,
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.sm,
    ...SHADOWS.glow,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFF',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },
  warningBox: {
    backgroundColor: 'rgba(255, 179, 0, 0.1)',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 179, 0, 0.25)',
    marginBottom: SPACING.lg,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: 4,
  },
  warningTitle: {
    color: COLORS.warning,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },
  warningText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body - 1,
    lineHeight: 18,
  },
});
