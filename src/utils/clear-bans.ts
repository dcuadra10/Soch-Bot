
import { prisma } from '../config';

async function clearBans() {
    try {
        await prisma.recruitmentThread.updateMany({
            data: {
                bumpStrikeCount: 0,
                bumpBanExpires: null
            }
        });
        console.log("✅ All recruitment bans have been cleared.");
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

clearBans();
