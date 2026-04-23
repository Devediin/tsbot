import mongoose from 'mongoose';

const LevelUpHistorySchema = new mongoose.Schema({
  name: String,
  previousLevel: Number,
  currentLevel: Number,
  gained: Number,
  date: { type: Date, default: Date.now }
});

export default mongoose.model('LevelUpHistory', LevelUpHistorySchema);
