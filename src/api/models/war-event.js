import mongoose from 'mongoose';

const killerSchema = new mongoose.Schema({
  name: String,
  isPlayer: Boolean,
}, { _id: false });

const warEventSchema = new mongoose.Schema({
  characterName: { type: String, required: true }, // quem morreu
  type: { type: String, enum: ['friend', 'enemy'], required: true },
  level: Number,
  killers: [killerSchema],
  time: { type: Date, required: true },
}, {
  timestamps: true
});

warEventSchema.index({ time: -1 });
warEventSchema.index({ characterName: 1 });

export default mongoose.model('WarEvent', warEventSchema);
