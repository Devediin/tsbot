import { COMMANDS_MAP } from './constants';

export const formatHelpMessage = (dbUserGroups = []) => {

  let response = `
[b]⚔️ SPK TEAM - COMANDOS ⚔️[/b]

[b]📌 COMANDOS PÚBLICOS[/b]
!desc - Link para gerar sua descrição
!loot <log> - Divide loot da hunt
!lk <nome> - Lista os matadores da última morte
!spy <nome> - Ver possíveis personagens secundários
!char <nome> - Estatísticas completas do personagem

`;

  response += `[b]🛠️ MODERAÇÃO[/b]\n`;

  const moderationCommands = ['!mk', '!mp', '!mmove'];

  moderationCommands.forEach(cmd => {
    const command = Object.values(COMMANDS_MAP).find(c =>
      c.howToUse && c.howToUse.startsWith(cmd)
    );
    if (command) {
      response += `${command.howToUse}\n`;
    }
  });

  response += `\n[b]🔐 ADMINISTRATIVO[/b]\n`;

  const hiddenCommands = [
    '!addNeutral',
    '!removeNeutral',
    '!addMakersEnemy',
    '!removeMakersEnemy',
    '!addMakersFriend',
    '!removeMakersFriend',
    '!addPossibleEnemys',
    '!removePossibleEnemys'
  ];

  const availableCommands = Object.values(COMMANDS_MAP);

  availableCommands.forEach(({ groups = [], howToUse }) => {

    if (!howToUse) return;

    const commandName = howToUse.split(' ')[0];
    if (hiddenCommands.includes(commandName)) return;

    const isAdminCommand = groups.length > 0;

    let isVisibleByGroup = false;

    dbUserGroups.forEach(({ name }) => {
      if (groups.includes(name)) {
        isVisibleByGroup = true;
      }
    });

    if (isAdminCommand && isVisibleByGroup) {

      if (commandName === '!dailyinfo') {
        response += `!dailyinfo <texto world board> - Atualiza Yasir e Daily Info\n`;
      } else if (!moderationCommands.includes(commandName)) {
        response += `${howToUse}\n`;
      }

    }

  });

  response += `\n🌐 Portal: https://spkteam.duckdns.org\n`;

  return response;
};
