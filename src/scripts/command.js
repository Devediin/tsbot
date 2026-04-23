import axios from 'axios';
import moment from 'moment';
import { canDo } from '../utils/permissions';
import ServerGroups from '../api/models/server-groups';
import { formatHelpMessage } from '../utils/help';
import { isUserServerAdmin } from './server-groups';
import { BOT_NAME, COMMANDS_MAP } from '../utils/constants';
import { parseLootSession } from '../utils/lootSplit';
import { lastDeathKillers } from '../api/crone/lists.js';
import { getOnlineTrackerByName } from '../api/models/online-tracker.js';

const executeCommand = async (command, teamspeak, msgAsList, cid) => (
  new Promise(async (resolve, reject) => {
    const { exec } = COMMANDS_MAP[command];
    const response = await exec(teamspeak, msgAsList, cid);

    if (!response || !response.ok) {
      reject(response?.message || 'Command failed');
      return;
    }

    resolve(response);
  })
);

export const proceesCommand = async (event = {}, teamspeak) => {
  const { msg, invoker } = event;
  const { propcache } = invoker;

  const { cid, client_nickname, client_servergroups } = propcache;

  try {
    if (client_nickname === BOT_NAME) return;

    const msgAsList = msg.split(' ');
    const command = msgAsList[0];

    const parsedServerGroups = Array.isArray(client_servergroups)
      ? client_servergroups.map((group) => Number(group))
      : String(client_servergroups || '')
          .split(',')
          .map((group) => Number(group.trim()))
          .filter((group) => !Number.isNaN(group));

    const dbUserGroups = await ServerGroups.find({ sgid: { $in: parsedServerGroups } });

    /* HELP */
    if (command === '!help') {
      return invoker.message(formatHelpMessage(dbUserGroups));
    }

    /* LK */
    if (command === '!lk') {
      msgAsList.shift();
      const name = msgAsList.join(' ').trim().toLowerCase();

      if (!name) {
        return invoker.message('Use: !lk Nome');
      }

      const killers = lastDeathKillers.get(name);

      if (!killers || killers.length === 0) {
        return invoker.message('Nenhuma morte recente encontrada.');
      }

      return invoker.message(
`💀 Matadores de ${name}:

${killers.map(k => `• ${k}`).join('\n')}`
      );
    }

    /* DESC */
    if (command === '!desc') {
      return invoker.message(
`📜 Gere sua descrição no portal:
https://spkteam.duckdns.org`
      );
    }

    /* LOOT */
    if (command === '!loot') {
      msgAsList.shift();
      const text = msgAsList.join(' ').trim();

      if (!text || text.length < 20) {
        return invoker.message(
`[b]LOOT SPLIT[/b]
Log inválido ou incompleto.`
        );
      }

      try {
        const result = parseLootSession(text);

        let response = '💰 [b]RESULTADO DO LOOT[/b]\n';
        response += '━━━━━━━━━━━━━━━━━━\n';

        result.transfers.forEach(t => {
          const roundedK = Math.round(t.amount / 1000);
          const bankValue = t.amount - 1;

          response += `• ${t.from} paga [b]${roundedK}k[/b] para ${t.to}\n`;
          response += `  transfer ${bankValue} to ${t.to}\n\n`;
        });

        const totalKK = (result.totalProfit / 1000000).toFixed(2);
        const perPlayerK = Math.round(result.perPlayer / 1000);

        response += '━━━━━━━━━━━━━━━━━━\n';
        response += `Total: [b]${totalKK}kk[/b]\n`;
        response += `Cada jogador: [b]${perPlayerK}k[/b]`;

        return invoker.message(response);

      } catch {
        return invoker.message('❌ Erro ao processar loot.');
      }
    }

    /* SPY */
    if (command === '!spy') {
      msgAsList.shift();
      const name = msgAsList.join(' ').trim();

      if (!name) {
        return invoker.message('Use: !spy Nome');
      }

      try {
        const response = await axios.get(
          `https://api.tibiastalker.pl/api/tibia-stalker/v1/characters/${encodeURIComponent(name)}`
        );

        const data = response.data;

        if (!data.possibleInvisibleCharacters ||
            data.possibleInvisibleCharacters.length === 0) {
          return invoker.message(`🔎 Nenhum secundário encontrado para ${name}.`);
        }

        const sorted = data.possibleInvisibleCharacters
          .sort((a,b) => b.numberOfMatches - a.numberOfMatches)
          .slice(0, 5);

        return invoker.message(
`🕵️ Possíveis personagens de [b]${name}[/b]:

${sorted.map((p, i) =>
  `${i === 0 ? '👑' : '•'} ${p.otherCharacterName} — ${p.numberOfMatches} registros`
).join('\n')}`
        );

      } catch {
        return invoker.message('❌ Erro ao consultar TibiaStalker.');
      }
    }

    /* CHAR */
    if (command === '!char') {
      msgAsList.shift();
      const name = msgAsList.join(' ').trim();

      if (!name) {
        return invoker.message('Use: !char Nome');
      }

      try {
        const resp = await axios.get(
          `https://api.tibiadata.com/v4/character/${encodeURIComponent(name)}`
        );

        const info = resp.data.character.character;

        if (!info) {
          return invoker.message('❌ Personagem não encontrado.');
        }

        const tracker = await getOnlineTrackerByName(name);

        let onlineTime = 'Offline';
        if (tracker?.isOnline) {
          const diff = moment().diff(moment(tracker.firstSeenOnline), 'minutes');
          onlineTime =
            Math.floor(diff / 60) > 0
              ? `${Math.floor(diff / 60)}h ${diff % 60}m`
              : `${diff}m`;
        }

        return invoker.message(
`👤 [b]${name}[/b]
📊 Level: ${info.level}
🛡 Vocação: ${info.vocation}
🟢 Status: ${info.status}
⏱ Online hoje: ${onlineTime}`
        );

      } catch {
        return invoker.message('❌ Erro ao consultar personagem.');
      }
    }

    /* PERMISSÕES PADRÃO */
    const { ok, message } = await canDo(command, dbUserGroups);
    const isServerAdmin = await isUserServerAdmin(teamspeak, parsedServerGroups);

    const continueWithAddingAdmins =
      (command === '!addNewAdmin' || command === '!addNewModerator') && isServerAdmin;

    if (!continueWithAddingAdmins && !ok) {
      return invoker.message(message);
    }

    const response = await executeCommand(command, teamspeak, msgAsList, cid);

    if (response.message) {
      invoker.message(response.message);
    }

    return true;

  } catch (error) {
    invoker.message(String(error));
  }
};
