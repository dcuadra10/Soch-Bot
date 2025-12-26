```typescript
import { Events, ThreadChannel, Message, EmbedBuilder } from 'discord.js';
import { createHash } from 'crypto';
import { prisma, config } from '../config';

// Updated bump command to check per‑user ban
export async function bumpCommand(interaction: ChatInputCommandInteraction) {
    if (!interaction.channel?.isThread()) {
        await interaction.reply({ content: "⚠️ This command can only be used in a recruitment post (thread).", flags: MessageFlags.Ephemeral });
        return;
    }

    const threadId = interaction.channelId;
    const userId = interaction.user.id;

    // Fetch per‑user bump data
    let userBump = await prisma.bumpUser.findUnique({
        where: { threadId_userId: { threadId, userId } }
    });
    if (!userBump) {
        // Create entry if not exists
        userBump = await prisma.bumpUser.create({
            data: { threadId, userId }
        });
    }

    if (userBump.banExpires && userBump.banExpires > new Date()) {
        const ts = Math.floor(userBump.banExpires.getTime() / 1000);
        await interaction.reply({ content: `🚫 ** You are banned from bumping ** until < t:${ ts }: F >.`, flags: MessageFlags.Ephemeral });
        return;
    }

    const now = new Date();
    const cooldownMs = 6 * 60 * 60 * 1000;
    const nextBumpDetails = new Date(userBump.lastBumped?.getTime() + cooldownMs || now.getTime() + cooldownMs);

    if (now < nextBumpDetails) {
        const ts = Math.floor(nextBumpDetails.getTime() / 1000);
        await interaction.reply({ content: `⏳ ** Bump Cooldown! ** You can bump again < t:${ ts }: R >.`, flags: MessageFlags.Ephemeral });
        return;
    }

    // Update last bump for this user
    await prisma.bumpUser.update({
        where: { threadId_userId: { threadId, userId } },
        data: { lastBumped: now }
    });

    const nextAvailable = Math.floor((now.getTime() + cooldownMs) / 1000);
    await interaction.reply({ content: `👊 ** Bumped! ** Next / bump available: <t:${ nextAvailable }: R > `, flags: MessageFlags.Ephemeral });
}

export async function handleThreadCreate(thread: ThreadChannel) {
    console.log(`[DEBUG] Thread Created: ${ thread.id } in Parent: ${ thread.parentId } `);
    console.log(`[DEBUG] Configured Forum IDs: ${ JSON.stringify(config.forumChannelId) } `);

    if (!thread.parentId || !config.forumChannelId.includes(thread.parentId)) {
        console.log(`[DEBUG] Thread parent ID does not match configured Forum IDs.Ignoring.`);
        return;
    }

    // "Only 1 post per kingdom / project / group" (Tracked by OwnerID)
    const existing = await prisma.recruitmentThread.findFirst({
        where: { ownerId: thread.ownerId! }
    });

    if (existing) {
        // Check if old thread still exists on Discord
        try {
            await thread.guild.channels.fetch(existing.id);
            // It exists: Warn and Close new thread
            await thread.send({ content: `🚫 ** Limit Reached! **\nYou already have an active post: <#${ existing.id } >.\nUse \`/remake\` on the old one if you want to replace it.` });
await thread.setLocked(true);
await thread.setArchived(true);
return;
        } catch (e) {
    // Old thread is gone (deleted manually?): Cleanup DB and allow new one
    await prisma.recruitmentThread.delete({ where: { id: existing.id } });
}
    }

// Track New Thread
// 1. Get content for hash
let contentHash: string | null = null;
try {
    const starter = await thread.fetchStarterMessage().catch(() => null);
    if (starter) {
        contentHash = createHash('md5').update(starter.content || "").digest('hex');
    }
} catch (e) { }

// 2. Check for duplicates (same content, different person/time)
if (contentHash) {
    const duplicate = await prisma.recruitmentThread.findFirst({
        where: { contentHash: contentHash }
    });

    if (duplicate) {
        // "Cierra el mas antiguo" -> Close the existing one in DB
        try {
            const oldThread = await thread.guild.channels.fetch(duplicate.id) as ThreadChannel;
            if (oldThread) {
                await oldThread.send("⚠️ **Duplicate Content Detected**\nA newer post with identical content has been created. Use unique content for your recruitment.\n**Action:** This older post is now closed.");
                await oldThread.setLocked(true);
                await oldThread.setArchived(true);
            }
        } catch (e) { }

        // Clean up old DB entry so we can track the new one
        await prisma.recruitmentThread.delete({ where: { id: duplicate.id } });
    }
}

await prisma.recruitmentThread.create({
    data: {
        id: thread.id,
        ownerId: thread.ownerId!,
        lastBumped: new Date(),
        contentHash: contentHash
    }
});

const nextBumpTs = Math.floor((Date.now() + 6 * 60 * 60 * 1000) / 1000);

const embed = new EmbedBuilder()
    .setDescription(`Post was last bumped: <t:${Math.floor(Date.now() / 1000)}:R>
Next /bump available: <t:${nextBumpTs}:R>
Forum Post Rules:
➼ \`/bump\` should be every 6 hours
➼ Only 1 post per kingdom / project / group
➼ Your Kingdom Number or Project/Group Name must be in your post title
➼ Do not send messages into recruitment posts or change your post title
➼ If you are interested in joining a group, reach out through the contacts listed in the post

If you wish to make a new post to add/change information, use the \`/remake\` command in this channel.
Warnings + Recruitment bans will be enforced for posts breaking the rules found in <#1433883764387217459>`)
    .setColor(0x00FF00);

await thread.send({ embeds: [embed] });
}

// Updated message handler to use per‑user strikes and embed update
export async function handleForumMessage(message: Message) {
    if (message.author.bot) return;
    if (!message.channel.isThread()) return;
    if (!message.channel.parentId || !config.forumChannelId.includes(message.channel.parentId)) return;

    const threadId = message.channel.id;
    const userId = message.author.id;

    // Fetch thread tracking
    const threadData = await prisma.recruitmentThread.findUnique({ where: { id: threadId } });
    if (!threadData) return;

    // Delete the offending message
    try { await message.delete(); } catch (e) { }

    // Manage per‑user strike record
    let userStrike = await prisma.bumpUser.findUnique({
        where: { threadId_userId: { threadId, userId } }
    });
    if (!userStrike) {
        userStrike = await prisma.bumpUser.create({ data: { threadId, userId } });
    }

    const newStrikes = (userStrike.strikeCount || 0) + 1;
    let isBanned = false;
    let banExpires: Date | null = null;
    if (newStrikes >= 3) {
        isBanned = true;
        const banDurationMs = 24 * 60 * 60 * 1000; // 1 day
        banExpires = new Date(Date.now() + banDurationMs);
    }

    await prisma.bumpUser.update({
        where: { threadId_userId: { threadId, userId } },
        data: {
            strikeCount: isBanned ? 0 : newStrikes,
            banExpires: banExpires
        }
    });

    // Notify user via DM
    try {
        if (isBanned) {
            const ts = Math.floor(banExpires!.getTime() / 1000);
            await message.author.send(`🚫 **Ban Applied**\nYou have reached 3 strikes for chatting in the recruitment thread. You are banned from bumping until <t:${ts}:F>.`);
        } else {
            await message.author.send(`⚠️ **Warning (${newStrikes}/3)**\nPlease do not send chat messages in the recruitment thread. Your next strike will result in a temporary bump ban.`);
        }
    } catch (e) { }

    // Update the original embed with strike info
    try {
        const starter = await (message.channel as ThreadChannel).fetchStarterMessage();
        const embedMsg = starter;
        const existingEmbeds = embedMsg.embeds;
        if (existingEmbeds.length > 0) {
            const embed = EmbedBuilder.from(existingEmbeds[0]);
            // Build strike list
            const users = await prisma.bumpUser.findMany({ where: { threadId } });
            const strikeLines = users.map(u => {
                const status = u.banExpires && u.banExpires > new Date() ? `BANNED until <t:${Math.floor(u.banExpires.getTime() / 1000)}:R>` : `${u.strikeCount} strike(s)`;
                return `<@${u.userId}>: ${status}`;
            }).join('\n');
            const newDesc = embed.data.description?.split('⚠️ **Recruitment Thread Warning**')[0] || embed.data.description || '';
            embed.setDescription(`${newDesc}\n\n**User Strikes / Bans:**\n${strikeLines}`);
            await embedMsg.edit({ embeds: [embed] });
        }
    } catch (e) { console.error('Failed to update embed with strikes', e); }
}

if (message.author.bot) return;
if (!message.channel.isThread()) return;
if (!message.channel.parentId || !config.forumChannelId.includes(message.channel.parentId)) return;

// Check strict rule: "Do not send messages into recruitment posts"
// User wants to enforce this.
// If user is owner? "Do not... change your post title" implies they can edit the *post* (first message),
// but sending NEW messages (chatting) is banned?
// User said: "si la persona pone un msg ademas del original... se borre el msg y no le deje bumpear el post por un dia"

// If message is the starter message (system message or first post), we ignore (it's handled by thread creation).
// Usually thread starter message is fine. Subsequent messages are "chat".

// We fetch thread data
const threadData = await prisma.recruitmentThread.findUnique({ where: { id: message.channel.id } });
if (!threadData) return; // Not tracked or not ours

// IGNORE STARTER MESSAGE (The Post Itself)
// In Forum Channels, the Thread ID is the same as the Starter Message ID
if (message.id === message.channel.id) {
    return;
}

// Delete the message
try {
    await message.delete();
} catch (e) { }

// If it looks like a command attempt (starts with / or !), we delete but DO NOT BAN.
if (message.content.startsWith('/') || message.content.startsWith('!')) {
    try {
        // Optional: warn them gently? Or just silent delete.
        // User asked not to ban.
        const nextBump = new Date(threadData.lastBumped.getTime() + 6 * 60 * 60 * 1000);
        const ts = Math.floor(nextBump.getTime() / 1000);
        const msg = await message.channel.send(`⚠️ <@${message.author.id}>, please use the **Slash Commands** menu (click the command in the popup). Don't type it as plain text.\nNext bump available: <t:${ts}:R>`);
        setTimeout(() => msg.delete().catch(() => { }), 5000);
    } catch (e) { }
    return;
}

// Apply Strike / Ban
const newStrikes = threadData.bumpStrikeCount + 1;

let isBanned = false;
let banExpires: Date | null = null;

// "3 strikes un ban"
if (newStrikes >= 3) {
    isBanned = true;
    // Reset strikes after ban? or keep them? Usually reset or escalate.
    // Let's ban for 1 day.
    const banDurationMs = 24 * 60 * 60 * 1000;
    banExpires = new Date(Date.now() + banDurationMs);
}

await prisma.recruitmentThread.update({
    where: { id: threadData.id },
    data: {
        bumpStrikeCount: isBanned ? 0 : newStrikes, // Reset if banned, else increment
        bumpBanExpires: banExpires
    }
});

// Notify User
try {
    if (isBanned) {
        const banEndTs = Math.floor(banExpires!.getTime() / 1000);
        await message.author.send(`🚫 **Recruitment Ban Applied**
You have reached 3 strikes for sending messages in your recruitment thread.
**Penalty:** You are banned from using \`/bump\` until <t:${banEndTs}:F>.`);
    } else {
        await message.author.send(`⚠️ **Warning (${newStrikes}/3)**
You sent a message in your recruitment thread. This is not allowed.
**Action:** Message deleted.
**Warning:** If you reach 3 strikes, you will be temporarily banned from bumping.`);
    }
} catch (e) { }
}
