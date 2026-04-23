import { COMMANDS_MAP } from './constants';

export const formatHelpMessage = (dbUserGroups = []) => {

  let response = `
[b]⚔️ SPK TEAM - COMANDOS ⚔️[/b]

[b]📌 PÚBLICOS[/b]
!desc - Link para gerar sua descrição
!loot <log> - Divide loot da hunt
!lk <nome> - Lista os matadores da última morte
!spy <nome> - Ver possíveis personagens secundários
!char <nome> - Estatísticas do personagem

`;

  response += `[b]🔐 COM PERMISSÃO[/b]\n`;

  const availableCommands = Object.values(COMMANDS_MAP);

  availableCommands.forEach(({ groups = [], howToUse }) => {

    if (!howToUse) return;

    const commandName = howToUse.split(' ')[0];

    // ignora comandos públicos que já mostramos acima
    const publicCommands = ['!desc','!loot','!lk','!spy','!char'];
    if (publicCommands.includes(commandName)) return;

    let isVisible = false;

    dbUserGroups.forEach(({ name }) => {
      if (groups.includes(name)) {
        isVisible = true;
      }
    });

    if (groups.length === 0 || isVisible) {
      response += `${howToUse}\n`;
    }

  });

  response += `\n🌐 Portal: https://spkteam.duckdns.org\n`;

  return response;
};
