const mongoose = require('mongoose');

const orchestratorStateSchema = new mongoose.Schema(
  {
    state_key: { type: String, default: 'orchestrator_state', index: true, unique: true },
    processed_chunks: [Number],
    global_titles_map: mongoose.Schema.Types.Mixed,
    updatedAt: { type: Date, default: Date.now }
  },
  { collection: 'orchestrator_state', versionKey: false }
);

module.exports = mongoose.models.OrchestratorState || mongoose.model('OrchestratorState', orchestratorStateSchema);
