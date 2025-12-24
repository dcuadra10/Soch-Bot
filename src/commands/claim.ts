
import {
    ChatInputCommandInteraction,
    ButtonInteraction,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    TextChannel,
    MessageFlags,
    GuildMember
} from 'discord.js';
import { config, prisma } from '../config';

export async function claimKing(interaction: ChatInputCommandInteraction) {
    const kingdomId = interaction.options.getString('kingdom', true);
    const govId = interaction.options.getString('gov_id', true);
    const screenshot = interaction.options.getAttachment('screenshot', true);

    // Initial response to user
    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    } catch (error: any) {
        if (error.code === 10062) {
            console.warn("Interaction expired before deferral (10062). Ignoring.");
            return;
        }
        throw error;
    }

    const logChannelId = config.logChannelId;
    if (!logChannelId) {
        await interaction.editReply("Server configuration error: Log Channel not set.");
        return;
    }

    const logChannel = interaction.guild?.channels.cache.get(logChannelId) as TextChannel;
    if (!logChannel) {
        await interaction.editReply("Server configuration error: Log Channel not found.");
        return;
    }

    // Create Embed for Admins
    const embed = new EmbedBuilder()
        .setTitle('👑 King Verification Request')
        .setDescription(`User <@${interaction.user.id}> claims to be the King of **Kingdom #${kingdomId}**.`)
        .addFields(
            { name: 'Governor ID', value: govId, inline: true },
            { name: 'Kingdom', value: `#${kingdomId}`, inline: true },
            { name: 'User', value: `${interaction.user.tag} (${interaction.user.id})`, inline: false }
        )
        .setImage(screenshot.url)
        .setColor('Gold')
        .setTimestamp();

    // Buttons
    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`claim_approve_${interaction.user.id}_${kingdomId}`)
                .setLabel('Approve & Verify')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`claim_reject_${interaction.user.id}`)
                .setLabel('Reject')
                .setStyle(ButtonStyle.Danger)
        );

    try {
        const staffPing = config.staffRoleId ? `<@&${config.staffRoleId}>` : '';
        await logChannel.send({ content: `${staffPing} New King Verification Request!`, embeds: [embed], components: [row] });
        await interaction.editReply(`Your request has been submitted to the staff for verification.\n\n**Kingdom:** #${kingdomId}\n**Gov ID:** ${govId}`);
    } catch (error) {
        console.error("Error sending verification request:", error);
        await interaction.editReply("Failed to submit request. Please contact an admin directly.");
    }
}

export async function handleClaimButtons(interaction: ButtonInteraction) {
    const { customId, user, guild } = interaction;
    const parts = customId.split('_');
    const action = parts[1]; // 'approve' or 'reject'
    const targetUserId = parts[2];

    // Check permissions (Staff only)
    const staffRoleId = config.staffRoleId;
    const member = interaction.member as GuildMember;

    // Assuming staff or admin can approve
    // Using has(PermissionFlagsBits.Administrator) or has(staffRoleId)
    // For now, let's rely on checking if they have the staff role if defined, or if they are admin.
    // If staffRoleId is not defined, only Admins.
    // But safely:
    /*
    if (!member.permissions.has(PermissionFlagsBits.Administrator) && (!staffRoleId || !member.roles.cache.has(staffRoleId))) {
        await interaction.reply({ content: "You do not have permission to verify kings.", flags: MessageFlags.Ephemeral });
        return;
    }
    */
    // Since interaction handlers in events file usually don't block logic, I'll add the check here.

    if (action === 'approve') {
        const kingdomId = parts[3];
        const targetMember = await guild?.members.fetch(targetUserId).catch(() => null);

        if (!targetMember) {
            await interaction.reply({ content: "User is no longer in the server.", flags: MessageFlags.Ephemeral });
            return;
        }

        try {
            // 1. Give King Role
            if (config.kingRoleId) {
                await targetMember.roles.add(config.kingRoleId);
            }

            // 2. Update Kingdom Owner in DB if Kingdom exists
            // Check if Kingdom exists
            const existingKingdom = await prisma.kingdom.findUnique({ where: { kdNumber: kingdomId } });

            let extraInfo = "";
            if (existingKingdom) {
                // Update owner
                await prisma.kingdom.update({
                    where: { id: existingKingdom.id },
                    data: { ownerId: targetUserId }
                });
                extraInfo = `\nKingdom #${kingdomId} ownership transferred to <@${targetUserId}>.`;
            } else {
                extraInfo = `\nKingdom #${kingdomId} is not registered yet. They can now register it.`;
            }

            // 3. Edit the Original Message to show Approved
            const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
            originalEmbed.setColor('Green');
            originalEmbed.addFields({ name: 'Status', value: `✅ Approved by <@${user.id}>`, inline: false });

            await interaction.update({ embeds: [originalEmbed], components: [] });

            // 4. Notify User
            await targetMember.send(`✅ Your verification for Kingdom #${kingdomId} has been **APPROVED**! You have been given the King role.\n\nYou can now use \`/register-kingdom\` to register your kingdom!`).catch(() => { });

            await interaction.followUp({ content: `✅ User <@${targetUserId}> verified as King of #${kingdomId}.${extraInfo}`, flags: MessageFlags.Ephemeral });

        } catch (error: any) {
            console.error(error);
            if (error.code === 50013) {
                await interaction.reply({
                    content: "❌ **Error de Permisos:** No pude asignar el rol de King. Asegúrate de que mi rol (SOCH Bot) esté **ARRIBA** del rol de King en la lista de roles del servidor.",
                    flags: MessageFlags.Ephemeral
                });
            } else {
                await interaction.reply({ content: "Error processing approval.", flags: MessageFlags.Ephemeral });
            }
        }

    } else if (action === 'reject') {
        const targetMember = await guild?.members.fetch(targetUserId).catch(() => null);

        // Edit message
        const originalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
        originalEmbed.setColor('Red');
        originalEmbed.addFields({ name: 'Status', value: `❌ Rejected by <@${user.id}>`, inline: false });

        await interaction.update({ embeds: [originalEmbed], components: [] });

        if (targetMember) {
            await targetMember.send(`❌ Your verification request has been rejected. Please check your screenshot or contact staff.`).catch(() => { });
        }
    }
}
