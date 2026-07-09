import { UserStreak } from "../models/index.js";
import { format, differenceInDays, startOfDay } from "date-fns";

/**
 * Get or create user streak row
 */
export async function getOrCreateStreak(userId) {
  let streak = await UserStreak.findOne({ where: { userId } });
  if (!streak) {
    streak = await UserStreak.create({
      userId,
      currentStreak: 0,
      longestStreak: 0,
      totalCollections: 0,
      lastCollectionDate: null,
      streakStartDate: null,
    });
  }
  return streak;
}

/**
 * Record a collection for the user (update streak).
 * Returns { currentStreak, longestStreak, streakMaintained, milestoneReached }
 */
export async function recordCollectionForUser(userId, collectionDate) {
  const collectionDateOnly = format(startOfDay(new Date(collectionDate)), "yyyy-MM-dd");
  const streak = await getOrCreateStreak(userId);

  const prevLast = streak.lastCollectionDate
    ? format(new Date(streak.lastCollectionDate), "yyyy-MM-dd")
    : null;

  if (prevLast === collectionDateOnly) {
    return {
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      streakMaintained: true,
      milestoneReached: false,
    };
  }

  const prevLastDate = prevLast ? new Date(prevLast) : null;
  const daysDiff = prevLastDate
    ? differenceInDays(new Date(collectionDateOnly), prevLastDate)
    : null;

  let newCurrentStreak;
  let newStreakStartDate;

  if (!prevLastDate || daysDiff === 1) {
    newCurrentStreak = prevLastDate ? streak.currentStreak + 1 : 1;
    newStreakStartDate = prevLastDate ? streak.streakStartDate : collectionDateOnly;
  } else {
    newCurrentStreak = 1;
    newStreakStartDate = collectionDateOnly;
  }

  const newLongestStreak = Math.max(streak.longestStreak, newCurrentStreak);

  await streak.update({
    currentStreak: newCurrentStreak,
    longestStreak: newLongestStreak,
    totalCollections: streak.totalCollections + 1,
    lastCollectionDate: collectionDateOnly,
    streakStartDate: newStreakStartDate,
  });

  const milestoneReached = [5, 10, 25, 50, 100].includes(newCurrentStreak);

  return {
    currentStreak: newCurrentStreak,
    longestStreak: newLongestStreak,
    streakMaintained: true,
    milestoneReached,
  };
}
