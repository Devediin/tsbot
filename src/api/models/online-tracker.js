import mongoose from 'mongoose';

const onlineTrackerSchema = new mongoose.Schema({
  name: {
    type: String,
    unique: true,
  },
  firstSeenOnline: {
    type: Date,
    default: null,
  },
  lastSeenOnline: {
    type: Date,
    default: null,
  },
  isOnline: {
    type: Boolean,
    default: false,
  },
});

const OnlineTracker = mongoose.model('OnlineTracker', onlineTrackerSchema, 'onlineTrackers');

export const upsertOnlineTracker = async ({ name, isOnline }) => (
  new Promise(async (resolve, reject) => {
    try {
      const now = new Date();
      const existing = await OnlineTracker.findOne({ name });

      if (!existing) {
        const tracker = new OnlineTracker({
          name,
          firstSeenOnline: isOnline ? now : null,
          lastSeenOnline: now,
          isOnline,
        });

        await tracker.save();
        resolve(tracker);
        return;
      }

      if (isOnline) {
        if (!existing.isOnline || !existing.firstSeenOnline) {
          existing.firstSeenOnline = now;
        }
        existing.lastSeenOnline = now;
        existing.isOnline = true;
      } else {
        existing.lastSeenOnline = now;
        existing.isOnline = false;
        existing.firstSeenOnline = null;
      }

      await existing.save();
      resolve(existing);
    } catch (error) {
      reject(error);
    }
  })
);

export const getOnlineTrackerByName = async (name) => (
  new Promise(async (resolve, reject) => {
    try {
      const tracker = await OnlineTracker.findOne({ name });
      resolve(tracker);
    } catch (error) {
      reject(error);
    }
  })
);

export default OnlineTracker;
