function parseNumber(str) {
  return parseInt(str.replace(/,/g, '').trim(), 10);
}

function parseDurationToHours(duration) {
  // formato 01:12h
  const match = duration.match(/(\d+):(\d+)h/);
  if (!match) return 1;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);

  return hours + (minutes / 60);
}

function parseLootSession(text) {
  const totalProfitMatch = text.match(/Balance:\s*([\d,]+)/);
  const durationMatch = text.match(/Session:\s*([\d:]+h)/);

  if (!totalProfitMatch) {
    throw new Error('Não foi possível encontrar o Balance total.');
  }

  const totalProfit = parseNumber(totalProfitMatch[1]);
  const duration = durationMatch ? durationMatch[1] : '00:00h';
  const durationHours = parseDurationToHours(duration);

  const playerRegex = /([A-Za-zÀ-ÿ'() ]+?)\s+Loot:\s*([\d,]+)\s+Supplies:\s*([\d,]+)\s+Balance:\s*(-?[\d,]+)/g;

  const players = [];
  let match;

  while ((match = playerRegex.exec(text)) !== null) {
    const name = match[1].trim().replace('(Leader)', '').trim();
    const loot = parseNumber(match[2]);
    const supplies = parseNumber(match[3]);
    const balance = parseNumber(match[4]);

    players.push({ name, loot, supplies, balance });
  }

  if (players.length === 0) {
    throw new Error('Nenhum jogador encontrado no log.');
  }

  const perPlayer = Math.floor(totalProfit / players.length);
  const profitPerHour = Math.floor(perPlayer / durationHours);

  const transfers = [];

  const payers = [];
  const receivers = [];

  players.forEach(p => {
    const diff = p.balance - perPlayer;
    if (diff > 0) {
      payers.push({ ...p, amount: diff });
    } else if (diff < 0) {
      receivers.push({ ...p, amount: Math.abs(diff) });
    }
  });

  payers.forEach(payer => {
    receivers.forEach(receiver => {
      if (payer.amount <= 0 || receiver.amount <= 0) return;

      const value = Math.min(payer.amount, receiver.amount);

      transfers.push({
        from: payer.name,
        to: receiver.name,
        amount: value
      });

      payer.amount -= value;
      receiver.amount -= value;
    });
  });

  return {
    totalProfit,
    perPlayer,
    duration,
    profitPerHour,
    transfers,
    playersCount: players.length
  };
}

module.exports = { parseLootSession };
