import Characters from '../models/characters.js';
import { sendMassPrivateMessage } from '../../scripts/client.js';
import TibiaAPI from '../tibia/index.js';

const { WORLD_NAME } = process.env;
const tibiaAPI = new TibiaAPI({ worldName: WORLD_NAME });

export const syncGuildsTask = async (teamspeak, guildName, type) => {
  try {
    const apiMembers = await tibiaAPI.getGuildInformation(guildName);

    // TRAVA 1: Se API retornar vazio, aborta para não apagar o banco
    if (!apiMembers || apiMembers.length === 0) {
      console.log(`[SYNC] ${guildName} retornou vazia da API. Abortando.`);
      return;
    }

    const dbMembers = await Characters.find({ 
      type: type, 
      guildName: guildName, 
      characterName: { $exists: true, $ne: null } 
    });
    const dbNames = dbMembers.map(c => c.characterName);

    const joined = apiMembers.filter(name => name && !dbNames.includes(name));
    const left = dbNames.filter(name => name && !apiMembers.includes(name));

    // TRAVA 2: Se mais de 50% da guild "saiu", algo está errado. Aborta.
    const totalInDb = dbNames.length;
    if (totalInDb > 0 && left.length > totalInDb * 0.5) {
      console.log(`[SYNC] ${guildName}: muitas saídas detectadas (${left.length}/${totalInDb}). Possível erro da API. Abortando.`);
      return;
    }

    const emoji = type === 'friend' ? '🟢' : '🔴';
    const typeLabel = type === 'friend' ? 'FRIEND' : 'ENEMY';

    // TRATAR ENTRADAS E RENAMES
    for (const name of joined) {
      if (!name) continue;

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

      // TRAVA 3: Não duplicar — só cria se não existir
      const exists = await Characters.findOne({ characterName: name, type: type });
      if (exists) continue;

      await Characters.create({ characterName: name, type: type, guildName: guildName });
      await sendMassPrivateMessage(teamspeak, `${emoji} [b]GUILD ${typeLabel}:[/b] ${name} ENTROU na guild ${guildName}.${renameMsg}`);
    }

    // TRATAR SAÍDAS
    for (const name of left) {
      if (!name) continue;
      await Characters.deleteOne({ characterName: name, type: type });
      await sendMassPrivateMessage(teamspeak, `${emoji} [b]GUILD ${typeLabel}:[/b] ${name} SAIU da guild ${guildName}.`);
    }

    console.log(`[SYNC] ${guildName} concluída. +${joined.length} -${left.length}`);

  } catch (error) {
    console.error(`[SYNC ERROR] ${guildName}:`, error);
  }
};
