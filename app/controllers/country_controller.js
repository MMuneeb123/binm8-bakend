import db from '../models/index.js';
import { 
    successResponse, 
    errorResponse, 
    notFoundResponse, 
    createdResponse, 
    badRequestResponse 
} from '../utils/responseHandler.js';
import { UK_COUNTRIES } from '../validations/country_schemas.js';

const { Country, Holiday } = db;

// Helper function to validate UK country
function validateUKCountry(code) {
    const upperCode = code.toUpperCase();
    if (!Object.keys(UK_COUNTRIES).includes(upperCode)) {
        throw new Error('Invalid UK country code. Must be one of: GB-ENG, GB-WLS, GB-SCT, GB-NIR');
    }
    return upperCode;
}

export const countryController = {
    // Country endpoints
    async addCountry(req, res) {
        try {
            const { code, name } = req.body;

            // Validate UK country code
            const validatedCode = validateUKCountry(code);
            
            // Ensure name matches the code
            if (UK_COUNTRIES[validatedCode] !== name) {
                return badRequestResponse(res, `Country name must be "${UK_COUNTRIES[validatedCode]}" for code "${validatedCode}"`);
            }

            // Check if country already exists
            const existingCountry = await Country.findOne({
                where: { code: validatedCode }
            });

            if (existingCountry) {
                return badRequestResponse(res, 'Country with this code already exists');
            }

            const country = await Country.create({
                code: validatedCode,
                name
            });

            return createdResponse(res, 'Country added successfully', country);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    },

    // Helper function to get or create country
    async getOrCreateCountry(code) {
        const validatedCode = validateUKCountry(code);
        const countryName = UK_COUNTRIES[validatedCode];
        
        let country = await Country.findOne({
            where: { code: validatedCode }
        });

        if (!country) {
            country = await Country.create({
                code: validatedCode,
                name: countryName
            });
        }

        return country;
    },

    async getCountries(req, res) {
        try {
            const countries = await Country.findAll({
                where: { 
                    isActive: true,
                    code: Object.keys(UK_COUNTRIES) // Only return UK countries
                },
                order: [['name', 'ASC']],
                include: [{
                    model: Holiday,
                    attributes: ['id', 'name', 'day', 'month', 'year', 'description']
                }]
            });

            return successResponse(res, 'Countries retrieved successfully', countries);
        } catch (error) {
            return errorResponse(res, 'Error retrieving countries', error);
        }
    },

    async updateCountry(req, res) {
        try {
            const { code } = req.params;
            const { isActive } = req.body;

            // Validate UK country code
            const validatedCode = validateUKCountry(code);

            const country = await Country.findOne({
                where: { code: validatedCode }
            });

            if (!country) {
                return notFoundResponse(res, 'Country not found');
            }

            // Only allow updating isActive status
            // Name cannot be changed as it's tied to the country code
            await country.update({
                isActive: isActive !== undefined ? isActive : country.isActive
            });

            return successResponse(res, 'Country updated successfully', country);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    },

    // Holiday endpoints
    async addHoliday(req, res) {
        try {
            const { code } = req.params;
            const holidayData = req.body;

            // Validate UK country code and get/create country
            const country = await countryController.getOrCreateCountry(code);

            // Check if holiday already exists for this date
            const existingHoliday = await Holiday.findOne({
                where: {
                    countryCode: country.code,
                    day: holidayData.day,
                    month: holidayData.month,
                    year: holidayData.year || null
                }
            });

            if (existingHoliday) {
                return badRequestResponse(res, 'Holiday already exists for this date');
            }

            const holiday = await Holiday.create({
                ...holidayData,
                countryCode: country.code
            });

            return createdResponse(res, 'Holiday added successfully', holiday);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    },

    async addHolidays(req, res) {
        try {
            const { code } = req.params;
            const { holidays } = req.body;

            // Validate UK country code and get/create country
            const country = await countryController.getOrCreateCountry(code);

            // Check for existing holidays
            const existingHolidays = await Holiday.findAll({
                where: {
                    countryCode: country.code,
                    [db.Sequelize.Op.or]: holidays.map(holiday => ({
                        day: holiday.day,
                        month: holiday.month,
                        year: holiday.year || null
                    }))
                }
            });

            if (existingHolidays.length > 0) {
                const existingDates = existingHolidays.map(h => 
                    `${h.day}/${h.month}${h.year ? `/${h.year}` : ''}`
                );
                return badRequestResponse(
                    res, 
                    'Some holidays already exist for these dates', 
                    { existingDates }
                );
            }

            // Create all holidays
            const createdHolidays = await Holiday.bulkCreate(
                holidays.map(holiday => ({
                    ...holiday,
                    countryCode: country.code
                }))
            );

            return createdResponse(res, 'Holidays added successfully', createdHolidays);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    },

    async getHolidays(req, res) {
        try {
            const { code } = req.params;
            const { year } = req.query;

            // Validate UK country code
            const validatedCode = validateUKCountry(code);

            const country = await Country.findOne({
                where: { code: validatedCode }
            });

            if (!country) {
                return notFoundResponse(res, 'Country not found');
            }

            const whereClause = {
                countryCode: validatedCode
            };

            if (year) {
                whereClause.year = year;
            }

            const holidays = await Holiday.findAll({
                where: whereClause,
                order: [
                    ['month', 'ASC'],
                    ['day', 'ASC']
                ]
            });

            return successResponse(res, 'Holidays retrieved successfully', holidays);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    },

    async updateHoliday(req, res) {
        try {
            const { code, holidayId } = req.params;
            const updateData = req.body;

            // Validate UK country code
            const validatedCode = validateUKCountry(code);

            const country = await Country.findOne({
                where: { code: validatedCode }
            });

            if (!country) {
                return notFoundResponse(res, 'Country not found');
            }

            const holiday = await Holiday.findOne({
                where: {
                    id: holidayId,
                    countryCode: validatedCode
                }
            });

            if (!holiday) {
                return notFoundResponse(res, 'Holiday not found');
            }

            // If updating date, check for conflicts
            if ((updateData.day || updateData.month || updateData.year !== undefined) && 
                (updateData.day !== holiday.day || 
                 updateData.month !== holiday.month || 
                 updateData.year !== holiday.year)) {
                
                const existingHoliday = await Holiday.findOne({
                    where: {
                        countryCode: validatedCode,
                        day: updateData.day || holiday.day,
                        month: updateData.month || holiday.month,
                        year: updateData.year !== undefined ? updateData.year : holiday.year,
                        id: { [db.Sequelize.Op.ne]: holidayId }
                    }
                });

                if (existingHoliday) {
                    return badRequestResponse(res, 'Another holiday already exists for this date');
                }
            }

            await holiday.update(updateData);

            return successResponse(res, 'Holiday updated successfully', holiday);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    },

    async deleteHoliday(req, res) {
        try {
            const { code, holidayId } = req.params;

            // Validate UK country code
            const validatedCode = validateUKCountry(code);

            const country = await Country.findOne({
                where: { code: validatedCode }
            });

            if (!country) {
                return notFoundResponse(res, 'Country not found');
            }

            const holiday = await Holiday.findOne({
                where: {
                    id: holidayId,
                    countryCode: validatedCode
                }
            });

            if (!holiday) {
                return notFoundResponse(res, 'Holiday not found');
            }

            await holiday.destroy();

            return successResponse(res, 'Holiday deleted successfully');
        } catch (error) {
            return errorResponse(res, error.message);
        }
    }
};

