const AFK_CHANNEL_NAME = '[cspacer] AFK';
const AFK_IDLE_MINUTES = 30;
const AFK_OUTPUT_OFF_SECONDS = 30;

const afkState = new Map();

const isEnabledFlag = (value) => Number(value || 0) === 1;

const getClientKey = (info = {}, client = {}) => String(
  info.client_database_id ||
  info.clientDatabaseId ||
  client.propcache?.client_database_id ||
  client.cldbid ||
  client.clid ||
  ''
);

export const moveAfkClients = async (teamspeak) => {
  const clients = await teamspeak.clientList({ client_type: 0 });
  const channels = await teamspeak.channelList();

  const afkChannel = channels.find(
    ({ propcache }) => propcache.channel_name === AFK_CHANNEL_NAME
  );

  if (!afkChannel) {
    console.log('[AFK] Canal AFK não encontrado.');
    return { moved: 0, reason: 'AFK channel not found' };
  }

  const {
    propcache: { cid: afkCid },
  } = afkChannel;

  let moved = 0;
  const onlineClientKeys = new Set();

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
        // fallback no propcache mesmo
      }

      const clientType = Number(
        info.client_type ||
        info.clientType ||
        client.propcache?.client_type ||
        0
      );

      if (clientType !== 0) {
        continue;
      }

      const clientKey = getClientKey(info, client);
      if (!clientKey) {
        continue;
      }

      onlineClientKeys.add(clientKey);

      const nickname = String(
        info.client_nickname ||
        info.clientNickname ||
        client.propcache?.client_nickname ||
        'Desconhecido'
      );

      const cid = Number(info.cid || info.client_channel_id || client.propcache?.cid || 0);
      const idleTime = Number(
        info.client_idle_time ||
        info.clientIdleTime ||
        client.propcache?.client_idle_time ||
        0
      );

      const idleMinutes = Math.floor(idleTime / 1000 / 60);

      const outputMuted = isEnabledFlag(info.client_output_muted || client.propcache?.client_output_muted);
      const outputOnlyMuted = isEnabledFlag(info.client_outputonly_muted || client.propcache?.client_outputonly_muted);

      const outputHardwareRaw = info.client_output_hardware ?? client.propcache?.client_output_hardware;
      const outputHardwareDisabled = Number(outputHardwareRaw) === 0;

      const outputOff = outputMuted || outputOnlyMuted || outputHardwareDisabled;

      let state = afkState.get(clientKey);
      if (!state) {
        state = {
          outputOffSince: null,
          previousChannelId: null,
          movedByOutputOff: false,
        };
      }

      if (outputOff) {
        if (!state.outputOffSince) {
          state.outputOffSince = Date.now();
        }
      } else {
        state.outputOffSince = null;
      }

      const outputOffSeconds = state.outputOffSince
        ? Math.floor((Date.now() - state.outputOffSince) / 1000)
        : 0;

      const shouldMoveByIdle = idleMinutes >= AFK_IDLE_MINUTES;
      const shouldMoveByOutputOff = outputOff && outputOffSeconds >= AFK_OUTPUT_OFF_SECONDS;

      console.log(
        `[AFK] ${nickname} | cid=${cid} | idle=${idleMinutes}m | outputMuted=${outputMuted} | outputOnlyMuted=${outputOnlyMuted} | outputHardware=${outputHardwareRaw} | outputOff=${outputOff} | outputOffSeconds=${outputOffSeconds} | moveIdle=${shouldMoveByIdle} | moveOutputOff=${shouldMoveByOutputOff} | movedByOutputOff=${state.movedByOutputOff}`
      );

      if (cid === Number(afkCid)) {
        if (state.movedByOutputOff && !outputOff && state.previousChannelId && Number(state.previousChannelId) !== Number(afkCid)) {
          try {
            await client.move(Number(state.previousChannelId));
            console.log(`[AFK] Voltou do AFK para canal anterior: ${nickname} -> ${state.previousChannelId}`);
          } catch (error) {
            console.error(`[AFK] Erro ao voltar ${nickname} para canal anterior:`, error.message || error);
          }

          state.movedByOutputOff = false;
          state.previousChannelId = null;
        }

        afkState.set(clientKey, state);
        continue;
      }

      if (shouldMoveByIdle || shouldMoveByOutputOff) {
        state.previousChannelId = cid;
        state.movedByOutputOff = shouldMoveByOutputOff;

        await client.move(afkCid);
        moved += 1;

        console.log(`[AFK] Movido para AFK: ${nickname}`);
      }

      afkState.set(clientKey, state);
    } catch (error) {
      console.error('AFK move error:', error.message || error);
    }
  }

  for (const savedKey of afkState.keys()) {
    if (!onlineClientKeys.has(savedKey)) {
      afkState.delete(savedKey);
    }
  }

  console.log(`[AFK] Ciclo finalizado. Movidos: ${moved}`);
  return { moved, reason: '' };
};
