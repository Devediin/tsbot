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
  guildName: {
    type: String,
    default: null,
  },
  isFocus: {
    type: Boolean,
    default: false,
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

      const characters = members.map(({ name }) => ({
        characterName: name,
        type,
        guildName,
      }));

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

export const syncCharactersByGuildName = async (guildName, type) => {
  try {
    const members = await tibiaAPI.getGuildInformation(guildName);
    const currentMemberNames = new Set(members.map(({ name }) => name));

    const dbCharacters = await Characters.find({ type, guildName });
    const dbNames = new Set(dbCharacters.map(({ characterName }) => characterName));

    let removed = 0;
    for (const doc of dbCharacters) {
      if (!currentMemberNames.has(doc.characterName)) {
        await Characters.findOneAndDelete({
          characterName: doc.characterName,
          type,
          guildName,
        });
        removed++;
      }
    }

    let added = 0;
    for (const member of members) {
      if (!dbNames.has(member.name)) {
        const newChar = new Characters({
          characterName: member.name,
          type,
          guildName,
        });
        await newChar.save();
        added++;
      }
    }

    return {
      added,
      removed,
      total: members.length,
      currentInDb: members.length - removed + added,
    };
  } catch (error) {
    throw error;
  }
};

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
