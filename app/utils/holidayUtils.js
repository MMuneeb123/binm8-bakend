import { Holiday } from '../models/index.js';
import { Op } from 'sequelize';
import { addDays } from 'date-fns';

export async function isHoliday(date, countryCode) {
    const day = date.getDate();
    const month = date.getMonth() + 1; // JavaScript months are 0-based
    const year = date.getFullYear();

    // Check for both yearly and specific year holidays
    const holiday = await Holiday.findOne({
        where: {
            countryCode,
            day,
            month,
            [Op.or]: [
                { year: null },  // Yearly holidays
                { year }         // Specific year holidays
            ]
        }
    });

    return !!holiday;
}

export async function findNextNonHolidayDate(startDate, countryCode) {
    let currentDate = new Date(startDate);
    
    while (await isHoliday(currentDate, countryCode)) {
        currentDate = addDays(currentDate, 1);
    }
    
    return currentDate;
} 