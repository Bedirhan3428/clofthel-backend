const mongoose = require('mongoose');

const challengeQuestionSchema = new mongoose.Schema(
  {
    questionHash: { type: String, required: true, unique: true, index: true },
    questionText: { type: String, required: true },
    questionImageUrl: { type: String, default: null },
    options: [
      {
        id: { type: String, required: true },
        text: { type: String, required: true }
      }
    ],
    correctOptionId: { type: String, required: true },
    correctOptionText: { type: String, default: null },
    confidence: { type: Number, default: 1.0 },
    solvedBy: { type: String, enum: ['human', 'llama_8b', 'cache'], default: 'llama_8b' }
  },
  { timestamps: true }
);

module.exports = mongoose.models.ChallengeQuestion || mongoose.model('ChallengeQuestion', challengeQuestionSchema);
