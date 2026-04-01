import mongoose from 'mongoose';

const metaSchema = new mongoose.Schema({
  lastCheck: {
    type: Date,
  },
  deathCheck: {
    type: Date,
  }
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
        });
      }

      if (!queryMeta.lastCheck || !queryMeta.deathCheck) {
        queryMeta = await Meta.findByIdAndUpdate(
          queryMeta._id,
          {
            $set: {
              lastCheck: queryMeta.lastCheck || new Date(),
              deathCheck: queryMeta.deathCheck || new Date(),
            }
          },
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

export default Meta;
