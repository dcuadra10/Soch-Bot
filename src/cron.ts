import cron from 'node-cron';
import { prisma, config } from './config';
import { TextChannel } from 'discord.js';
import { client } from './config'; // We need the client to fetch users/channels

export function startCronJobs() {
    // Run every day at midnight (00:00)
    cron.schedule('0 0 * * *', async () => {
        console.log('Running daily migration check...');

        try {
            const today = new Date();
            // Reset time to 00:00:00 for accurate comparison if needed, or just compare dates
            today.setHours(0, 0, 0, 0);

            // Find tickets that are ACCEPTED, NOT NOTIFIED, and whose Kingdom Migration matches "today" (or is open)
            // Actually, we want to catch the exact opening day. 
            // Or if it's open and they haven't been notified yet.

            // Fetch tickets joined with Kingdom
            const tickets = await prisma.ticket.findMany({
                where: {
                    status: 'ACCEPTED',
                    notified: false,
                    closed: false,
                    kingdom: {
                        migrationOpen: {
                            lte: new Date() // Open date is in the past or today
                        },
                        // Optional: Check if closes is in the future?
                        // If migrationClose is null or > today
                    }
                },
                include: {
                    kingdom: true
                }
            });

            for (const ticket of tickets) {
                // Double check if migration is actually open today? 
                // The query `lte: new Date()` covers it.
                // We should also ensure it hasn't closed yet.
                if (ticket.kingdom.migrationClose && ticket.kingdom.migrationClose < new Date()) {
                    continue; // Closed
                }

                try {
                    const user = await client.users.fetch(ticket.userId);
                    const guild = client.guilds.cache.get(config.guildId!);

                    let notified = false;

                    // Try DM
                    try {
                        await user.send(
                            `🚀 **Migration Alert!** 🚀\n\n` +
                            `Great news! Migration for **Kingdom #${ticket.kingdom.kdNumber}** is now **OPEN**.\n` +
                            `You have been accepted. Please proceed with migration.`
                        );
                        notified = true;
                    } catch (e) {
                        console.log(`Could not DM user ${ticket.userId}. Trying fallback channel.`);
                    }

                    // Fallback to Ticket Channel if DM failed
                    if (!notified) {
                        try {
                            const channel = await guild?.channels.fetch(ticket.channelId) as TextChannel;
                            if (channel) {
                                await channel.send(
                                    `<@${ticket.userId}> 🚀 **Migration is OPEN!** 🚀\nPlease check your game and migrate now.`
                                );
                                notified = true;
                            }
                        } catch (e) {
                            console.log(`Could not post in ticket channel ${ticket.channelId}.`);
                        }
                    }

                    // Mark as notified if successful
                    if (notified) {
                        await prisma.ticket.update({
                            where: { id: ticket.id },
                            data: { notified: true }
                        });
                    }

                } catch (error) {
                    console.error(`Error processing ticket ${ticket.id}:`, error);
                }
            }
        } catch (error) {
            console.error("Error in migration cron job:", error);
        }
    });
}
