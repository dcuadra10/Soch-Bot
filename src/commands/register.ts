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
    MessageFlags,
    ChannelType,
    TextChannel,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    Message,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} from 'discord.js';
import { prisma, config } from '../config';
import { parseStatsInput } from '../utils/format';

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

                    if (content.toLowerCase().endsWith('x')) {
                        // MULTIPLIER LOGIC
                        const mul = parseFloat(content.toLowerCase().replace('x', ''));
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
                    await channel.send("✅ Saved.\nEnter Migration **Start Date** (YYYY-MM-DD).\n(Required)");
                    break;

                case 'MIGRATION_START':
                    const dStart = new Date(content);
                    if (isNaN(dStart.getTime())) {
                        await message.reply("Invalid date format. Use YYYY-MM-DD.");
                        return;
                    }
                    session.data.migrationStart = dStart;
                    session.step = 'MIGRATION_END';
                    await channel.send("✅ Start Date saved.\nNow enter Migration **End Date** (YYYY-MM-DD).\n(Required)");
                    break;

                case 'MIGRATION_END':
                    const dEnd = new Date(content);
                    if (isNaN(dEnd.getTime())) {
                        await message.reply("Invalid date format. Use YYYY-MM-DD.");
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
            new ButtonBuilder().setCustomId('add_question').setLabel('Add Question').setStyle(ButtonStyle.Primary).setEmoji('➕'),
            new ButtonBuilder().setCustomId('finish_setup').setLabel('Finish & Save').setStyle(ButtonStyle.Success).setEmoji('💾')
        );

    let qMsg: Message;
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
        if (i.user.id !== session.userId) return; // Basic security check

        if (i.customId === 'add_question') {
            const modal = new ModalBuilder().setCustomId('addQuestionModal').setTitle("Add Question");
            const input = new TextInputBuilder().setCustomId('question_text').setLabel("Question").setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
            await i.showModal(modal);
        } else if (i.customId === 'finish_setup') {
            await i.deferUpdate();
            btnCollector.stop();
            await finalizeRegistration(channel, session);
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
            questions: (d.questions && d.questions.length > 0) ? d.questions.join('\n') : null
        };

        await prisma.kingdom.create({
            data: payload
        });

        // ... (rest of finalization)
        await channel.send("🎉 **Kingdom Registered Successfully!**\nDeleting channel in 10 seconds...");
        setTimeout(() => channel.delete().catch(() => { }), 10000);

    } catch (error) {
        console.error(error);
        await channel.send("❌ Error saving kingdom. Please try again or contact support.");
    }
}



export async function editKingdom(interaction: ChatInputCommandInteraction) {
    await interaction.reply({ content: "Edit command is under maintenance to match new wizard.", flags: MessageFlags.Ephemeral });
}
export async function handleRegisterModal(interaction: ModalSubmitInteraction) { }
export async function handleEditKingdomModal(interaction: ModalSubmitInteraction) { }
