import { canDo } from '../utils/permissions';
import ServerGroups from '../api/models/server-groups';
import { formatHelpMessage } from '../utils/help';
import { isUserServerAdmin } from './server-groups';
import { BOT_NAME, COMMANDS_MAP } from '../utils/constants';
import { parseLootSession } from '../utils/lootSplit';

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

    if (command === '!help') {
      return invoker.message(formatHelpMessage(dbUserGroups));
    }

if (command === '!desc') {
  const link = `https://spkteam.duckdns.org`;
  return invoker.message(`📜 Gere sua descrição aqui:\n[url]${link}[/url]`);
}

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

    let response = '';
    response += '[b]RESULTADO DO LOOT SPLIT[/b]\n';
    response += '━━━━━━━━━━━━━━━━━━\n';

    result.transfers.forEach(t => {
      const roundedK = Math.round(t.amount / 1000);
      const bankValue = t.amount - 1;

      response += `• ${t.from} paga [b]${roundedK}k[/b] para ${t.to}\n`;
      response += `  transfer ${bankValue} to ${t.to}\n\n`;
    });

    const totalKK = (result.totalProfit / 1000000).toFixed(2);
    const perPlayerK = Math.round(result.perPlayer / 1000);
    const perHourK = Math.round(result.profitPerHour / 1000);

    response += '━━━━━━━━━━━━━━━━━━\n';
    response += `Total: [b]${totalKK}kk[/b]\n`;
    response += `Cada jogador: [b]${perPlayerK}k[/b]\n`;
    response += `Por hora: [b]${perHourK}k[/b]`;

    return invoker.message(response);

  } catch (err) {
    return invoker.message(
`[b]LOOT SPLIT[/b]
Erro ao processar o loot.`
    );
  }
}

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
