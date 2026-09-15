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
  Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import { AuthContext } from '../context/AuthContext';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { useAlert } from '../context/AlertContext';

let GoogleSignin = null;
try {
  GoogleSignin = require('@react-native-google-signin/google-signin').GoogleSignin;
} catch (e) {
  console.warn('[LoginScreen] @react-native-google-signin/google-signin not available in current runtime (e.g. Expo Go).');
}

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen({ navigation }) {
  const { login, googleLogin, loginAsTestUser, forgotPassword, resetPassword } = useContext(AuthContext);
  const { showAlert } = useAlert();

  React.useEffect(() => {
    if (GoogleSignin && typeof GoogleSignin.configure === 'function') {
      try {
        GoogleSignin.configure({
          webClientId: '732024089569-c3cnb2soqe1me7ilp5k714nh7crdgth3.apps.googleusercontent.com',
        });
      } catch (e) {}
    }
  }, []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // ── Forgot Password Modal State ──────────────────────────────
  const [isForgotModalVisible, setForgotModalVisible] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); // 1: Email, 2: Code + New Password
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [isForgotLoading, setIsForgotLoading] = useState(false);
  const [showForgotNewPassword, setShowForgotNewPassword] = useState(false);

  const handleOpenForgotModal = () => {
    setForgotEmail((email || '').trim().toLowerCase());
    setForgotCode('');
    setForgotNewPassword('');
    setForgotStep(1);
    setForgotModalVisible(true);
  };

  const handleRequestResetCode = async () => {
    const cleanForgotEmail = (forgotEmail || '').trim().toLowerCase();
    if (!cleanForgotEmail) {
      showAlert('Hata', 'Lütfen e-posta adresinizi girin.');
      return;
    }
    setIsForgotLoading(true);
    const result = await forgotPassword(cleanForgotEmail);
    setIsForgotLoading(false);

    if (result.success) {
      showAlert('Kod Gönderildi', result.message || '6 haneli sıfırlama kodu e-postanıza gönderildi.');
      setForgotStep(2);
    } else {
      showAlert('Hata', result.error || 'Şifre sıfırlama kodu gönderilemedi.');
    }
  };

  const handleConfirmResetPassword = async () => {
    const cleanForgotEmail = (forgotEmail || '').trim().toLowerCase();
    if (!forgotCode || forgotCode.trim().length !== 6) {
      showAlert('Hata', 'Lütfen 6 haneli kodu eksiksiz girin.');
      return;
    }
    if (!forgotNewPassword || forgotNewPassword.length < 6) {
      showAlert('Hata', 'Yeni şifreniz en az 6 karakter olmalıdır.');
      return;
    }

    setIsForgotLoading(true);
    const result = await resetPassword(cleanForgotEmail, forgotCode.trim(), forgotNewPassword);
    setIsForgotLoading(false);

    if (result.success) {
      setForgotModalVisible(false);
      showAlert('Başarılı', 'Şifreniz başarıyla sıfırlandı ve oturumunuz açıldı.', [
        { text: 'Devam Et', onPress: () => navigation.replace('Home') }
      ]);
    } else {
      showAlert('Hata', result.error || 'Şifre sıfırlanamadı.');
    }
  };

  const handleDevLogin = async () => {
    setIsLoading(true);
    await loginAsTestUser();
    setIsLoading(false);
    navigation.replace('Home');
  };

  const handleLogin = async () => {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !password) {
      showAlert('Hata', 'Lütfen e-posta ve şifrenizi girin.');
      return;
    }

    setIsLoading(true);
    const result = await login(cleanEmail, password);
    setIsLoading(false);

    if (result.success) {
      navigation.replace('Home');
    } else {
      if (result.requiresVerification) {
        showAlert('Doğrulama Gerekli', result.error, [
          { text: 'Doğrula', onPress: () => navigation.replace('Verification', { email: result.email || cleanEmail }) }
        ]);
      } else {
        showAlert('Giriş Başarısız', result.error);
      }
    }
  };

  const handleGoogleLogin = async () => {
    if (!GoogleSignin) {
      showAlert('Geliştirici Uyarısı', 'Google ile Giriş özelliği standart Expo Go ortamında desteklenmez. Lütfen e-posta/şifre ile giriş yapın veya derlenmiş APK kullanın.');
      return;
    }

    try {
      setIsLoading(true);
      await GoogleSignin.hasPlayServices();
      
      try {
        await GoogleSignin.signOut();
      } catch (e) {
      }

      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken || userInfo.idToken;
      
      const result = await googleLogin(idToken, userInfo.data?.user?.email || userInfo.user?.email || 'dummy@google.com', userInfo.data?.user?.name || userInfo.user?.name || 'Google User', '');
      setIsLoading(false);

      if (result.success) {
        navigation.replace('Home');
      } else {
        showAlert('Google Giriş Hatası', result.error);
      }
    } catch (error) {
      setIsLoading(false);
      if (error.code !== 'ASYNC_OP_IN_PROGRESS' && error.code !== 'SIGN_IN_CANCELLED') {
        showAlert('Hata', 'Google ile giriş iptal edildi veya başarısız oldu. Hata: ' + error.message);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.keyboardView} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.headerBar}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.replace('Home')}
          >
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.headerContainer}>
            <Text style={styles.title}>Hoş Geldiniz</Text>
            <Text style={styles.subtitle}>En sevdiğin animeleri kesintisiz izlemeye devam et.</Text>
          </View>

          <View style={styles.formContainer}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>E-Posta</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="ornek@email.com"
                  placeholderTextColor={COLORS.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Şifre</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Şifreniz"
                  placeholderTextColor={COLORS.textSecondary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.forgotPassword} onPress={handleOpenForgotModal} activeOpacity={0.7}>
              <Text style={styles.forgotPasswordText}>Şifremi Unuttum</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
            >
              <LinearGradient
                colors={[COLORS.accent, COLORS.accentDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.loginGradient}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.loginButtonText}>Giriş Yap</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.devTestButton}
              onPress={handleDevLogin}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              <Ionicons name="flash" size={18} color={COLORS.accent} style={{ marginRight: 8 }} />
              <Text style={styles.devTestButtonText}>Test / Geliştirici Hesabı ile Hızlı Giriş</Text>
            </TouchableOpacity>

            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>VEYA</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity 
              style={styles.googleButton}
              onPress={handleGoogleLogin}
              disabled={isLoading}
            >
              <Ionicons name="logo-google" size={20} color="#DB4437" style={styles.googleIcon} />
              <Text style={styles.googleButtonText}>Google ile Giriş Yap</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Hesabın yok mu? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.footerLink}>Hemen Kayıt Ol</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Şifremi Unuttum Modalı */}
      <Modal
        visible={isForgotModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setForgotModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Ionicons name="key-outline" size={22} color={COLORS.accent} style={{ marginRight: 8 }} />
                <Text style={styles.modalTitle}>
                  {forgotStep === 1 ? 'Şifremi Unuttum' : 'Yeni Şifre Belirle'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setForgotModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color="#AAA" />
              </TouchableOpacity>
            </View>

            {forgotStep === 1 ? (
              <View>
                <Text style={styles.modalSubtitle}>
                  Hesabınıza ait e-posta adresini girin. Size 6 haneli bir sıfırlama kodu göndereceğiz.
                </Text>

                <View style={styles.modalInputGroup}>
                  <Text style={styles.label}>E-Posta Adresi</Text>
                  <View style={styles.inputContainer}>
                    <Ionicons name="mail-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="ornek@mail.com"
                      placeholderTextColor={COLORS.textSecondary}
                      value={forgotEmail}
                      onChangeText={setForgotEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                <TouchableOpacity 
                  style={[styles.modalActionBtn, isForgotLoading && styles.loginButtonDisabled]}
                  onPress={handleRequestResetCode}
                  disabled={isForgotLoading}
                >
                  <LinearGradient
                    colors={[COLORS.accent, COLORS.accentDark]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.modalActionGradient}
                  >
                    {isForgotLoading ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <Text style={styles.loginButtonText}>Sıfırlama Kodu Gönder</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text style={styles.modalSubtitle}>
                  <Text style={{ fontWeight: 'bold', color: COLORS.textPrimary }}>{forgotEmail}</Text> adresine gönderilen 6 haneli kodu ve yeni şifrenizi girin.
                </Text>

                <View style={styles.modalInputGroup}>
                  <Text style={styles.label}>6 Haneli Kod</Text>
                  <View style={styles.inputContainer}>
                    <Ionicons name="keypad-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="123456"
                      placeholderTextColor={COLORS.textSecondary}
                      value={forgotCode}
                      onChangeText={(t) => setForgotCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                      keyboardType="number-pad"
                      maxLength={6}
                    />
                  </View>
                </View>

                <View style={styles.modalInputGroup}>
                  <Text style={styles.label}>Yeni Şifre (En az 6 karakter)</Text>
                  <View style={styles.inputContainer}>
                    <Ionicons name="lock-closed-outline" size={20} color={COLORS.textSecondary} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Yeni şifreniz"
                      placeholderTextColor={COLORS.textSecondary}
                      value={forgotNewPassword}
                      onChangeText={setForgotNewPassword}
                      secureTextEntry={!showForgotNewPassword}
                    />
                    <TouchableOpacity onPress={() => setShowForgotNewPassword(!showForgotNewPassword)} style={styles.eyeIcon}>
                      <Ionicons name={showForgotNewPassword ? "eye-off-outline" : "eye-outline"} size={20} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity 
                  style={[styles.modalActionBtn, isForgotLoading && styles.loginButtonDisabled]}
                  onPress={handleConfirmResetPassword}
                  disabled={isForgotLoading}
                >
                  <LinearGradient
                    colors={[COLORS.accent, COLORS.accentDark]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.modalActionGradient}
                  >
                    {isForgotLoading ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <Text style={styles.loginButtonText}>Şifreyi Güncelle & Giriş Yap</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.modalBackStepBtn}
                  onPress={() => setForgotStep(1)}
                >
                  <Text style={styles.modalBackStepText}>Farklı bir e-posta dene</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  headerBar: {
    height: 56,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  backButton: {
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
    marginBottom: 40,
  },
  title: {
    color: '#FFF',
    fontSize: 32,
    fontWeight: FONT_WEIGHTS.heavy,
    marginBottom: SPACING.sm,
    letterSpacing: -0.5,
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    lineHeight: 22,
  },
  formContainer: {
    marginBottom: 40,
  },
  inputGroup: {
    marginBottom: SPACING.lg,
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
    height: 56,
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
  eyeIcon: {
    padding: SPACING.sm,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: SPACING.xl,
  },
  forgotPasswordText: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.body - 1,
    fontWeight: FONT_WEIGHTS.medium,
  },
  loginButton: {
    height: 56,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.glow,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#FFF',
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 0.5,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 'auto',
    marginBottom: SPACING.xxl,
  },
  footerText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
  },
  footerLink: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACING.xl,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.divider,
  },
  dividerText: {
    color: COLORS.textSecondary,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.bold,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    height: 56,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.glow,
  },
  googleIcon: {
    marginRight: SPACING.md,
  },
  googleButtonText: {
    color: '#000',
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
  },
  devTestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    borderWidth: 1,
    borderColor: COLORS.accent,
    height: 52,
    borderRadius: BORDER_RADIUS.lg,
    marginTop: SPACING.md,
  },
  devTestButtonText: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#161922',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    ...SHADOWS.glow,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSubtitle: {
    fontSize: FONT_SIZES.caption,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: SPACING.lg,
  },
  modalInputGroup: {
    marginBottom: SPACING.md,
  },
  modalActionBtn: {
    height: 50,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    marginTop: SPACING.sm,
  },
  modalActionGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackStepBtn: {
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  modalBackStepText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.caption,
    textDecorationLine: 'underline',
  },
});
