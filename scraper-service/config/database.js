const mongoose = require('mongoose');

async function connectDatabase() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.warn('⚠️ MONGO_URI environment variable is not defined in Scraper Service.');
    return null;
  }

  try {
    const conn = await mongoose.connect(mongoUri, { family: 4 });
    console.log(`✅ [Database] Connected to MongoDB: ${conn.connection.host}`);
    return conn;
  } catch (err) {
    console.error('❌ [Database] Connection error:', err.message);
    throw err;
  }
}

module.exports = { connectDatabase };
