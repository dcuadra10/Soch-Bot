import 'dotenv/config';
import { prisma } from './src/config';

async function run() {
    const kd = await prisma.kingdom.findFirst({ where: { kdNumber: '1960' } });
    if (!kd) return;

    await prisma.kingdom.update({
        where: { id: kd.id },
        data: {
            verified: true,
            kpMultiplier: 4.0, // Fixing the missing multiplier
            kpReq: 0 // Resetting fixed KP req
        }
    });
    console.log("✅ Verified Kingdom 1960 and fixed KP Multiplier to 4x.");
}

run().catch(console.error);
