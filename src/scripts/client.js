export const sendJoinMessage = async (event) => {
  try {
    const client = event.client;
    if (!client) return;

    const link = 'https://spkteam.duckdns.org';

    await client.message(
`👋 Bem-vindo ao servidor!

📜 Gere sua descrição usando:
!desc

🌐 Portal:
${link}`
    );

  } catch (error) {
    console.error('Erro sendJoinMessage:', error);
  }
};

export const massKick = async (teamspeak, message) => (
  new Promise(async (resolve) => {
    const clients = await teamspeak.clientList({ client_type: 0 });
    let affected = 0;

    await Promise.all(clients.map((client) => (
      new Promise(async (resolve) => {
        const { propcache } = client;
        const { clid } = propcache;

        await teamspeak.clientKick(clid, 5, message);
        affected += 1;
        resolve(true);
      })
    )));

    resolve(affected);
  })
);

export const massMove = async (teamspeak, cid, cpw) => (
  new Promise(async (resolve) => {
    const clients = await teamspeak.clientList({ client_type: 0 });
    let affected = 0;

    await Promise.all(clients.map((client) => (
      new Promise(async (resolve) => {
        const { propcache } = client;
        const { cid: currentChannelUserIs } = propcache;

        if (cid !== currentChannelUserIs) {
          await client.move(cid, cpw);
          affected += 1;
        }

        resolve(true);
      })
    )));

    resolve(affected);
  })
);

export const sendMassPoke = async (teamspeak, message) => (
  new Promise(async (resolve) => {
    const clients = await teamspeak.clientList({ client_type: 0 });
    let affected = 0;

    await Promise.all(clients.map((client) => (
      new Promise(async (resolve) => {
        await client.poke(message);
        affected += 1;
        resolve(true);
      })
    )));

    resolve(affected);
  })
);

export const sendMassPrivateMessage = async (teamspeak, message) => (
  new Promise(async (resolve) => {
    const clients = await teamspeak.clientList({ client_type: 0 });
    let affected = 0;

    await Promise.all(clients.map((client) => (
      new Promise(async (resolve) => {
        await client.message(message);
        affected += 1;
        resolve(true);
      })
    )));

    resolve(affected);
  })
);
