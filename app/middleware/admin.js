import { forbiddenResponse } from '../utils/responseHandler.js';

export const requireAdmin = (req, res, next) => {
    if (!req.user || !req.user.isAdmin) {
        return forbiddenResponse(res, 'Admin privileges required');
    }
    next();
}; 