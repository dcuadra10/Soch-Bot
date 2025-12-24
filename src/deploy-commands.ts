import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { config } from './config';

const commands = [
    new SlashCommandBuilder()
        .setName('register-kingdom')
        .setDescription('Start the Kingdom Registration Wizard')
        .setDefaultMemberPermissions(0), // No default perms, handled in code check
    new SlashCommandBuilder()
        .setName('find-kingdom')
        .setDescription('Find a kingdom matching your stats')
        .addStringOption(option =>
            option.setName('power')
                .setDescription('Your Power (e.g. 50m, 2b)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('kp')
                .setDescription('Your Kill Points (e.g. 300m, 1b)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('seed')
                .setDescription('Preferred Seed')
                .setRequired(false)
                .addChoices(
                    { name: 'Imperium', value: 'Imperium' },
                    { name: 'A', value: 'A' },
                    { name: 'B', value: 'B' },
                    { name: 'C', value: 'C' },
                    { name: 'D', value: 'D' }
                )),
    new SlashCommandBuilder()
        .setName('delete-kingdom')
        .setDescription('Delete a registered kingdom')
        .addStringOption(option =>
            option.setName('kd')
                .setDescription('Kingdom Number to delete (Optional - Leave blank to see list)')
                .setRequired(false)),
    new SlashCommandBuilder()
        .setName('set-kingdom-score')
        .setDescription('Set a score for a kingdom (Staff only)')
        .addStringOption(option =>
            option.setName('kd')
                .setDescription('Kingdom Number')
                .setRequired(true))
        .addNumberOption(option =>
            option.setName('score')
                .setDescription('Score to assign (1-100)')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('set-kingdom-slots')
        .setDescription('Update available migrant slots (King/Admin only)')
        .addStringOption(option =>
            option.setName('kd')
                .setDescription('Kingdom Number')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('slots')
                .setDescription('New number of slots')
                .setMinValue(0)
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('list-kingdoms')
        .setDescription('List all registered kingdoms'),
    new SlashCommandBuilder()
        .setName('edit-kingdom')
        .setDescription('Edit your registered kingdom (Kings only)'),
    new SlashCommandBuilder()
        .setName('claim-king')
        .setDescription('Submit proof to claim King status of a kingdom')
        .addStringOption(option =>
            option.setName('kingdom')
                .setDescription('Kingdom Number (e.g. 1234)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('gov_id')
                .setDescription('Your In-Game Governor ID')
                .setRequired(true))
        .addAttachmentOption(option =>
            option.setName('screenshot')
                .setDescription('Screenshot of your profile showing King title')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show list of available commands'),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(config.token!);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        if (!config.clientId) {
            throw new Error('Missing CLIENT_ID in config/env');
        }

        if (config.guildId) {
            console.log(`Registering commands to Guild: ${config.guildId}`);
            await rest.put(
                Routes.applicationGuildCommands(config.clientId, config.guildId),
                { body: commands },
            );
        } else {
            console.log('Registering Global commands (can take up to 1 hour)...');
            await rest.put(
                Routes.applicationCommands(config.clientId),
                { body: commands },
            );
        }

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();
