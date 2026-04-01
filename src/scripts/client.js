export const sendJoinMessage = async (event = {}) => (
  new Promise(async (resolve) => {
    event.client.message('Bem-vindo ao servidor.');
    event.client.message('É obrigatório ter sua descrição adicionada para liberar seu acesso.');
    event.client.message('Envie para quem vai te registrar exatamente neste formato: Main: Nome do seu personagem principal');
    event.client.message('Depois aguarde alguns segundos para o NiideHelper validar seu personagem e aplicar seus grupos.');
    resolve();
  })
);

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
