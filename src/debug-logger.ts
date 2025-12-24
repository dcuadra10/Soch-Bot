import { config } from './config';
import { client } from './config';
import { logAction } from './utils/logger';
import { Events } from 'discord.js';

console.log("--- DEBUG LOGGER START ---");
console.log("LOG_CHANNEL_ID from config:", config.logChannelId);

if (!config.logChannelId) {
    console.error("ERROR: LOG_CHANNEL_ID is missing or empty.");
    process.exit(1);
}

client.once(Events.ClientReady, async () => {
    console.log("Client ready. Attempting to log...");
    try {
        await logAction("Test Log", "This is a debug log to verify the system.", 0x00FF00);
        console.log("Log action called. Check the channel.");
    } catch (e) {
        console.error("Error calling logAction:", e);
    }

    // Give it a moment to send
    setTimeout(() => {
        console.log("Exiting debug script.");
        process.exit(0);
    }, 5000);
});

client.login(config.token);
