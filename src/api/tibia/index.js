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

  async getWorldOverview() {
    const { data } = await axios.get(
      `${TIBIA_DATA_API_URL}world/${encodeURIComponent(this.worldName)}`
    );

    const worldData = data.world || {};

    return {
      name: worldData.name || this.worldName,
      onlinePlayers: worldData.online_players || [],
      boostedCreature: worldData.boosted_creature || null,
      boostedBoss: worldData.boosted_boss || null,
      recordOnline: worldData.record_online || null,
      location: worldData.location || null,
      pvpType: worldData.pvp_type || null,
      battleyeDate: worldData.battleye_date || null,
      tournamentWorldType: worldData.tournament_world_type || null,
      gameWorldType: worldData.game_world_type || null,
      creationDate: worldData.creation_date || null,
      transferType: worldData.transfer_type || null,
      onlineCount: Array.isArray(worldData.online_players) ? worldData.online_players.length : 0,
    };
  }

  // NOVO: Busca Criatura Boostada (Endpoint específico v4)
  async getBoostedCreature() {
    try {
      const { data } = await axios.get(`${TIBIA_DATA_API_URL}creatures`);
      return data.creatures?.boosted?.name || 'Desconhecido';
    } catch (e) {
      return 'Desconhecido';
    }
  }

  // NOVO: Busca Boss Boostado (Endpoint específico v4)
  async getBoostedBoss() {
    try {
      const { data } = await axios.get(`${TIBIA_DATA_API_URL}boostablebosses`);
      return data.boostable_bosses?.boosted?.name || 'Desconhecido';
    } catch (e) {
      return 'Desconhecido';
    }
  }
}
