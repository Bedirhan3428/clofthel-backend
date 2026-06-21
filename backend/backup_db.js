require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Anime = require('./models/Anime');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/clofthel';

async function backup() {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGO_URI, { family: 4 });
    console.log('Connected to MongoDB. Fetching all animes...');
    const animes = await Anime.find({}).lean();
    console.log(`Fetched ${animes.length} animes. Writing to JSON file...`);
    const backupPath = path.join(__dirname, 'db_backup.json');
    fs.writeFileSync(backupPath, JSON.stringify(animes, null, 2), 'utf8');
    console.log(`Backup completed successfully. Saved to ${backupPath}`);
  } catch (err) {
    console.error('Backup failed:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
    process.exit(0);
  }
}

backup();
