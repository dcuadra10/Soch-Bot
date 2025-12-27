// @ts-nocheck
import { ChatInputCommandInteraction, ButtonInteraction, TextChannel, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction, Interaction } from 'discord.js';
import { prisma } from '../config';
import { parseStatsInput, formatNumber } from '../utils/format';

export async function findKingdom(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const seed = interaction.options.getString('seed') || '';
    await renderKingdomSearch(interaction, seed, 0);
}

export async function handleSearchPagination(interaction: ButtonInteraction) {
    // id: search_page_PAGE_SEED
    const parts = interaction.customId.split('_');
    const page = parseInt(parts[2]);
    const seed = parts.slice(3).join('_'); // Just in case
    await renderKingdomSearch(interaction, seed, page);
}

async function renderKingdomSearch(interaction: Interaction, seedInput: string, page: number) {
    // Fetch User Profile
    const profile = await prisma.userProfile.findUnique({ where: { discordId: interaction.user.id } });

    let powerVal = BigInt(0);
    let kpVal = BigInt(0);
    let hasProfile = false;

    if (profile) {
        powerVal = profile.power;
        kpVal = profile.kp;
        hasProfile = true;
    }

    const whereClause: any = {
        seed: { contains: seedInput, mode: 'insensitive' },
        verified: true
    };

    // Fetch all (filtered by seed)
    const allKingdoms = await prisma.kingdom.findMany({
        where: whereClause,
        orderBy: { kdNumber: 'asc' }
    });

    const filteredKingdoms = allKingdoms.filter((k: any) => {
        // If no profile, show everything matching the seed (skip stat checks)
        if (!hasProfile) return true;

        // 1. Power Check (With tolerance)
        const strictReqPower = BigInt(k.powerReq);
        const toleratedReqPower = strictReqPower * 75n / 100n;

        if (powerVal && strictReqPower > BigInt(0) && powerVal < toleratedReqPower) return false;

        // 2. KP Check
        let reqKp = BigInt(0);
        if (k.kpMultiplier) {
            reqKp = BigInt(Math.floor(Number(powerVal) * k.kpMultiplier));
        } else {
            reqKp = BigInt(k.kpReq);
        }

        if (kpVal && reqKp > BigInt(0) && kpVal < reqKp) return false;

        return true;
    });

    const ITEMS_PER_PAGE = 5;
    const totalPages = Math.ceil(filteredKingdoms.length / ITEMS_PER_PAGE);
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));

    if (filteredKingdoms.length === 0) {
        const msg = hasProfile ? "No kingdoms found matching your stats." : "No kingdoms found for this seed.";
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
        } else {
            // @ts-ignore
            await interaction.editReply({ content: msg, embeds: [], components: [] });
        }
        return;
    }

    const start = currentPage * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const currentKingdoms = filteredKingdoms.slice(start, end);

    const embeds: EmbedBuilder[] = [];
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    let currentRow = new ActionRowBuilder<ButtonBuilder>();

    currentKingdoms.forEach((k: any) => {
        let kpDisplay = '';
        if (k.kpMultiplier) {
            if (hasProfile) {
                const req = BigInt(Math.floor(Number(powerVal) * k.kpMultiplier));
                kpDisplay = `${formatNumber(req)} KP (${k.kpMultiplier}x)`;
            } else {
                kpDisplay = `${k.kpMultiplier}x Power`;
            }
        } else {
            kpDisplay = `${formatNumber(k.kpReq)} KP`;
        }
        const totalKpDisplay = k.totalKp ? `\nTotal KP: **${formatNumber(k.totalKp)}**` : '';
        const slotsDisplay = k.migrantSlots ? ` | Slots: **${k.migrantSlots}**` : '';

        let migDisplay = '';
        if (k.migrationStart && k.migrationEnd) {
            const tsStart = Math.floor(new Date(k.migrationStart).getTime() / 1000);
            const tsEnd = Math.floor(new Date(k.migrationEnd).getTime() / 1000);
            migDisplay = `\nMigration: <t:${tsStart}:D> ➡ <t:${tsEnd}:D>`;
        } else if (k.migrationStart) {
            const tsStart = Math.floor(new Date(k.migrationStart).getTime() / 1000);
            migDisplay = `\nMigration Starts: <t:${tsStart}:R>`;
        }

        const embed = new EmbedBuilder()
            .setTitle(`#${k.kdNumber} - ${k.name} (${k.seed}-Seed)${slotsDisplay}`)
            .setColor(0x00FF00)
            .addFields({
                name: 'Stats & Reqs',
                value: `Score: **${k.score ? k.score : 'N/A'}** | Status: **${k.kvkStatus || 'N/A'}**\nReq: **${formatNumber(k.powerReq)}** Power, **${kpDisplay}**\nKvK: ${k.kvkWins}W / ${k.kvkLosses}L${totalKpDisplay}${migDisplay}`
            });

        if (k.imageUrl) {
            embed.setImage(k.imageUrl);
        }

        embeds.push(embed);

        // Buttons
        if (currentRow.components.length >= 5) {
            rows.push(currentRow);
            currentRow = new ActionRowBuilder<ButtonBuilder>();
        }
        currentRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`apply_${k.id}`)
                .setLabel(`Apply #${k.kdNumber}`)
                .setStyle(ButtonStyle.Primary)
        );
    });

    if (currentRow.components.length > 0) {
        rows.push(currentRow);
    }

    // Pagination Row
    if (totalPages > 1) {
        const pageRow = new ActionRowBuilder<ButtonBuilder>();
        pageRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`search_page_${currentPage - 1}_${seedInput}`)
                .setLabel('⬅️ Previous')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage === 0),
            new ButtonBuilder()
                .setCustomId('search_page_num')
                .setLabel(`${currentPage + 1}/${totalPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`search_page_${currentPage + 1}_${seedInput}`)
                .setLabel('Next ➡️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage === totalPages - 1)
        );
        rows.push(pageRow);
    }

    const introText = hasProfile
        ? `**Matching Kingdoms** (Page ${currentPage + 1}/${totalPages})\nBased on your profile (Power: ${formatNumber(powerVal)}, KP: ${formatNumber(kpVal)}):`
        : `**Matching Kingdoms** (Page ${currentPage + 1}/${totalPages})\n⚠️ No Profile Found. Showing all matching seed.`;

    const payload = { content: introText, embeds: embeds, components: rows, flags: MessageFlags.Ephemeral };

    if (interaction.isButton()) {
        await interaction.update(payload);
    } else {
        // @ts-ignore
        await interaction.editReply(payload);
    }
}

export async function handleScanApply(interaction: ButtonInteraction) {
    const kingdomId = parseInt(interaction.customId.split('_')[1]);

    const kingdom = await prisma.kingdom.findUnique({ where: { id: kingdomId } });
    if (!kingdom) {
        await interaction.reply({ content: "Kingdom not found.", flags: MessageFlags.Ephemeral });
        return;
    }

    // Check if kingdom has questions
    if (kingdom.questions && kingdom.questions.trim().length > 0) {
        // Show Modal
        const modal = new ModalBuilder()
            .setCustomId(`application_modal_${kingdom.id}`)
            .setTitle(`Apply to Kingdom #${kingdom.kdNumber}`);

        // Split questions intelligently
        let questionsList = kingdom.questions.split('@@@').map(q => q.trim()).filter(q => q.length > 0);

        if (questionsList.length <= 1 && !kingdom.questions.includes('@@@')) {
            // Fallback: If no delimiter found, assume newlines separate questions
            // But check if it actually HAS newlines
            if (kingdom.questions.includes('\n')) {
                questionsList = kingdom.questions.split('\n').map(q => q.trim()).filter(q => q.length > 0);
            }
        }

        if (questionsList.length === 0 && kingdom.questions.trim().length > 0) {
            questionsList.push(kingdom.questions);
        }

        // Limit to 5 questions (Discord Modal Limit)
        const finalQuestions = questionsList.slice(0, 5);

        for (let i = 0; i < finalQuestions.length; i++) {
            const qText = finalQuestions[i];
            const label = qText.length > 45 ? qText.substring(0, 42) + '...' : qText;

            const input = new TextInputBuilder()
                .setCustomId(`answer_${i}`)
                .setLabel(label)
                .setPlaceholder("Your answer...")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
        }

        try {
            await interaction.showModal(modal);
        } catch (error) {
            console.error(error);
            if (!interaction.replied) {
                await interaction.reply({ content: "Error opening application form. Please try again.", flags: MessageFlags.Ephemeral });
            }
        }
    } else {
        // No questions, proceed to create ticket directly
        await createApplicationTicket(interaction, kingdom, null);
    }
}

export async function handleApplicationSubmit(interaction: ModalSubmitInteraction) {
    const kingdomId = parseInt(interaction.customId.split('_')[2]);
    const kingdom = await prisma.kingdom.findUnique({ where: { id: kingdomId } });

    if (!kingdom) {
        await interaction.reply({ content: "Kingdom not found.", flags: MessageFlags.Ephemeral });
        return;
    }

    let answers = "";
    // Re-construct question list to match labels
    let questionsList = kingdom.questions?.split('@@@').map(q => q.trim()).filter(q => q.length > 0) || [];

    if (questionsList.length <= 1 && kingdom.questions && !kingdom.questions.includes('@@@') && kingdom.questions.includes('\n')) {
        questionsList = kingdom.questions.split('\n').map(q => q.trim()).filter(q => q.length > 0);
    }

    if (questionsList.length === 0 && kingdom.questions) {
        questionsList.push(kingdom.questions);
    }

    for (let i = 0; i < 5; i++) {
        try {
            const ans = interaction.fields.getTextInputValue(`answer_${i}`);
            if (ans) {
                const qLabel = questionsList[i] || `Question ${i + 1}`;
                answers += `**${qLabel}**\n${ans}\n\n`;
            }
        } catch (e) {
            // Field not found (less questions than 5)
        }
    }

    // Legacy fallback
    if (!answers) {
        try {
            const oldAns = interaction.fields.getTextInputValue('answers');
            if (oldAns) answers = `**Answers:**\n${oldAns}`;
        } catch (e) { }
    }

    await createApplicationTicket(interaction, kingdom, answers);
}

async function createApplicationTicket(interaction: ButtonInteraction | ModalSubmitInteraction, kingdomInput: any, answers: string | null) {
    const kingdom = kingdomInput as any;
    const guild = interaction.guild;
    if (!guild) return;

    // Create ticket channel
    const channelName = `ticket-${interaction.user.username}-${kingdom.kdNumber}`;

    try {
        const channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: interaction.user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                },
            ],
        });

        // Try to add the King permissions
        try {
            const kingMember = await guild.members.fetch(kingdom.ownerId);
            if (kingMember) {
                await channel.permissionOverwrites.edit(kingMember.id, {
                    ViewChannel: true,
                    SendMessages: true
                });
            }
        } catch (e) {
            console.log("King not found in server or invalid ID");
        }

        // Save ticket to DB
        await prisma.ticket.create({
            data: {
                channelId: channel.id,
                userId: interaction.user.id,
                kingdomId: kingdom.id
            }
        });

        // Ticket Controls Row
        const ticketRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('accept_applicant')
                    .setLabel('Accept Applicant')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅'),
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('Close Ticket')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒')
            );

        // Format dates if available
        // Format dates if available
        let dateInfo = "";
        if (kingdom.migrationStart) {
            const tsStart = Math.floor(new Date(kingdom.migrationStart).getTime() / 1000);
            if (kingdom.migrationEnd) {
                const tsEnd = Math.floor(new Date(kingdom.migrationEnd).getTime() / 1000);
                dateInfo = `\n📅 **Migration Window**: <t:${tsStart}:D> - <t:${tsEnd}:D>`;
            } else {
                dateInfo = `\n📅 **Migration Starts**: <t:${tsStart}:D>`;
            }
        }

        // Initial Message
        await channel.send({
            content: `Welcome ${interaction.user}! You have applied to Kingdom #${kingdom.kdNumber}.\nThe King <@${kingdom.ownerId}> will appear shortly.${dateInfo}`,
            components: [ticketRow]
        });

        // 1. Application Form (Questions)
        if (answers) {
            const embed = new EmbedBuilder()
                .setTitle("📋 Application Form")
                .setColor(0x00AAFF)
                .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() });

            // Split the formatted answers string back into chunks to display as fields
            // Format was: **Question**\nAnswer\n\n
            if (answers.includes('**')) {
                const chunks = answers.split('\n\n').filter(c => c.trim().length > 0);
                chunks.forEach(chunk => {
                    const lines = chunk.split('\n');
                    const question = lines[0].replace(/\*\*/g, ''); // Remove bold markers for title
                    const answer = lines.slice(1).join('\n');

                    if (question && answer) {
                        embed.addFields({ name: question, value: answer });
                    }
                });
            } else {
                embed.setDescription(answers);
            }

            await channel.send({ embeds: [embed] });
        }

        // 2. User Profile Fetch & Embed
        const userProfile = await prisma.userProfile.findUnique({ where: { discordId: interaction.user.id } });

        if (userProfile) {
            const profileEmbed = new EmbedBuilder()
                .setTitle("👤 Governor Profile")
                .setColor(0xFFA500)
                .addFields(
                    { name: "In-Game Name", value: userProfile.ingameName, inline: true },
                    { name: "In-Game ID", value: userProfile.ingameId, inline: true },
                    { name: "Current Kingdom", value: userProfile.kingdomNumber, inline: true },
                    { name: "Power", value: formatNumber(userProfile.power), inline: true },
                    { name: "Kill Points", value: formatNumber(userProfile.kp), inline: true },
                    { name: "Dead Troops", value: formatNumber(userProfile.dead), inline: true },
                    { name: "Farms", value: userProfile.farms.toString(), inline: true },
                    { name: "CH25 Farms", value: userProfile.ch25Farms.toString(), inline: true }
                )
                .setImage(userProfile.imageUrl)
                .setFooter({ text: "To update this info, use /edit-account" });

            await channel.send({ embeds: [profileEmbed] });
        } else {
            await channel.send("⚠️ **Warning:** You have not set up your Governor Profile yet.\nPlease run `/create-account` so the King can see your stats!");
        }

        await interaction.reply({ content: `Ticket created: ${channel.toString()}`, flags: MessageFlags.Ephemeral });

    } catch (error) {
        console.error(error);
        if (!interaction.replied) {
            await interaction.reply({ content: "Failed to create ticket channel. Check bot permissions.", flags: MessageFlags.Ephemeral });
        }
    }
}

export async function handleCloseTicket(interaction: ButtonInteraction) {
    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('confirm_close')
                .setLabel('Delete Channel')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️'),
            new ButtonBuilder()
                .setCustomId('cancel_close')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
        );

    await interaction.reply({ content: "Are you sure you want to close and delete this ticket?", components: [row] });
}

export async function handleConfirmClose(interaction: ButtonInteraction) {
    if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) return;

    await interaction.reply("Deleting ticket in 5 seconds...");

    // Update DB
    try {
        await prisma.ticket.updateMany({
            where: { channelId: interaction.channel.id },
            data: { closed: true }
        });
    } catch (e) {
        console.error("Error updating ticket status:", e);
    }

    setTimeout(async () => {
        if (interaction.channel) {
            await interaction.channel.delete().catch(console.error);
        }
    }, 5000);
}

export async function handleAcceptApplicant(interaction: ButtonInteraction) {
    const channelId = interaction.channelId;

    // Find ticket to get Kingdom
    const ticket = await prisma.ticket.findFirst({ where: { channelId } });
    if (!ticket) {
        await interaction.reply({ content: "Ticket not found.", flags: MessageFlags.Ephemeral });
        return;
    }

    const kingdom = await prisma.kingdom.findUnique({ where: { id: ticket.kingdomId } });
    if (!kingdom) return;

    // Check permissions (King/Admin/Staff)
    // King check:
    if (interaction.user.id !== kingdom.ownerId && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: "Only the King can accept applicants.", flags: MessageFlags.Ephemeral });
        return;
    }

    if (kingdom.migrantSlots === null || kingdom.migrantSlots <= 0) {
        await interaction.reply({ content: "❌ No migrant slots available!", flags: MessageFlags.Ephemeral });
        return;
    }

    // Decrement Slots
    const newSlots = kingdom.migrantSlots - 1;
    await prisma.kingdom.update({
        where: { id: kingdom.id },
        data: { migrantSlots: newSlots }
    });

    await interaction.reply(`✅ **Applicant Accepted!**\nOne slot used. Remaining Slots: **${newSlots}**.`);

    // Disable the button to prevent double click?
    // Optionally update the message components to disable the button.
    try {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('accept_applicant').setLabel('Accepted').setStyle(ButtonStyle.Success).setDisabled(true),
            new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
        );
        await interaction.message.edit({ components: [row] });
    } catch (e) { }
}

