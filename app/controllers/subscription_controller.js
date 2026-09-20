import { Subscription, User } from '../models/index.js';
import { successResponse, errorResponse } from '../utils/responseHandler.js';
import config from '../config/config.js';

// Helper to determine planType based on RevenueCat duration or product identifier
const resolvePlanType = (productId) => {
    if (!productId) return 'MONTHLY';
    const lower = productId.toLowerCase();
    if (lower.includes('year')) return 'YEARLY';
    if (lower.includes('trial') || lower.includes('promo')) return 'FREE_TRIAL';
    return 'MONTHLY';
};

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

export const handleRevenueCatWebhook = async (req, res) => {
    try {
        console.log("========== RevenueCat Webhook Hit ==========");
        console.log("Headers:", JSON.stringify(req.headers, null, 2));
        console.log("Raw Body:", JSON.stringify(req.body, null, 2));

        const authHeader = req.headers.authorization;
        const expectedSecret = config.revenuecat.webhookSecret;

        console.log("Auth Header Received:", authHeader);
        console.log("Expected Secret Configured:", !!expectedSecret);

        // Webhook Secret Validation
        if (expectedSecret && authHeader !== `${expectedSecret}`) {
            console.warn("⚠️ Webhook secret mismatch! (currently not blocking — see note below)");
            // return errorResponse(res, "Unauthorized webhook request", 401);
        }

        const { event } = req.body;
        if (!event) {
            console.error("❌ No 'event' key found in req.body");
            return errorResponse(res, "No event payload provided", 400);
        }

        const {
            type,
            app_user_id,
            product_id,
            price_in_purchased_currency,
            currency,
            purchased_at_ms,
            expiration_at_ms,
            original_transaction_id,
            transaction_id,
            store,
            period_type
        } = event;

        console.log("Event Type:", type);
        console.log("app_user_id:", app_user_id);
        console.log("product_id:", product_id);
        console.log("original_transaction_id:", original_transaction_id);
        console.log("transaction_id:", transaction_id);

        if (!app_user_id) {
            console.error("❌ Missing app_user_id in event payload");
            return errorResponse(res, "Missing app_user_id in webhook", 400);
        }

        // Email ya Numeric ID dono handling
        let targetUser = null;
        if (app_user_id.includes('@')) {
            console.log("app_user_id looks like an email, searching by email:", app_user_id);
            targetUser = await User.findOne({ where: { email: app_user_id } });
        } else {
            const parsedId = parseInt(app_user_id, 10);
            console.log("app_user_id treated as numeric ID. Parsed value:", parsedId);
            if (isNaN(parsedId)) {
                console.error("❌ app_user_id could not be parsed as a number:", app_user_id);
            }
            targetUser = await User.findByPk(parsedId);
        }

        if (!targetUser) {
            console.error(`❌ User not found in DB for app_user_id: ${app_user_id}`);
            return errorResponse(res, "User not found in database", 404);
        }

        console.log("✅ User found:", targetUser.id, targetUser.email);

        const userId = targetUser.id;
        const startsAt = purchased_at_ms ? new Date(purchased_at_ms) : new Date();
        const endsAt = expiration_at_ms ? new Date(expiration_at_ms) : new Date();
        const amount = price_in_purchased_currency || 0.00;
        const planType = resolvePlanType(period_type, product_id);

        console.log("Computed values -> startsAt:", startsAt, "endsAt:", endsAt, "amount:", amount, "planType:", planType);

        switch (type) {
            case 'INITIAL_PURCHASE':
            case 'RENEWAL':
            case 'PRODUCT_CHANGE': {
                console.log(`Processing ${type} for userId:`, userId);

                // Purani active subscriptions ko inactive kar do
                const [expiredCount] = await Subscription.update(
                    { isActive: false, status: 'EXPIRED' },
                    { where: { userId, isActive: true } }
                );
                console.log(`Marked ${expiredCount} old subscription(s) as EXPIRED for userId:`, userId);

                // Nayi cycle record karo
                const newSub = await Subscription.create({
                    userId,
                    appUserId: String(app_user_id),
                    originalTransactionId: original_transaction_id || null,
                    transactionId: transaction_id || original_transaction_id || null,
                    productId: product_id || null,
                    planType,
                    status: 'ACTIVE',
                    isActive: true,
                    startsAt,
                    endsAt,
                    paymentProvider: store || 'revenuecat',
                    amount,
                    currency: currency || 'USD'
                });
                console.log("✅ New subscription created:", newSub.id);

                // User profile premium status set karo
                const [updatedCount] = await User.update(
                    { is_premium: true, subscription_status: 'ACTIVE' },
                    { where: { id: userId } }
                );
                console.log(`✅ User.update affected ${updatedCount} row(s) for userId:`, userId);

                if (updatedCount === 0) {
                    console.error("⚠️ User.update matched 0 rows — check userId / model config / hooks");
                }
                break;
            }

            case 'CANCELLATION': {
                console.log("Processing CANCELLATION for userId:", userId);
                // Cancellation par access khatam nahi karte (expiry date tak active rehta hai)
                const [cancelledCount] = await Subscription.update(
                    {
                        status: 'CANCELLED',
                        unsubscribedAt: new Date()
                    },
                    { where: { userId, isActive: true } }
                );
                console.log(`Marked ${cancelledCount} subscription(s) as CANCELLED for userId:`, userId);
                break;
            }

            case 'EXPIRATION': {
                console.log("Processing EXPIRATION for userId:", userId);
                // Access khatam ho chuka hai
                const [expiredCount] = await Subscription.update(
                    { isActive: false, status: 'EXPIRED' },
                    { where: { userId, isActive: true } }
                );
                console.log(`Marked ${expiredCount} subscription(s) as EXPIRED for userId:`, userId);

                const [userUpdatedCount] = await User.update(
                    { is_premium: false, subscription_status: 'EXPIRED' },
                    { where: { id: userId } }
                );
                console.log(`Marked user as non-premium. Rows affected: ${userUpdatedCount}`);
                break;
            }

            default:
                console.log(`ℹ️ RevenueCat Event Ignored (no handler for this type): ${type}`);
        }

        console.log("========== Webhook processed successfully ==========");
        return successResponse(res, null, "Webhook processed successfully");
    } catch (error) {
        console.error("❌ RevenueCat Webhook Error:", error);
        console.error("Stack:", error.stack);
        return errorResponse(res, error.message || "Internal Server Error", 500);
    }
};

/**
 * Manual Sync via RevenueCat REST API (POST /api/v1/subscriptions/sync)
 */
export const syncUserSubscription = async (req, res) => {
    try {
        const userId = req.user.id;
        const userEmail = req.user.email; // RevenueCat Email identifier use kar raha hai

        // App User ID me pehle email check karo, agar na ho toh userId
        const appUserId = userEmail || String(userId);

        const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${config.revenuecat.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            return errorResponse(res, "Failed to fetch subscriber info from RevenueCat", response.status);
        }

        const data = await response.json();
        const subscriber = data.subscriber || {};
        const entitlements = subscriber.entitlements || {};
        const subscriptions = subscriber.subscriptions || {};

        // Active entitlement find karo (jiski expires_date future ki ho)
        const activeEntitlementKey = Object.keys(entitlements).find(key => {
            const ent = entitlements[key];
            return ent.expires_date && new Date(ent.expires_date) > new Date();
        });

        if (activeEntitlementKey) {
            const activeEnt = entitlements[activeEntitlementKey];
            const productId = activeEnt.product_identifier;
            
            // Subscriptions object se matching product ki price aur details fetch karo
            const subDetail = subscriptions[productId] || {};
            const amount = subDetail.price ? subDetail.price.amount : 0.00;
            const currency = subDetail.price ? subDetail.price.currency : 'USD';
            const store = subDetail.store || 'revenuecat';
            const transactionId = subDetail.store_transaction_id || null;

            // Purani active subscriptions ko inactive kar do
            await Subscription.update(
                { isActive: false },
                { where: { userId, isActive: true } }
            );

            // Database me new record save karo
            const newSub = await Subscription.create({
                userId,
                appUserId: String(appUserId),
                originalTransactionId: subscriber.original_purchase_date || null,
                transactionId: transactionId,
                productId: productId,
                planType: resolvePlanType(productId),
                status: 'ACTIVE',
                isActive: true,
                startsAt: new Date(activeEnt.purchase_date),
                endsAt: new Date(activeEnt.expires_date),
                paymentProvider: store,
                amount: amount,
                currency: currency
            });

            // User record update karo
            await User.update(
                { is_premium: true, subscription_status: 'ACTIVE' },
                { where: { id: userId } }
            );

            return successResponse(res, { is_premium: true, subscription: newSub }, "Subscription synced successfully");
        } else {
            // Agar koi active subscription / entitlement na mile
            await Subscription.update(
                { isActive: false, status: 'EXPIRED' },
                { where: { userId, isActive: true } }
            );

            await User.update(
                { is_premium: false, subscription_status: 'EXPIRED' },
                { where: { id: userId } }
            );

            return successResponse(res, { is_premium: false }, "No active subscription found");
        }
    } catch (error) {
        console.error("Sync Subscription Error:", error);
        return errorResponse(res, error.message, 500);
    }
};