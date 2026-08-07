import { Subscription, User } from '../models/index.js';
import { successResponse, errorResponse } from '../utils/responseHandler.js';

// Get Current User's Subscription Status
export const getSubscriptionStatus = async (req, res) => {
    try {
        const userId = req.user.id;
        const sub = await Subscription.findOne({
            where: { userId },
            order: [['createdAt', 'DESC']],
        });

        if (!sub) {
            return errorResponse(res, 'No subscription record found', 404);
        }

        const now = new Date();
        const isExpired = sub.endsAt < now;

        return successResponse(res, 'Subscription status fetched successfully', {
            planType: sub.planType,
            status: isExpired ? 'EXPIRED' : sub.status,
            startsAt: sub.startsAt,
            endsAt: sub.endsAt,
            daysRemaining: Math.max(0, Math.ceil((new Date(sub.endsAt) - now) / (1000 * 60 * 60 * 24))),
        });
    } catch (err) {
        return errorResponse(res, err.message, 500);
    }
};

// Activate or Upgrade Plan (In-App Purchase / Stripe Callback Handler)
export const updateSubscription = async (req, res) => {
    try {
        const userId = req.user.id;
        const { planType, paymentProvider, transactionId , amount} = req.body;

        if (!['MONTHLY', 'YEARLY'].includes(planType)) {
            return errorResponse(res, 'Invalid plan type', 400);
        }

        const now = new Date();
        let endsAt = new Date();

        if (planType === 'MONTHLY') {
            endsAt.setDate(now.getDate() + 30);
        } else if (planType === 'YEARLY') {
            endsAt.setFullYear(now.getFullYear() + 1);
        }

        const newSub = await Subscription.create({
            userId,
            planType,
            status: 'ACTIVE',
            startsAt: now,
            endsAt,
            amount,
            paymentProvider: paymentProvider || 'in_app',
            transactionId: transactionId || null,
        });

        return successResponse(res, 'Subscription activated successfully', newSub);
    } catch (err) {
        return errorResponse(res, err.message, 500);
    }
};