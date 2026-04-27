import Characters from '../models/characters.js';
import { sendMassPrivateMessage } from '../../scripts/client.js';
import TibiaAPI from '../tibia/index.js';

const { WORLD_NAME } = process.env;
const tibiaAPI = new TibiaAPI({ worldName: WORLD_NAME });

export const syncGuildsTask = async (teamspeak, guildName, type) => {
  try {
    const apiMembers = await tibiaAPI.getGuildInformation(guildName);

    // Buscamos apenas quem tem nome preenchido no banco para comparar
    const dbMembers = await Characters.find({ type: type, guildName: guildName, characterName: { $exists: true } });
    const dbNames = dbMembers.map(c => c.characterName);

    const joined = apiMembers.filter(name => name && !dbNames.includes(name));
    const left = dbNames.filter(name => name && !apiMembers.includes(name));

    const emoji = type === 'friend' ? '🟢' : '🔴';
    const typeLabel = type === 'friend' ? 'FRIEND' : 'ENEMY';

    // TRATAR ENTRADAS E RENAMES
    for (const name of joined) {
      if (!name) continue; // Pula se o nome for inválido

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

      // GRAVAÇÃO NO BANCO
      await Characters.create({ characterName: name, type: type, guildName: guildName });
      await sendMassPrivateMessage(teamspeak, `${emoji} [b]GUILD ${typeLabel}:[/b] ${name} ENTROU na guild ${guildName}.${renameMsg}`);
    }

    // TRATAR SAÍDAS
    for (const name of left) {
      if (!name) continue;
      await Characters.deleteOne({ characterName: name });
      await sendMassPrivateMessage(teamspeak, `${emoji} [b]GUILD ${typeLabel}:[/b] ${name} SAIU da guild ${guildName}.`);
    }
  } catch (error) {
    console.error(`[SYNC ERROR] ${guildName}:`, error);
  }
};
