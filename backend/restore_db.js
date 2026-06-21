require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Anime = require('./models/Anime');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/clofthel';

async function restore() {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGO_URI, { family: 4 });
    console.log('Connected. Reading db_backup.json...');
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'db_backup.json'), 'utf8'));
    console.log(`Loaded ${data.length} documents from backup. Clearing database collection...`);
    await Anime.deleteMany({});
    console.log('Database collection cleared. Restoring data...');
    await Anime.insertMany(data);
    console.log('Database restored successfully from backup!');
  } catch (err) {
    console.error('Restore failed:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
    process.exit(0);
  }
}

restore();
