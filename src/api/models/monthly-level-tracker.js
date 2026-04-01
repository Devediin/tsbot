import mongoose from 'mongoose';
import moment from 'moment';

const monthlyLevelTrackerSchema = new mongoose.Schema({
  name: {
    type: String,
  },
  monthKey: {
    type: String,
  },
  startLevel: {
    type: Number,
    default: 0,
  },
});

monthlyLevelTrackerSchema.index({ name: 1, monthKey: 1 }, { unique: true });

const MonthlyLevelTracker = mongoose.model(
  'MonthlyLevelTracker',
  monthlyLevelTrackerSchema,
  'monthlyLevelTrackers'
);

export const ensureMonthlyLevelTracker = async ({ name, level }) => (
  new Promise(async (resolve, reject) => {
    try {
      const monthKey = moment().format('YYYY-MM');
      let tracker = await MonthlyLevelTracker.findOne({ name, monthKey });

      if (!tracker) {
        tracker = new MonthlyLevelTracker({
          name,
          monthKey,
          startLevel: Number(level),
        });

        await tracker.save();
      }

      resolve(tracker);
    } catch (error) {
      reject(error);
    }
  })
);

export const getMonthlyLevelTrackerByName = async (name) => (
  new Promise(async (resolve, reject) => {
    try {
      const monthKey = moment().format('YYYY-MM');
      const tracker = await MonthlyLevelTracker.findOne({ name, monthKey });
      resolve(tracker);
    } catch (error) {
      reject(error);
    }
  })
);

export default MonthlyLevelTracker;
