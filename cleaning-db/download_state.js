const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://Bedirhan:IWVAR7SF4sX03iPxm8cAsxLpUcplC2oL@ac-gvpimdi-shard-00-00.ng7xf3i.mongodb.net:27017,ac-gvpimdi-shard-00-01.ng7xf3i.mongodb.net:27017,ac-gvpimdi-shard-00-02.ng7xf3i.mongodb.net:27017/clofthel_db?ssl=true&replicaSet=atlas-4w6yvn-shard-0&authSource=admin&retryWrites=true&w=majority';

const STATE_FILE = path.join(__dirname, 'orchestrator_state.json');

async function download() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB.');

    // Mongoose schema for orchestrator_state
    const orchestratorStateSchema = new mongoose.Schema(
      {
        state_key: { type: String, default: 'orchestrator_state', index: true, unique: true },
        processed_chunks: [Number],
        global_titles_map: mongoose.Schema.Types.Mixed,
        updatedAt: { type: Date, default: Date.now }
      },
      { collection: 'orchestrator_state', versionKey: false }
    );

    const OrchestratorState = mongoose.models.OrchestratorState || mongoose.model('OrchestratorState', orchestratorStateSchema);

    console.log('Downloading state from database...');
    const doc = await OrchestratorState.findOne({ state_key: 'orchestrator_state' }).lean();

    if (!doc) {
      console.error('Error: No saved orchestrator state found in the database.');
      process.exit(1);
    }

    const state = {
      processed_chunks: doc.processed_chunks || [],
      global_titles_map: doc.global_titles_map || {}
    };

    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');

    console.log('--------------------------------------------------');
    console.log('SUCCESS: orchestrator_state has been successfully downloaded and saved locally!');
    console.log(`Path: ${STATE_FILE}`);
    console.log(`Processed chunks count: ${state.processed_chunks.length}`);
    console.log(`Global titles mapped: ${Object.keys(state.global_titles_map).length}`);
    console.log('--------------------------------------------------');

  } catch (error) {
    console.error('Error during download:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Database connection closed.');
  }
}

download();
