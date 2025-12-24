// @ts-nocheck
import { ChatInputCommandInteraction, ButtonInteraction, TextChannel, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction } from 'discord.js';
import { prisma } from '../config';

// Number formatter
const fmt = new Intl.NumberFormat('en-US');

import { parseStatsInput } from '../utils/format';

export async function findKingdom(interaction: ChatInputCommandInteraction) {
    const powerInput = interaction.options.getString('power', true);
    const kpInput = interaction.options.getString('kp', true);
    const seedInput = interaction.options.getString('seed');

    const powerVal = parseStatsInput(powerInput) || BigInt(0);
    const kpVal = parseStatsInput(kpInput) || BigInt(0);

    const whereClause: any = {};
    if (seedInput) {
        whereClause.seed = { contains: seedInput, mode: 'insensitive' };
    }

    // Fetch all (filtered by seed) and filter stats in memory for complex logic
    const allKingdoms = await prisma.kingdom.findMany({
        where: whereClause
    });

    const kingdoms = allKingdoms.filter((k: any) => {
        // 1. Power Check (With 80% Tolerance)
        // Kingdom asks for X. User needs 0.8 * X.
        const strictReqPower = BigInt(k.powerReq);
        const toleratedReqPower = strictReqPower * 75n / 100n;

        if (strictReqPower > BigInt(0) && powerVal < toleratedReqPower) return false;

        // 2. KP Check (Strict / 100%)
        let reqKp = BigInt(0);
        if (k.kpMultiplier) {
            // Dynamic: UserPower * Multiplier
            reqKp = BigInt(Math.floor(Number(powerVal) * k.kpMultiplier));
        } else {
            // Static
            reqKp = BigInt(k.kpReq);
        }

        if (reqKp > BigInt(0) && kpVal < reqKp) return false;

        return true;
    }).slice(0, 5); // Take top 5 after filter

    if (kingdoms.length === 0) {
        await interaction.reply({ content: "No kingdoms found matching your stats.", flags: MessageFlags.Ephemeral });
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle("Matching Kingdoms")
        .setDescription("Here are kingdoms that match your stats:")
        .setColor(0x00FF00);

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    kingdoms.forEach((k: any, index) => {
        const kpDisplay = k.kpMultiplier ? `${k.kpMultiplier}x Power` : `${fmt.format(Number(k.kpReq))} KP`;
        const totalKpDisplay = k.totalKp ? `\nTotal KP: **${fmt.format(Number(k.totalKp))}**` : '';
        const slotsDisplay = k.migrantSlots ? ` | Slots: **${k.migrantSlots}**` : '';
        // Format dates simply
        const migStart = k.migrationStart ? new Date(k.migrationStart).toISOString().split('T')[0] : '?';
        const migEnd = k.migrationEnd ? new Date(k.migrationEnd).toISOString().split('T')[0] : '?';
        const migDisplay = (k.migrationStart && k.migrationEnd) ? `\nMigration: **${migStart}** ➡ **${migEnd}**` : '';

        embed.addFields({
            name: `#${k.kdNumber} - ${k.name} (${k.seed}-Seed)${slotsDisplay}`,
            value: `Score: **${k.score || 0}**\nReq: **${fmt.format(Number(k.powerReq))}** Power, **${kpDisplay}**\nKvK: ${k.kvkWins}W / ${k.kvkLosses}L${totalKpDisplay}${migDisplay}`
        });

        // Limit buttons to 5 per row
        if (rows.length === 0 || rows[rows.length - 1].components.length >= 5) {
            rows.push(new ActionRowBuilder<ButtonBuilder>());
        }

        rows[rows.length - 1].addComponents(
            new ButtonBuilder()
                .setCustomId(`apply_${k.id}`)
                .setLabel(`Apply #${k.kdNumber}`)
                .setStyle(ButtonStyle.Primary)
        );
    });

    await interaction.reply({ embeds: [embed], components: rows, flags: [] });
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

        const questionsInput = new TextInputBuilder()
            .setCustomId('answers')
            .setLabel("Please answer the kingdom's questions:")
            .setPlaceholder(kingdom.questions.substring(0, 100)) // Use questions as placeholder
            .setValue(kingdom.questions.length > 2000 ? "Check channel for full questions." : "") // Cannot prefill value easily as this is input. 
            // Better strategy: Use label generic, but maybe put questions in the modal?? Discord modals don't support text-only fields nicely.
            // We will rely on the user having read them or just putting "See below" if standard.
            // Wait, USER wants "questions to be asked as a form".
            // Since we only have one questions string, we will ask them to answer it here.
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const row = new ActionRowBuilder<TextInputBuilder>().addComponents(questionsInput);
        modal.addComponents(row);

        await interaction.showModal(modal);
    } else {
        // No questions, proceed to create ticket directly
        await createApplicationTicket(interaction, kingdom, null);
    }
}

export async function handleApplicationSubmit(interaction: ModalSubmitInteraction) {
    const kingdomId = parseInt(interaction.customId.split('_')[2]);
    const answers = interaction.fields.getTextInputValue('answers');

    const kingdom = await prisma.kingdom.findUnique({ where: { id: kingdomId } });
    if (!kingdom) {
        await interaction.reply({ content: "Kingdom not found.", flags: MessageFlags.Ephemeral });
        return;
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
        let dateInfo = "";
        if (kingdom.migrationOpen) {
            const openDate = new Date(kingdom.migrationOpen).toLocaleDateString();
            const closeDate = kingdom.migrationClose ? new Date(kingdom.migrationClose).toLocaleDateString() : "Indefinite";
            dateInfo = `\n📅 **Migration Window**: ${openDate} - ${closeDate}`;
        }

        // Initial Message
        await channel.send({
            content: `Welcome ${interaction.user}! You have applied to Kingdom #${kingdom.kdNumber}.\nThe King <@${kingdom.ownerId}> will appear shortly.${dateInfo}`,
            components: [ticketRow]
        });

        // If answers provided, send Embed
        if (answers || kingdom.questions) {
            const embed = new EmbedBuilder()
                .setTitle("📋 Application Form")
                .setColor(0x00AAFF)
                .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
                .addFields(
                    { name: 'Kingdom Questions', value: kingdom.questions || "None provided." },
                    { name: 'User Answers', value: answers || "No answers provided (or not required)." }
                );

            await channel.send({ embeds: [embed] });
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

