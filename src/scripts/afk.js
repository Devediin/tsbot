const AFK_CHANNEL_NAME = '[cspacer] AFK';
const AFK_IDLE_MINUTES = 30;
const AFK_MUTED_IDLE_MINUTES = 1;

export const moveAfkClients = async (teamspeak) => {
  const clients = await teamspeak.clientList({ client_type: 0 });
  const channels = await teamspeak.channelList();

  const afkChannel = channels.find(
    ({ propcache }) => propcache.channel_name === AFK_CHANNEL_NAME
  );

  if (!afkChannel) {
    return { moved: 0, reason: 'AFK channel not found' };
  }

  const {
    propcache: { cid: afkCid },
  } = afkChannel;

  let moved = 0;

  for (const client of clients) {
    const { propcache } = client;
    const {
      cid,
      client_idle_time,
      client_input_muted,
      client_output_muted,
      client_outputonly_muted,
    } = propcache;

    // já está no AFK
    if (Number(cid) === Number(afkCid)) {
      continue;
    }

    const idleMinutes = Math.floor(Number(client_idle_time || 0) / 1000 / 60);

    const inputMuted = Number(client_input_muted) === 1;
    const outputMuted = Number(client_output_muted) === 1 || Number(client_outputonly_muted) === 1;
    const fullyMuted = inputMuted && outputMuted;

    const shouldMoveByIdle = idleMinutes >= AFK_IDLE_MINUTES;
    const shouldMoveByMutedIdle = fullyMuted && idleMinutes >= AFK_MUTED_IDLE_MINUTES;

    if (shouldMoveByIdle || shouldMoveByMutedIdle) {
      await client.move(afkCid);
      moved += 1;
    }
  }

  return { moved, reason: '' };
};
