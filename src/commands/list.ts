// @ts-nocheck
import { ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ButtonInteraction, Interaction } from 'discord.js';
import { prisma } from '../config';

import { formatNumber } from '../utils/format';

export async function listKingdoms(interaction: ChatInputCommandInteraction) {
    try {
        await interaction.deferReply();
        await renderList(interaction, 0);
    } catch (error) {
        console.error(error);
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: "Failed to fetch kingdoms." });
        } else {
            await interaction.reply({ content: "Failed to fetch kingdoms.", flags: MessageFlags.Ephemeral });
        }
    }
}

export async function handleListPagination(interaction: ButtonInteraction) {
    const page = parseInt(interaction.customId.split('_')[2]);
    await renderList(interaction, page);
}

async function renderList(interaction: Interaction, page: number) {
    const ITEMS_PER_PAGE = 10;
    const kingdoms = await prisma.kingdom.findMany({
        where: { verified: true },
        orderBy: { kdNumber: 'asc' }
    });

    if (kingdoms.length === 0) {
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: "No verified kingdoms found.", flags: MessageFlags.Ephemeral });
        } else {
            // @ts-ignore
            await interaction.editReply({ content: "No verified kingdoms found.", components: [], embeds: [] });
        }
        return;
    }

    const totalPages = Math.ceil(kingdoms.length / ITEMS_PER_PAGE);
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));

    const start = currentPage * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const slicedKingdoms = kingdoms.slice(start, end);

    const embed = new EmbedBuilder()
        .setTitle("🏰 All Registered Kingdoms")
        .setColor(0x0099FF)
        .setDescription(`Here is the list of verified kingdoms (Page ${currentPage + 1}/${totalPages}):`);

    slicedKingdoms.forEach((k) => {
        const openDate = k.migrationStart ? `\n📅 **Open**: ${k.migrationStart.toLocaleDateString()}` : "";
        const kpReqDisplay = k.kpMultiplier ? `${k.kpMultiplier}x Power` : `${formatNumber(k.kpReq)} KP`;
        const bannerLink = k.imageUrl ? ` | [Banner](${k.imageUrl})` : "";
        embed.addFields({
            name: `#${k.kdNumber} - ${k.name} (${k.seed}-Seed)`,
            value: `👑 **King**: <@${k.ownerId}>\nScore: **${k.score}** | Status: **${k.kvkStatus || 'N/A'}**\nKvK: ${k.kvkWins}W/${k.kvkLosses}L${bannerLink}\nReqs: **${formatNumber(k.powerReq)}** Power, **${kpReqDisplay}**${openDate}`
        });
    });

    const row = new ActionRowBuilder<ButtonBuilder>();

    if (totalPages > 1) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`list_page_${currentPage - 1}`)
                .setLabel('⬅️ Previous')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage === 0),
            new ButtonBuilder()
                .setCustomId('list_page_num')
                .setLabel(`${currentPage + 1}/${totalPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`list_page_${currentPage + 1}`)
                .setLabel('Next ➡️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage === totalPages - 1)
        );
    }

    const payload = { embeds: [embed], components: row.components.length > 0 ? [row] : [] };

    if (interaction.isButton()) {
        await interaction.update(payload);
    } else {
        // @ts-ignore
        await interaction.editReply(payload);
    }
}
