import axios from 'axios';
import moment from 'moment';

const TIBIA_DATA_API_URL = 'https://api.tibiadata.com/v4/';
const RECENT_DEATH_WINDOW_MINUTES = 15;

export default class TibiaAPI {
  constructor({ worldName }) {
    this.worldName = worldName;
  }

  async getCharacterInformation(characterName) {
    const { data } = await axios.get(
      `${TIBIA_DATA_API_URL}character/${encodeURIComponent(characterName)}`
    );

    const characterRoot = data.character || {};
    const characterData = characterRoot.character || {};
    const allDeaths = characterRoot.deaths || [];
    const characters = characterRoot.other_characters || [];

    const selfCharacter =
      characters.find((c) => c.name === characterData.name) || null;

    const recentDeaths = allDeaths.filter(({ time }) => {
      if (!time) return false;
      const deathMoment = moment(time);
      if (!deathMoment.isValid()) return false;
      return moment().isBefore(deathMoment.clone().add(RECENT_DEATH_WINDOW_MINUTES, 'minutes'));
    });

    return {
      info: {
        ...characterData,
        status: selfCharacter?.status || 'offline',
      },
      kills: recentDeaths,
      characters,
    };
  }

  async getGuildInformation(guildName) {
    const { data } = await axios.get(
      `${TIBIA_DATA_API_URL}guild/${encodeURIComponent(guildName)}`
    );

    return data.guild?.members || [];
  }

  async getWorldOnline() {
    const { data } = await axios.get(
      `${TIBIA_DATA_API_URL}world/${encodeURIComponent(this.worldName)}`
    );

    const worldData = data.world || {};
    const onlinePlayers = worldData.online_players || [];

    return onlinePlayers;
  }
}
