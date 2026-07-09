import Joi from 'joi';

// Valid UK country codes and names
export const UK_COUNTRIES = {
    'GB-ENG': 'England',
    'GB-WLS': 'Wales',
    'GB-SCT': 'Scotland',
    'GB-NIR': 'Northern Ireland'
};

export const countrySchemas = {
    addCountry: Joi.object({
        code: Joi.string()
            .valid(...Object.keys(UK_COUNTRIES))
            .required()
            .messages({
                'any.only': 'Country code must be one of: GB-ENG, GB-WLS, GB-SCT, GB-NIR',
                'string.empty': 'Country code is required'
            }),
        name: Joi.string()
            .valid(...Object.values(UK_COUNTRIES))
            .required()
            .messages({
                'any.only': 'Country name must be one of: England, Wales, Scotland, Northern Ireland',
                'string.empty': 'Country name is required'
            })
    }),

    addHoliday: Joi.object({
        name: Joi.string()
            .min(2)
            .max(100)
            .required()
            .messages({
                'string.empty': 'Holiday name is required',
                'string.min': 'Holiday name must be at least 2 characters long',
                'string.max': 'Holiday name cannot exceed 100 characters'
            }),
        day: Joi.number()
            .integer()
            .min(1)
            .max(31)
            .required()
            .messages({
                'number.base': 'Day must be a number',
                'number.min': 'Day must be between 1 and 31',
                'number.max': 'Day must be between 1 and 31',
                'any.required': 'Day is required'
            }),
        month: Joi.number()
            .integer()
            .min(1)
            .max(12)
            .required()
            .messages({
                'number.base': 'Month must be a number',
                'number.min': 'Month must be between 1 and 12',
                'number.max': 'Month must be between 1 and 12',
                'any.required': 'Month is required'
            }),
        year: Joi.number()
            .integer()
            .min(1900)
            .max(2100)
            .allow(null)
            .messages({
                'number.base': 'Year must be a number',
                'number.min': 'Year must be between 1900 and 2100',
                'number.max': 'Year must be between 1900 and 2100'
            }),
        description: Joi.string()
            .max(500)
            .allow('', null)
            .messages({
                'string.max': 'Description cannot exceed 500 characters'
            })
    }),

    addHolidays: Joi.object({
        holidays: Joi.array()
            .items(
                Joi.object({
                    name: Joi.string()
                        .min(2)
                        .max(100)
                        .required()
                        .messages({
                            'string.empty': 'Holiday name is required',
                            'string.min': 'Holiday name must be at least 2 characters long',
                            'string.max': 'Holiday name cannot exceed 100 characters'
                        }),
                    day: Joi.number()
                        .integer()
                        .min(1)
                        .max(31)
                        .required()
                        .messages({
                            'number.base': 'Day must be a number',
                            'number.min': 'Day must be between 1 and 31',
                            'number.max': 'Day must be between 1 and 31',
                            'any.required': 'Day is required'
                        }),
                    month: Joi.number()
                        .integer()
                        .min(1)
                        .max(12)
                        .required()
                        .messages({
                            'number.base': 'Month must be a number',
                            'number.min': 'Month must be between 1 and 12',
                            'number.max': 'Month must be between 1 and 12',
                            'any.required': 'Month is required'
                        }),
                    year: Joi.number()
                        .integer()
                        .min(1900)
                        .max(2100)
                        .allow(null)
                        .messages({
                            'number.base': 'Year must be a number',
                            'number.min': 'Year must be between 1900 and 2100',
                            'number.max': 'Year must be between 1900 and 2100'
                        }),
                    description: Joi.string()
                        .max(500)
                        .allow('', null)
                        .messages({
                            'string.max': 'Description cannot exceed 500 characters'
                        })
                })
            )
            .min(1)
            .max(100) // Limit to 100 holidays per request
            .required()
            .messages({
                'array.min': 'At least one holiday is required',
                'array.max': 'Cannot add more than 100 holidays at once',
                'any.required': 'Holidays array is required'
            })
    }),

    updateHoliday: Joi.object({
        name: Joi.string()
            .min(2)
            .max(100)
            .messages({
                'string.min': 'Holiday name must be at least 2 characters long',
                'string.max': 'Holiday name cannot exceed 100 characters'
            }),
        day: Joi.number()
            .integer()
            .min(1)
            .max(31)
            .messages({
                'number.base': 'Day must be a number',
                'number.min': 'Day must be between 1 and 31',
                'number.max': 'Day must be between 1 and 31'
            }),
        month: Joi.number()
            .integer()
            .min(1)
            .max(12)
            .messages({
                'number.base': 'Month must be a number',
                'number.min': 'Month must be between 1 and 12',
                'number.max': 'Month must be between 1 and 12'
            }),
        year: Joi.number()
            .integer()
            .min(1900)
            .max(2100)
            .allow(null)
            .messages({
                'number.base': 'Year must be a number',
                'number.min': 'Year must be between 1900 and 2100',
                'number.max': 'Year must be between 1900 and 2100'
            }),
        description: Joi.string()
            .max(500)
            .allow('', null)
            .messages({
                'string.max': 'Description cannot exceed 500 characters'
            })
    })
}; 