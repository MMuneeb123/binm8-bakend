import { validationErrorResponse } from '../utils/responseHandler.js';

/**
 * Generic validation middleware using Joi schemas
 * @param {Joi.Schema} schema - Joi validation schema
 * @param {string} property - Request property to validate (body, query, params)
 */
export const validate = (schema, property = 'body') => {
    return (req, res, next) => {
        const { error } = schema.validate(req[property], {
            abortEarly: false, // Return all errors
            stripUnknown: true, // Remove unknown properties
            allowUnknown: false // Don't allow unknown properties
        });

        if (error) {
            const errors = error.details.map(err => ({
                field: err.path[0],
                message: err.message
            }));
            return validationErrorResponse(res, errors);
        }

        next();
    };
};
/**
 * Validate request body
 * @param {Joi.Schema} schema - Joi validation schema
 */
export const validateBody = (schema) => validate(schema, 'body');

/**
 * Validate request query parameters
 * @param {Joi.Schema} schema - Joi validation schema
 */
export const validateQuery = (schema) => validate(schema, 'query');

/**
 * Validate request URL parameters
 * @param {Joi.Schema} schema - Joi validation schema
 */
export const validateParams = (schema) => validate(schema, 'params'); 