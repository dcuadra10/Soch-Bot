import { REST, Routes } from 'discord.js';
import { config } from './config';

const rest = new REST({ version: '10' }).setToken(config.token!);

(async () => {
    try {
        console.log('Started deleting global application (/) commands.');

        if (!config.clientId) {
            throw new Error('Missing CLIENT_ID in config/env');
        }

        // Fetch all global commands
        const globalCommands = await rest.get(Routes.applicationCommands(config.clientId)) as any[];

        for (const command of globalCommands) {
            console.log(`Deleting global command: ${command.name}`);
            await rest.delete(Routes.applicationCommand(config.clientId, command.id));
        }

        console.log('Successfully deleted all global application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();
