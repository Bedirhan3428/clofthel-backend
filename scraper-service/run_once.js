require('dotenv').config();
const mongoose = require('mongoose');
const { runScraper } = require('./sync_homepage');

console.log('Connecting to MongoDB...');
mongoose.connect(process.env.MONGO_URI, { family: 4 })
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    console.log('Starting scraper...');
    try {
      const result = await runScraper();
      console.log('✅ Scraper finished successfully:', result);
    } catch (err) {
      console.error('❌ Scraper run failed:', err);
    } finally {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB.');
    }
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err);
  });
