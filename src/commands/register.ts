// @ts-nocheck
import {
    ChatInputCommandInteraction,
    ModalSubmitInteraction,
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    GuildMember,
    PermissionFlagsBits,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    Message,
    TextChannel,
    MessageFlags,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ChannelType,
    ButtonInteraction
} from 'discord.js';
import { prisma, config } from '../config';
import { parseStatsInput, formatNumber } from '../utils/format';


interface RegistrationSession {
    userId: string;
    step: 'KD' | 'NAME' | 'SEED' | 'POWER_REQ' | 'KP_REQ' | 'KVK' | 'TOTAL_KP' | 'INVITE' | 'MIGRATION_START' | 'MIGRATION_END' | 'SLOTS' | 'IMAGE' | 'QUESTIONS';
    data: {
        kdNumber?: string;
        name?: string;
        seed?: string;
        powerReq?: bigint;
        kpReq?: bigint;
        kpMultiplier?: number; // New field
        kvkWins?: number;
        kvkLosses?: number;
        totalKp?: bigint;
        migrantSlots?: number;
        discordInvite?: string;
        migrationStart?: Date;
        migrationEnd?: Date;
        imageUrl?: string;
        questions: string[];
    };
    msgId?: string; // ID of the last bot prompt to update/edit if needed
}

// In-memory sessions: channelId -> Session
const sessions = new Map<string, RegistrationSession>();

export async function deleteKingdom(interaction: ChatInputCommandInteraction) {
    const member = interaction.member as GuildMember;
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
    // Check staff role
    const isStaff = config.staffRoleId && member.roles.cache.has(config.staffRoleId);

    const kdNumber = interaction.options.getString('kd');
    const userId = interaction.user.id;

    if (kdNumber) {
        // Direct Delete Logic
        const kingdom = await prisma.kingdom.findUnique({ where: { kdNumber } });
        if (!kingdom) {
            await interaction.reply({ content: `Kingdom #${kdNumber} not found.`, flags: MessageFlags.Ephemeral });
            return;
        }

        // Permission Check
        const isOwner = kingdom.ownerId === userId;
        if (!isAdmin && !isStaff && !isOwner) {
            await interaction.reply({ content: "❌ You do not have permission to delete this kingdom.", flags: MessageFlags.Ephemeral });
            return;
        }

        await prisma.ticket.deleteMany({ where: { kingdomId: kingdom.id } });
        await prisma.kingdom.delete({ where: { kdNumber } });
        await interaction.reply({ content: `🗑️ Kingdom #${kdNumber} has been deleted.`, flags: MessageFlags.Ephemeral });

    } else {
        // List Logic
        const whereClause = (isAdmin || isStaff) ? {} : { ownerId: userId };

        const kingdoms = await prisma.kingdom.findMany({
            where: whereClause,
            take: 25, // Limit for Dropdown
            orderBy: { kdNumber: 'asc' }
        });

        if (kingdoms.length === 0) {
            await interaction.reply({ content: "You have no kingdoms available to delete.", flags: MessageFlags.Ephemeral });
            return;
        }

        const select = new StringSelectMenuBuilder()
            .setCustomId('delete_kingdom_select')
            .setPlaceholder('Select a kingdom to delete')
            .addOptions(
                kingdoms.map(k => new StringSelectMenuOptionBuilder()
                    .setLabel(`#${k.kdNumber} - ${k.name}`)
                    .setDescription(`Seed: ${k.seed}`)
                    .setValue(k.kdNumber)
                )
            );

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

        const msg = await interaction.reply({
            content: "Select a kingdom to delete (This action is irreversible):",
            components: [row],
            flags: MessageFlags.Ephemeral
        });

        // Collector
        try {
            const selection = await msg.awaitMessageComponent({
                componentType: ComponentType.StringSelect,
                time: 60000
            });

            if (selection.customId === 'delete_kingdom_select') {
                const targetKd = selection.values[0];
                // Double check existence (race condition)
                const kToDelete = await prisma.kingdom.findUnique({ where: { kdNumber: targetKd } });
                if (kToDelete) {
                    // Verify permission again securely just in case context changed (unlikely in ephemeral but good practice)
                    const canDelete = isAdmin || isStaff || kToDelete.ownerId === userId;

                    if (canDelete) {
                        await prisma.ticket.deleteMany({ where: { kingdomId: kToDelete.id } });
                        await prisma.kingdom.delete({ where: { kdNumber: targetKd } });
                        await selection.update({ content: `🗑️ Kingdom #${targetKd} has been deleted.`, components: [] });
                    } else {
                        await selection.update({ content: "Permission denied.", components: [] });
                    }
                } else {
                    await selection.update({ content: "Kingdom no longer exists.", components: [] });
                }
            }
        } catch (e) {
            // Timeout or error
            await interaction.editReply({ content: "Command timed out or cancelled.", components: [] });
        }
    }
}

export async function setKingdomScore(interaction: ChatInputCommandInteraction) {
    const staffRoleId = config.staffRoleId;
    const member = interaction.member as GuildMember;
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
    const isStaff = staffRoleId && member.roles.cache.has(staffRoleId);

    if (!isAdmin && !isStaff) {
        await interaction.reply({ content: "Only Staff/Admins can set kingdom scores.", flags: MessageFlags.Ephemeral });
        return;
    }

    const kdNumber = interaction.options.getString('kd', true);
    const score = interaction.options.getNumber('score', true);

    try {
        await prisma.kingdom.update({ where: { kdNumber }, data: { score } });
        await interaction.reply({ content: `Score for Kingdom #${kdNumber} updated to **${score}**.`, flags: MessageFlags.Ephemeral });
    } catch (error) {
        await interaction.reply({ content: "Failed to update score. Kingdom might not exist.", flags: MessageFlags.Ephemeral });
    }
}

export async function setKingdomSlots(interaction: ChatInputCommandInteraction) {
    const member = interaction.member as GuildMember;
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
    const kdNumber = interaction.options.getString('kd', true);
    const slots = interaction.options.getInteger('slots', true);

    try {
        const kingdom = await prisma.kingdom.findUnique({ where: { kdNumber } });
        if (!kingdom) {
            await interaction.reply({ content: "Kingdom not found.", flags: MessageFlags.Ephemeral });
            return;
        }

        if (!isAdmin && kingdom.ownerId !== interaction.user.id) {
            await interaction.reply({ content: "You do not have permission to manage slots for this kingdom.", flags: MessageFlags.Ephemeral });
            return;
        }

        await prisma.kingdom.update({ where: { kdNumber }, data: { migrantSlots: slots } });
        await interaction.reply({ content: `✅ Migrant slots for Kingdom #${kdNumber} updated to **${slots}**.`, flags: MessageFlags.Ephemeral });

    } catch (error) {
        console.error(error);
        await interaction.reply({ content: "Failed to update slots.", flags: MessageFlags.Ephemeral });
    }
}

// --- NEW WIZARD IMPLEMENTATION ---

export async function registerKingdom(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const kingRoleId = config.kingRoleId;
    const member = interaction.member as GuildMember;

    if (kingRoleId && member && !member.roles.cache.has(kingRoleId)) {
        await interaction.editReply({ content: "You do not have permission to register a kingdom." });
        return;
    }

    const guild = interaction.guild;
    if (!guild) return;

    // Create a private channel
    const channelName = `setup-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '');

    try {
        const channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
                { id: interaction.client.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
            ]
        });

        // Initialize Session
        sessions.set(channel.id, {
            userId: interaction.user.id,
            step: 'KD',
            data: { questions: [] }
        });

        await interaction.editReply({ content: `✅ Setup channel created: ${channel.toString()}` });

        // Start Flow
        await channel.send({
            content: `👋 **Welcome, Your Majesty!**\nI'm here to help you register your kingdom.\n\nWe will go through the settings step-by-step.\nYou can type \`cancel\` at any time to abort.\n\n**Step 1:** What is your **Kingdom Number**? (e.g. 1234)`
        });

        // Start Collector
        startWizardCollector(channel, interaction.user.id);

    } catch (error) {
        console.error("Setup Error:", error);
        await interaction.editReply({ content: "Failed to create setup channel." });
    }
}

function startWizardCollector(channel: TextChannel, userId: string) {
    const collector = channel.createMessageCollector({
        filter: m => m.author.id === userId,
        time: 1000 * 60 * 30 // Extended timeout to 30 mins
    });

    collector.on('collect', async (message) => {
        const content = message.content.trim();
        if (content.toLowerCase() === 'cancel') {
            await channel.send("🚫 Setup cancelled. Deleting channel in 5 seconds...");
            setTimeout(() => channel.delete().catch(() => { }), 5000);
            collector.stop();
            return;
        }

        const session = sessions.get(channel.id);
        if (!session) return;

        try {
            switch (session.step) {
                case 'KD':
                    if (!/^\d+$/.test(content)) {
                        await message.reply("❌ Kingdom Number must be numeric. Try again.");
                        return;
                    }
                    // Check availability
                    const existing = await prisma.kingdom.findUnique({ where: { kdNumber: content } });
                    if (existing) {
                        await message.reply(`❌ Kingdom #${content} is already registered. Please enter a different number.`);
                        return;
                    }
                    session.data.kdNumber = content;
                    session.step = 'NAME';
                    await channel.send("✅ Got it. Now, what is the **Kingdom Name**?");
                    break;

                case 'NAME':
                    if (content.length > 50) {
                        await message.reply("Name is too long. Keep it under 50 characters.");
                        return;
                    }
                    session.data.name = content;
                    session.step = 'SEED';

                    // Show Buttons for Seed
                    const seedRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                        ['Imperium', 'A', 'B', 'C', 'D'].map(s =>
                            new ButtonBuilder().setCustomId(`seed_${s}`).setLabel(s).setStyle(ButtonStyle.Primary)
                        )
                    );
                    const seedMsg = await channel.send({ content: "Select your **Kingdom Seed**:", components: [seedRow] });

                    // Button Collector for Seed
                    try {
                        const seedInt = await seedMsg.awaitMessageComponent({
                            filter: i => i.user.id === userId && i.customId.startsWith('seed_'),
                            time: 60000,
                            componentType: ComponentType.Button
                        });
                        session.data.seed = seedInt.customId.split('_')[1];
                        session.step = 'POWER_REQ';
                        await seedInt.update({ content: `✅ Seed set to **${session.data.seed}**.`, components: [] });
                        await channel.send("What is the **Power Requirement**? (e.g. `30m`)");
                    } catch (e) {
                        await channel.send("Timed out selecting seed. Type `cancel` to stop.");
                    }
                    break;

                case 'POWER_REQ':
                    const pVal = parseStatsInput(content);
                    if (pVal === null || pVal < BigInt(0)) {
                        await message.reply("Invalid power format. Please use `30m`, `15m`, or `0` for none.");
                        return;
                    }
                    session.data.powerReq = pVal;
                    session.step = 'KP_REQ';
                    await channel.send("✅ Power saved.\nNow, what is the **Kill Points (KP) Requirement**?\nYou can enter a fixed number (e.g. `2b`) OR a multiplier like `4x` (which means `4 * Your_Power`).");
                    break;

                case 'KP_REQ':
                    let kpVal = BigInt(0);
                    let multiplier: number | undefined = undefined;
                    const kpInput = content.trim().toLowerCase();

                    if (kpInput.endsWith('x')) {
                        // MULTIPLIER LOGIC
                        const mul = parseFloat(kpInput.replace('x', ''));
                        if (isNaN(mul)) {
                            await message.reply("Invalid multiplier. Try `4x`, `5x` or a fixed number `2b`.");
                            return;
                        }
                        multiplier = mul;
                        kpVal = BigInt(0); // Placeholder, will rely on multiplier
                    } else {
                        // FIXED NUMBER LOGIC
                        kpVal = parseStatsInput(content);
                        if (!kpVal && kpVal !== BigInt(0)) {
                            await message.reply("Invalid KP format. Try `2b`, `500m` or `4x`.");
                            return;
                        }
                    }

                    session.data.kpReq = kpVal;
                    session.data.kpMultiplier = multiplier;

                    session.step = 'KVK';
                    await channel.send("✅ KP saved. Now, enter KvK History: `Wins, Losses`\nExample: `3, 1`");
                    break;

                case 'KVK':
                    const [w, l] = content.split(',').map(s => s.trim());
                    const wins = parseInt(w);
                    const losses = parseInt(l);
                    if (isNaN(wins) || isNaN(losses)) {
                        await message.reply("Invalid numbers. Try again (e.g. `3, 1`).");
                        return;
                    }
                    session.data.kvkWins = wins;
                    session.data.kvkLosses = losses;
                    session.step = 'TOTAL_KP';
                    await channel.send("✅ Stats saved.\nWhat is the **Kingdom's Total KP**?\nExample: `500b`, `1.2t` (Trillion), or type `0` if unknown.");
                    break;

                case 'TOTAL_KP':
                    const totKp = parseStatsInput(content);
                    if (!totKp && totKp !== BigInt(0)) {
                        await message.reply("Invalid format. Use `500b`, `1t` etc.");
                        return;
                    }
                    session.data.totalKp = totKp;
                    session.step = 'INVITE';
                    await channel.send("✅ Saved.\nOptionally, enter your **Discord Invite Link**.\nType `skip` to skip.");
                    break;

                case 'INVITE':
                    if (content.toLowerCase() !== 'skip') {
                        if (!content.includes('discord')) {
                            await message.reply("That doesn't look like a valid invite link. Try again or type `skip`.");
                            return;
                        }
                        session.data.discordInvite = content;
                    }
                    session.step = 'MIGRATION_START';
                    await channel.send("✅ Saved.\nEnter Migration **Start Date**.\nFormat: `DD/MM/YYYY` (e.g. 25/12/2025)");
                    break;

                case 'MIGRATION_START':
                    // Basic parser for DD/MM/YYYY or YYYY-MM-DD
                    let dStartStr = content.trim().replace(/-/g, '/'); // Normalize - to /
                    let dStartTokens = dStartStr.split('/');
                    let dStart: Date;

                    // Assume DD/MM/YYYY if 3 parts and first is day
                    if (dStartTokens.length === 3) {
                        // Check if YYYY is first
                        if (dStartTokens[0].length === 4) {
                            dStart = new Date(dStartStr); // YYYY/MM/DD
                        } else {
                            // DD/MM/YYYY -> MM/DD/YYYY for JS Date constructor or YYYY-MM-DD
                            dStart = new Date(`${dStartTokens[2]}-${dStartTokens[1]}-${dStartTokens[0]}`);
                        }
                    } else {
                        dStart = new Date(content);
                    }

                    if (isNaN(dStart.getTime())) {
                        await message.reply("Invalid date. Please use format `DD/MM/YYYY` (e.g. 31/12/2024).");
                        return;
                    }
                    session.data.migrationStart = dStart;
                    session.step = 'MIGRATION_END';
                    await channel.send("✅ Start Date saved.\nEnter Migration **End Date**.\nFormat: `DD/MM/YYYY` (e.g. 15/01/2025)");
                    break;

                case 'MIGRATION_END':
                    let dEndStr = content.trim().replace(/-/g, '/');
                    let dEndTokens = dEndStr.split('/');
                    let dEnd: Date;

                    if (dEndTokens.length === 3) {
                        if (dEndTokens[0].length === 4) {
                            dEnd = new Date(dEndStr);
                        } else {
                            dEnd = new Date(`${dEndTokens[2]}-${dEndTokens[1]}-${dEndTokens[0]}`);
                        }
                    } else {
                        dEnd = new Date(content);
                    }

                    if (isNaN(dEnd.getTime())) {
                        await message.reply("Invalid date. Please use format `DD/MM/YYYY` (e.g. 30/01/2025).");
                        return;
                    }
                    if (session.data.migrationStart && dEnd < session.data.migrationStart) {
                        await message.reply("End date cannot be before Start date.");
                        return;
                    }
                    session.data.migrationEnd = dEnd;
                    session.step = 'SLOTS';
                    await channel.send("✅ End Date saved.\nHow many **Migrant Slots** are available? (Number)\n(Required)");
                    break;

                case 'SLOTS':
                    const slots = parseInt(content);
                    if (isNaN(slots) || slots < 0) {
                        await message.reply("Please enter a valid number (e.g. `30`).");
                        return;
                    }
                    session.data.migrantSlots = slots;
                    session.step = 'IMAGE';
                    await channel.send("✅ Saved.\nOptionally, upload a **Kingdom Banner/Ad Image** (Attach it or paste URL).\nType `skip` to skip.");
                    break;

                case 'IMAGE':
                    if (message.attachments.size > 0) {
                        session.data.imageUrl = message.attachments.first()?.url;
                        session.step = 'QUESTIONS';
                        await renderQuestionsStep(channel, session);
                    } else if (content.toLowerCase() !== 'skip') {
                        if (content.startsWith('http')) {
                            session.data.imageUrl = content;
                            session.step = 'QUESTIONS';
                            await renderQuestionsStep(channel, session);
                        } else {
                            await message.reply("Please attach an image, paste a URL, or type `skip`.");
                            return;
                        }
                    } else {
                        session.step = 'QUESTIONS';
                        await renderQuestionsStep(channel, session);
                    }
                    break;

                case 'QUESTIONS':
                    await message.delete().catch(() => { });
                    break;
            }
        } catch (err) {
            console.error(err);
            await channel.send("An error occurred processing that step. Try again.");
        }
    });
}

async function renderQuestionsStep(channel: TextChannel, session: RegistrationSession) {
    const embed = new EmbedBuilder()
        .setTitle("📋 Application Questions")
        .setDescription(session.data.questions.length > 0
            ? session.data.questions.map((q, i) => `**${i + 1}.** ${q}`).join('\n')
            : "_No questions added yet._")
        .setFooter({ text: "Add questions one by one. Click Finish when done." });

    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('add_question')
                .setLabel('Add Question')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('➕')
                .setDisabled(session.data.questions.length >= 5), // Limit to 5
            new ButtonBuilder()
                .setCustomId('finish_setup')
                .setLabel('Finish & Save')
                .setStyle(ButtonStyle.Success)
                .setEmoji('💾')
        );

    let qMsg: Message;
    // ... [Same helper logic for qMsg] ...
    if (session.msgId) {
        try {
            qMsg = await channel.messages.fetch(session.msgId);
            qMsg = await qMsg.edit({ content: "Set up your application questions:", embeds: [embed], components: [row] });
        } catch {
            qMsg = await channel.send({ content: "Set up your application questions:", embeds: [embed], components: [row] });
        }
    } else {
        qMsg = await channel.send({ content: "Set up your application questions:", embeds: [embed], components: [row] });
        session.msgId = qMsg.id;
    }

    const btnCollector = qMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 600000 });

    btnCollector.on('collect', async i => {
        if (i.user.id !== session.userId) return;

        try {
            if (i.customId === 'add_question') {
                const modal = new ModalBuilder().setCustomId('addQuestionModal').setTitle("Add Question");
                const input = new TextInputBuilder().setCustomId('question_text').setLabel("Question").setStyle(TextInputStyle.Paragraph).setRequired(true);
                modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
                await i.showModal(modal);
            } else if (i.customId === 'finish_setup') {
                if (i.replied || i.deferred) return; // Prevent double ack
                await i.deferUpdate();
                btnCollector.stop();
                await finalizeRegistration(channel, session);
            }
        } catch (err) {
            console.error("Interaction Error:", err);
            // Don't try to reply again if already crashed
        }
    });
}

export async function handleAddQuestionModal(interaction: ModalSubmitInteraction) {
    const channelId = interaction.channelId;
    const session = sessions.get(channelId);
    if (!session || session.step !== 'QUESTIONS') {
        await interaction.reply({ content: "Session expired or invalid.", flags: MessageFlags.Ephemeral });
        return;
    }

    const qText = interaction.fields.getTextInputValue('question_text');
    session.data.questions.push(qText);

    await interaction.deferUpdate();
    if (interaction.channel instanceof TextChannel) {
        await renderQuestionsStep(interaction.channel, session);
    }
}

async function finalizeRegistration(channel: TextChannel, session: RegistrationSession) {
    try {
        const d = session.data;
        const payload: any = {
            kdNumber: d.kdNumber!,
            name: d.name!,
            seed: d.seed!,
            powerReq: d.powerReq!,
            kpReq: d.kpReq!,
            kpMultiplier: d.kpMultiplier || null,
            kvkWins: d.kvkWins!,
            kvkLosses: d.kvkLosses!,
            totalKp: d.totalKp || null,
            migrantSlots: d.migrantSlots || null,
            ownerId: session.userId,
            discordInvite: d.discordInvite || null,
            migrationStart: d.migrationStart || null,
            migrationEnd: d.migrationEnd || null,
            imageUrl: d.imageUrl || null,
            questions: (d.questions && d.questions.length > 0) ? d.questions.join('@@@') : null
        };

        const kd = await prisma.kingdom.create({
            data: payload
        });

        // Notify Staff
        if (config.logChannelId) {
            try {
                const logChannel = await channel.guild.channels.fetch(config.logChannelId) as TextChannel;
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setTitle("🆕 New Kingdom Registration")
                        .setDescription(`Kingdom **#${kd.kdNumber}** has been registered by <@${kd.ownerId}>.\n**Status:** Pending Verification`)
                        .addFields(
                            { name: 'Power Req', value: formatNumber(kd.powerReq), inline: true },
                            { name: 'KP Req', value: kd.kpMultiplier ? `${kd.kpMultiplier}x` : formatNumber(kd.kpReq), inline: true },
                            { name: 'Seed', value: kd.seed, inline: true }
                        )
                        .setColor(0xFFA500)
                        .setTimestamp();

                    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder().setCustomId(`approve_kd_${kd.id}`).setLabel('Verificar').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`reject_kd_${kd.id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
                    );

                    await logChannel.send({ embeds: [embed], components: [row] });
                }
            } catch (e) {
                console.error("Failed to log registration:", e);
            }
        }

        // ... (rest of finalization)
        await channel.send("🎉 **Kingdom Registered Successfully!**\n⚠️ **One last step:** Your kingdom is **Pending Verification** by Staff.\nIt will appear in search results once approved.\nDeleting channel in 10 seconds...");
        setTimeout(() => channel.delete().catch(() => { }), 10000);

    } catch (error) {
        console.error(error);
        await channel.send("❌ Error saving kingdom. Please try again or contact support.");
    }
}



export async function editKingdom(interaction: ChatInputCommandInteraction) {
    const { user, guild } = interaction;
    if (!guild) return;

    // Check Permissions (Admin/King)
    const member = await guild.members.fetch(user.id);
    const kingRoleId = config.kingRoleId;
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
    const isKing = kingRoleId ? member.roles.cache.has(kingRoleId) : false;

    if (!isAdmin && !isKing) {
        await interaction.reply({ content: "🚫 You need the **King** role or **Administrator** permissions.", flags: MessageFlags.Ephemeral });
        return;
    }

    // Find Kingdom
    // If Admin and provided 'kd', search by that. Else search by ownerId.
    const kdNumOption = interaction.options.getString('kd');
    let kingdom;

    if (kdNumOption && isAdmin) {
        kingdom = await prisma.kingdom.findFirst({ where: { kdNumber: kdNumOption } });
    } else {
        kingdom = await prisma.kingdom.findFirst({ where: { ownerId: user.id } });
    }

    if (!kingdom) {
        await interaction.reply({ content: "⚠️ No registered kingdom found linked to you.\nAdmins can use `/edit-kingdom kd:<number>` to edit others.", flags: MessageFlags.Ephemeral });
        return;
    }

    // Menu Embed
    const getEmbed = () => new EmbedBuilder()
        .setTitle(`🛠️ Edit Kingdom #${kingdom.kdNumber}`)
        .setDescription(`**Name:** ${kingdom.name}\n**Seed:** ${kingdom.seed}\n**Power Req:** ${formatNumber(kingdom.powerReq)}\n**KP Req:** ${formatNumber(kingdom.kpReq)}`)
        .addFields(
            { name: "Migration", value: `Start: ${kingdom.migrationStart ? new Date(kingdom.migrationStart).toLocaleDateString() : 'N/A'}\nEnd: ${kingdom.migrationEnd ? new Date(kingdom.migrationEnd).toLocaleDateString() : 'N/A'}\nSlots: ${kingdom.migrantSlots || 0}`, inline: true },
            { name: "Stats", value: `KvK: ${kingdom.kvkWins}W / ${kingdom.kvkLosses}L\nTotal KP: ${formatNumber(kingdom.totalKp || 0)}`, inline: true }
        )
        .setColor(0x00AAFF);

    const getRow = () => new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('edit_menu')
            .setPlaceholder('Select category to edit...')
            .addOptions(
                new StringSelectMenuOptionBuilder().setLabel('General Info (Name, Seed, Reqs)').setValue('edit_general').setEmoji('📝'),
                new StringSelectMenuOptionBuilder().setLabel('Migration (Dates, Slots)').setValue('edit_migration').setEmoji('📅'),
                new StringSelectMenuOptionBuilder().setLabel('Kingdom Stats (KvK, Total KP)').setValue('edit_stats').setEmoji('📊'),
                new StringSelectMenuOptionBuilder().setLabel('Questions').setValue('edit_questions').setEmoji('❓'),
                new StringSelectMenuOptionBuilder().setLabel('Banner Image').setValue('edit_image').setEmoji('🖼️'),
                new StringSelectMenuOptionBuilder().setLabel('Close Menu').setValue('close_menu').setEmoji('❌')
            )
    );

    await interaction.reply({ embeds: [getEmbed()], components: [getRow()] });
    const replyMsg = await interaction.fetchReply();

    const collector = replyMsg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 300000 });

    collector.on('collect', async i => {
        if (i.user.id !== user.id) {
            await i.reply({ content: "Not your menu.", flags: MessageFlags.Ephemeral });
            return;
        }

        const choice = i.values[0];

        try {
            if (choice === 'close_menu') {
                await i.update({ content: '✅ Menu closed.', components: [] });
                collector.stop();
                return;
            }

            if (choice === 'edit_general') {
                const modal = new ModalBuilder().setCustomId('edit_general_modal').setTitle('Edit General Info');

                const r1 = new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Kingdom Name').setValue(kingdom.name || '').setStyle(TextInputStyle.Short).setRequired(true));
                const r2 = new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('seed').setLabel('Seed (A, B, C, D)').setValue(kingdom.seed || '').setStyle(TextInputStyle.Short).setRequired(true));
                const r3 = new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('power').setLabel('Power Req (e.g. 30m)').setValue(formatNumber(kingdom.powerReq)).setStyle(TextInputStyle.Short).setRequired(true));
                const r4 = new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('kp').setLabel('KP Req (2b or 4x)').setValue(formatNumber(kingdom.kpReq)).setStyle(TextInputStyle.Short).setRequired(true));

                modal.addComponents(r1, r2, r3, r4);

                await i.showModal(modal);

                const submitted = await i.awaitModalSubmit({ time: 60000, filter: s => s.user.id === user.id && s.customId === 'edit_general_modal' });

                // Parse
                const name = submitted.fields.getTextInputValue('name');
                const seed = submitted.fields.getTextInputValue('seed');
                const power = parseStatsInput(submitted.fields.getTextInputValue('power'));
                // KP handling (simple parse for now, loosing multiplier context in simple modal unless we parse 'x')
                const kpRaw = submitted.fields.getTextInputValue('kp');
                let kp = BigInt(0), kpMul;
                if (kpRaw.toLowerCase().endsWith('x')) {
                    kpMul = parseFloat(kpRaw.replace('x', ''));
                } else {
                    kp = parseStatsInput(kpRaw);
                }

                await prisma.kingdom.update({ where: { id: kingdom.id }, data: { name, seed, powerReq: power, kpReq: kp, kpMultiplier: kpMul || null } });

                // Refresh local object
                kingdom = await prisma.kingdom.findUnique({ where: { id: kingdom.id } });
                await submitted.update({ embeds: [getEmbed()], components: [getRow()] });

            } else if (choice === 'edit_migration') {
                const modal = new ModalBuilder().setCustomId('edit_mig_modal').setTitle('Edit Migration');
                const startStr = kingdom.migrationStart ? new Date(kingdom.migrationStart).toLocaleDateString('en-GB') : ''; // DD/MM/YYYY
                const endStr = kingdom.migrationEnd ? new Date(kingdom.migrationEnd).toLocaleDateString('en-GB') : '';

                modal.addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('start').setLabel('Start Date (DD/MM/YYYY)').setValue(startStr).setStyle(TextInputStyle.Short).setRequired(false)),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('end').setLabel('End Date (DD/MM/YYYY)').setValue(endStr).setStyle(TextInputStyle.Short).setRequired(false)),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('slots').setLabel('Slots').setValue(kingdom.migrantSlots?.toString() || "0").setStyle(TextInputStyle.Short).setRequired(true))
                );
                await i.showModal(modal);

                const submitted = await i.awaitModalSubmit({ time: 60000, filter: s => s.user.id === user.id });

                // Helper to parse DD/MM/YYYY
                const parseD = (str: string) => {
                    if (!str) return null;
                    const parts = str.trim().split(/\/|-/);
                    if (parts.length !== 3) return null;
                    // assume dd/mm/yyyy
                    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                };

                const start = parseD(submitted.fields.getTextInputValue('start'));
                const end = parseD(submitted.fields.getTextInputValue('end'));
                const slots = parseInt(submitted.fields.getTextInputValue('slots'));

                await prisma.kingdom.update({ where: { id: kingdom.id }, data: { migrationStart: start, migrationEnd: end, migrantSlots: isNaN(slots) ? 0 : slots } });
                kingdom = await prisma.kingdom.findUnique({ where: { id: kingdom.id } });
                await submitted.update({ embeds: [getEmbed()], components: [getRow()] });

            } else if (choice === 'edit_stats') {
                const modal = new ModalBuilder().setCustomId('edit_stats_modal').setTitle('Edit Statistics');
                modal.addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('wins').setLabel('KvK Wins').setValue(kingdom.kvkWins.toString()).setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('losses').setLabel('KvK Losses').setValue(kingdom.kvkLosses.toString()).setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('tot_kp').setLabel('Total Kingdom KP').setValue(formatNumber(kingdom.totalKp || 0)).setStyle(TextInputStyle.Short).setRequired(true))
                );
                await i.showModal(modal);

                const submitted = await i.awaitModalSubmit({ time: 60000, filter: s => s.user.id === user.id });

                const w = parseInt(submitted.fields.getTextInputValue('wins'));
                const l = parseInt(submitted.fields.getTextInputValue('losses'));
                const k = parseStatsInput(submitted.fields.getTextInputValue('tot_kp'));

                await prisma.kingdom.update({ where: { id: kingdom.id }, data: { kvkWins: w, kvkLosses: l, totalKp: k } });
                kingdom = await prisma.kingdom.findUnique({ where: { id: kingdom.id } });
                await submitted.update({ embeds: [getEmbed()], components: [getRow()] });

            } else if (choice === 'edit_questions') {
                // For questions, Modal is tricky for list. 
                // Let's offer a Modal to "Paste all questions separated by @@@" or "Clear".
                // Or just a single big text area "Enter Questions (one per line)".
                const modal = new ModalBuilder().setCustomId('edit_q_modal').setTitle('Edit Application Questions');
                // Load current
                const currQ = kingdom.questions ? kingdom.questions.split('@@@').join('\n') : '';
                modal.addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('qs').setLabel('Questions (One per line)').setValue(currQ.substring(0, 4000)).setStyle(TextInputStyle.Paragraph).setRequired(false))
                );
                await i.showModal(modal);

                const submitted = await i.awaitModalSubmit({ time: 60000, filter: s => s.user.id === user.id });
                const raw = submitted.fields.getTextInputValue('qs');

                // Split by newline and save joined by @@@
                const qList = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);

                await prisma.kingdom.update({ where: { id: kingdom.id }, data: { questions: qList.join('@@@') } });
                kingdom = await prisma.kingdom.findUnique({ where: { id: kingdom.id } });
                await submitted.update({ content: "✅ Questions updated!", embeds: [getEmbed()], components: [getRow()] });

            } else if (choice === 'edit_image') {
                // Image is hard via Modal (can't upload).
                // Ask user to paste URL in modal.
                const modal = new ModalBuilder().setCustomId('edit_img_modal').setTitle('Edit Banner Image');
                modal.addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('url').setLabel('Image URL').setValue(kingdom.imageUrl || '').setStyle(TextInputStyle.Short).setRequired(false))
                );
                await i.showModal(modal);

                const submitted = await i.awaitModalSubmit({ time: 60000, filter: s => s.user.id === user.id });
                const link = submitted.fields.getTextInputValue('url');

                await prisma.kingdom.update({ where: { id: kingdom.id }, data: { imageUrl: link } });
                kingdom = await prisma.kingdom.findUnique({ where: { id: kingdom.id } });
                await submitted.update({ embeds: [getEmbed()], components: [getRow()] });
            }

        } catch (err) {
            console.error(err);
            // If waitModalSubmit times out or fails
        }
    });

}
export async function handleRegisterModal(interaction: ModalSubmitInteraction) { }
export async function handleEditKingdomModal(interaction: ModalSubmitInteraction) { }

export async function verifyKingdom(interaction: ChatInputCommandInteraction) {
    const { user, guild, options } = interaction;
    if (!guild) return;

    const member = await guild.members.fetch(user.id);
    if (!member.permissions.has(PermissionFlagsBits.Administrator) && !member.roles.cache.has(config.adminRoleId || '')) {
        await interaction.reply({ content: "🚫 Staff Only.", flags: MessageFlags.Ephemeral });
        return;
    }

    const kdNum = options.getString('kd');
    const kingdom = await prisma.kingdom.findFirst({ where: { kdNumber: kdNum } });

    if (!kingdom) {
        await interaction.reply({ content: `❌ Kingdom #${kdNum} not found.`, flags: MessageFlags.Ephemeral });
        return;
    }

    if (kingdom.verified) {
        await interaction.reply({ content: `Kingdom #${kdNum} is already verified.`, flags: MessageFlags.Ephemeral });
        return;
    }

    await prisma.kingdom.update({ where: { id: kingdom.id }, data: { verified: true } });
    await interaction.reply(`✅ **Kingdom #${kingdom.kdNumber}** has been **VERIFIED** and is now visible in search!`);

    try {
        const owner = await guild.members.fetch(kingdom.ownerId);
        if (owner) {
            await owner.send(`🎉 Your Kingdom **#${kingdom.kdNumber}** has been approved and verified by SOCH Staff! It is now searchable.`);
        }
    } catch (e) {
        // Owner DMs closed or left server
    }
}

export async function handleKingdomVerificationButtons(interaction: ButtonInteraction) {
    const { customId, guild } = interaction;
    if (!guild) return;

    // Permissions check (Staff only)
    const member = await guild.members.fetch(interaction.user.id);
    if (!member.permissions.has(PermissionFlagsBits.Administrator) && !member.roles.cache.has(config.adminRoleId || '')) {
        await interaction.reply({ content: "🚫 Staff Only.", flags: MessageFlags.Ephemeral });
        return;
    }

    const action = customId.startsWith('approve_kd_') ? 'approve' : 'reject';
    const kdIdStr = customId.replace('approve_kd_', '').replace('reject_kd_', '');
    const kdId = parseInt(kdIdStr);

    const kingdom = await prisma.kingdom.findUnique({ where: { id: kdId } });

    if (!kingdom) {
        await interaction.reply({ content: "❌ Kingdom not found (might have been deleted).", flags: MessageFlags.Ephemeral });
        return;
    }

    if (action === 'approve') {
        if (kingdom.verified) {
            await interaction.reply({ content: "Already verified.", flags: MessageFlags.Ephemeral });
            return;
        }

        await prisma.kingdom.update({ where: { id: kdId }, data: { verified: true } });
        await interaction.update({ content: `✅ **Kingdom #${kingdom.kdNumber} Verified** by ${interaction.user}.`, components: [] });

        // Notify Owner
        try {
            const owner = await guild.members.fetch(kingdom.ownerId);
            if (owner) await owner.send(`🎉 Your Kingdom **#${kingdom.kdNumber}** has been **APPROVED**!`);
        } catch (e) { }

    } else {
        // Reject - Delete it? Or just mark rejected? Usually delete if it's spam.
        // User asked to "Accept or Reject". I'll delete to keep DB clean.
        await prisma.kingdom.delete({ where: { id: kdId } });
        await interaction.update({ content: `❌ **Kingdom #${kingdom.kdNumber} Rejected** (Deleted) by ${interaction.user}.`, components: [] });

        // Notify Owner
        try {
            const owner = await guild.members.fetch(kingdom.ownerId);
            if (owner) await owner.send(`❌ Your Kingdom **#${kingdom.kdNumber}** registration was rejected by Staff.`);
        } catch (e) { }
    }
}
