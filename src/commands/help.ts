
import { ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';

export async function helpCommand(interaction: ChatInputCommandInteraction) {
    const embed = new EmbedBuilder()
        .setTitle('📘 SOCH Bot Help')
        .setDescription('Here are the available commands for the SOCH Bot.')
        .setColor('Blue')
        .addFields(
            {
                name: '🔍 **Public Commands**',
                value:
                    '`/find-kingdom` - Search for a kingdom matching your Power/KP.\n' +
                    '`/list-kingdoms` - View a list of all registered kingdoms.\n' +
                    '`/claim-king` - Verify yourself as a King (requires screenshot).'
            },
            {
                name: '👑 **King Commands**',
                value:
                    '`/register-kingdom` - Register your kingdom (Must be King).\n' +
                    '`/edit-kingdom` - Edit your kingdom details.'
            },
            {
                name: '🛡️ **Staff/Admin Commands**',
                value:
                    '`/set-kingdom-score` - Assign a score to a kingdom.\n' +
                    '`/delete-kingdom` - Delete a kingdom (Admin only).'
            }
        )
        .setFooter({ text: 'SOCH Bot • Rise of Kingdoms', iconURL: interaction.client.user?.displayAvatarURL() });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
