import { COMMANDS_MAP } from './constants';

export const formatHelpMessage = (dbUserGroups = []) => {

  let response = `

[b]⚔️ SPK TEAM - COMANDOS DISPONÍVEIS ⚔️[/b]

[b]📌 UTILITÁRIOS[/b]
!desc - Link para gerar sua descrição
!loot <log> - Divide loot da hunt
!lk <nome> - Lista os matadores da última morte
!spy <nome> - Ver possíveis personagens secundários
!char <nome> - (Em breve) Estatísticas do personagem

`;

  response += `[b]🔐 COMANDOS POR PERMISSÃO[/b]\n`;

  const availableCommands = Object.values(COMMANDS_MAP);

  availableCommands.forEach(({ groups = [], howToUse }) => {

    if (!howToUse) return;

    // ignora comandos que você não quer mais mostrar
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

    const commandName = howToUse.split(' ')[0];

    if (hiddenCommands.includes(commandName)) return;

    let isVisibleByGroup = false;

    dbUserGroups.forEach(({ name }) => {
      if (groups.includes(name)) {
        isVisibleByGroup = true;
      }
    });

    if (groups.length === 0 || isVisibleByGroup) {
      response += `${howToUse}\n`;
    }

  });

  response += `\n🌐 Portal: https://spkteam.duckdns.org\n`;

  return response;
};
