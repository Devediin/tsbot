import { promoteUser } from '../scripts/server-groups';
import { massKick, massMove, sendMassPoke } from '../scripts/client';
import { insertCharacter, removeCharacter, addCharactersByGuildName, syncCharactersByGuildName } from '../api/models/characters';
import { parseLootSession } from '../utils/lootSplit.js';

export const ADMIN_GROUP_NAME = 'Bot Admin';
export const MODERATOR_GROUP_NAME = 'Bot Moderator';

export const BOT_NAME = 'NiideHelper';

export const VOCATIONS_ICONS = {
  'http://forums.xenobot.net/images/icons/icon4.png': 'None',
  'http://i.imgur.com/qAXsL2J.png': 'Druid',
  'http://i.imgur.com/rYWmtmw.png': 'Paladin',
  'http://i.imgur.com/jMWSztQ.png': 'Sorcerer',
  'http://i.imgur.com/sKqEwqU.png': 'Knight',
};

export const INITIAL_CHANNELS = [{
  type: 'spacer',
  name: '[*cspacer]▂',
}, {
  type: 'spacer',
  name: '[cspacer]* * * NiideHelp TS BOT * * *',
}, {
  type: 'spacer',
  name: '[*cspacer]▂▂',
}, {
  type: 'help',
  name: '[cspacer]Help channel',
  description: 'Send !help to see all the availables commands',
}, {
  type: 'dailyInfo',
  name: '[cspacer]Daily Info',
}, {
  type: 'spacer',
  name: '[*cspacer]▂▂▂▂▂▂',
},{
  type: 'enemy',
  name: '[cspacer]Enemys (0/0)',
}, {
  type: 'makersEnemy',
  name: '[cspacer]Enemy makers (0/0)',
}, {
  type: 'friend',
  name: '[cspacer]Friends (0/0)',
}, {
  type: 'neutral',
  name: '[cspacer]Neutrals (0/0)',
}, {
  type: 'makersFriend',
  name: '[cspacer]Friend makers (0/0)',
}, {
  type: 'possibleEnemys',
  name: '[cspacer]Possible Enemys (0/0)',
}, {
  type: 'spacer',
  name: '[*cspacer]▂▂▂▂',
}];

export const VOCATIONS = [
  'Master Sorcerer',
  'Sorcerer',
  'Elite Knight',
  'Knight',
  'Elder Druid',
  'Druid',
  'Royal Paladin',
  'Paladin',
  'None',
];

export const COMMANDS_MAP = {
  '!mk': {
    groups: [MODERATOR_GROUP_NAME, ADMIN_GROUP_NAME],
    exec: async (teamspeak, msgAsList) => {
      try {
        msgAsList.shift();
        const message = msgAsList.join(' ') || 'Removido pelo administrador.';
        const affected = await massKick(teamspeak, message);
        return {
          ok: true,
          message: `✅ Kick em massa executado com sucesso. Usuários removidos: ${affected}.`,
        };
      } catch (error) {
        console.error(error);
        return {
          ok: false,
          message: '❌ Erro ao executar o kick em massa.',
        };
      }
    },
    howToUse: '!mk ${mensagem} - expulsa todos os usuários conectados com uma mensagem opcional',
  },

  '!mp': {
    groups: [MODERATOR_GROUP_NAME, ADMIN_GROUP_NAME],
    exec: async (teamspeak, msgAsList) => {
      try {
        msgAsList.shift();
        const message = msgAsList.join(' ');

        if (!message) {
          return {
            ok: false,
            message: '❌ Você precisa informar a mensagem do mass poke.',
          };
        }

        const affected = await sendMassPoke(teamspeak, message);
        return {
          ok: true,
          message: `✅ Mass poke enviado com sucesso para ${affected} usuário(s).`,
        };
      } catch (error) {
        console.error(error);
        return {
          ok: false,
          message: '❌ Erro ao enviar o mass poke.',
        };
      }
    },
    howToUse: '!mp ${mensagem} - envia um poke para todos os usuários conectados',
  },

  '!mmove': {
    groups: [MODERATOR_GROUP_NAME, ADMIN_GROUP_NAME],
    exec: async (teamspeak, msgAsList, cid) => {
      try {
        const affected = await massMove(teamspeak, cid, msgAsList[1]);
        return {
          ok: true,
          message: `✅ Mass move executado com sucesso. Usuários movidos: ${affected}.`,
        };
      } catch (error) {
        console.error(error);
        return {
          ok: false,
          message: '❌ Erro ao executar o mass move.',
        };
      }
    },
    howToUse: '!mmove ${senhaDoCanal} - move todos para o canal onde você está',
  },

  '!addEnemy': {
    groups: [ADMIN_GROUP_NAME],
    exec: async (teamspeak, msgAsList) => {
      try {
        msgAsList.shift();
        const characterName = msgAsList.join(' ');

        if (!characterName) {
          return {
            ok: false,
            message: '❌ Você precisa informar o nome do personagem inimigo.',
          };
        }

        const result = await insertCharacter({ characterName, type: 'enemy' }, teamspeak);

        if (result?.alreadyExists) {
          return {
            ok: true,
            message: `ℹ️ O inimigo ${characterName} já estava cadastrado.`,
          };
        }

        return {
          ok: true,
          message: `✅ Inimigo adicionado com sucesso: ${characterName}.`,
        };
      } catch (error) {
        console.error(error);
        return {
          ok: false,
          message: '❌ Erro ao adicionar o inimigo.',
        };
      }
    },
    howToUse: '!addEnemy ${nome} - adiciona um personagem na lista de inimigos',
  },

  '!addEnemysByGuild': {
    groups: [ADMIN_GROUP_NAME],
    exec: async (_, msgAsList) => {
      try {
        msgAsList.shift();
        const guildName = msgAsList.join(' ');

        if (!guildName) {
          return {
            ok: false,
            message: '❌ Você precisa informar o nome da guild.',
          };
        }

        const result = await addCharactersByGuildName(guildName, 'enemy');

        return {
          ok: true,
          message: `✅ Guild de inimigos processada: ${guildName}. Adicionados: ${result.added}. Já existentes: ${result.alreadyExists}. Total encontrado: ${result.total}.`,
        };
      } catch (error) {
        console.error(error);
        return {
          ok: false,
          message: '❌ Erro ao adicionar a guild de inimigos.',
        };
      }
    },
    howToUse: '!addEnemysByGuild ${guild} - adiciona todos os membros da guild como inimigos',
  },

  '!removeEnemy': {
    groups: [ADMIN_GROUP_NAME],
    exec: async (teamspeak, msgAsList) => {
      try {
        msgAsList.shift();
        const characterName = msgAsList.join(' ');

        if (!characterName) {
          return {
            ok: false,
            message: '❌ Você precisa informar o nome do personagem inimigo.',
          };
        }

        const result = await removeCharacter({ characterName, type: 'enemy' });

        if (!result?.removed) {
          return {
            ok: true,
            message: `ℹ️ O inimigo ${characterName} não estava cadastrado.`,
          };
        }

        return {
          ok: true,
          message: `✅ Inimigo removido com sucesso: ${characterName}.`,
        };
      } catch (error) {
        console.error(error);
        return {
          ok: false,
          message: '❌ Erro ao remover o inimigo.',
        };
      }
    },
    howToUse: '!removeEnemy ${nome} - remove um personagem da lista de inimigos',
  },

  '!addFriend': {
    groups: [ADMIN_GROUP_NAME],
    exec: async (teamspeak, msgAsList) => {
      try {
        msgAsList.shift();
        const characterName = msgAsList.join(' ');

        if (!characterName) {
          return {
            ok: false,
            message: '❌ Você precisa informar o nome do personagem amigo.',
          };
        }

        const result = await insertCharacter({ characterName, type: 'friend' }, teamspeak);

        if (result?.alreadyExists) {
          return {
            ok: true,
            message: `ℹ️ O friend ${characterName} já estava cadastrado.`,
          };
        }

        return {
          ok: true,
          message: `✅ Friend adicionado com sucesso: ${characterName}.`,
        };
      } catch (error) {
        console.error(error);
        return {
          ok: false,
          message: '❌ Erro ao adicionar o friend.',
        };
      }
    },
    howToUse: '!addFriend ${nome} - adiciona um personagem na lista de friends',
  },

  '!addFriendsByGuild': {
    groups: [ADMIN_GROUP_NAME],
    exec: async (teamspeak, msgAsList) => {
      try {
        msgAsList.shift();
        const guildName = msgAsList.join(' ');

        if (!guildName) {
          return {
            ok: false,
            message: '❌ Você precisa informar o nome da guild.',
          };
        }

        const result = await addCharactersByGuildName(guildName, 'friend');

        return {
          ok: true,
          message: `✅ Guild de friends processada: ${guildName}. Adicionados: ${result.added}. Já existentes: ${result.alreadyExists}. Total encontrado: ${result.total}.`,
        };
      } catch (error) {
        console.error(error);
        return {
          ok: false,
          message: '❌ Erro ao adicionar a guild de friends.',
        };
      }
    },
    howToUse: '!addFriendsByGuild ${guild} - adiciona todos os membros da guild como friends',
  },

  '!syncGuildFriends': {
    groups: [ADMIN_GROUP_NAME],
    exec: async (teamspeak, msgAsList) => {
      try {
        msgAsList.shift();
        const guildName = msgAsList.join(' ');

        if (!guildName) {
          return {
            ok: false,
            message: '❌ Você precisa informar o nome da guild.',
          };
        }

        const result = await syncCharactersByGuildName(guildName, 'friend');

        return {
          ok: true,
          message: `✅ Sync de friends da guild ${guildName} concluído. Adicionados: ${result.added}. Removidos: ${result.removed}. Total na guild: ${result.total}.`,
        };
      } catch (error) {
        console.error(error);
        return {
          ok: false,
          message: '❌ Erro ao sincronizar a guild de friends.',
        };
      }
    },
    howToUse: '!syncGuildFriends ${guild} - sincroniza friends com a guild atual, removendo quem saiu e adicionando quem entrou',
  },

  '!syncGuildEnemys': {
    groups: [ADMIN_GROUP_NAME],
    exec: async (teamspeak, msgAsList) => {
      try {
        msgAsList.shift();
        const guildName = msgAsList.join(' ');

        if (!guildName) {
          return {
            ok: false,
            message: '❌ Você precisa informar o nome da guild.',
          };
        }

        const result = await syncCharactersByGuildName(guildName, 'enemy');

        return {
          ok: true,
          message: `✅ Sync de enemys da guild ${guildName} concluído. Adicionados: ${result.added}. Removidos: ${result.removed}. Total na guild: ${result.total}.`,
        };
      } catch (error) {
        console.error(error);
        return {
          ok: false,
          message: '❌ Erro ao sincronizar a guild de enemys.',
        };
      }
    },
    howToUse: '!syncGuildEnemys ${guild} - sincroniza enemys com a guild atual, removendo quem saiu e adicionando quem entrou',
  },

  '!removeFriend': {
    groups: [ADMIN_GROUP_NAME],
    exec: async (teamspeak, msgAsList) => {
      try {
        msgAsList.shift();
        const characterName = msgAsList.join(' ');

        if (!characterName) {
          return {
            ok: false,
            message: '❌ Você precisa informar o nome do personagem friend.',
          };
        }

        const result = await removeCharacter({ characterName, type: 'friend' });

        if (!result?.removed) {
          return {
            ok: true,
            message: `ℹ️ O friend ${characterName} não estava cadastrado.`,
          };
        }

        return {
          ok: true,
          message: `✅ Friend removido com sucesso: ${characterName}.`,
        };
      } catch (error) {
        console.error(error);
        return {
          ok: false,
          message: '❌ Erro ao remover o friend.',
        };
      }
    },
    howToUse: '!removeFriend ${nome} - remove um personagem da lista de friends',
  },

  '!addNeutral': {
    groups: [ADMIN_GROUP_NAME],
    exec: async (teamspeak, msgAsList) => {
      try {
        msgAsList.shift();
        const characterName = msgAsList.join(' ');

        await insertCharacter({ characterName, type: 'neutral' }, teamspeak);

        return {
          ok: true,
        };
      } catch (error) {
        console.error(error);
      }
    },
    howToUse: '!addNeutral ${enemyName}',
  },

  '!removeNeutral': {
    groups: [ADMIN_GROUP_NAME],
    exec: async (teamspeak, msgAsList) => {
      try {
        msgAsList.shift();
        const characterName = msgAsList.join(' ');

        await removeCharacter({ characterName, type: 'neutral' });

        return {
          ok: true,
        };
      } catch (error) {
        console.error(error);
      }
    },
    howToUse: '!removeNeutral ${enemyName}',
  },

  '!addMakersEnemy': {
    groups: [ADMIN_GROUP_NAME],
    exec: async (teamspeak, msgAsList) => {
      try {
        msgAsList.shift();
        const characterName = msgAsList.join(' ');

        await insertCharacter({ characterName, type: 'makersEnemy' }, teamspeak);

        return {
          ok: true,
        };
      } catch (error) {
        console.error(error);
      }
    },
    howToUse: '!addMakersEnemy ${enemyName}',
  },

  '!removeMakersEnemy': {
    groups: [ADMIN_GROUP_NAME],
    exec: async (teamspeak, msgAsList) => {
      try {
        msgAsList.shift();
        const characterName = msgAsList.join(' ');

        await removeCharacter({ characterName, type: 'makersEnemy' });

        return {
          ok: true,
        };
      } catch (error) {
        console.error(error);
      }
    },
    howToUse: '!removeMakersEnemy ${enemyName}',
  },

  '!addMakersFriend': {
    groups: [ADMIN_GROUP_NAME],
    exec: async (teamspeak, msgAsList) => {
      try {
        msgAsList.shift();
        const characterName = msgAsList.join(' ');

        await insertCharacter({ characterName, type: 'makersFriend' }, teamspeak);

        return {
          ok: true,
        };
      } catch (error) {
        console.error(error);
      }
    },
    howToUse: '!addMakersFriend ${enemyName}',
  },

  '!removeMakersFriend': {
    groups: [ADMIN_GROUP_NAME],
    exec: async (teamspeak, msgAsList) => {
      try {
        msgAsList.shift();
        const characterName = msgAsList.join(' ');

        await removeCharacter({ characterName, type: 'makersFriend' });

        return {
          ok: true,
        };
      } catch (error) {
        console.error(error);
      }
    },
    howToUse: '!removeMakersFriend ${enemyName}',
  },

  '!addPossibleEnemys': {
    groups: [ADMIN_GROUP_NAME],
    exec: async (teamspeak, msgAsList) => {
      try {
        msgAsList.shift();
        const characterName = msgAsList.join(' ');

        await insertCharacter({ characterName, type: 'possibleEnemys' }, teamspeak);

        return {
          ok: true,
        };
      } catch (error) {
        console.error(error);
      }
    },
    howToUse: '!addPossibleEnemys ${enemyName}',
  },

  '!removePossibleEnemys': {
    groups: [ADMIN_GROUP_NAME],
    exec: async (teamspeak, msgAsList) => {
      try {
        msgAsList.shift();
        const characterName = msgAsList.join(' ');

        await removeCharacter({ characterName, type: 'possibleEnemys' });

        return {
          ok: true,
        };
      } catch (error) {
        console.error(error);
      }
    },
    howToUse: '!removePossibleEnemys ${enemyName}',
  },

  '!addNewAdmin': {
    groups: [ADMIN_GROUP_NAME],
    exec: async (teamspeak, msgAsList) => {
      try {
        msgAsList.shift();
        const username = msgAsList.join(' ');

        await promoteUser(teamspeak, username, 'Bot Admin');

        return {
          ok: true,
        };
      } catch (error) {
        console.error(error);
      }
    },
    howToUse: '!addNewAdmin ${username}',
  },

  '!removeAdmin': {
    groups: [ADMIN_GROUP_NAME],
    exec: async (teamspeak, msgAsList) => {
      try {
        msgAsList.shift();
        const username = msgAsList.join(' ');

        await promoteUser(teamspeak, username, 'Bot Admin', 'remove');

        return {
          ok: true,
        };
      } catch (error) {
        console.error(error);
      }
    },
    howToUse: '!removeAdmin ${username}',
  },

  '!addNewModerator': {
    groups: [ADMIN_GROUP_NAME],
    exec: async (teamspeak, msgAsList) => {
      try {
        msgAsList.shift();
        const username = msgAsList.join(' ');

        await promoteUser(teamspeak, username, 'Bot Moderator');

        return {
          ok: true,
        };
      } catch (error) {
        console.error(error);
      }
    },
    howToUse: '!addNewModerator ${username}',
  },
  '!dailyinfo': {
    groups: [ADMIN_GROUP_NAME],
    exec: async (teamspeak, msgAsList) => {
      try {
        const { updateDailyInfoChannel, parseWorldBoard } = require('../api/crone/daily-info');

        msgAsList.shift();
        const boardText = msgAsList.join(' ');

        if (boardText) {
          parseWorldBoard(boardText);
        }

        await updateDailyInfoChannel(teamspeak);

        return {
          ok: true,
          message: '✅ Daily Info atualizado com sucesso.',
        };
      } catch (error) {
        console.error(error);
        return {
          ok: false,
          message: '❌ Erro ao atualizar Daily Info.',
        };
      }
    },
    howToUse: '!dailyinfo <texto do world board>',
  },
   '!loot': {
    groups: [], // ✅ NUNCA null
    exec: async (teamspeak, msgAsList) => {
      try {

        msgAsList.shift();
        const text = msgAsList.join(' ').trim();

        if (!text || text.length < 20) {
          return {
            ok: false,
            message: '❌ Log inválido ou incompleto.'
          };
        }

        const result = parseLootSession(text);

        let response = '';

        result.transfers.forEach(t => {
          const roundedK = Math.round(t.amount / 1000);
          const bankValue = t.amount - 1;

          response += `${t.from} deve pagar ${roundedK}k para ${t.to} (transfer ${bankValue} to ${t.to})\n`;
        });

        const totalKK = (result.totalProfit / 1000000).toFixed(2);
        const perPlayerK = Math.round(result.perPlayer / 1000);
        const perHourK = Math.round(result.profitPerHour / 1000);

        response += `\n💰 Lucro total: ${totalKK}kk (~${perPlayerK}k cada)\n`;
        response += `⏱️ ${result.duration} (~${perHourK}k/h por jogador)`;

        return {
          ok: true,
          message: response
        };

      } catch (err) {
        console.error('LOOT ERROR:', err);
        return {
          ok: false,
          message: '❌ Erro ao processar o loot.'
        };
      }
    },
    howToUse: '!loot <cole o log completo>'
  },
  '!removeModerator': {
    groups: [ADMIN_GROUP_NAME],
    exec: async (teamspeak, msgAsList) => {
      try {
        msgAsList.shift();
        const username = msgAsList.join(' ');

        await promoteUser(teamspeak, username, 'Bot Moderator', 'remove');

        return {
          ok: true,
        };
      } catch (error) {
        console.error(error);
      }
    },
    howToUse: '!removeModerator ${username}',
  },
};
