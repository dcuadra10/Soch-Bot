
import { ChatInputCommandInteraction, PermissionFlagsBits, MessageFlags, ChannelType } from 'discord.js';
import { prisma } from '../config';

export async function unbanPostCommand(interaction: ChatInputCommandInteraction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: "🚫 Only Administrators can use this command.", flags: MessageFlags.Ephemeral });
        return;
    }

    const channel = interaction.options.getChannel('post') || interaction.channel;

    if (!channel || channel.type !== ChannelType.PublicThread) {
        await interaction.reply({ content: "⚠️ Please specify a valid recruitment post or use this command inside one.", flags: MessageFlags.Ephemeral });
        return;
    }

    const threadData = await prisma.recruitmentThread.findUnique({ where: { id: channel.id } });

    if (!threadData) {
        await interaction.reply({ content: "⚠️ This post is not tracked in the database.", flags: MessageFlags.Ephemeral });
        return;
    }

    await prisma.recruitmentThread.update({
        where: { id: channel.id },
        data: {
            bumpBanExpires: null,
            bumpStrikeCount: 0 // Optional: Reset strikes? Yes, usually unban means clean slate.
        }
    });

    await interaction.reply({ content: `✅ **Ban Removed!**\nThe recruitment post <#${channel.id}> can now be bumped again.` });
}

export async function checkPostCommand(interaction: ChatInputCommandInteraction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: "🚫 Only Administrators can use this command.", flags: MessageFlags.Ephemeral });
        return;
    }

    const channel = interaction.options.getChannel('post') || interaction.channel;

    if (!channel || channel.type !== ChannelType.PublicThread) {
        await interaction.reply({ content: "⚠️ Please specify a valid recruitment post or use this command inside one.", flags: MessageFlags.Ephemeral });
        return;
    }

    const threadData = await prisma.recruitmentThread.findUnique({ where: { id: channel.id } });

    if (!threadData) {
        await interaction.reply({ content: "⚠️ This thread is not tracked in the database.", flags: MessageFlags.Ephemeral });
        return;
    }

    const isBanned = threadData.bumpBanExpires && threadData.bumpBanExpires > new Date();
    const banExpires = isBanned ? `<t:${Math.floor(threadData.bumpBanExpires!.getTime() / 1000)}:R>` : "No active ban";
    const lastBump = `<t:${Math.floor(threadData.lastBumped.getTime() / 1000)}:R>`;

    await interaction.reply({
        content: `📋 **Post Status: <#${channel.id}>**\n\n` +
            `👤 **Owner ID:** ${threadData.ownerId}\n` +
            `🕒 **Last Bumped:** ${lastBump}\n` +
            `⚠️ **Strikes:** ${threadData.bumpStrikeCount}\n` +
            `🚫 **Ban Status:** ${banExpires}`,
        flags: MessageFlags.Ephemeral
    });
}
