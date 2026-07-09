/**
 * Common response handler for all controllers
 */

// Success response handler
export const successResponse = (res, data = null, message = 'Success', statusCode = 200) => {
    return res.status(statusCode).json({
        status: 'success',
        message,
        data
    });
};

// Error response handler
export const errorResponse = (res, message = 'Something went wrong', statusCode = 500, errors = null) => {
    return res.status(statusCode).json({
        status: 'error',
        message,
        errors
    });
};

// Not found response handler
export const notFoundResponse = (res, message = 'Resource not found') => {
    return res.status(404).json({
        status: 'error',
        message
    });
};

// Validation error response handler
export const validationErrorResponse = (res, errors) => {
    return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors
    });
};

// Unauthorized response handler
export const unauthorizedResponse = (res, message = 'Unauthorized access') => {
    return res.status(401).json({
        status: 'error',
        message
    });
};

// Forbidden response handler
export const forbiddenResponse = (res, message = 'Forbidden access') => {
    return res.status(403).json({
        status: 'error',
        message
    });
};

// Created response handler
export const createdResponse = (res, data, message = 'Resource created successfully') => {
    return res.status(201).json({
        status: 'success',
        message,
        data
    });
};

// No content response handler
export const noContentResponse = (res) => {
    return res.status(204).send();
};

// Bad request response handler
export const badRequestResponse = (res, message = 'Bad request', errors = null) => {
    return res.status(400).json({
        status: 'error',
        message,
        errors
    });
}; 