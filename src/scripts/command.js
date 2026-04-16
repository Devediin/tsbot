import { canDo } from '../utils/permissions';
import ServerGroups from '../api/models/server-groups';
import { formatHelpMessage } from '../utils/help';
import { isUserServerAdmin } from './server-groups';
import { BOT_NAME, COMMANDS_MAP } from '../utils/constants';

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
      invoker.message(formatHelpMessage(dbUserGroups));
      return;
    }
    if (command === '!desc') {
  const link = `http://${process.env.WEB_PUBLIC_URL}:3000`;
  return invoker.message(`📜 Gere sua descrição aqui:\n[url]${link}[/url]`);
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
