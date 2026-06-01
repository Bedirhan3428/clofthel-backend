import React, { useEffect, useState, useContext } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { Image } from 'expo-image';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from '../constants/theme';
import { AuthContext } from '../context/AuthContext';
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../services/api';

export default function NotificationsScreen() {
  const navigation = useNavigation();
  const { user } = useContext(AuthContext);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchNotifications();
  }, [user]);

  const fetchNotifications = async () => {
    try {
      const data = await getNotifications();
      if (data && data.success) {
        setNotifications(data.data);
      }
    } catch (err) {
      console.log('Error fetching notifications:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id) => {
    try {
      await markNotificationAsRead(id);
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
    } catch (err) {
      console.log(err.message);
    }
  };

  const markAllAsRead = async () => {
    try {
      await markAllNotificationsAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (err) {
      console.log(err.message);
    }
  };

  const handlePress = (notification) => {
    if (!notification.isRead) {
      markAsRead(notification._id);
    }
    if (notification.anime) {
      navigation.navigate('AnimeDetail', { anime: notification.anime });
    }
  };

  const renderItem = ({ item }) => {
    const isUnread = !item.isRead;
    return (
      <TouchableOpacity 
        style={[styles.notificationCard, isUnread && styles.unreadCard]}
        activeOpacity={0.8}
        onPress={() => handlePress(item)}
      >
        <View style={styles.imageContainer}>
          {item.anime?.coverImage ? (
            <Image source={{ uri: item.anime.coverImage }} style={styles.image} contentFit="cover" />
          ) : (
            <View style={styles.placeholderImage}>
              <Ionicons name="notifications" size={24} color={COLORS.accent} />
            </View>
          )}
        </View>
        <View style={styles.content}>
          <Text style={[styles.title, isUnread && styles.unreadText]}>{item.title}</Text>
          <Text style={styles.message} numberOfLines={2}>{item.message}</Text>
          <Text style={styles.time}>{new Date(item.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
        {isUnread && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bildirimler</Text>
        <TouchableOpacity onPress={markAllAsRead}>
          <Ionicons name="checkmark-done-outline" size={24} color={COLORS.accent} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.accent} style={{ marginTop: 50 }} />
      ) : notifications.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="notifications-off-outline" size={64} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>Henüz hiç bildirimin yok.</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bgPrimary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: { padding: SPACING.xs },
  headerTitle: { fontSize: FONT_SIZES.title, fontWeight: FONT_WEIGHTS.bold, color: COLORS.textPrimary },
  list: { padding: SPACING.md, gap: SPACING.sm },
  notificationCard: {
    flexDirection: 'row',
    padding: SPACING.md,
    backgroundColor: COLORS.bgCard,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
  },
  unreadCard: {
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.3)',
  },
  imageContainer: {
    width: 50, height: 70, borderRadius: BORDER_RADIUS.sm, overflow: 'hidden', marginRight: SPACING.md
  },
  image: { width: '100%', height: '100%' },
  placeholderImage: {
    width: '100%', height: '100%', backgroundColor: COLORS.bgSecondary, justifyContent: 'center', alignItems: 'center'
  },
  content: { flex: 1 },
  title: { fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.textPrimary, marginBottom: 2 },
  unreadText: { color: COLORS.accent },
  message: { fontSize: FONT_SIZES.small, color: COLORS.textSecondary, marginBottom: 4 },
  time: { fontSize: 10, color: COLORS.textMuted },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.accent, marginLeft: SPACING.sm },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 100 },
  emptyText: { color: COLORS.textMuted, fontSize: FONT_SIZES.body, marginTop: SPACING.md }
});
