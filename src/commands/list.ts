import { ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { prisma } from '../config';

import { formatNumber } from '../utils/format';

export async function listKingdoms(interaction: ChatInputCommandInteraction) {
    try {
        await interaction.deferReply();

        const kingdoms = await prisma.kingdom.findMany({
            where: { verified: true },
            orderBy: { kdNumber: 'asc' }
        });

        if (kingdoms.length === 0) {
            await interaction.editReply({ content: "No verified kingdoms found." });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle("🏰 All Registered Kingdoms")
            .setColor(0x0099FF)
            .setDescription("Here is the list of all verified kingdoms:");

        kingdoms.forEach((k) => {
            const openDate = k.migrationStart ? `\n📅 **Open**: ${k.migrationStart.toLocaleDateString()}` : "";
            const kpReqDisplay = k.kpMultiplier ? `${k.kpMultiplier}x Power` : `${formatNumber(k.kpReq)} KP`;
            embed.addFields({
                name: `#${k.kdNumber} - ${k.name} (${k.seed}-Seed)`,
                value: `👑 **King**: <@${k.ownerId}>\nScore: **${k.score}** | KvK: ${k.kvkWins}W/${k.kvkLosses}L\nReqs: **${formatNumber(k.powerReq)}** Power, **${kpReqDisplay}**${openDate}`
            });
        });

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error(error);
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: "Failed to fetch kingdoms." });
        } else {
            await interaction.reply({ content: "Failed to fetch kingdoms.", flags: MessageFlags.Ephemeral });
        }
    }
}
