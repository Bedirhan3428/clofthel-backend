const AnimesService = require('../services/AnimesService');
const OrchestratorService = require('../services/OrchestratorService');

class IngestionController {
  /**
   * Main controller endpoint for receiving raw ingestion payload from Termux or other scrapers/bots.
   * Performs validation, sanitization/formatting, and non-blocking Dual-Dispatch to Target A & Target B.
   */
  static async handleIngestion(req, res) {
    const startTime = Date.now();

    try {
      const rawBody = req.body || {};
      
      // 1. Extract raw items from flexible payload formats
      let rawItems = [];
      if (Array.isArray(rawBody)) {
        rawItems = rawBody;
      } else if (Array.isArray(rawBody.episodes)) {
        rawItems = rawBody.episodes;
      } else if (Array.isArray(rawBody.data)) {
        rawItems = rawBody.data;
      } else if (typeof rawBody === 'object' && (rawBody.slug || rawBody.tranimeizle_slug || rawBody.url)) {
        rawItems = [rawBody];
      }

      if (rawItems.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid or empty ingestion payload. Expected array or object with episodes data.'
        });
      }

      // 2. Validate, sanitize, and format payload items
      const formattedItems = [];
      let skippedCount = 0;

      for (const item of rawItems) {
        if (!item || typeof item !== 'object') {
          skippedCount++;
          continue;
        }

        const rawSlug = item.slug || item.tranimeizle_slug;
        const rawEpisode = item.episode !== undefined ? item.episode : item.episode_number;
        const rawUrl = item.url || item.source_url || item.tranimeizle_url;
        const title = item.title || item.orijinal_ad || null;

        if (!rawSlug || !rawUrl) {
          skippedCount++;
          continue;
        }

        // Sanitize slug
        const sanitizedSlug = String(rawSlug).trim().toLowerCase();
        
        // Sanitize URL
        const sanitizedUrl = String(rawUrl).trim();
        if (!sanitizedUrl.startsWith('http://') && !sanitizedUrl.startsWith('https://')) {
          skippedCount++;
          continue;
        }

        // Sanitize episode number
        let episodeNum = parseInt(rawEpisode, 10);
        if (isNaN(episodeNum) || episodeNum < 1) {
          episodeNum = 1; // Default to episode 1 if unparsed (e.g. movies)
        }

        formattedItems.push({
          slug: sanitizedSlug,
          episode: episodeNum,
          url: sanitizedUrl,
          title: title ? String(title).trim() : null,
          timestamp: Date.now()
        });
      }

      if (formattedItems.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid episode items could be formatted from payload.',
          received: rawItems.length,
          skipped: skippedCount
        });
      }

      console.log(`📥 [IngestionController] Received ${rawItems.length} raw items -> ${formattedItems.length} valid formatted items.`);

      // 3. Non-Blocking Dual-Dispatch (Target A: Legacy AnimesService & Target B: OrchestratorService)
      const dispatchResults = await Promise.allSettled([
        AnimesService.save(formattedItems),
        OrchestratorService.publish(formattedItems)
      ]);

      // Unpack dual dispatch results independently
      const legacyResult = dispatchResults[0].status === 'fulfilled'
        ? dispatchResults[0].value
        : { success: false, target: 'LegacyAnimes', error: dispatchResults[0].reason?.message || String(dispatchResults[0].reason) };

      const orchestratorResult = dispatchResults[1].status === 'fulfilled'
        ? dispatchResults[1].value
        : { success: false, target: 'OrchestratorService', error: dispatchResults[1].reason?.message || String(dispatchResults[1].reason) };

      // Log any isolated failures
      if (!legacyResult.success) {
        console.error('❌ [IngestionController] Target A (Legacy) failed during dual-dispatch:', legacyResult.error);
      }
      if (!orchestratorResult.success) {
        console.error('❌ [IngestionController] Target B (Orchestrator) failed during dual-dispatch:', orchestratorResult.error);
      }

      const durationMs = Date.now() - startTime;

      // 4. Return unified JSON response
      return res.status(200).json({
        success: true,
        message: 'Ingestion payload sanitized and dual-dispatched successfully.',
        durationMs: durationMs,
        summary: {
          received: rawItems.length,
          valid: formattedItems.length,
          skipped: skippedCount,
          targets: {
            legacy: legacyResult,
            orchestrator: orchestratorResult
          }
        }
      });

    } catch (err) {
      console.error('❌ [IngestionController] Fatal ingestion error:', err);
      return res.status(500).json({
        success: false,
        error: 'Server error during ingestion payload processing.',
        message: err.message
      });
    }
  }
}

module.exports = IngestionController;
