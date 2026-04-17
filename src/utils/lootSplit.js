function parseNumber(str) {
  return parseInt(str.replace(/,/g, '').trim(), 10);
}

function parseDurationToHours(duration) {
  const match = duration.match(/(\d+):(\d+)h/);
  if (!match) return 1;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);

  return hours + (minutes / 60);
}

function parseLootSession(text) {

  // ✅ pega a linha principal da sessão (a primeira linha)
  const headerMatch = text.match(/Session data:[^\n]+/);
  if (!headerMatch) {
    throw new Error('Formato inválido.');
  }

  const header = headerMatch[0];

  const totalProfitMatch = header.match(/Balance:\s*([\d,]+)/);
  const durationMatch = header.match(/Session:\s*([\d:]+h)/);

  if (!totalProfitMatch) {
    throw new Error('Balance total não encontrado.');
  }

  const totalProfit = parseNumber(totalProfitMatch[1]);
  const duration = durationMatch ? durationMatch[1] : '00:00h';
  const durationHours = parseDurationToHours(duration);

  // ✅ regex corrigida para pegar jogadores corretamente
  const playerRegex = /([A-Za-zÀ-ÿ' ]+?)(?:\s*\(Leader\))?\s+Loot:\s*([\d,]+)\s+Supplies:\s*([\d,]+)\s+Balance:\s*(-?[\d,]+)/g;

  const players = [];
  let match;

  while ((match = playerRegex.exec(text)) !== null) {
    players.push({
      name: match[1].trim(),
      loot: parseNumber(match[2]),
      supplies: parseNumber(match[3]),
      balance: parseNumber(match[4])
    });
  }

  if (players.length === 0) {
    throw new Error('Nenhum jogador encontrado.');
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

export { parseLootSession };
