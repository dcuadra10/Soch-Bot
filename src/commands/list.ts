import { ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { prisma } from '../config';

import { formatNumber } from '../utils/format';

export async function listKingdoms(interaction: ChatInputCommandInteraction) {
    try {
        const kingdoms = await prisma.kingdom.findMany({
            orderBy: { kdNumber: 'asc' }
        });

        if (kingdoms.length === 0) {
            await interaction.reply({ content: "No kingdoms registered yet.", flags: MessageFlags.Ephemeral });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle("🏰 All Registered Kingdoms")
            .setColor(0x0099FF)
            .setDescription("Here is the list of all participating kingdoms:");

        kingdoms.forEach((k) => {
            const openDate = k.migrationOpen ? `\n📅 **Open**: ${k.migrationOpen.toLocaleDateString()}` : "";
            embed.addFields({
                name: `#${k.kdNumber} - ${k.name} (${k.seed}-Seed)`,
                value: `👑 **King**: <@${k.ownerId}>\nScore: **${k.score}** | KvK: ${k.kvkWins}W/${k.kvkLosses}L\nReqs: **${formatNumber(k.powerReq)}** Power, **${formatNumber(k.kpReq)}** KP${openDate}`
            });
        });

        // Split into multiple embeds if too many fields (Discord limit 25 fields per embed)
        // For simple MVP, we assume < 25. If > 25, we should paginate. 
        // I'll stick to one embed for now as requested "simple list".

        await interaction.reply({ embeds: [embed], flags: [] }); // Public

    } catch (error) {
        console.error(error);
        await interaction.reply({ content: "Failed to fetch kingdoms.", flags: MessageFlags.Ephemeral });
    }
}
