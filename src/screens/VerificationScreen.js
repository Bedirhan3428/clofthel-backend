import React, { useState, useContext, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { AuthContext } from '../context/AuthContext';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { useAlert } from '../context/AlertContext';

export default function VerificationScreen({ route, navigation }) {
  const { verifyEmail, resendCode } = useContext(AuthContext);
  const { showAlert } = useAlert();
  const email = route?.params?.email || '';

  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  const handleVerify = async () => {
    if (!code || code.length !== 6) {
      showAlert('Hata', 'Lütfen 6 haneli doğrulama kodunu tam girin.');
      return;
    }

    setIsLoading(true);
    const result = await verifyEmail(email, code);
    setIsLoading(false);

    if (result.success) {
      navigation.replace('Home');
    } else {
      showAlert('Doğrulama Başarısız', result.error);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;

    setIsResending(true);
    const result = await resendCode(email);
    setIsResending(false);

    if (result.success) {
      showAlert('Başarılı', 'Yeni doğrulama kodu gönderildi.');
      setCountdown(60); // 60 saniye bekleme süresi
    } else {
      showAlert('Hata', result.error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.keyboardView} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.navigate('Login')}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>

        <View style={styles.content}>
          <View style={styles.headerContainer}>
            <View style={styles.iconWrapper}>
              <Ionicons name="mail-unread-outline" size={48} color={COLORS.accent} />
            </View>
            <Text style={styles.title}>E-Postanı Doğrula</Text>
            <Text style={styles.subtitle}>
              <Text style={{fontWeight: 'bold', color: COLORS.textPrimary}}>{email}</Text> adresine 6 haneli bir doğrulama kodu gönderdik.
            </Text>
          </View>

          <View style={styles.formContainer}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Doğrulama Kodu</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="keypad-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="000000"
                  placeholderTextColor={COLORS.textSecondary}
                  value={code}
                  onChangeText={(text) => setCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus={true}
                />
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.verifyButton, (isLoading || code.length !== 6) && styles.verifyButtonDisabled]}
              onPress={handleVerify}
              disabled={isLoading || code.length !== 6}
            >
              <LinearGradient
                colors={[COLORS.accent, COLORS.accentDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.verifyGradient}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.verifyButtonText}>Kodu Doğrula</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.resendButton} 
              onPress={handleResend}
              disabled={isResending || countdown > 0}
            >
              {isResending ? (
                <ActivityIndicator color={COLORS.accent} size="small" />
              ) : (
                <Text style={[styles.resendText, countdown > 0 && styles.resendTextDisabled]}>
                  {countdown > 0 ? `Tekrar Gönder (${countdown}s)` : 'Kodu Tekrar Gönder'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  keyboardView: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 40 : 10,
    left: SPACING.lg,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.xl,
    justifyContent: 'center',
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconWrapper: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: COLORS.accentGlowSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
    ...SHADOWS.glow,
  },
  title: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: FONT_WEIGHTS.heavy,
    marginBottom: SPACING.sm,
    letterSpacing: -0.5,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: SPACING.md,
  },
  formContainer: {
    marginBottom: 40,
  },
  inputGroup: {
    marginBottom: SPACING.xl,
  },
  label: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    height: 60,
  },
  inputIcon: {
    marginRight: SPACING.md,
  },
  input: {
    flex: 1,
    color: '#FFF',
    fontSize: 24,
    letterSpacing: 8,
    fontWeight: FONT_WEIGHTS.bold,
    height: '100%',
  },
  verifyButton: {
    height: 56,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    marginBottom: SPACING.xl,
    ...SHADOWS.glow,
  },
  verifyButtonDisabled: {
    opacity: 0.5,
  },
  verifyGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifyButtonText: {
    color: '#FFF',
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 0.5,
  },
  resendButton: {
    alignItems: 'center',
    padding: SPACING.sm,
  },
  resendText: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  resendTextDisabled: {
    color: COLORS.textSecondary,
  }
});
