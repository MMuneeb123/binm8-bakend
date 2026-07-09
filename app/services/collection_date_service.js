import { startOfDay, isAfter, isSameDay, differenceInDays, addDays, format } from "date-fns";
import { findNextNonHolidayDate } from "../utils/holidayUtils.js";

/**
 * Calculate and update collection dates for a bin if nextCollectionDate has passed
 * Handles multiple missed collection cycles and holidays
 * 
 * @param {UserBin} bin - The bin to update (Sequelize model instance)
 * @param {User} user - The user who owns the bin (for country/holiday lookup)
 * @param {number} maxCycles - Maximum number of cycles to calculate (default: 10, prevents infinite loops)
 * @returns {Promise<{updated: boolean, lastCollectionDate: Date, nextCollectionDate: Date, cyclesCalculated: number}>}
 */
export async function calculateAndUpdateCollectionDates(bin, user, maxCycles = 10) {
  try {
    const today = startOfDay(new Date());
    const nextCollectionDate = startOfDay(new Date(bin.nextCollectionDate));
    
    // If nextCollectionDate is in the future, no update needed
    if (isAfter(nextCollectionDate, today)) {
      return {
        updated: false,
        lastCollectionDate: new Date(bin.lastCollectionDate),
        nextCollectionDate: new Date(bin.nextCollectionDate),
        cyclesCalculated: 0,
      };
    }
    
    // Calculate how many collection cycles have passed
    const daysPassed = differenceInDays(today, nextCollectionDate);
    const cyclesPassed = Math.min(
      Math.floor(daysPassed / bin.collectionInterval) + 1,
      maxCycles
    );
    
    if (cyclesPassed <= 0) {
      return {
        updated: false,
        lastCollectionDate: new Date(bin.lastCollectionDate),
        nextCollectionDate: new Date(bin.nextCollectionDate),
        cyclesCalculated: 0,
      };
    }
    
    // Start from the last known nextCollectionDate
    let currentDate = new Date(bin.nextCollectionDate);
    let lastCollectionDate = new Date(bin.nextCollectionDate);
    
    // Calculate through all missed cycles
    for (let cycle = 0; cycle < cyclesPassed; cycle++) {
      // Calculate next date for this cycle
      const initialNextDate = addDays(currentDate, bin.collectionInterval);
      
      // Find next non-holiday date (skip holidays)
      const nextNonHolidayDate = await findNextNonHolidayDate(
        initialNextDate,
        user.country
      );
      
      // Update lastCollectionDate to the previous nextCollectionDate
      lastCollectionDate = new Date(currentDate);
      
      // Move to next cycle
      currentDate = nextNonHolidayDate;
    }
    
    // Update the bin in database
    await bin.update({
      lastCollectionDate: lastCollectionDate,
      nextCollectionDate: currentDate,
    });
    
    return {
      updated: true,
      lastCollectionDate: lastCollectionDate,
      nextCollectionDate: currentDate,
      cyclesCalculated: cyclesPassed,
    };
  } catch (error) {
    console.error(`Error calculating collection dates for bin ${bin.id}:`, error);
    // Return current dates if calculation fails
    return {
      updated: false,
      lastCollectionDate: new Date(bin.lastCollectionDate),
      nextCollectionDate: new Date(bin.nextCollectionDate),
      cyclesCalculated: 0,
      error: error.message,
    };
  }
}

/**
 * Update collection dates for multiple bins
 * Used by cron jobs to update all bins with passed collection dates
 * 
 * @param {Array<UserBin>} bins - Array of bins to update
 * @param {User} user - The user who owns the bins
 * @returns {Promise<{updated: number, failed: number, results: Array}>}
 */
export async function updateMultipleBinsCollectionDates(bins, user) {
  const results = {
    updated: 0,
    failed: 0,
    results: [],
  };
  
  for (const bin of bins) {
    try {
      const result = await calculateAndUpdateCollectionDates(bin, user);
      if (result.updated) {
        results.updated++;
      }
      results.results.push({
        binId: bin.id,
        binType: bin.binType,
        ...result,
      });
    } catch (error) {
      results.failed++;
      results.results.push({
        binId: bin.id,
        binType: bin.binType,
        updated: false,
        error: error.message,
      });
      console.error(`Failed to update bin ${bin.id}:`, error);
    }
  }
  
  return results;
}
