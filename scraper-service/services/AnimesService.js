const Anime = require('../models/Anime');
const axios = require('axios');

class AnimesService {
  /**
   * Save / sync formatted episode items to Legacy DB (Target A)
   * @param {Array<Object>} formattedItems - Clean, formatted ingestion items [{ slug, episode, url, title }]
   * @returns {Promise<Object>} - Execution result for Legacy target
   */
  static async save(formattedItems) {
    if (!Array.isArray(formattedItems) || formattedItems.length === 0) {
      return { success: true, count: 0, message: 'No items to save to Legacy DB.' };
    }

    try {
      console.log(`[Target A - LegacyAnimesService] Processing ${formattedItems.length} formatted items...`);

      let newAnimeCount = 0;
      let newEpisodeCount = 0;
      let updatedCount = 0;
      const errors = [];

      for (const item of formattedItems) {
        const { slug, episode, url, title } = item;

        try {
          let anime = await Anime.findOne({ tranimeizle_slug: slug });

          if (anime) {
            const episodesMap = anime.episodes || {};
            const isNewEp = !episodesMap[String(episode)];
            
            episodesMap[String(episode)] = url;
            anime.episodes = episodesMap;
            anime.total_episodes = Math.max(anime.total_episodes || 0, episode);
            
            if (title && !anime.orijinal_ad) {
              anime.orijinal_ad = title;
            }

            anime.markModified('episodes');
            await anime.save();

            if (isNewEp) {
              newEpisodeCount++;
            }
            updatedCount++;
          } else {
            const newEpisodesMap = {};
            newEpisodesMap[String(episode)] = url;

            anime = new Anime({
              tranimeizle_slug: slug,
              tranimeizle_url: `https://www.tranimeizle.io/${slug}`,
              orijinal_ad: title || null,
              total_episodes: episode,
              episodes: newEpisodesMap
            });

            await anime.save();
            newAnimeCount++;
            newEpisodeCount++;
            updatedCount++;
          }
        } catch (itemErr) {
          console.error(`❌ [Target A - LegacyAnimesService] Error processing item ${slug} ep ${episode}:`, itemErr.message);
          errors.push({ slug, episode, error: itemErr.message });
        }
      }

      // If backend API URL is configured, optional legacy notification push
      const backendUrl = process.env.BACKEND_URL;
      if (backendUrl) {
        axios.post(`${backendUrl}/api/internal/bulk-episode-sync`, {
          episodes: formattedItems
        }, {
          headers: {
            'x-internal-api-key': process.env.INTERNAL_API_KEY
          },
          timeout: 5000
        }).catch(err => {
          console.warn(`[Target A - LegacyAnimesService] Legacy backend sync notification notice: ${err.message}`);
        });
      }

      console.log(`✅ [Target A - LegacyAnimesService] Success: ${newAnimeCount} new anime, ${newEpisodeCount} new episodes, ${updatedCount} updated.`);

      return {
        success: true,
        target: 'LegacyAnimes',
        newAnime: newAnimeCount,
        newEpisodes: newEpisodeCount,
        updatedCount: updatedCount,
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (err) {
      console.error('❌ [Target A - LegacyAnimesService] Uncaught error during legacy save:', err.message);
      return {
        success: false,
        target: 'LegacyAnimes',
        error: err.message
      };
    }
  }
}

module.exports = AnimesService;
