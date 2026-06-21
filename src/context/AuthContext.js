import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../constants/config';
import { apiFetch, acceptLegalWarningApi } from '../services/api';
import { registerForPushNotificationsAsync, sendPushTokenToBackend } from '../services/pushNotifications';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userToken, setUserToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBotBypassed, setBotBypassed] = useState(false);

  // Uygulama açıldığında token'ı kontrol et
  const checkToken = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (token) {
        // Token varsa doğrulamak için backend'e sor
        const res = await apiFetch(`${API_BASE_URL}/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        const data = await res.json();
        if (data.success && data.user) {
          setUser(data.user);
          setUserToken(token);
          
          // Push token kaydet
          const pushToken = await registerForPushNotificationsAsync();
          if (pushToken) {
            await sendPushTokenToBackend(pushToken);
          }
        } else {
          // Token geçersizse temizle
          await AsyncStorage.removeItem('userToken');
          setUser(null);
          setUserToken(null);
        }
      }
    } catch (e) {
      console.warn('Auth token check error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkToken();
  }, []);

  const login = async (email, password) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      
      if (data.success) {
        await AsyncStorage.setItem('userToken', data.token);
        setUserToken(data.token);
        setUser(data.user);
        return { success: true };
      } else {
        // Eğer hesap doğrulanmamışsa özel bir cevap dönüyoruz ki LoginScreen VerificationScreen'e yönlendirebilsin
        if (data.requiresVerification) {
          return { success: false, error: data.error, requiresVerification: true, email: data.email };
        }
        return { success: false, error: data.error };
      }
    } catch (e) {
      return { success: false, error: 'Bağlantı hatası oluştu.' };
    }
  };

  const register = async (name, email, password) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      
      if (data.success) {
        // Artık token dönmüyor, sadece success
        return { success: true, email: data.email };
      } else {
        return { success: false, error: data.error };
      }
    } catch (e) {
      return { success: false, error: 'Bağlantı hatası oluştu.' };
    }
  };

  const verifyEmail = async (email, code) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code })
      });
      const data = await res.json();
      
      if (data.success) {
        await AsyncStorage.setItem('userToken', data.token);
        setUserToken(data.token);
        setUser(data.user);
        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (e) {
      return { success: false, error: 'Bağlantı hatası oluştu.' };
    }
  };

  const resendCode = async (email) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/auth/resend-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      
      if (data.success) {
        return { success: true, message: data.message };
      } else {
        return { success: false, error: data.error };
      }
    } catch (e) {
      return { success: false, error: 'Bağlantı hatası oluştu.' };
    }
  };

  const googleLogin = async (idToken, email, name, avatar) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, email, name, avatar })
      });
      const data = await res.json();
      
      if (data.success) {
        await AsyncStorage.setItem('userToken', data.token);
        setUserToken(data.token);
        setUser(data.user);
        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (e) {
      return { success: false, error: 'Google girişi sırasında bağlantı hatası oluştu.' };
    }
  };

  const logout = async () => {
    setIsLoading(true);
    await AsyncStorage.removeItem('userToken');
    setUserToken(null);
    setUser(null);
    setIsLoading(false);
  };

  const acceptLegal = async () => {
    try {
      const res = await acceptLegalWarningApi();
      if (res && res.success) {
        if (user) {
          const updatedUser = { ...user, hasAcceptedLegal: true };
          setUser(updatedUser);
          await AsyncStorage.setItem(`hasAcceptedLegal_${user._id}`, 'true');
        }
        return { success: true };
      }
      return { success: false, error: res?.error || 'Yasal onay kaydedilemedi.' };
    } catch (e) {
      console.warn('acceptLegal context error:', e);
      return { success: false, error: 'Sunucu bağlantı hatası.' };
    }
  };

  const updateUserAvatar = (avatarUrl) => {
    if (user) {
      setUser({ ...user, avatar: avatarUrl });
    }
  };

  const updateUserName = (name) => {
    if (user) {
      setUser({ ...user, name });
    }
  };

  return (
    <AuthContext.Provider value={{ login, register, verifyEmail, resendCode, googleLogin, logout, user, userToken, isLoading, updateUserAvatar, updateUserName, acceptLegal, isBotBypassed, setBotBypassed }}>
      {children}
    </AuthContext.Provider>
  );
};
