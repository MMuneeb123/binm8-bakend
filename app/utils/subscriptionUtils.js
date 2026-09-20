import { Subscription } from '../models/index.js';

/**
 * Helper function to calculate current subscription details for a user
 * @param {number} userId 
 * @returns {Promise<Object>}
 */
export async function getSubscriptionDetails(userId) {
    try {
        // 1. First check if there is an active subscription, ordered by most recently created
        let subscription = await Subscription.findOne({
            where: {
                userId,
                isActive: true,
            },
            order: [['createdAt', 'DESC']],
        });

        // 2. If no active subscription, fall back to the most recent subscription record overall
        if (!subscription) {
            subscription = await Subscription.findOne({
                where: { userId },
                order: [['createdAt', 'DESC']],
            });
        }

        if (!subscription) {
            return {
                subscriptionType: null,
                remainingSubscriptionDays: null,
                remainingTrialDays: null,
                status: null,
                endsAt: null,
            };
        }

        const now = new Date();
        const endsAt = new Date(subscription.endsAt);
        const isExpired = endsAt < now;
        const daysRemaining = Math.ceil((endsAt - now) / (1000 * 60 * 60 * 24));
        const remainingDays = daysRemaining > 0 ? daysRemaining : 0;

        const isTrial = subscription.planType === 'FREE_TRIAL' || subscription.status === 'TRIAL';
        const actualStatus = isExpired ? 'EXPIRED' : subscription.status;

        return {
            subscriptionType: subscription.planType, // FREE_TRIAL, MONTHLY, YEARLY
            remainingSubscriptionDays: isTrial ? null : remainingDays,
            remainingTrialDays: isTrial ? remainingDays : null,
            status: actualStatus,
            endsAt: subscription.endsAt || null,
        };
    } catch (error) {
        console.error(`Error fetching subscription details for user ${userId}:`, error);
        return {
            subscriptionType: null,
            remainingSubscriptionDays: null,
            remainingTrialDays: null,
            status: null,
            endsAt: null,
        };
    }
}
