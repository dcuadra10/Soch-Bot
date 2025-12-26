import { ChatInputCommandInteraction, MessageFlags, EmbedBuilder, ThreadChannel } from 'discord.js';
import { prisma, config } from '../config';

export async function bumpCommand(interaction: ChatInputCommandInteraction) {
    if (!interaction.channel?.isThread()) {
        await interaction.reply({ content: "⚠️ This command can only be used in a recruitment post (thread).", flags: MessageFlags.Ephemeral });
        return;
    }

    const threadId = interaction.channelId;

    const threadData = await prisma.recruitmentThread.findUnique({ where: { id: threadId } });
    if (!threadData) {
        await interaction.reply({ content: "⚠️ This post is not tracked. Use `/remake` to create a new, tracked post.", flags: MessageFlags.Ephemeral });
        return;
    }

    if (threadData.bumpBanExpires && threadData.bumpBanExpires > new Date()) {
        const ts = Math.floor(threadData.bumpBanExpires.getTime() / 1000);
        await interaction.reply({ content: `🚫 **You are banned from bumping** until <t:${ts}:F>.\nReason: Sending chat messages in recruitment post.`, flags: MessageFlags.Ephemeral });
        return;
    }

    const now = new Date();
    const cooldownMs = 6 * 60 * 60 * 1000;
    const nextBumpDetails = new Date(threadData.lastBumped.getTime() + cooldownMs);

    if (now < nextBumpDetails) {
        const ts = Math.floor(nextBumpDetails.getTime() / 1000);
        await interaction.reply({ content: `⏳ **Bump Cooldown!**\nYou can bump again <t:${ts}:R>.`, flags: MessageFlags.Ephemeral });
        return;
    }

    await prisma.recruitmentThread.update({
        where: { id: threadId },
        data: { lastBumped: now }
    });

    const nextAvailable = Math.floor((now.getTime() + cooldownMs) / 1000);
    // Public reply bumps the thread
    await interaction.reply({
        content: `👊 **Bumped!**\nSee you in 6 hours.\nNext /bump available: <t:${nextAvailable}:R>`
    });
}


export async function remakeCommand(interaction: ChatInputCommandInteraction) {
    if (!interaction.channel?.isThread()) {
        await interaction.reply({ content: "⚠️ This command can only be used in a recruitment post (thread).", flags: MessageFlags.Ephemeral });
        return;
    }

    const isOwner = interaction.user.id === interaction.channel.ownerId;
    const isAdmin = interaction.memberPermissions?.has('Administrator');

    if (!isOwner && !isAdmin) {
        await interaction.reply({ content: "🚫 Only the post owner can remake this.", flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.reply({ content: "🗑️ **Remaking...** Deleting this post in 5s. Please create a new one.", flags: MessageFlags.Ephemeral });

    setTimeout(async () => {
        try {
            await interaction.channel?.delete();
            await prisma.recruitmentThread.deleteMany({ where: { id: interaction.channelId } });
        } catch (e) {
            console.error(e);
        }
    }, 5000);
}
