import { client, config } from './config';
import { Events } from 'discord.js';
import { interactionCreate } from './events/interactionCreate';
import { startCronJobs } from './cron';
import express from 'express';
import axios from 'axios';

client.once(Events.ClientReady, c => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
    // Start Cron Jobs (e.g. Activity Check)
    startCronJobs();
});

client.on(Events.InteractionCreate, async interaction => {
    try {
        await interactionCreate(interaction);
    } catch (error) {
        console.error('Interaction Error:', error);
    }
});

// Prevent crash on unhandled errors
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
});

client.login(config.token);

// --- Uptime & Health Check ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('SOCH Bot is running!');
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

app.listen(PORT, () => {
    console.log(`Web server running on port ${PORT}`);
});

// Optional: Ping Healthchecks.io if URL provided
const HEALTHCHECK_URL = process.env.HEALTHCHECK_URL;
if (HEALTHCHECK_URL) {
    // Ping immediately on start
    axios.get(HEALTHCHECK_URL)
        .then(() => console.log('💓 Healthcheck Ping Sent (Start)'))
        .catch(err => console.error('Healthcheck ping failed:', err.message));

    // Then every 1 minute
    setInterval(() => {
        axios.get(HEALTHCHECK_URL)
            .then(() => console.log('💓 Healthcheck Ping Sent'))
            .catch(err => console.error('Healthcheck ping failed:', err.message));
    }, 60000);
    console.log("Healthcheck.io Pinger started (1 min interval).");
}
