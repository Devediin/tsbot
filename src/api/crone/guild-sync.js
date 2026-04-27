import Characters from '../models/characters.js';
import { sendMassPrivateMessage } from '../../scripts/client.js';
import TibiaAPI from '../tibia/index.js';

const { WORLD_NAME } = process.env;
const tibiaAPI = new TibiaAPI({ worldName: WORLD_NAME });

export const syncGuildsTask = async (teamspeak, guildName, type) => {
  try {
    const apiMembers = await tibiaAPI.getGuildInformation(guildName);

    // --- TRAVA DE SEGURANÇA ---
    // Se a API falhar ou vier vazia, NÃO faz o sync para não apagar o banco por erro.
    if (!apiMembers || apiMembers.length === 0) {
      console.log(`[SYNC] Guilda ${guildName} retornou vazia. Abortando para evitar remoção massiva.`);
      return;
    }

    const dbMembers = await Characters.find({ type: type, guildName: guildName });
    // ... resto do código igual ...
    const dbNames = dbMembers.map(c => c.characterName);

    const joined = apiMembers.filter(name => !dbNames.includes(name));
    const left = dbNames.filter(name => !apiMembers.includes(name));

    const emoji = type === 'friend' ? '🟢' : '🔴';
    const typeLabel = type === 'friend' ? 'FRIEND' : 'ENEMY';

    // TRATAR ENTRADAS E RENAMES
    for (const name of joined) {
      let renameMsg = '';
      try {
        const info = await tibiaAPI.getCharacterInformation(name);
        const former = info.info?.former_names || [];
        const oldName = left.find(lName => former.includes(lName));
        if (oldName) {
          renameMsg = ` [b](Trocou de nome! Antigo: ${oldName})[/b]`;
          await Characters.deleteOne({ characterName: oldName });
          const idx = left.indexOf(oldName);
          if (idx > -1) left.splice(idx, 1);
        }
      } catch (e) {}

      await Characters.create({ characterName: name, type: type, guildName: guildName });
      await sendMassPrivateMessage(teamspeak, `${emoji} [b]GUILD ${typeLabel}:[/b] ${name} ENTROU na guild ${guildName}.${renameMsg}`);
    }

    // TRATAR SAÍDAS
    for (const name of left) {
      await Characters.deleteOne({ characterName: name });
      await sendMassPrivateMessage(teamspeak, `${emoji} [b]GUILD ${typeLabel}:[/b] ${name} SAIU da guild ${guildName}.`);
    }
  } catch (error) {
    console.error(`[SYNC ERROR] ${guildName}:`, error);
  }
};
