import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { config } from './config';

const commands = [
    new SlashCommandBuilder()
        .setName('register-kingdom')
        .setDescription('Start the Kingdom Registration Wizard')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('find-kingdom')
        .setDescription('Find a kingdom matching your stats (Seed required)')
        .addStringOption(option =>
            option.setName('seed')
                .setDescription('Preferred Seed')
                .setRequired(true)
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
        .setName('verify-kingdom')
        .setDescription('Approve a kingdom to show up in search (Staff Only)')
        .addStringOption(option =>
            option.setName('kd')
                .setDescription('Kingdom Number (e.g. 1960)')
                .setRequired(true)),
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
        .setName('create-account')
        .setDescription('Create your Governor Profile for applications (Required before applying)')
        .addStringOption(o => o.setName('name').setDescription('In-game Name').setRequired(true))
        .addStringOption(o => o.setName('id').setDescription('In-game ID').setRequired(true))
        .addStringOption(o => o.setName('power').setDescription('Total Power (e.g. 50m)').setRequired(true))
        .addStringOption(o => o.setName('kp').setDescription('Total Kill Points (e.g. 1b)').setRequired(true))
        .addStringOption(o => o.setName('dead').setDescription('Dead Troops (e.g. 5m)').setRequired(true))
        .addStringOption(o => o.setName('kingdom').setDescription('Current Kingdom Number').setRequired(true))
        .addIntegerOption(o => o.setName('farms').setDescription('Number of Farm Accounts').setRequired(true))
        .addIntegerOption(o => o.setName('ch25').setDescription('Number of CH25 Farms').setRequired(true))
        .addAttachmentOption(o => o.setName('image').setDescription('Screenshot of your In-game Profile').setRequired(true)),
    new SlashCommandBuilder()
        .setName('edit-account')
        .setDescription('Edit specific fields of your Governor Profile')
        .addStringOption(o => o.setName('name').setDescription('In-game Name').setRequired(false))
        .addStringOption(o => o.setName('id').setDescription('In-game ID').setRequired(false))
        .addStringOption(o => o.setName('power').setDescription('Total Power').setRequired(false))
        .addStringOption(o => o.setName('kp').setDescription('Total KP').setRequired(false))
        .addStringOption(o => o.setName('dead').setDescription('Dead Troops').setRequired(false))
        .addStringOption(o => o.setName('kingdom').setDescription('Current Kingdom').setRequired(false))
        .addIntegerOption(o => o.setName('farms').setDescription('Number of Farms').setRequired(false))
        .addIntegerOption(o => o.setName('ch25').setDescription('Number of CH25 Farms').setRequired(false))
        .addAttachmentOption(o => o.setName('image').setDescription('New Profile Screenshot').setRequired(false)),
    new SlashCommandBuilder()
        .setName('view-profile')
        .setDescription('View a Governor Profile')
        .addUserOption(o => o.setName('user').setDescription('The user to view (Default: Yourself)').setRequired(false)),
    new SlashCommandBuilder()
        .setName('list-profiles')
        .setDescription('List all registered Governor Profiles (Admin only)')
        .setDefaultMemberPermissions(0),
    new SlashCommandBuilder()
        .setName('delete-profile')
        .setDescription('Delete your profile or another user\'s (Admin only)')
        .addUserOption(o => o.setName('user').setDescription('The user to delete (Admin usage)').setRequired(false)),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show list of available commands'),
    new SlashCommandBuilder()
        .setName('bump')
        .setDescription('Bump this post to the top (Every 6 hours)'),
    new SlashCommandBuilder()
        .setName('remake')
        .setDescription('Delete and recreate this post to update info (Owner/Admin only)'),
    new SlashCommandBuilder()
        .setName('unban-post')
        .setDescription('Remove a bump ban from a recruitment post (Admin Only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(o => o.setName('post').setDescription('The thread to unban (Default: Current channel)').setRequired(false)),
    new SlashCommandBuilder()
        .setName('check-post')
        .setDescription('Check status/bans of a recruitment post (Admin Only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(o => o.setName('post').setDescription('The thread to check (Default: Current channel)').setRequired(false)),
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
