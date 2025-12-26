import { ChatInputCommandInteraction, MessageFlags, EmbedBuilder, Attachment, TextChannel } from 'discord.js';
import { prisma, config, client } from '../config';
import { parseStatsInput, formatNumber } from '../utils/format';

async function persistImage(attachment: Attachment): Promise<string> {
    if (!config.logChannelId) return attachment.url; // Fallback if no log channel

    try {
        const channel = await client.channels.fetch(config.logChannelId) as TextChannel;
        if (!channel || !channel.isTextBased()) return attachment.url;

        const sent = await channel.send({
            content: `Image upload for profile persistence (Size: ${attachment.size})`,
            files: [attachment.url]
        });

        if (sent.attachments.size > 0) {
            return sent.attachments.first()!.url;
        }
    } catch (e) {
        console.error("Failed to persist image:", e);
    }
    return attachment.url;
}

export async function createAccount(interaction: ChatInputCommandInteraction) {
    const name = interaction.options.getString('name', true);
    const id = interaction.options.getString('id', true);
    const powerInput = interaction.options.getString('power', true);
    const kpInput = interaction.options.getString('kp', true);
    const deadInput = interaction.options.getString('dead', true);
    const kingdom = interaction.options.getString('kingdom', true);
    const farms = interaction.options.getInteger('farms', true);
    const ch25 = interaction.options.getInteger('ch25', true);
    const image = interaction.options.getAttachment('image', true);

    const power = parseStatsInput(powerInput) || BigInt(0);
    const kp = parseStatsInput(kpInput) || BigInt(0);
    const dead = parseStatsInput(deadInput) || BigInt(0);

    try {
        // Check if profile exists
        const existing = await prisma.userProfile.findUnique({ where: { discordId: interaction.user.id } });
        if (existing) {
            await interaction.reply({
                content: "⚠️ **You already have a profile!**\nUse `/edit-account` to update your details, or ask an Admin if you need a hard reset.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        await prisma.userProfile.create({
            data: {
                discordId: interaction.user.id,
                ingameName: name,
                ingameId: id,
                power: power,
                kp: kp,
                dead: dead,
                kingdomNumber: kingdom,
                farms: farms,
                ch25Farms: ch25,
                imageUrl: await persistImage(image)
            }
        });

        const embed = new EmbedBuilder()
            .setTitle("✅ Profile Created")
            .setColor(0x00FF00)
            .addFields(
                { name: "Name", value: name, inline: true },
                { name: "ID", value: id, inline: true },
                { name: "Kingdom", value: kingdom, inline: true },
                { name: "Power", value: powerInput, inline: true },
                { name: "KP", value: kpInput, inline: true },
                { name: "Dead", value: deadInput, inline: true },
                { name: "Farms", value: farms.toString(), inline: true },
                { name: "CH25 Farms", value: ch25.toString(), inline: true }
            )
            .setImage(image.url);

        await interaction.reply({ content: "Profile created successfully!", embeds: [embed], flags: MessageFlags.Ephemeral });

    } catch (error) {
        console.error(error);
        await interaction.reply({ content: "Failed to create profile.", flags: MessageFlags.Ephemeral });
    }
}

export async function editAccount(interaction: ChatInputCommandInteraction) {
    const name = interaction.options.getString('name');
    const id = interaction.options.getString('id');
    const powerInput = interaction.options.getString('power');
    const kpInput = interaction.options.getString('kp');
    const deadInput = interaction.options.getString('dead');
    const kingdom = interaction.options.getString('kingdom');
    const farms = interaction.options.getInteger('farms');
    const ch25 = interaction.options.getInteger('ch25');
    const image = interaction.options.getAttachment('image');

    try {
        const profile = await prisma.userProfile.findUnique({ where: { discordId: interaction.user.id } });
        if (!profile) {
            await interaction.reply({ content: "Profile not found. Please create one with `/create-account` first.", flags: MessageFlags.Ephemeral });
            return;
        }

        const data: any = {};
        if (name) data.ingameName = name;
        if (id) data.ingameId = id;
        if (powerInput) data.power = parseStatsInput(powerInput) || BigInt(0);
        if (kpInput) data.kp = parseStatsInput(kpInput) || BigInt(0);
        if (deadInput) data.dead = parseStatsInput(deadInput) || BigInt(0);
        if (kingdom) data.kingdomNumber = kingdom;
        if (farms !== null) data.farms = farms;
        if (ch25 !== null) data.ch25Farms = ch25;
        if (image) data.imageUrl = await persistImage(image);

        const updated = await prisma.userProfile.update({
            where: { discordId: interaction.user.id },
            data: data
        });

        await interaction.reply({ content: "✅ Profile Updated Successfully!", flags: MessageFlags.Ephemeral });

    } catch (error) {
        console.error(error);
        console.error(error);
        await interaction.reply({ content: "Failed to update profile.", flags: MessageFlags.Ephemeral });
    }
}

export async function viewAccount(interaction: ChatInputCommandInteraction) {
    try {
        await interaction.deferReply();

        const targetUser = interaction.options.getUser('user') || interaction.user;
        const userProfile = await prisma.userProfile.findUnique({ where: { discordId: targetUser.id } });

        if (!userProfile) {
            await interaction.editReply({ content: `${targetUser.username} has not set up a profile yet.` });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle(`👤 Governor Profile: ${userProfile.ingameName}`)
            .setColor(0xFFA500)
            .addFields(
                { name: "In-Game ID", value: userProfile.ingameId, inline: true },
                { name: "Kingdom", value: userProfile.kingdomNumber, inline: true },
                { name: "Power", value: formatNumber(userProfile.power), inline: true },
                { name: "Kill Points", value: formatNumber(userProfile.kp), inline: true },
                { name: "Dead Troops", value: formatNumber(userProfile.dead), inline: true },
                { name: "Farms", value: userProfile.farms.toString(), inline: true },
                { name: "CH25 Farms", value: userProfile.ch25Farms.toString(), inline: true }
            )
            .setImage(userProfile.imageUrl)
            .setFooter({ text: "Requested by " + interaction.user.tag });

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error(error);
        await interaction.editReply({ content: "Error fetching profile." });
    }
}

export async function listAccounts(interaction: ChatInputCommandInteraction) {
    // Permission check handled by deploy-command (defaultPerms: 0)
    // But double check IS safe.
    // if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) ...

    try {
        const profiles = await prisma.userProfile.findMany({ orderBy: { kingdomNumber: 'asc' } });

        if (profiles.length === 0) {
            await interaction.reply({ content: "No profiles registered yet.", flags: MessageFlags.Ephemeral });
            return;
        }

        // Generate CSV content
        const header = "DiscordID,Name,IngameID,Kingdom,Power,KP,Dead,Farms,CH25,ImageURL\n";
        const rows = profiles.map(p => {
            return `${p.discordId},"${p.ingameName}",${p.ingameId},${p.kingdomNumber},${p.power},${p.kp},${p.dead},${p.farms},${p.ch25Farms},${p.imageUrl}`;
        }).join("\n");

        const csvContent = header + rows;
        const buffer = Buffer.from(csvContent, 'utf-8');

        await interaction.reply({
            content: `✅ Found **${profiles.length}** profiles. See attachment.`,
            files: [{ attachment: buffer, name: 'soch_profiles.csv' }],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        console.error(error);
        await interaction.reply({ content: "Failed to list profiles.", flags: MessageFlags.Ephemeral });
    }
}

export async function deleteProfile(interaction: ChatInputCommandInteraction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const isAdmin = interaction.memberPermissions?.has("Administrator");

    // Check permissions if deleting someone else
    if (targetUser.id !== interaction.user.id && !isAdmin) {
        await interaction.reply({ content: "🚫 You can only delete your own profile. Admins can delete any profile.", flags: MessageFlags.Ephemeral });
        return;
    }

    try {
        const profile = await prisma.userProfile.findUnique({ where: { discordId: targetUser.id } });

        if (!profile) {
            await interaction.reply({ content: "Profile not found.", flags: MessageFlags.Ephemeral });
            return;
        }

        await prisma.userProfile.delete({ where: { discordId: targetUser.id } });

        await interaction.reply({
            content: `✅ Profile for **${targetUser.username}** (Ingame: ${profile.ingameName}) has been deleted.`,
            flags: MessageFlags.Ephemeral // Ephemeral to reduce spam or Public? Usually deletions are confirmed privately.
        });

    } catch (error) {
        console.error(error);
        await interaction.reply({ content: "Failed to delete profile.", flags: MessageFlags.Ephemeral });
    }
}
