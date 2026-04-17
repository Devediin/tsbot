import mongoose from 'mongoose';

const PlayerHistorySchema = new mongoose.Schema({
  name: String,
  level: Number,
  date: { type: Date, default: Date.now }
});

export default mongoose.model('PlayerHistory', PlayerHistorySchema);
