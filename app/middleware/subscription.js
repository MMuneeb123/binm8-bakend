import Subscription from '../models/subscription_model.js';
import { errorResponse } from '../utils/responseHandler.js';

export const checkSubscription = async (req, res, next) => {
    try {
        const userId = req.user.id; // From auth middleware

        const subscription = await Subscription.findOne({
            where: { userId },
            order: [['created_at', 'DESC']],
        });

        if (!subscription) {
            return errorResponse(res, 'No active trial or subscription found.', 403);
        }

        const now = new Date();
        if (subscription.endsAt < now) {
            // Update status to EXPIRED if past end date
            if (subscription.status !== 'EXPIRED') {
                subscription.status = 'EXPIRED';
                await subscription.save();
            }
            return errorResponse(res, 'Your trial/subscription has expired. Please upgrade.', 403);
        }

        req.subscription = subscription;
        next();
    } catch (error) {
        return errorResponse(res, error.message || 'Subscription verification failed', 500);
    }
};