import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { COLORS } from './src/constants/theme';

import HomeScreen from './src/screens/HomeScreen';
import AnimeDetailScreen from './src/screens/AnimeDetailScreen';
import SearchScreen from './src/screens/SearchScreen';
import WatchScreen from './src/screens/WatchScreen';
import GenreScreen from './src/screens/GenreScreen';
import ResolveScreen from './src/screens/ResolveScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import VerificationScreen from './src/screens/VerificationScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import AiRecommendationScreen from './src/screens/AiRecommendationScreen';
import AccountSettingsScreen from './src/screens/AccountSettingsScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import { AuthProvider } from './src/context/AuthContext';
import { AlertProvider } from './src/context/AlertContext';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LegalGuard from './src/components/LegalGuard';

const Stack = createNativeStackNavigator();
const navigationRef = React.createRef();

// Karanlık navigasyon teması
const ClofthelTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: COLORS.accent,
    background: COLORS.bgPrimary,
    card: COLORS.bgSecondary,
    text: COLORS.textPrimary,
    border: COLORS.divider,
  },
};

export default function App() {
  const lastNotificationResponse = Notifications.useLastNotificationResponse();

  React.useEffect(() => {
    if (
      lastNotificationResponse &&
      lastNotificationResponse.notification.request.content.data.animeId &&
      lastNotificationResponse.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
    ) {
      const animeId = lastNotificationResponse.notification.request.content.data.animeId;
      setTimeout(() => {
        if (navigationRef.current) {
          navigationRef.current.navigate('AnimeDetail', { anime: { _id: animeId } });
        }
      }, 1000);
    }
  }, [lastNotificationResponse]);

  return (
    <AlertProvider>
      <AuthProvider>
        <LegalGuard>
          <SafeAreaProvider>
          <NavigationContainer ref={navigationRef} theme={ClofthelTheme}>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: COLORS.bgPrimary },
            }}
          >
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="AnimeDetail" component={AnimeDetailScreen} />
            <Stack.Screen name="Search" component={SearchScreen} />
            <Stack.Screen name="Genre" component={GenreScreen} />
            <Stack.Screen name="Resolve" component={ResolveScreen} />
            <Stack.Screen name="Watch" component={WatchScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="Verification" component={VerificationScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="AiRecommendation" component={AiRecommendationScreen} />
            <Stack.Screen name="AccountSettings" component={AccountSettingsScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
      </LegalGuard>
    </AuthProvider>
    </AlertProvider>
  );
}
