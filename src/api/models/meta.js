import mongoose from 'mongoose';
import moment from 'moment';

const deathCacheEntrySchema = new mongoose.Schema({
  characterName: {
    type: String,
    required: true,
  },
  time: {
    type: String,
    required: true,
  },
}, { _id: false });

const metaSchema = new mongoose.Schema({
  lastCheck: {
    type: Date,
  },
  deathCheck: {
    type: Date,
  },
  deathCache: {
    type: [deathCacheEntrySchema],
    default: [],
  },
});

const Meta = mongoose.model('Meta', metaSchema, 'meta');

export const ensureMeta = async () => (
  new Promise(async (resolve, reject) => {
    try {
      let queryMeta = await Meta.findOne();

      if (!queryMeta) {
        queryMeta = await Meta.create({
          lastCheck: new Date(),
          deathCheck: new Date(),
          deathCache: [],
        });
      }

      const updates = {};

      if (!queryMeta.lastCheck) {
        updates.lastCheck = new Date();
      }

      if (!queryMeta.deathCheck) {
        updates.deathCheck = new Date();
      }

      if (!Array.isArray(queryMeta.deathCache)) {
        updates.deathCache = [];
      }

      if (Object.keys(updates).length > 0) {
        queryMeta = await Meta.findByIdAndUpdate(
          queryMeta._id,
          { $set: updates },
          { new: true }
        );
      }

      resolve(queryMeta);
    } catch (error) {
      reject(error);
    }
  })
);

export const updateMeta = async () => (
  new Promise(async (resolve, reject) => {
    try {
      const queryMeta = await ensureMeta();

      await Meta.findByIdAndUpdate(queryMeta._id, { $set: { lastCheck: new Date() } });

      resolve();
    } catch (error) {
      reject(error);
    }
  })
);

export const updateDeathCheck = async () => (
  new Promise(async (resolve, reject) => {
    try {
      const queryMeta = await ensureMeta();

      await Meta.findByIdAndUpdate(queryMeta._id, { $set: { deathCheck: new Date() } });

      resolve();
    } catch (error) {
      reject(error);
    }
  })
);

export const getDeathsCache = async () => (
  new Promise(async (resolve, reject) => {
    try {
      const queryMeta = await ensureMeta();
      resolve(Array.isArray(queryMeta.deathCache) ? queryMeta.deathCache : []);
    } catch (error) {
      reject(error);
    }
  })
);

export const addDeathsCache = async ({ characterName, time }) => (
  new Promise(async (resolve, reject) => {
    try {
      const queryMeta = await ensureMeta();

      await Meta.findByIdAndUpdate(
        queryMeta._id,
        {
          $push: {
            deathCache: { characterName, time },
          },
        }
      );

      resolve();
    } catch (error) {
      reject(error);
    }
  })
);

export const removeOldDeathsCache = async () => (
  new Promise(async (resolve, reject) => {
    try {
      const queryMeta = await ensureMeta();
      const deathCache = Array.isArray(queryMeta.deathCache) ? queryMeta.deathCache : [];
      const now = moment();

      const filteredDeathCache = deathCache.filter(({ time }) => {
        if (!time) return false;

        const deathMoment = moment(time);
        if (!deathMoment.isValid()) return false;

        return now.isBefore(deathMoment.clone().add(30, 'minutes'));
      });

      await Meta.findByIdAndUpdate(
        queryMeta._id,
        { $set: { deathCache: filteredDeathCache } }
      );

      resolve(filteredDeathCache);
    } catch (error) {
      reject(error);
    }
  })
);

export default Meta;
