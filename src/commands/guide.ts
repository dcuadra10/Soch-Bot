import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import { config } from '../config';

export async function guideCommand(interaction: ChatInputCommandInteraction) {
    const embed = new EmbedBuilder()
        .setTitle('📘 SOCH Bot – Complete Guide')
        .setColor('Green')
        .setDescription('Welcome to the **SOCH Migration & Recruitment System**! Here is everything you need to know.')
        .addFields(
            {
                name: '1️⃣ For Governors (Migrants)',
                value:
                    '**• Step 1: Create Profile**\nUse `/create-account` to set up your stats (Power, KP, etc.). This allows Kings to see your info when you apply.\n\n' +
                    '**• Step 2: Find Kingdoms**\nUse `/find-kingdom` to see which kingdoms match your stats. You can filter by Seed (A, B, C, etc.).\n\n' +
                    '**• Step 3: Apply**\nClick "Apply" on a kingdom to open a private ticket with the King.'
            },
            {
                name: '2️⃣ For Recruiters (Forum)',
                value:
                    '**• Creating a Post:**\nGo to the Recruitment Forum <#' + (config.forumChannelId?.[0] || 'unavailable') + '> and create a **New Post**.\n' +
                    '_Title Requirement:_ Must include your Kingdom Number or Project Name.\n\n' +
                    '**• Bumping:**\nUse `/bump` inside your post every **6 hours** to move it to the top.\n\n' +
                    '**• One Post Rule:**\nYou can only have **one** active recruitment post. Use `/remake` if you want to replace your old one.\n\n' +
                    '**• ⚠️ Strict Chat Rules:**\nDo **NOT** send chat messages inside recruitment posts. They will be deleted.\n' +
                    '• 1st/2nd Offense: Warning DM.\n' +
                    '• **3rd Offense:** You will be **banned** from bumping that post for **24 hours**.'
            },
            {
                name: '3️⃣ For Kings (Management)',
                value:
                    '**• Registration:** Use `/register-kingdom` to list your kingdom in our database.\n' +
                    '**• Managing:** Use `/edit-kingdom` to update migration dates, power reqs, or open/close slots.\n' +
                    '**• Accepting:** When a user applies, you get a private ticket. Click "Accept" to approve them and deduce a migrant slot.'
            },
            {
                name: '4️⃣ Important Commands',
                value:
                    '`/find-kingdom [seed]` – Search kingdoms.\n' +
                    '`/bump` – Bump your post.\n' +
                    '`/create-account` – Setup profile.\n' +
                    '`/help` – See command list.'
            }
        )
        .setFooter({ text: 'SOCH Bot Guide • Rise of Kingdoms' });

    await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });
}
