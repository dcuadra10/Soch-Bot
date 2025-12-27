import { Interaction, MessageFlags } from 'discord.js';
import { registerKingdom, handleRegisterModal, deleteKingdom, setKingdomScore, editKingdom, handleEditKingdomModal, handleAddQuestionModal, setKingdomSlots, verifyKingdom, handleKingdomVerificationButtons } from '../commands/register';
import { createAccount, editAccount, viewAccount, listAccounts, deleteProfile } from '../commands/profile';
import { findKingdom, handleScanApply, handleCloseTicket, handleConfirmClose, handleSearchPagination } from '../commands/search';
import { listKingdoms, handleListPagination } from '../commands/list';
import { claimKing, handleClaimButtons } from '../commands/claim';
import { helpCommand } from '../commands/help';
import { guideCommand } from '../commands/guide';
import { bumpCommand, remakeCommand } from '../commands/forum';
import { unbanPostCommand, checkPostCommand } from '../commands/forum-admin';

export async function interactionCreate(interaction: Interaction) {
    try {
        if (interaction.isChatInputCommand()) {
            const { commandName } = interaction;

            if (commandName === 'register-kingdom') {
                await registerKingdom(interaction);
            } else if (commandName === 'delete-kingdom') {
                await deleteKingdom(interaction);
            } else if (commandName === 'set-kingdom-score') {
                await setKingdomScore(interaction);
            } else if (commandName === 'set-kingdom-slots') {
                await setKingdomSlots(interaction);
            } else if (commandName === 'verify-kingdom') {
                await verifyKingdom(interaction);
            } else if (commandName === 'create-account') {
                await createAccount(interaction);
            } else if (commandName === 'edit-account') {
                await editAccount(interaction);
            } else if (commandName === 'view-profile') {
                await viewAccount(interaction);
            } else if (commandName === 'list-profiles') {
                await listAccounts(interaction);
            } else if (commandName === 'delete-profile') {
                await deleteProfile(interaction);
            } else if (commandName === 'find-kingdom') {
                await findKingdom(interaction);
            } else if (commandName === 'list-kingdoms') {
                await listKingdoms(interaction);
            } else if (commandName === 'edit-kingdom') {
                await editKingdom(interaction);
            } else if (commandName === 'claim-king') {
                await claimKing(interaction);
            } else if (commandName === 'help') {
                await helpCommand(interaction);
            } else if (commandName === 'guide') {
                await guideCommand(interaction);
            } else if (commandName === 'bump') {
                await bumpCommand(interaction);
            } else if (commandName === 'remake') {
                await remakeCommand(interaction);
            } else if (commandName === 'unban-post') {
                await unbanPostCommand(interaction);
            } else if (commandName === 'check-post') {
                await checkPostCommand(interaction);
            }
        } else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'registerKingdomModal') {
                await handleRegisterModal(interaction);
            } else if (interaction.customId === 'editKingdomModal') {
                await handleEditKingdomModal(interaction);
            } else if (interaction.customId === 'addQuestionModal') {
                await handleAddQuestionModal(interaction);
            } else if (interaction.customId.startsWith('application_modal_')) {
                await import('../commands/search').then(m => m.handleApplicationSubmit(interaction));
            }
        } else if (interaction.isButton()) {
            if (interaction.customId.startsWith('apply_')) {
                await handleScanApply(interaction);
            } else if (interaction.customId === 'close_ticket') {
                await handleCloseTicket(interaction);
            } else if (interaction.customId.startsWith('approve_kd_') || interaction.customId.startsWith('reject_kd_')) {
                await handleKingdomVerificationButtons(interaction as any);
            } else if (interaction.customId === 'accept_applicant') {
                await import('../commands/search').then(m => m.handleAcceptApplicant(interaction));
            } else if (interaction.customId === 'confirm_close') {
                await handleConfirmClose(interaction);
            } else if (interaction.customId === 'cancel_close') {
                // Deleting the message directly might require Message, trying update instead
                await interaction.update({ content: 'Ticket closure cancelled.', components: [] });
                setTimeout(() => interaction.deleteReply().catch(() => { }), 3000);
            } else if (interaction.customId.startsWith('claim_')) {
                await handleClaimButtons(interaction);
            } else if (interaction.customId.startsWith('list_page_')) {
                await handleListPagination(interaction);
            } else if (interaction.customId.startsWith('search_page_')) {
                await handleSearchPagination(interaction);
            }
        }
    } catch (error) {
        console.error("Interaction Error:", error);
        // Attempt to notify user if possible
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({ content: "An unexpected error occurred.", flags: MessageFlags.Ephemeral });
            } catch (e) {
                // Ignore if we can't reply
            }
        }
    }
}
