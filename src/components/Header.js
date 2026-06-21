import React, { useContext, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, SHADOWS, BORDER_RADIUS } from '../constants/theme';
import { AuthContext } from '../context/AuthContext';
import { getNotifications } from '../services/api';

export default function Header() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { user, isBotBypassed } = useContext(AuthContext);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (user && isFocused) {
      getNotifications(1, 1).then(data => {
        if (data && data.success) {
          setUnreadCount(data.unreadCount || 0);
        }
      }).catch(err => console.log('Header notification error:', err.message));
    }
  }, [user, isFocused]);

  const handleProfilePress = () => {
    if (user) {
      navigation.navigate('Profile');
    } else {
      navigation.navigate('Login');
    }
  };

  return (
    <View style={styles.container}>
      {/* ── Logo ────────────────────────────────────── */}
      <View style={[styles.logoContainer, { gap: 2 }]}>
        <Image source={require('../../assets/mainLogo.png')} style={{width: 44, height: 44}} contentFit="contain" />
        <Text style={[styles.logoText, { marginLeft: -4, fontSize: 28 }]}>
          lof<Text style={[styles.logoAccent, { color: isBotBypassed ? COLORS.accent : '#FFB300' }]}>thel</Text>
        </Text>
      </View>

      {/* ── Right Actions ───────────────────────────── */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.iconButton}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Search')}
        >
          <Ionicons name="search-outline" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.iconButton} 
          activeOpacity={0.7}
          onPress={() => {
            if (user) {
              navigation.navigate('Notifications');
            } else {
              navigation.navigate('Login');
            }
          }}
        >
          <Ionicons name="notifications-outline" size={22} color={COLORS.textPrimary} />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.profileButton} activeOpacity={0.7} onPress={handleProfilePress}>
          {user ? (
            user.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.headerAvatar} />
            ) : (
              <Text style={{color: '#FFF', fontWeight: 'bold'}}>{user.name ? user.name.charAt(0).toUpperCase() : 'U'}</Text>
            )
          ) : (
            <Ionicons name="person" size={16} color={COLORS.accent} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  logoIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.accentGlowSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.glow,
  },
  logoText: {
    fontSize: FONT_SIZES.title,
    fontWeight: FONT_WEIGHTS.heavy,
    color: COLORS.textPrimary,
    letterSpacing: 0.5,
  },
  logoAccent: {
    color: COLORS.accent,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  profileButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accentGlowSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.borderAccent,
    overflow: 'hidden',
  },
  headerAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: COLORS.error || '#FF3D57',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.bgPrimary,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  }
});
