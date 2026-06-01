import React, { createContext, useState, useContext } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../constants/theme';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';

export const AlertContext = createContext();

export const useAlert = () => useContext(AlertContext);

export const AlertProvider = ({ children }) => {
  const [alertData, setAlertData] = useState({
    visible: false,
    title: '',
    message: '',
    buttons: [],
    options: { cancelable: true }
  });

  const showAlert = (title, message, buttons = [], options = { cancelable: true }) => {
    setAlertData({
      visible: true,
      title,
      message,
      buttons: buttons.length ? buttons : [{ text: 'Tamam' }],
      options
    });
  };

  const hideAlert = () => {
    setAlertData(prev => ({ ...prev, visible: false }));
  };

  const isError = alertData.title.toLowerCase().includes('hata') || alertData.title.toLowerCase().includes('başarısız');
  const isSuccess = alertData.title.toLowerCase().includes('başarılı');

  const getIconName = () => {
    if (isError) return 'warning';
    if (isSuccess) return 'checkmark-circle';
    return 'information-circle';
  };

  const getIconColor = () => {
    if (isError) return '#FF3B30';
    if (isSuccess) return '#34C759';
    return COLORS.accent;
  };

  return (
    <AlertContext.Provider value={{ showAlert, hideAlert }}>
      {children}
      
      <Modal 
        visible={alertData.visible} 
        transparent 
        animationType="fade" 
        statusBarTranslucent
        onRequestClose={alertData.options?.cancelable !== false ? hideAlert : () => {}}
      >
        <TouchableWithoutFeedback onPress={alertData.options?.cancelable !== false ? hideAlert : () => {}}>
          <View style={styles.overlay}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)' }]} />
            <TouchableWithoutFeedback>
              <View style={styles.alertBox}>
                <View style={[styles.iconWrapper, { backgroundColor: getIconColor() + '20' }]}>
                  <Ionicons name={getIconName()} size={32} color={getIconColor()} />
                </View>
                
                <Text style={styles.title}>{alertData.title}</Text>
                {alertData.message ? <Text style={styles.message}>{alertData.message}</Text> : null}
                
                <View style={[styles.buttonsContainer, alertData.buttons.length > 1 && { flexDirection: 'row' }]}>
                  {alertData.buttons.map((btn, idx) => {
                    const isCancel = btn.style === 'cancel';
                    const isDestructive = btn.style === 'destructive';
                    
                    return (
                      <TouchableOpacity 
                        key={idx} 
                        style={[
                          styles.button, 
                          isCancel ? styles.buttonCancel : 
                          isDestructive ? styles.buttonDestructive : 
                          styles.buttonDefault,
                          alertData.buttons.length > 1 && { flex: 1, marginHorizontal: 4 }
                        ]}
                        onPress={() => {
                          hideAlert();
                          if (btn.onPress) btn.onPress();
                        }}
                      >
                        {(!isCancel && !isDestructive) ? (
                          <LinearGradient
                            colors={[COLORS.accent, COLORS.accentDark]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.gradientBg}
                          >
                            <Text style={[styles.buttonText, { color: '#FFF' }]}>{btn.text}</Text>
                          </LinearGradient>
                        ) : (
                          <Text style={[
                            styles.buttonText, 
                            isCancel && styles.textCancel,
                            isDestructive && styles.textDestructive
                          ]}>
                            {btn.text}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </AlertContext.Provider>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  alertBox: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: COLORS.bgElevated,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.divider,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    color: '#FFF',
    fontSize: FONT_SIZES.title,
    fontWeight: FONT_WEIGHTS.heavy,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  message: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 22,
  },
  buttonsContainer: {
    width: '100%',
    flexDirection: 'column',
    gap: SPACING.md,
  },
  button: {
    height: 48,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradientBg: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDefault: {
    backgroundColor: COLORS.accent, // fallback if gradient fails
  },
  buttonCancel: {
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  buttonDestructive: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.3)',
  },
  buttonText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },
  textCancel: {
    color: COLORS.textPrimary,
  },
  textDestructive: {
    color: '#FF3B30',
  }
});
