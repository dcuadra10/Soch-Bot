import { EmbedBuilder, TextChannel } from 'discord.js';
import { client, config } from '../config';

export async function logAction(title: string, description: string, color: number = 0x0099FF) {
    if (!config.logChannelId) {
        console.warn("[LOGGER] No LOG_CHANNEL_ID configured.");
        return;
    }

    try {
        const channel = await client.channels.fetch(config.logChannelId) as TextChannel;
        if (!channel) {
            console.error(`[LOGGER] Log channel ${config.logChannelId} not found or not accessible.`);
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .setTimestamp();

        await channel.send({ embeds: [embed] });
        console.log(`[LOGGER] Log sent: ${title}`);
    } catch (error) {
        console.error("Failed to send log:", error);
    }
}
