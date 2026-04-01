import mongoose from 'mongoose';
import TibiaAPI from '../tibia';

const { WORLD_NAME } = process.env;

const tibiaAPI = new TibiaAPI({ worldName: WORLD_NAME });

const characterSchema = new mongoose.Schema({
  type: {
    type: String,
  },
  characterName: {
    type: String,
  },
});

const Characters = mongoose.model('Characters', characterSchema, 'characters');

export const removeCharacter = async (character) => (
  new Promise(async (resolve, reject) => {
    try {
      const removed = await Characters.findOneAndDelete(character);

      if (!removed) {
        resolve({ removed: false });
        return;
      }

      resolve({ removed: true });
    } catch (error) {
      reject(error);
    }
  })
);

export const addCharactersByGuildName = async (guildName, type) => (
  new Promise(async (resolve, reject) => {
    try {
      const members = await tibiaAPI.getGuildInformation(guildName);

      const characters = members.map(({ name }) => ({ characterName: name, type }));

      const results = await Promise.all(characters.map(insertCharacter));

      const added = results.filter((result) => result && result.added).length;
      const alreadyExists = results.filter((result) => result && result.alreadyExists).length;

      resolve({
        added,
        alreadyExists,
        total: characters.length,
      });
    } catch (error) {
      reject(error);
    }
  })
);

export const insertCharacter = async (character) => (
  new Promise(async (resolve, reject) => {
    try {
      const { characterName } = character;

      const query = await Characters.findOne({ characterName });

      if (query) {
        resolve({
          added: false,
          alreadyExists: true,
        });
        return;
      }

      const newCharacter = new Characters(character);

      await newCharacter.save();

      resolve({
        added: true,
        alreadyExists: false,
      });
    } catch (error) {
      reject(error);
    }
  })
);

export default Characters;
