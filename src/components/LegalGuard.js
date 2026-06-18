import React, { useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthContext } from '../context/AuthContext';
import LegalModal from './LegalModal';

export default function LegalGuard({ children }) {
  const { user, acceptLegal } = useContext(AuthContext);
  const [hasAccepted, setHasAccepted] = useState(true);

  useEffect(() => {
    const checkLegalStatus = async () => {
      try {
        if (!user) {
          // Cihaz açıldığında/giriş yapılmadığında (misafir modunda) sorma
          setHasAccepted(true);
          return;
        }

        // Eğer kullanıcı verisinde kabul edildiği bilgisi varsa sorma
        if (user.hasAcceptedLegal) {
          setHasAccepted(true);
          return;
        }

        // Local storage kontrolü (flicker önlemek için ek güvenlik)
        const storageKey = `hasAcceptedLegal_${user._id}`;
        const status = await AsyncStorage.getItem(storageKey);
        
        if (status === 'true') {
          setHasAccepted(true);
        } else {
          setHasAccepted(false);
        }
      } catch (e) {
        console.warn('Yasal metin kontrol hatası:', e);
        setHasAccepted(true);
      }
    };

    checkLegalStatus();
  }, [user, user?.hasAcceptedLegal]);

  const handleAcceptLegal = async () => {
    try {
      const res = await acceptLegal();
      if (res.success) {
        setHasAccepted(true);
      }
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
