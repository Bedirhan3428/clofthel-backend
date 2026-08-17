const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

const STATE_FILE = path.join(__dirname, 'orchestrator_state.json');

async function upload() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB.');

    if (!fs.existsSync(STATE_FILE)) {
      console.error(`Error: State file not found at ${STATE_FILE}`);
      process.exit(1);
    }

    const rawData = fs.readFileSync(STATE_FILE, 'utf8');
    const state = JSON.parse(rawData);

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

    console.log('Uploading state to database (collection: orchestrator_state)...');
    
    await OrchestratorState.findOneAndUpdate(
      { state_key: 'orchestrator_state' },
      {
        processed_chunks: state.processed_chunks,
        global_titles_map: state.global_titles_map,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    console.log('--------------------------------------------------');
    console.log('SUCCESS: orchestrator_state has been successfully saved to MongoDB!');
    console.log(`Processed chunks count: ${state.processed_chunks.length}`);
    console.log(`Global titles mapped: ${Object.keys(state.global_titles_map).length}`);
    console.log('--------------------------------------------------');

  } catch (error) {
    console.error('Error during upload:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Database connection closed.');
  }
}

upload();
