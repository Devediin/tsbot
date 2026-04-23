import mongoose from 'mongoose';
import LevelUpHistory from './level-up-history.js';

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

/* ✅ ESTA É A FUNÇÃO QUE O BOT REALMENTE USA */
export const setLevelTrackerLevel = async ({ name, level }) => (
  new Promise(async (resolve, reject) => {
    try {

      const existing = await LevelTracker.findOne({ name });

      const previousLevel = existing ? Number(existing.lastLevel) : null;
      const currentLevel = Number(level);
      const leveledUp =
        previousLevel !== null && currentLevel > previousLevel;

      const tracker = await LevelTracker.findOneAndUpdate(
        { name },
        { $set: { lastLevel: currentLevel } },
        { new: true, upsert: true }
      );

      /* ✅ SALVA LEVEL UP AQUI */
      if (leveledUp) {
        await LevelUpHistory.create({
          name,
          previousLevel,
          currentLevel,
          gained: currentLevel - previousLevel
        });
      }

      resolve(tracker);

    } catch (error) {
      reject(error);
    }
  })
);

/* Pode manter se quiser, mas não é usado no fluxo principal */
export const upsertLevelTracker = async ({ name, level }) => (
  new Promise(async (resolve, reject) => {
    try {
      const tracker = await setLevelTrackerLevel({ name, level });
      resolve(tracker);
    } catch (error) {
      reject(error);
    }
  })
);

export default LevelTracker;
