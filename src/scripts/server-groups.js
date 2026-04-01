import ServerGroups, { insertServerGroup } from '../api/models/server-groups';
import { ADMIN_GROUP_NAME, MODERATOR_GROUP_NAME } from '../utils/constants';

export const isUserServerAdmin = async (teamspeak, clientServerGroups = []) => (
  new Promise(async (resolve, reject) => {
    try {
      const serverGroupsNameOfUser = await Promise.all(
        clientServerGroups.map((serverGroupId) => (
          new Promise(async (resolve, reject) => {
            try {
              const serverGroup = await teamspeak.getServerGroupByID(serverGroupId);

              if (!serverGroup) {
                resolve('');
                return;
              }

              const { propcache } = serverGroup;
              const { name } = propcache;

              resolve(name);
            } catch (error) {
              reject(error);
            }
          })
        ))
      );

      resolve(serverGroupsNameOfUser.includes('Server Admin'));
    } catch (error) {
      reject(error);
    }
  })
);

export const promoteUser = async (teamspeak, username, name, type = 'add') => (
  new Promise(async (resolve, reject) => {
    try {
      const serverGroup = await ServerGroups.findOne({ name });

      if (!serverGroup) {
        resolve();
        return;
      }

      const sgid = Number(serverGroup.sgid);

      const client = await teamspeak.getClientByName(username);

      if (!client) {
        resolve();
        return;
      }

      const { propcache: clientPropcache } = client;
      const clientDatabaseId = Number(clientPropcache.client_database_id);

      if (!sgid || !clientDatabaseId) {
        resolve();
        return;
      }

      if (type === 'add') {
        await teamspeak.serverGroupAddClient(clientDatabaseId, sgid);
      } else {
        await teamspeak.serverGroupDelClient(clientDatabaseId, sgid);
      }

      resolve();
    } catch (error) {
      reject(error);
    }
  })
);

export const createServerGroups = async (spinner, teamspeak) => (
  new Promise(async (resolve, reject) => {
    try {
      spinner.text = 'Creating Server Groups';

      await teamspeak.serverGroupCreate(MODERATOR_GROUP_NAME, 1);
      await teamspeak.serverGroupCreate(ADMIN_GROUP_NAME, 1);

      const {
        propcache: { sgid: serverGroupIdAdmin }
      } = await teamspeak.getServerGroupByName(ADMIN_GROUP_NAME);

      const {
        propcache: { sgid: serverGroupIdModerator }
      } = await teamspeak.getServerGroupByName(MODERATOR_GROUP_NAME);

      const { client_id } = await teamspeak.whoami();
      const me = await teamspeak.getClientByID(client_id);

      const {
        propcache: { client_database_id }
      } = me;

      await teamspeak.serverGroupAddClient(Number(client_database_id), Number(serverGroupIdAdmin));
      await teamspeak.serverGroupAddClient(Number(client_database_id), Number(serverGroupIdModerator));

      await insertServerGroup({ sgid: Number(serverGroupIdAdmin), name: ADMIN_GROUP_NAME });
      await insertServerGroup({ sgid: Number(serverGroupIdModerator), name: MODERATOR_GROUP_NAME });

      resolve();
    } catch (error) {
      reject(error);
    }
  })
);
