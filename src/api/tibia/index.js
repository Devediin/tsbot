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
    /* -------------------
      GUILD INFORMATION
      ------------------- */
  
  async getGuildInformation(guildName) {
    try {
      const { data } = await axios.get(`${TIBIA_DATA_API_URL}guild/${encodeURIComponent(guildName)}`);
      const members = data.guild?.members || [];
      const flatList = [];

      members.forEach(item => {
        // Se o item já tiver o .name, é a lista direta
        if (item.name) { 
          flatList.push(item.name); 
        } 
        // Se o item tiver .characters, é o formato por ranks
        else if (item.characters) { 
          item.characters.forEach(c => flatList.push(c.name)); 
        }
      });

      return flatList;
    } catch (error) {
      console.error(`[GUILD API ERROR] ${guildName}:`, error.message);
      return [];
    }
  }

/* ----------------------
    GET WORLD ONLINE
  ---------------------- */

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

    // Busca Criatura Boostada + Imagem
  async getBoostedCreature() {
    try {
      const { data } = await axios.get(`${TIBIA_DATA_API_URL}creatures`);
      const boosted = data.creatures?.boosted;
      return {
        name: boosted?.name || 'Desconhecido',
        image: boosted?.image_url || ''
      };
    } catch (e) { return { name: 'Desconhecido', image: '' }; }
  }

  // Busca Boss Boostado + Imagem
  async getBoostedBoss() {
    try {
      const { data } = await axios.get(`${TIBIA_DATA_API_URL}boostablebosses`);
      const boosted = data.boostable_bosses?.boosted;
      return {
        name: boosted?.name || 'Desconhecido',
        image: boosted?.image_url || ''
      };
    } catch (e) { return { name: 'Desconhecido', image: '' }; }
  }
}
