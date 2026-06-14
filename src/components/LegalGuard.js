import React, { useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthContext } from '../context/AuthContext';
import LegalModal from './LegalModal';

export default function LegalGuard({ children }) {
  const { user } = useContext(AuthContext);
  const [hasAccepted, setHasAccepted] = useState(true);

  useEffect(() => {
    const checkLegalStatus = async () => {
      try {
        // Eğer kullanıcı giriş yapmışsa ID'sine göre, yapmamışsa cihaz geneli (guest) kontrol et
        const storageKey = user ? `hasAcceptedLegal_${user._id}` : 'hasAcceptedLegal_guest';
        const status = await AsyncStorage.getItem(storageKey);
        
        if (status !== 'true') {
          setHasAccepted(false);
        } else {
          setHasAccepted(true);
        }
      } catch (e) {
        console.warn('Yasal metin kontrol hatası:', e);
      }
    };

    checkLegalStatus();
  }, [user]); // user state'i her değiştiğinde (farklı hesaba girildiğinde) tekrar kontrol eder

  const handleAcceptLegal = async () => {
    try {
      const storageKey = user ? `hasAcceptedLegal_${user._id}` : 'hasAcceptedLegal_guest';
      await AsyncStorage.setItem(storageKey, 'true');
      setHasAccepted(true);
    } catch (e) {
      console.warn('Yasal metin kayıt hatası:', e);
    }
  };

  return (
    <>
      {children}
      <LegalModal visible={!hasAccepted} onAccept={handleAcceptLegal} />
    </>
  );
}
