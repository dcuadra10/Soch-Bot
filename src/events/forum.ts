import { ThreadChannel, Message, EmbedBuilder } from 'discord.js';
import { createHash } from 'crypto';
import { prisma, config } from '../config';

/**
 * Handles creation of a recruitment thread.
 * - Validates that the thread belongs to a configured forum channel.
 * - Enforces one active post per user.
 * - Detects duplicate content via MD5 hash and closes the older post.
 * - Sends a welcome embed with bump info and rules.
 */
export async function handleThreadCreate(thread: ThreadChannel) {
    console.log(`[DEBUG] Thread Created: ${thread.id} in Parent: ${thread.parentId}`);
    if (!thread.parentId || !config.forumChannelId.includes(thread.parentId)) return;

    // Enforce one post per user (owner)
    const existing = await prisma.recruitmentThread.findFirst({ where: { ownerId: thread.ownerId! } });
    if (existing) {
        try {
            await thread.guild.channels.fetch(existing.id);
            await thread.send({ content: `🚫 **Limit Reached!**\nYou already have an active post: <#${existing.id}>. Use \`/remake\` on the old one if you want to replace it.` });
            await thread.setLocked(true);
            await thread.setArchived(true);
            return;
        } catch {
            await prisma.recruitmentThread.delete({ where: { id: existing.id } });
        }
    }

    // Compute content hash for duplicate detection
    let contentHash: string | null = null;
    try {
        const starter = await thread.fetchStarterMessage();
        if (starter) contentHash = createHash('md5').update(starter.content ?? '').digest('hex');
    } catch { }

    // Duplicate detection – close older post
    if (contentHash) {
        const duplicate = await prisma.recruitmentThread.findFirst({ where: { contentHash } });
        if (duplicate) {
            try {
                const oldThread = await thread.guild.channels.fetch(duplicate.id) as ThreadChannel;
                if (oldThread) {
                    await oldThread.send('⚠️ **Duplicate Content Detected**\nA newer post with identical content has been created. This older post is now closed.');
                    await oldThread.setLocked(true);
                    await oldThread.setArchived(true);
                }
            } catch { }
            await prisma.recruitmentThread.delete({ where: { id: duplicate.id } });
        }
    }

    // Create DB entry for the new thread
    await prisma.recruitmentThread.create({
        data: {
            id: thread.id,
            ownerId: thread.ownerId!,
            lastBumped: new Date(),
            contentHash,
        },
    });

    const nextBumpTs = Math.floor((Date.now() + 6 * 60 * 60 * 1000) / 1000);
    const embed = new EmbedBuilder()
        .setDescription(`Post was last bumped: <t:${Math.floor(Date.now() / 1000)}:R>\nNext /bump available: <t:${nextBumpTs}:R>\nForum Post Rules:\n➼ \`/bump\` should be every 6 hours\n➼ Only 1 post per kingdom / project / group\n➼ Your Kingdom Number or Project/Group Name must be in your post title\n➼ Do not send messages into recruitment posts or change your post title\n➼ If you are interested in joining a group, reach out through the contacts listed in the post\n\nIf you wish to make a new post to add/change information, use the \`/remake\` command in this channel.\nWarnings + Recruitment bans will be enforced for posts breaking the rules found in <#1433883764387217459>`)
        .setColor(0x00ff00);

    await thread.send({ embeds: [embed] });
}

/**
 * Handles messages sent inside recruitment threads.
 * - Deletes any chat messages.
 * - Tracks per‑user strikes and applies a temporary ban after 3 strikes.
 * - Updates the original embed with current strike/ban information.
 */
export async function handleForumMessage(message: Message) {
    if (message.author.bot) return;
    if (!message.channel.isThread()) return;
    if (!message.channel.parentId || !config.forumChannelId.includes(message.channel.parentId)) return;

    const threadId = message.channel.id;
    const userId = message.author.id;

    // Delete the offending message
    try { await message.delete(); } catch { }

    // Load or create per‑user strike record
    let userStrike = await prisma.bumpUser.findUnique({ where: { threadId_userId: { threadId, userId } } });
    if (!userStrike) userStrike = await prisma.bumpUser.create({ data: { threadId, userId } });

    const newStrikes = (userStrike.strikeCount ?? 0) + 1;
    let isBanned = false;
    let banExpires: Date | null = null;
    if (newStrikes >= 3) {
        isBanned = true;
        banExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day
    }

    await prisma.bumpUser.update({
        where: { threadId_userId: { threadId, userId } },
        data: { strikeCount: isBanned ? 0 : newStrikes, banExpires },
    });

    // DM the user about warning or ban
    try {
        if (isBanned) {
            const ts = Math.floor(banExpires!.getTime() / 1000);
            await message.author.send(`🚫 **Ban Applied**\nYou have reached 3 strikes in this recruitment thread. You are banned from bumping until <t:${ts}:F>.`);
        } else {
            await message.author.send(`⚠️ **Warning (${newStrikes}/3)**\nPlease do not send chat messages in the recruitment thread. Your next strike will result in a temporary bump ban.`);
        }
    } catch { }

    // Update embed with strike list
    try {
        const starter = await (message.channel as ThreadChannel).fetchStarterMessage();
        const embeds = starter.embeds;
        if (embeds.length) {
            const embed = EmbedBuilder.from(embeds[0]);
            const users = await prisma.bumpUser.findMany({ where: { threadId } });
            const lines = users.map(u => `<@${u.userId}>: ${u.banExpires && u.banExpires > new Date() ? `BANNED until <t:${Math.floor(u.banExpires.getTime() / 1000)}:R>` : `${u.strikeCount} strike(s)`}`);
            const baseDesc = embed.data.description?.split('⚠️ **Recruitment Thread Warning**')[0] || embed.data.description || '';
            embed.setDescription(`${baseDesc}\n\n**User Strikes / Bans:**\n${lines.join('\n')}`);
            await starter.edit({ embeds: [embed] });
        }
    } catch (e) {
        console.error('Failed to update embed with strikes', e);
    }
}
