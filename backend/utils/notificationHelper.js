const User = require('../models/User');
const Notification = require('../models/Notification');
const Anime = require('../models/Anime');
const { Expo } = require('expo-server-sdk');

let expo = new Expo();

/**
 * Creates notifications for users who have this anime in their favorites (if enabled)
 * or in a custom list that has notificationsEnabled = true.
 * 
 * @param {String} animeId - The ID of the anime
 * @param {Object} episodeData - Information about the new episode
 */
const sendNewEpisodeNotifications = async (animeId, episodeData) => {
  try {
    const anime = await Anime.findById(animeId);
    if (!anime) return;

    // Find users who have this anime in favorites with notifyOnFavorites = true
    // OR in a custom list with notificationsEnabled = true
    const usersToNotify = await User.find({
      $or: [
        { favorites: animeId, notifyOnFavorites: true },
        { 
          customLists: { 
            $elemMatch: { 
              animes: animeId, 
              notificationsEnabled: true 
            } 
          } 
        }
      ]
    }).select('_id expoPushTokens');

    if (usersToNotify.length === 0) return;

    const notificationsToInsert = [];
    const pushMessages = [];

    const title = 'Yeni Bölüm Eklendi!';
    const message = `${anime.orijinal_ad || anime.tranimeizle_slug} için yeni bir bölüm eklendi. Hemen izlemek için tıkla!`;

    usersToNotify.forEach(user => {
      // 1. Veritabanı için Notification kaydı
      notificationsToInsert.push({
        user: user._id,
        anime: animeId,
        type: 'NEW_EPISODE',
        title: title,
        message: message,
        linkData: {
          episodeNumber: episodeData.bolum_no,
          episodeTitle: episodeData.bolum_adi
        },
        createdAt: new Date()
      });

      // 2. Expo Push Notification için mesaj hazırlığı
      if (user.expoPushTokens && user.expoPushTokens.length > 0) {
        user.expoPushTokens.forEach(pushToken => {
          if (Expo.isExpoPushToken(pushToken)) {
            pushMessages.push({
              to: pushToken,
              sound: 'default',
              title: title,
              body: message,
              data: { animeId: animeId, screen: 'AnimeDetail' },
            });
          }
        });
      }
    });

    // Create notifications in bulk in MongoDB
    if (notificationsToInsert.length > 0) {
      await Notification.insertMany(notificationsToInsert, { ordered: false });
      console.log(`[Notification] Created ${notificationsToInsert.length} DB notifications for anime: ${anime.tranimeizle_slug}`);
    }

    // Send push notifications via Expo
    if (pushMessages.length > 0) {
      const chunks = expo.chunkPushNotifications(pushMessages);
      const tickets = [];
      
      for (const chunk of chunks) {
        try {
          const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
          tickets.push(...ticketChunk);
        } catch (error) {
          console.error('[Expo Push] Error sending chunk', error);
        }
      }
      console.log(`[Expo Push] Sent ${pushMessages.length} push notifications.`);
    }

  } catch (error) {
    console.error('[Notification Helper Error]', error);
  }
};

module.exports = {
  sendNewEpisodeNotifications
};
