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

  // ===== PEGAR HEADER COMPLETO =====
  const headerMatch = text.match(/Session data:.*?Balance:\s*[\d,]+/);
  if (!headerMatch) {
    throw new Error('Formato inválido.');
  }

  const header = headerMatch[0];

  const totalLootMatch = header.match(/Loot:\s*([\d,]+)/);
  const totalSuppliesMatch = header.match(/Supplies:\s*([\d,]+)/);
  const durationMatch = header.match(/Session:\s*([\d:]+h)/);

  if (!totalLootMatch || !totalSuppliesMatch) {
    throw new Error('Loot ou Supplies totais não encontrados.');
  }

  const totalLoot = parseNumber(totalLootMatch[1]);
  const totalSupplies = parseNumber(totalSuppliesMatch[1]);
  const totalProfit = totalLoot - totalSupplies;

  const duration = durationMatch ? durationMatch[1] : '00:00h';
  const durationHours = parseDurationToHours(duration);

  // ===== REMOVER HEADER DO TEXTO =====
  const bodyText = text.replace(header, '');

  // ===== PEGAR APENAS PLAYERS =====
  const playerRegex = /([A-Za-zÀ-ÿ' ]+?)\s*(?:\(Leader\))?\s+Loot:\s*([\d,]+)\s+Supplies:\s*([\d,]+)\s+Balance:\s*(-?[\d,]+)/g;

  const players = [];
  let match;

  while ((match = playerRegex.exec(bodyText)) !== null) {

    const name = match[1].trim();

    players.push({
      name,
      loot: parseNumber(match[2]),
      supplies: parseNumber(match[3])
    });
  }

  if (players.length === 0) {
    throw new Error('Nenhum jogador encontrado.');
  }

  const perPlayerProfit = Math.floor(totalProfit / players.length);
  const profitPerHour = Math.floor(perPlayerProfit / durationHours);

  const balances = players.map(p => {

    const shouldHave = perPlayerProfit + p.supplies;
    const diff = shouldHave - p.loot;

    return {
      name: p.name,
      diff
    };
  });

  const payers = balances
    .filter(b => b.diff < 0)
    .map(b => ({ name: b.name, amount: Math.abs(b.diff) }));

  const receivers = balances
    .filter(b => b.diff > 0)
    .map(b => ({ name: b.name, amount: b.diff }));

  const transfers = [];

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
    perPlayer: perPlayerProfit,
    duration,
    profitPerHour,
    transfers
  };
}

export { parseLootSession };
