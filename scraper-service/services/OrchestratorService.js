const OrchestratorState = require('../models/OrchestratorState');
const axios = require('axios');

class OrchestratorService {
  /**
   * Publish / ingest formatted episode items to Orchestrator Service (Target B)
   * @param {Array<Object>} formattedItems - Clean, formatted ingestion items [{ slug, episode, url, title }]
   * @returns {Promise<Object>} - Execution result for Orchestrator target
   */
  static async publish(formattedItems) {
    if (!Array.isArray(formattedItems) || formattedItems.length === 0) {
      return { success: true, count: 0, message: 'No items to publish to Orchestrator Service.' };
    }

    try {
      console.log(`[Target B - OrchestratorService] Publishing ${formattedItems.length} items to Orchestrator...`);

      let publishedCount = 0;
      let stateUpdated = false;

      // 1. Direct MongoDB Orchestrator State Update (if DB connection exists)
      try {
        const stateDoc = await OrchestratorState.findOne({ state_key: 'orchestrator_state' });
        if (stateDoc && stateDoc.global_titles_map) {
          const titlesMap = stateDoc.global_titles_map;
          let modified = false;

          for (const item of formattedItems) {
            const { slug, episode, url } = item;
            
            // Clean base title key from slug (e.g., 'jujutsu-kaisen-3-sezon-izle' -> 'jujutsu kaisen')
            const cleanKey = slug
              .replace(/-izle$/i, '')
              .replace(/-(?:\d+)-sezon.*/i, '')
              .replace(/-/g, ' ')
              .trim();

            if (titlesMap[cleanKey]) {
              publishedCount++;
              modified = true;
            }
          }

          if (modified) {
            stateDoc.updatedAt = new Date();
            stateDoc.markModified('global_titles_map');
            await stateDoc.save();
            stateUpdated = true;
          }
        }
      } catch (dbErr) {
        console.warn(`⚠️ [Target B - OrchestratorService] Direct DB state update notice: ${dbErr.message}`);
      }

      // 2. HTTP Event Dispatch to Orchestrator Ingest Endpoint (if configured)
      const orchestratorUrl = process.env.ORCHESTRATOR_URL || process.env.BACKEND_URL;
      if (orchestratorUrl) {
        try {
          const endpoint = `${orchestratorUrl.replace(/\/$/, '')}/api/v1/orchestrator/ingest`;
          await axios.post(endpoint, {
            source: 'scraper-ingestion-middleware',
            timestamp: new Date().toISOString(),
            data: formattedItems
          }, {
            headers: {
              'Content-Type': 'application/json',
              'x-internal-api-key': process.env.INTERNAL_API_KEY
            },
            timeout: 5000
          });
          console.log(`🌐 [Target B - OrchestratorService] Dispatched event to Orchestrator HTTP endpoint: ${endpoint}`);
        } catch (httpErr) {
          console.warn(`⚠️ [Target B - OrchestratorService] HTTP dispatch to Orchestrator endpoint notice: ${httpErr.message}`);
        }
      }

      console.log(`✅ [Target B - OrchestratorService] Successfully published ${formattedItems.length} items to Orchestrator.`);

      return {
        success: true,
        target: 'OrchestratorService',
        publishedCount: formattedItems.length,
        stateUpdated: stateUpdated
      };

    } catch (err) {
      console.error('❌ [Target B - OrchestratorService] Uncaught error during orchestrator publish:', err.message);
      return {
        success: false,
        target: 'OrchestratorService',
        error: err.message
      };
    }
  }
}

module.exports = OrchestratorService;
