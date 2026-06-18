import React, { useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthContext } from '../context/AuthContext';
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { getProfileData, createCustomList, deleteCustomList, updateAvatar, toggleFavoritesNotificationsApi, toggleListNotificationsApi } from '../services/api';
import { AVATAR_LIST } from '../constants/avatars';
import { Modal, TextInput, Switch } from 'react-native';

export default function ProfileScreen({ navigation }) {
  const { user, logout, updateUserAvatar } = useContext(AuthContext);
  const [profileData, setProfileData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  const [isModalVisible, setModalVisible] = React.useState(false);
  const [newListName, setNewListName] = React.useState('');

  const [isAvatarModalVisible, setAvatarModalVisible] = React.useState(false);

  const fetchProfile = async () => {
    if (user) {
      setLoading(true);
      const data = await getProfileData();
      if (data) setProfileData(data);
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchProfile();
  }, [user]);

  const handleCreateList = async () => {
    if (!newListName.trim()) return;
    const res = await createCustomList(newListName);
    if (res) {
      setNewListName('');
      setModalVisible(false);
      fetchProfile();
    }
  };

  const handleDeleteList = async (listId) => {
    const res = await deleteCustomList(listId);
    if (res) {
      fetchProfile();
    }
  };

  const handleSelectAvatar = async (imageUrl) => {
    const res = await updateAvatar(imageUrl);
    if (res) {
      setAvatarModalVisible(false);
      updateUserAvatar(imageUrl);
      fetchProfile();
    }
  };

  const toggleFavoritesNotifications = async (newValue) => {
    try {
      // Optimistic update
      setProfileData(prev => ({ ...prev, notifyOnFavorites: newValue }));
      await toggleFavoritesNotificationsApi(newValue);
    } catch (err) {
      console.log('Error toggling favorites notifications:', err.message);
      // Revert on error
      setProfileData(prev => ({ ...prev, notifyOnFavorites: !newValue }));
    }
  };

  const toggleListNotifications = async (listId, newValue) => {
    try {
      // Optimistic update
      setProfileData(prev => {
        const updatedLists = prev.customLists.map(l => 
          l._id === listId ? { ...l, notificationsEnabled: newValue } : l
        );
        return { ...prev, customLists: updatedLists };
      });
      await toggleListNotificationsApi(listId, newValue);
    } catch (err) {
      console.log('Error toggling list notifications:', err.message);
      // Revert on error
      fetchProfile();
    }
  };

  const handleLogout = () => {
    logout();
    navigation.replace('Home');
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Giriş yapmadınız.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profilim</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Info */}
        <View style={styles.profileCard}>
          <TouchableOpacity style={styles.avatarWrapper} onPress={() => setAvatarModalVisible(true)}>
            {profileData?.avatar ? (
              <Image source={{ uri: profileData.avatar }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>
                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </Text>
            )}
            <View style={styles.editAvatarBadge}>
              <Ionicons name="camera" size={12} color="#FFF" />
            </View>
          </TouchableOpacity>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user.name || 'Kullanıcı'}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
          </View>
        </View>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>İzlemeye Devam Et</Text>
          {loading ? (
            <ActivityIndicator color={COLORS.accent} />
          ) : profileData?.watchHistory?.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.lg }}>
              {profileData.watchHistory.map((item, index) => {
                const anime = item.anime;
                if (!anime) return null;
                const animeName = anime.orijinal_ad || anime.tranimeizle_slug?.replace(/-/g, ' ') || 'Bilinmeyen Anime';
                const animeImage = anime.coverImage || anime.cover_image || anime.bannerImage || anime.banner_image;
                return (
                  <TouchableOpacity key={index} style={styles.animeCard} onPress={() => navigation.navigate('Resolve', {
                    animeId: anime._id,
                    episodeNumber: item.episode,
                    episodeTitle: `${item.episode}. Bölüm`,
                    animeTitle: animeName,
                    startAt: item.currentTime || 0
                  })}>
                    <Image source={{ uri: animeImage }} style={styles.animeImage} />
                    <Text style={styles.animeTitle} numberOfLines={1}>{animeName}</Text>
                    <Text style={styles.animeSubtitle}>Bölüm {item.episode}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <Text style={styles.emptyTextSm}>Henüz bir geçmiş bulunmuyor.</Text>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs }}>
            <Text style={styles.sectionTitle}>Favorilerim</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: COLORS.textMuted, fontSize: 12, marginRight: 6 }}>Bildirimler</Text>
              <Switch
                value={profileData?.notifyOnFavorites !== false}
                onValueChange={toggleFavoritesNotifications}
                trackColor={{ false: COLORS.bgSecondary, true: COLORS.accentGlow }}
                thumbColor={profileData?.notifyOnFavorites !== false ? COLORS.accent : COLORS.textMuted}
                style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
              />
            </View>
          </View>
          {loading ? (
            <ActivityIndicator color={COLORS.accent} />
          ) : profileData?.favorites?.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.lg }}>
              {profileData.favorites.map((anime, index) => {
                if (!anime) return null;
                const animeName = anime.orijinal_ad || anime.tranimeizle_slug?.replace(/-/g, ' ') || 'Bilinmeyen Anime';
                const animeImage = anime.coverImage || anime.cover_image || anime.bannerImage || anime.banner_image;
                return (
                  <TouchableOpacity key={index} style={styles.animeCard} onPress={() => navigation.navigate('AnimeDetail', { anime: { _id: anime._id, title: animeName } })}>
                    <Image source={{ uri: animeImage }} style={styles.animeImage} />
                    <Text style={styles.animeTitle} numberOfLines={1}>{animeName}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <Text style={styles.emptyTextSm}>Listeniz boş.</Text>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md }}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Özel Listelerim</Text>
            <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addListBtn}>
              <Ionicons name="add" size={18} color={COLORS.accent} />
              <Text style={styles.addListBtnText}>Yeni Liste</Text>
            </TouchableOpacity>
          </View>
          
          {loading ? (
            <ActivityIndicator color={COLORS.accent} />
          ) : profileData?.customLists?.length > 0 ? (
            profileData.customLists.map((list, listIndex) => (
              <View key={listIndex} style={styles.customListContainer}>
                <View style={styles.customListHeader}>
                  <Text style={styles.customListTitle}>{list.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="notifications-outline" size={16} color={COLORS.textMuted} style={{ marginRight: 4 }} />
                    <Switch
                      value={list.notificationsEnabled}
                      onValueChange={(val) => toggleListNotifications(list._id, val)}
                      trackColor={{ false: COLORS.bgSecondary, true: COLORS.accentGlow }}
                      thumbColor={list.notificationsEnabled ? COLORS.accent : COLORS.textMuted}
                      style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }], marginRight: 10 }}
                    />
                    <TouchableOpacity onPress={() => handleDeleteList(list._id)}>
                      <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                    </TouchableOpacity>
                  </View>
                </View>
                {list.animes && list.animes.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.md }}>
                    {list.animes.map((anime, index) => {
                      if (!anime) return null;
                      const animeName = anime.orijinal_ad || anime.tranimeizle_slug?.replace(/-/g, ' ') || 'Bilinmeyen Anime';
                      const animeImage = anime.coverImage || anime.cover_image || anime.bannerImage || anime.banner_image;
                      return (
                        <TouchableOpacity key={index} style={styles.animeCard} onPress={() => navigation.navigate('AnimeDetail', { anime: { _id: anime._id, title: animeName } })}>
                          <Image source={{ uri: animeImage }} style={styles.animeImage} />
                          <Text style={styles.animeTitle} numberOfLines={1}>{animeName}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <Text style={styles.emptyTextSm}>Bu liste boş.</Text>
                )}
              </View>
            ))
          ) : (
            <Text style={styles.emptyTextSm}>Henüz özel liste oluşturmadınız.</Text>
          )}

          <Text style={styles.sectionTitle}>Ayarlar</Text>
          <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('AccountSettings')}>
            <View style={styles.menuIconWrapper}>
              <Ionicons name="settings-outline" size={20} color={COLORS.textSecondary} />
            </View>
            <Text style={styles.menuText}>Hesap Ayarları</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('PlayerSettings')}>
            <View style={styles.menuIconWrapper}>
              <Ionicons name="play-outline" size={20} color={COLORS.textSecondary} />
            </View>
            <Text style={styles.menuText}>Player Ayarları</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color="#FF3B30" />
          <Text style={styles.logoutText}>Çıkış Yap</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>Clofthel v1.0.0</Text>
      </ScrollView>

      {/* Create List Modal */}
      <Modal visible={isModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Yeni Liste Oluştur</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Örn: Binge Watch"
              placeholderTextColor={COLORS.textMuted}
              value={newListName}
              onChangeText={setNewListName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalBtnCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnSave} onPress={handleCreateList}>
                <Text style={styles.modalBtnSaveText}>Oluştur</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Avatar Selection Modal */}
      <Modal visible={isAvatarModalVisible} transparent animationType="slide">
        <View style={styles.avatarModalOverlay}>
          <View style={styles.avatarModalContent}>
            <View style={styles.avatarModalHeader}>
              <Text style={styles.avatarModalTitle}>Avatar Seç</Text>
              <TouchableOpacity onPress={() => setAvatarModalVisible(false)}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {AVATAR_LIST.map((animeGrp, index) => (
                <View key={index} style={styles.avatarGroupContainer}>
                  <Text style={styles.avatarGroupTitle}>{animeGrp.category}</Text>
                  <View style={styles.avatarGrid}>
                    {animeGrp.characters.map((char, charIdx) => {
                      const isSelected = profileData?.avatar === char.imageUrl;
                      return (
                        <TouchableOpacity 
                          key={charIdx} 
                          style={[styles.avatarChoiceWrapper, isSelected && styles.avatarChoiceSelected]} 
                          onPress={() => handleSelectAvatar(char.imageUrl)}
                        >
                          <Image source={{ uri: char.imageUrl }} style={styles.avatarChoiceImage} />
                          {isSelected && (
                            <View style={styles.avatarCheckBadge}>
                              <Ionicons name="checkmark" size={14} color="#FFF" />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
  },
  content: {
    padding: SPACING.lg,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgElevated,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.xxl,
    borderWidth: 1,
    borderColor: COLORS.divider,
    ...SHADOWS.card,
  },
  avatarWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.lg,
    position: 'relative',
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarText: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: FONT_WEIGHTS.heavy,
  },
  editAvatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: COLORS.bgElevated,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.bgPrimary,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: '#FFF',
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 4,
  },
  userEmail: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
  },
  animeTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.medium,
    marginBottom: 2,
  },
  animeSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 10,
  },
  addListBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 0, 0.1)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: BORDER_RADIUS.md,
  },
  addListBtnText: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.bold,
    marginLeft: 4,
  },
  customListContainer: {
    marginBottom: SPACING.xl,
  },
  customListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    paddingLeft: SPACING.sm,
  },
  customListTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  modalContent: {
    width: '100%',
    backgroundColor: COLORS.bgElevated,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    ...SHADOWS.card,
  },
  modalTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.subtitle,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.lg,
  },
  modalInput: {
    backgroundColor: COLORS.bgSecondary,
    color: '#FFF',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: FONT_SIZES.body,
    marginBottom: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalBtnCancel: {
    padding: SPACING.md,
    marginRight: SPACING.sm,
  },
  modalBtnCancelText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
  },
  modalBtnSave: {
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
  },
  modalBtnSaveText: {
    color: '#FFF',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
  },
  avatarModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  avatarModalContent: {
    backgroundColor: COLORS.bgPrimary,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    height: '80%',
  },
  avatarModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  avatarModalTitle: {
    color: '#FFF',
    fontSize: FONT_SIZES.heading,
    fontWeight: FONT_WEIGHTS.bold,
  },
  avatarGroupContainer: {
    marginBottom: SPACING.lg,
  },
  avatarGroupTitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.sm,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  avatarChoiceWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
    position: 'relative',
  },
  avatarChoiceSelected: {
    borderColor: COLORS.accent,
  },
  avatarChoiceImage: {
    width: '100%',
    height: '100%',
    borderRadius: 36,
  },
  avatarCheckBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: COLORS.accent,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuSection: {
    marginBottom: SPACING.xxxl,
  },
  sectionTitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.md,
    paddingLeft: SPACING.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
  },
  menuIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  menuText: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.3)',
    marginBottom: SPACING.xxxl,
  },
  logoutText: {
    color: '#FF3B30',
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold,
    marginLeft: SPACING.sm,
  },
  versionText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.caption,
    textAlign: 'center',
  },
  emptyTextSm: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.body,
    marginBottom: SPACING.xl,
    paddingLeft: SPACING.sm,
  },
  animeCard: {
    width: 120,
    marginRight: SPACING.md,
  },
  animeImage: {
    width: '100%',
    height: 180,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.bgElevated,
    marginBottom: SPACING.xs,
  },
  animeTitle: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.medium,
  },
  animeSubtitle: {
    color: COLORS.accent,
    fontSize: FONT_SIZES.caption - 2,
    fontWeight: FONT_WEIGHTS.bold,
  }
});
