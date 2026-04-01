import mongoose from 'mongoose';

const levelEventSchema = new mongoose.Schema({
  name: {
    type: String,
  },
  type: {
    type: String,
  },
  fromLevel: {
    type: Number,
  },
  toLevel: {
    type: Number,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const LevelEvent = mongoose.model('LevelEvent', levelEventSchema, 'levelEvents');

export const insertLevelEvent = async (event) => (
  new Promise(async (resolve, reject) => {
    try {
      const newEvent = new LevelEvent(event);
      await newEvent.save();
      resolve(newEvent);
    } catch (error) {
      reject(error);
    }
  })
);

export const getRecentLevelEvents = async (limit = 20) => (
  new Promise(async (resolve, reject) => {
    try {
      const events = await LevelEvent.find({})
        .sort({ createdAt: -1 })
        .limit(limit);

      resolve(events);
    } catch (error) {
      reject(error);
    }
  })
);

export default LevelEvent;
