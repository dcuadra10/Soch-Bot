import { Interaction } from 'discord.js';
import { registerKingdom, handleRegisterModal, deleteKingdom, setKingdomScore, editKingdom, handleEditKingdomModal, handleAddQuestionModal, setKingdomSlots } from '../commands/register';
import { findKingdom, handleScanApply, handleCloseTicket, handleConfirmClose } from '../commands/search';
import { listKingdoms } from '../commands/list';
import { claimKing, handleClaimButtons } from '../commands/claim';
import { helpCommand } from '../commands/help';

export async function interactionCreate(interaction: Interaction) {
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
        }
    }
}
