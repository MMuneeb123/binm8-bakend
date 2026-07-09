import cron from 'node-cron';
import { Op } from 'sequelize';
import { checkUpcomingCollections, setTestMode } from '../services/notification_service.js';
import { UserBin, User } from '../models/index.js';
import { startOfDay, isAfter, isSameDay } from 'date-fns';
import { updateMultipleBinsCollectionDates } from '../services/collection_date_service.js';

// Check if test mode is enabled via environment variable
const TEST_MODE_ENABLED = process.env.NOTIFICATION_TEST_MODE === 'true';
let reminderTickInProgress = false;

async function runReminderTickWithGuard(logPrefix = '') {
  if (reminderTickInProgress) {
    console.log(`${logPrefix}Reminder tick skipped (previous run still in progress)`);
    return;
  }

  reminderTickInProgress = true;
  try {
    await checkUpcomingCollections();
  } finally {
    reminderTickInProgress = false;
  }
}

if (TEST_MODE_ENABLED) {
  // Enable test mode in notification service
  setTestMode(true);
  console.log('🧪 Notification test mode ENABLED');
  console.log('🧪 Notifications will be checked every minute for testing');
  
  // In test mode, run every minute for testing
  cron.schedule('* * * * *', async () => {
    console.log('🧪 [TEST MODE] Checking for upcoming bin collections (every minute)...');
    await runReminderTickWithGuard('🧪 ');
  });
  
  // Run immediately on startup
  console.log('🧪 Running initial notification check...');
  runReminderTickWithGuard('🧪 startup ').catch(err => {
    console.error('🧪 Error in initial notification check:', err);
  });
} else {
  // PRODUCTION: every minute — user-defined local times converted to UTC per bin/user
  console.log('📅 Production notification schedule initialized');
  console.log('📅 Collection reminders checked every minute (user timezone + offsets)');

  cron.schedule('* * * * *', async () => {
    await runReminderTickWithGuard();
  });
}

// Daily maintenance job: Update all bins with passed collection dates
// Runs at midnight to ensure database stays consistent
// This is separate from notification cron and updates ALL bins (not just notification-enabled)
async function updateAllPassedCollectionDates() {
  try {
    console.log('🔄 [MAINTENANCE] Starting daily collection date update...');
    const today = startOfDay(new Date());
    
    // Find all bins where nextCollectionDate has passed (strictly before today)
    // Using Op.lt (not Op.lte) so bins with collection "today" stay until after same-day reminders
    const binsToUpdate = await UserBin.findAll({
      where: {
        nextCollectionDate: {
          [Op.lt]: today,
        },
      },
      include: [
        {
          model: User,
          attributes: ["id", "country"],
        },
      ],
    });

    if (binsToUpdate.length === 0) {
      console.log('🔄 [MAINTENANCE] No bins with passed collection dates found');
      return;
    }

    console.log(`🔄 [MAINTENANCE] Found ${binsToUpdate.length} bin(s) with passed collection dates`);

    // Group bins by user for efficient processing
    const binsByUser = new Map();
    for (const bin of binsToUpdate) {
      const userId = bin.userId;
      if (!binsByUser.has(userId)) {
        binsByUser.set(userId, {
          user: bin.User,
          bins: [],
        });
      }
      binsByUser.get(userId).bins.push(bin);
    }

    // Update bins for each user
    let totalUpdated = 0;
    let totalFailed = 0;

    for (const [userId, { user, bins }] of binsByUser) {
      try {
        const result = await updateMultipleBinsCollectionDates(bins, user);
        totalUpdated += result.updated;
        totalFailed += result.failed;
      } catch (error) {
        console.error(`🔄 [MAINTENANCE] Error updating bins for user ${userId}:`, error);
        totalFailed += bins.length;
      }
    }

    console.log(`🔄 [MAINTENANCE] Completed: ${totalUpdated} bin(s) updated, ${totalFailed} failed`);
    console.log('✨ [MAINTENANCE] Daily collection date update completed');
  } catch (error) {
    console.error('❌ [MAINTENANCE] Error in daily collection date update:', error);
    console.error(error.stack);
  }
}

// Schedule daily maintenance at midnight (00:00)
cron.schedule('0 0 * * *', async () => {
  console.log('🔄 [MIDNIGHT] Running daily maintenance: updating all passed collection dates...');
  await updateAllPassedCollectionDates();
}, {
  timezone: "Europe/London"
});

console.log('🔄 Daily maintenance cron initialized');
console.log('🔄 Collection dates will be updated daily at midnight (00:00)');