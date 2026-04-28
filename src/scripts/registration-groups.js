import TibiaAPI from '../api/tibia';

const { WORLD_NAME } = process.env;
const tibiaAPI = new TibiaAPI({ worldName: WORLD_NAME });

const VOCATION_GROUPS = {
  '[EK]': 17,
  '[RP]': 18,
  '[ED]': 19,
  '[MS]': 20,
  '[EM]': 21,
};

const LEVEL_GROUPS = [
  { name: '[2000+]', sgid: 53, min: 2000 },
  { name: '[1900+]', sgid: 52, min: 1900 },
  { name: '[1800+]', sgid: 51, min: 1800 },
  { name: '[1700+]', sgid: 50, min: 1700 },
  { name: '[1600+]', sgid: 49, min: 1600 },
  { name: '[1500+]', sgid: 48, min: 1500 },
  { name: '[1400+]', sgid: 47, min: 1400 },
  { name: '[1300+]', sgid: 46, min: 1300 },
  { name: '[1200+]', sgid: 45, min: 1200 },
  { name: '[1100+]', sgid: 44, min: 1100 },
  { name: '[1000+]', sgid: 43, min: 1000 },
  { name: '[950+]', sgid: 42, min: 950 },
  { name: '[900+]', sgid: 41, min: 900 },
  { name: '[850+]', sgid: 40, min: 850 },
  { name: '[800+]', sgid: 39, min: 800 },
  { name: '[750+]', sgid: 38, min: 750 },
  { name: '[700+]', sgid: 37, min: 700 },
  { name: '[650+]', sgid: 36, min: 650 },
  { name: '[600+]', sgid: 35, min: 600 },
  { name: '[550+]', sgid: 34, min: 550 },
  { name: '[500+]', sgid: 33, min: 500 },
  { name: '[450+]', sgid: 32, min: 450 },
  { name: '[400+]', sgid: 31, min: 400 },
  { name: '[350+]', sgid: 30, min: 350 },
  { name: '[300+]', sgid: 29, min: 300 },
  { name: '[250+]', sgid: 28, min: 250 },
  { name: '[200+]', sgid: 27, min: 200 },
  { name: '[150+]', sgid: 26, min: 150 },
  { name: '[100+]', sgid: 25, min: 100 },
  { name: '[50+]', sgid: 24, min: 50 },
  { name: '[8+]', sgid: 23, min: 8 },
];

const SEM_DESCRICAO_GROUP_ID = 56;
const ONLINE_GROUP_ID = 58;
const OFFLINE_GROUP_ID = 59;

const extractMainCharacter = (description = '') => {
  if (!description || typeof description !== 'string') return null;

  const normalized = description.replace(/\\s/g, ' ').trim();
  const match = normalized.match(/Main:\s*(.+?)(\s*-\s*Quem registrou:|$)/i);

  if (!match || !match[1]) {
    return null;
  }

  return match[1].trim();
};

const getVocationGroupId = (vocation = '') => {
  if (vocation.includes('Elite Knight') || vocation === 'Knight') return VOCATION_GROUPS['[EK]'];
  if (vocation.includes('Royal Paladin') || vocation === 'Paladin') return VOCATION_GROUPS['[RP]'];
  if (vocation.includes('Elder Druid') || vocation === 'Druid') return VOCATION_GROUPS['[ED]'];
  if (vocation.includes('Master Sorcerer') || vocation === 'Sorcerer') return VOCATION_GROUPS['[MS]'];
  if (vocation.includes('Exalted Monk') || vocation === 'Monk') return VOCATION_GROUPS['[EM]'];
  return null;
};

const getLevelGroupId = (level = 0) => {
  const found = LEVEL_GROUPS.find((group) => Number(level) >= group.min);
  return found ? found.sgid : null;
};

const removeGroupIfPresent = async (teamspeak, clientDatabaseId, currentGroups = [], sgid) => {
  if (!currentGroups.includes(Number(sgid))) return false;

  try {
    await teamspeak.serverGroupDelClient(Number(clientDatabaseId), Number(sgid));
    return true;
  } catch (e) {
    console.error(`Erro removendo grupo ${sgid} do cliente DBID ${clientDatabaseId}:`, e.message || e);
    return false;
  }
};

const addGroupIfMissing = async (teamspeak, clientDatabaseId, currentGroups = [], sgid) => {
  if (currentGroups.includes(Number(sgid))) return false;

  try {
    await teamspeak.serverGroupAddClient(Number(clientDatabaseId), Number(sgid));
    return true;
  } catch (e) {
    console.error(`Erro adicionando grupo ${sgid} ao cliente DBID ${clientDatabaseId}:`, e.message || e);
    return false;
  }
};

const syncOnlineOfflineGroups = async (teamspeak, clientDatabaseId, currentGroups = [], isOnline) => {
  if (isOnline) {
    await removeGroupIfPresent(teamspeak, clientDatabaseId, currentGroups, OFFLINE_GROUP_ID);
    await addGroupIfMissing(teamspeak, clientDatabaseId, currentGroups, ONLINE_GROUP_ID);
    return;
  }

  await removeGroupIfPresent(teamspeak, clientDatabaseId, currentGroups, ONLINE_GROUP_ID);
  await addGroupIfMissing(teamspeak, clientDatabaseId, currentGroups, OFFLINE_GROUP_ID);
};

const removeOnlineOfflineGroups = async (teamspeak, clientDatabaseId, currentGroups = []) => {
  await removeGroupIfPresent(teamspeak, clientDatabaseId, currentGroups, ONLINE_GROUP_ID);
  await removeGroupIfPresent(teamspeak, clientDatabaseId, currentGroups, OFFLINE_GROUP_ID);
};

export const syncRegistrationGroups = async (teamspeak) => {
  const clients = await teamspeak.clientList({ client_type: 0 });

  let worldOnline = [];

  try {
    worldOnline = await tibiaAPI.getWorldOnline();
  } catch (e) {
    console.error('[REGSYNC] Erro buscando online do mundo:', e.message || e);
  }

  const worldOnlineNames = new Set(
    (worldOnline || [])
      .map((player) => (player && player.name ? String(player.name).trim().toLowerCase() : null))
      .filter(Boolean)
  );

  for (const client of clients) {
    try {
      let info = client.propcache || {};

      try {
        if (typeof client.getInfo === 'function') {
          info = await client.getInfo();
        } else if (client.clid && typeof teamspeak.clientInfo === 'function') {
          info = await teamspeak.clientInfo(client.clid);
        }
      } catch (e) {
        console.error('Erro buscando client info detalhado:', e.message || e);
      }

      const clientDatabaseId = Number(
        info.client_database_id ||
        info.clientDatabaseId ||
        (client.propcache && client.propcache.client_database_id)
      );

      const clientType = Number(
        info.client_type ||
        info.clientType ||
        (client.propcache && client.propcache.client_type) ||
        0
      );

      const clientDescription =
        info.client_description ||
        info.clientDescription ||
        (client.propcache && client.propcache.client_description) ||
        '';

      const clientServerGroupsRaw =
        info.client_servergroups ||
        info.clientServergroups ||
        (client.propcache && client.propcache.client_servergroups) ||
        '';

      const clientNickname =
        info.client_nickname ||
        info.clientNickname ||
        (client.propcache && client.propcache.client_nickname) ||
        'Desconhecido';

      if (clientType !== 0) continue;
      if (!clientDatabaseId || clientDatabaseId <= 0) continue;

      const currentGroups = String(clientServerGroupsRaw)
        .split(',')
        .map((group) => Number(group.trim()))
        .filter((group) => !Number.isNaN(group));

      const mainCharacter = extractMainCharacter(clientDescription);

      console.log(`[REGSYNC] ${clientNickname} | DBID ${clientDatabaseId} | desc="${clientDescription}" | main="${mainCharacter}"`);

      if (!mainCharacter) {
        await addGroupIfMissing(teamspeak, clientDatabaseId, currentGroups, SEM_DESCRICAO_GROUP_ID);
        await removeOnlineOfflineGroups(teamspeak, clientDatabaseId, currentGroups);
        continue;
      }

      await removeGroupIfPresent(teamspeak, clientDatabaseId, currentGroups, SEM_DESCRICAO_GROUP_ID);

      try {
        const characterData = await tibiaAPI.getCharacterInformation(mainCharacter);

        console.log(`[REGSYNC] Char lookup ${mainCharacter}:`, JSON.stringify(characterData));

        if (!characterData || !characterData.info) {
          const isOnline = worldOnlineNames.has(String(mainCharacter).trim().toLowerCase());

          console.log(
            `[REGSYNC] Sem info válida para ${mainCharacter}. Mantendo grupos atuais. online=${isOnline}`
          );

          await syncOnlineOfflineGroups(teamspeak, clientDatabaseId, currentGroups, isOnline);
          continue;
        }

        const { vocation, level } = characterData.info;

        const targetVocationGroupId = getVocationGroupId(vocation);
        const targetLevelGroupId = getLevelGroupId(level);
        const isOnline = worldOnlineNames.has(String(mainCharacter).trim().toLowerCase());

        for (const sgid of Object.values(VOCATION_GROUPS)) {
          if (sgid !== targetVocationGroupId) {
            await removeGroupIfPresent(teamspeak, clientDatabaseId, currentGroups, sgid);
          }
        }

        for (const levelGroup of LEVEL_GROUPS) {
          if (levelGroup.sgid !== targetLevelGroupId) {
            await removeGroupIfPresent(teamspeak, clientDatabaseId, currentGroups, levelGroup.sgid);
          }
        }

        if (targetVocationGroupId) {
          await addGroupIfMissing(teamspeak, clientDatabaseId, currentGroups, targetVocationGroupId);
        }

        if (targetLevelGroupId) {
          await addGroupIfMissing(teamspeak, clientDatabaseId, currentGroups, targetLevelGroupId);
        }

        await syncOnlineOfflineGroups(teamspeak, clientDatabaseId, currentGroups, isOnline);

        console.log(
          `[REGSYNC] OK ${clientNickname} -> ${mainCharacter} | level ${level} | vocation ${vocation} | online=${isOnline} | groups vocation=${targetVocationGroupId} level=${targetLevelGroupId}`
        );
      } catch (e) {
        const isOnline = worldOnlineNames.has(String(mainCharacter).trim().toLowerCase());

        console.error(`[REGSYNC] Erro no lookup do char ${mainCharacter}:`, e.message || e);

        // NÃO joga no grupo Sem Descrição por erro temporário da API
        // NÃO remove os grupos de vocação/level
        // Apenas atualiza online/offline se possível
        await syncOnlineOfflineGroups(teamspeak, clientDatabaseId, currentGroups, isOnline);

        console.log(
          `[REGSYNC] Lookup falhou para ${mainCharacter}. Preservando grupos atuais. online=${isOnline}`
        );
      }
    } catch (err) {
      console.error('syncRegistrationGroups client error:', err);
    }
  }

  return true;
};
