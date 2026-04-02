import mongoose from 'mongoose';

const levelTrackerSchema = new mongoose.Schema({
  name: {
    type: String,
    unique: true,
  },
  lastLevel: {
    type: Number,
    default: 0,
  },
});

const LevelTracker = mongoose.model('LevelTracker', levelTrackerSchema, 'levelTrackers');

export const getLevelTrackerByName = async (name) => (
  new Promise(async (resolve, reject) => {
    try {
      const tracker = await LevelTracker.findOne({ name });
      resolve(tracker);
    } catch (error) {
      reject(error);
    }
  })
);

export const ensureLevelTracker = async ({ name, level }) => (
  new Promise(async (resolve, reject) => {
    try {
      let tracker = await LevelTracker.findOne({ name });

      if (!tracker) {
        tracker = new LevelTracker({
          name,
          lastLevel: Number(level),
        });

        await tracker.save();
      }

      resolve(tracker);
    } catch (error) {
      reject(error);
    }
  })
);

export const setLevelTrackerLevel = async ({ name, level }) => (
  new Promise(async (resolve, reject) => {
    try {
      const tracker = await LevelTracker.findOneAndUpdate(
        { name },
        { $set: { lastLevel: Number(level) } },
        { new: true, upsert: true }
      );

      resolve(tracker);
    } catch (error) {
      reject(error);
    }
  })
);

export const upsertLevelTracker = async ({ name, level }) => (
  new Promise(async (resolve, reject) => {
    try {
      let tracker = await LevelTracker.findOne({ name });

      if (!tracker) {
        tracker = new LevelTracker({
          name,
          lastLevel: Number(level),
        });

        await tracker.save();
        resolve({ previousLevel: null, currentLevel: Number(level), leveledUp: false });
        return;
      }

      const previousLevel = Number(tracker.lastLevel);
      const currentLevel = Number(level);
      const leveledUp = currentLevel > previousLevel;

      tracker.lastLevel = currentLevel;
      await tracker.save();

      resolve({ previousLevel, currentLevel, leveledUp });
    } catch (error) {
      reject(error);
    }
  })
);

export default LevelTracker;
