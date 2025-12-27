import { ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';

export async function helpCommand(interaction: ChatInputCommandInteraction) {
    const embed = new EmbedBuilder()
        .setTitle('📘 SOCH Bot Help')
        .setDescription('Here are the available commands for the SOCH Bot.')
        .setColor('Blurple')
        .addFields(
            {
                name: '👤 **Governor Profile**',
                value:
                    '**`/create-account`** – Create your governor profile (Required to apply).\n' +
                    '**`/edit-account`** – Update your stats or image.\n' +
                    '**`/view-account`** – View your own or another user\'s profile.'
            },
            {
                name: '🔍 **Kingdom Search**',
                value:
                    '**`/find-kingdom`** – Search for kingdoms matching your stats.\n' +
                    '**`/list-kingdoms`** – View all registered kingdoms.'
            },
            {
                name: '📢 **Recruitment Forum**',
                value:
                    '**`/bump`** – Bump your recruitment post (6h cooldown).\n' +
                    '**`/remake`** – Delete and recreate your post to update content.\n' +
                    '**`/guide`** – View the complete recruitment guide.'
            },
            {
                name: '👑 **King Management**',
                value:
                    '**`/register-kingdom`** – Register your kingdom.\n' +
                    '**`/edit-kingdom`** – Update kingdom details (slots, migration dates, etc.).'
            },
            {
                name: '🛡️ **Staff Tools**',
                value:
                    '**`/unban-post`** – Remove bump ban/strikes from a post.\n' +
                    '**`/check-post`** – Check strike status of a post.'
            }
        )
        .setFooter({ text: 'SOCH Bot • Rise of Kingdoms', iconURL: interaction.client.user?.displayAvatarURL() });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('open_guide_help') // We will handle this in interactionCreate if needed, or just let them use /guide
            .setLabel('📖 Open Full Guide')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true) // Disabled for now, encouraging /guide command usage or later implementation
    );

    // We can just suggest using /guide in the text instead of a button for simplicity now
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
