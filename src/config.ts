import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { Client, GatewayIntentBits, Partials } from 'discord.js';

dotenv.config();

if (!process.env.DISCORD_TOKEN) {
    throw new Error("Missing DISCORD_TOKEN in .env");
}

export const prisma = new PrismaClient();

export const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message],
});

export const config = {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID, // Optional if we need it for rest
    guildId: process.env.GUILD_ID,
    kingRoleId: process.env.KING_ROLE_ID,
    staffRoleId: process.env.STAFF_ROLE_ID,
    logChannelId: process.env.LOG_CHANNEL_ID,
};
