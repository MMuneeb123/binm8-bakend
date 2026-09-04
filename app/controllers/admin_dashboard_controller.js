import { Sequelize, Op } from 'sequelize';
import db from '../models/index.js';
import { successResponse, errorResponse } from '../utils/responseHandler.js';
import { sendAdminPushNotification } from '../services/notification_delivery.js';

const { User, Council, Subscription, UserBin, NotificationLog, Country, PushNotification, PushNotificationDelivery } = db;

/** GET /api/v1/admin/dashboard/notifications?page=1&limit=20&search=email-or-name */
export const getPushNotifications = async (req, res) => {
    try {
        const requestedPage = Number.parseInt(req.query.page, 10);
        const requestedLimit = Number.parseInt(req.query.limit, 10);
        const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
        const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
            ? Math.min(requestedLimit, 100)
            : 20;
        const search = String(req.query.search || '').trim();
        const offset = (page - 1) * limit;
        const userWhere = search ? {
            [Op.or]: [
                { fullName: { [Op.iLike]: `%${search}%` } },
                { email: { [Op.iLike]: `%${search}%` } },
            ],
        } : undefined;

        const { count, rows } = await NotificationLog.findAndCountAll({
            include: [
                { model: User, attributes: ['id', 'fullName', 'email'], required: Boolean(search), where: userWhere },
                { model: UserBin, attributes: ['id', 'binType'], required: false },
            ],
            order: [['sentAt', 'DESC']],
            limit,
            offset,
            distinct: true,
        });

        return successResponse(res, {
            notifications: rows.map((notification) => ({
                id: notification.id,
                title: notification.title,
                message: notification.message,
                status: notification.status,
                sentAt: notification.sentAt,
                scheduledFor: notification.scheduledFor,
                collectionDate: notification.collectionDate,
                notificationType: notification.notificationType,
                isCatchUp: notification.isCatchUp,
                recipient: notification.User ? {
                    id: notification.User.id,
                    name: notification.User.fullName,
                    email: notification.User.email,
                } : null,
                bin: notification.UserBin ? {
                    id: notification.UserBin.id,
                    type: notification.UserBin.binType,
                } : null,
            })),
            pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
        }, 'Push notification history fetched successfully');
    } catch (error) {
        console.error('Error fetching push notification history:', error);
        return errorResponse(res, 'Failed to fetch push notification history', 500);
    }
};

/** Send an admin push notification to all users, one country, or one council. */
export const sendAdminPushNotificationToAudience = async (req, res) => {
    try {
        const { title, message, targetType, countryCode, councilId } = req.body;
        const normalizedTarget = String(targetType || '').trim().toUpperCase();

        if (!['GLOBAL', 'COUNTRY', 'COUNCIL'].includes(normalizedTarget)) {
            return errorResponse(res, 'targetType must be GLOBAL, COUNTRY, or COUNCIL', 400);
        }
        if ((normalizedTarget === 'COUNTRY' || normalizedTarget === 'COUNCIL') && !countryCode) {
            return errorResponse(res, 'countryCode is required when targetType is COUNTRY or COUNCIL', 400);
        }
        if (normalizedTarget === 'COUNCIL' && !councilId) {
            return errorResponse(res, 'councilId is required when targetType is COUNCIL', 400);
        }

        const normalizedCountryCode = countryCode ? String(countryCode).trim().toUpperCase() : null;
        const normalizedCouncilId = councilId ? Number.parseInt(councilId, 10) : null;

        if (normalizedTarget === 'COUNTRY' || normalizedTarget === 'COUNCIL') {
            const country = await Country.findByPk(normalizedCountryCode);
            if (!country) return errorResponse(res, 'Country not found', 404);
        }
        if (normalizedTarget === 'COUNCIL') {
            const council = await Council.findOne({
                where: { id: normalizedCouncilId, country: normalizedCountryCode },
            });
            if (!council) return errorResponse(res, 'Council not found', 404);
        }

        const notification = await PushNotification.create({
            title,
            message,
            targetType: normalizedTarget,
            countryCode: normalizedTarget === 'GLOBAL' ? null : normalizedCountryCode,
            councilId: normalizedTarget === 'COUNCIL' ? normalizedCouncilId : null,
            createdByAdminId: req.user?.id || null,
            status: 'PROCESSING',
        });

        const userWhere = {
            isActive: true,
            deviceToken: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] },
        };
        if (normalizedTarget === 'COUNTRY') userWhere.country = normalizedCountryCode;
        if (normalizedTarget === 'COUNCIL') userWhere.councilId = normalizedCouncilId;

        const recipients = await User.findAll({
            where: userWhere,
            attributes: ['id', 'deviceToken'],
        });
        let sentCount = 0;
        let failedCount = 0;

        // Log recipients (token preview) to help debug widespread failures
        console.log(`Admin push ${notification.id} - recipients: ${recipients.length}`);
        console.log(
            recipients.slice(0, 20).map(u => ({ id: u.id, tokenPreview: u.deviceToken ? `${String(u.deviceToken).slice(0,8)}...` : null }))
        );

        // FCM sends in small parallel batches, avoiding an unbounded request burst.
        for (let index = 0; index < recipients.length; index += 20) {
            const batch = recipients.slice(index, index + 20);
            const results = await Promise.all(batch.map(async (user) => {
                console.log(`Sending broadcast ${notification.id} -> user ${user.id} token=${user.deviceToken ? `${String(user.deviceToken).slice(0,12)}...` : 'NO_TOKEN'}`);
                const result = await sendAdminPushNotification(user, {
                    title,
                    message,
                    notificationId: notification.id,
                });
                await PushNotificationDelivery.create({
                    pushNotificationId: notification.id,
                    userId: user.id,
                    status: result.ok ? 'SENT' : 'FAILED',
                    fcmMessageId: result.fcmMessageId || null,
                    errorCode: result.errorCode || null,
                    sentAt: result.ok ? new Date() : null,
                });
                if (!result.ok) console.warn(`Delivery failed for user ${user.id}:`, result.errorCode || 'unknown');
                return result.ok;
            }));
            sentCount += results.filter(Boolean).length;
            failedCount += results.filter((result) => !result).length;
        }

        await notification.update({
            recipientCount: recipients.length,
            sentCount,
            failedCount,
            status: sentCount > 0 ? 'SENT' : 'FAILED',
            completedAt: new Date(),
        });

        // Log failed deliveries for debugging
        try {
            const failedRows = await PushNotificationDelivery.findAll({ where: { pushNotificationId: notification.id, status: 'FAILED' }, limit: 50, order: [['createdAt','DESC']] });
            if (failedRows && failedRows.length) {
                console.warn(`Broadcast ${notification.id} failures:`, failedRows.map(r => ({ userId: r.userId, errorCode: r.errorCode })));
            }
        } catch (err) {
            console.error('Error fetching delivery failures for logging:', err);
        }

        return successResponse(res, {
            id: notification.id,
            status: notification.status,
            targetType: notification.targetType,
            recipientCount: recipients.length,
            sentCount,
            failedCount,
        }, 'Push notification processed successfully', 201);
    } catch (error) {
        console.error('Error sending admin push notification:', error);
        return errorResponse(res, 'Failed to send push notification', 500);
    }
};

/** List manually created broadcasts for the admin notifications screen. */
export const getAdminPushBroadcasts = async (req, res) => {
    try {
        const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
        const { count, rows } = await PushNotification.findAndCountAll({
            include: [
                { model: Country, attributes: ['code', 'name'], required: false },
                { model: Council, attributes: ['id', 'name'], required: false },
            ],
            order: [['createdAt', 'DESC']],
            limit,
            offset: (page - 1) * limit,
        });
        return successResponse(res, {
            notifications: rows.map((item) => ({
                id: item.id,
                title: item.title,
                message: item.message,
                status: item.status,
                targetType: item.targetType,
                country: item.Country ? { code: item.Country.code, name: item.Country.name } : null,
                council: item.Council ? { id: item.Council.id, name: item.Council.name } : null,
                recipientCount: item.recipientCount,
                sentCount: item.sentCount,
                failedCount: item.failedCount,
                sentAt: item.completedAt,
                createdAt: item.createdAt,
            })),
            pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
        }, 'Admin push notifications fetched successfully');
    } catch (error) {
        console.error('Error fetching admin push notifications:', error);
        return errorResponse(res, 'Failed to fetch admin push notifications', 500);
    }
};

/** View recipient-level delivery results for one manually created broadcast. */
export const getAdminPushBroadcastDeliveries = async (req, res) => {
    try {
        const notificationId = Number.parseInt(req.params.id, 10);
        if (!Number.isInteger(notificationId) || notificationId <= 0) {
            return errorResponse(res, 'Invalid notification ID', 400);
        }
        const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
        const status = String(req.query.status || '').trim().toUpperCase();
        if (status && !['SENT', 'FAILED'].includes(status)) {
            return errorResponse(res, 'status must be SENT or FAILED', 400);
        }

        const notification = await PushNotification.findByPk(notificationId, {
            attributes: ['id', 'title', 'status', 'recipientCount', 'sentCount', 'failedCount'],
        });
        if (!notification) return errorResponse(res, 'Push notification not found', 404);

        const { count, rows } = await PushNotificationDelivery.findAndCountAll({
            where: { pushNotificationId: notificationId, ...(status ? { status } : {}) },
            include: [{ model: User, attributes: ['id', 'fullName', 'email'], required: false }],
            order: [['createdAt', 'DESC']],
            limit,
            offset: (page - 1) * limit,
        });

        return successResponse(res, {
            notification,
            deliveries: rows.map((item) => ({
                id: item.id,
                status: item.status,
                sentAt: item.sentAt,
                errorCode: item.errorCode,
                user: item.User ? {
                    id: item.User.id,
                    name: item.User.fullName,
                    email: item.User.email,
                } : null,
            })),
            pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
        }, 'Push notification delivery results fetched successfully');
    } catch (error) {
        console.error('Error fetching push notification delivery results:', error);
        return errorResponse(res, 'Failed to fetch push notification delivery results', 500);
    }
};

/**
 * 1. Get Summary Cards & KPIs Stats
 */
export const getDashboardOverview = async (req, res) => {
    try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const yesterdayStart = new Date(todayStart);
        yesterdayStart.setDate(yesterdayStart.getDate() - 1);

        const lastWeekStart = new Date(todayStart);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);

        // --- Quick Bar Stats ---
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
        
        const activeSessions = await User.count({
            where: { updatedAt: { [Op.gte]: fifteenMinutesAgo } }
        });

        const newToday = await User.count({ 
            where: { createdAt: { [Op.gte]: todayStart } } 
        });

        // Renewals due in next 3 days
        const threeDaysLater = new Date();
        threeDaysLater.setDate(threeDaysLater.getDate() + 3);
        
        const renewalsDue = await Subscription.count({
            where: {
                status: 'ACTIVE',
                endsAt: { [Op.between]: [new Date(), threeDaysLater] }
            }
        });

        // --- Main KPI Stats ---
        const totalUsers = await User.count();
        const usersYesterday = await User.count({ 
            where: { createdAt: { [Op.lt]: todayStart } } 
        });
        const userPercentageChange = usersYesterday > 0 
            ? (((totalUsers - usersYesterday) / usersYesterday) * 100).toFixed(1) 
            : '0.0';

        const paidUsers = await Subscription.count({ 
            where: { status: 'ACTIVE' } 
        });
        const paidUsersLastWeek = await Subscription.count({
            where: { status: 'ACTIVE', createdAt: { [Op.lt]: lastWeekStart } }
        });
        const paidPercentageChange = paidUsersLastWeek > 0 
            ? (((paidUsers - paidUsersLastWeek) / paidUsersLastWeek) * 100).toFixed(1) 
            : '0.0';

        const trialUsers = await Subscription.count({ 
            where: { status: 'FREE_TRIAL' } 
        });
        const trialYesterday = await Subscription.count({
            where: { status: 'FREE_TRIAL', createdAt: { [Op.lt]: todayStart } }
        });
        const trialPercentageChange = trialYesterday > 0 
            ? (((trialUsers - trialYesterday) / trialYesterday) * 100).toFixed(1) 
            : '0.0';

        const totalCouncils = await Council.count();
        const councilsYesterday = await Council.count({ 
            where: { createdAt: { [Op.lt]: todayStart } } 
        });
        const councilsPercentageChange = councilsYesterday > 0 
            ? (((totalCouncils - councilsYesterday) / councilsYesterday) * 100).toFixed(1) 
            : '0.0';

        return successResponse(res, 'Dashboard overview stats fetched successfully', {
            quickStats: {
                activeSessions,
                newToday,
                renewalsDue
            },
            kpiCards: {
                totalUsers: {
                    value: totalUsers,
                    percentageChange: `${userPercentageChange >= 0 ? '+' : ''}${userPercentageChange}%`,
                    label: 'Up from yesterday'
                },
                paidUsers: {
                    value: paidUsers,
                    percentageChange: `${paidPercentageChange >= 0 ? '+' : ''}${paidPercentageChange}%`,
                    label: 'Up from last week'
                },
                trialUsers: {
                    value: trialUsers,
                    percentageChange: `${trialPercentageChange >= 0 ? '+' : ''}${trialPercentageChange}%`,
                    label: 'vs yesterday'
                },
                totalCouncils: {
                    value: totalCouncils,
                    percentageChange: `${councilsPercentageChange >= 0 ? '+' : ''}${councilsPercentageChange}%`,
                    label: 'Up from yesterday'
                }
            }
        });
    } catch (err) {
        return errorResponse(res, err.message, 500);
    }
};

/**
 * 2. Get Recent Live Activity Feed
 */
export const getRecentActivity = async (req, res) => {
    try {
        const [recentUsers, recentCouncils, recentSubscriptions] = await Promise.all([
            User.findAll({
                limit: 5,
                order: [['createdAt', 'DESC']],
                attributes: ['id', 'fullName', 'email', 'createdAt']
            }),
            Council.findAll({
                limit: 5,
                order: [['createdAt', 'DESC']],
                attributes: ['id', 'name', 'createdAt']
            }),
            Subscription.findAll({
                limit: 5,
                order: [['createdAt', 'DESC']],
                attributes: ['id', 'userId', 'planType', 'amount', 'createdAt']
            })
        ]);

        const activities = [
            ...recentUsers.map(u => ({
                id: `user_${u.id}`,
                title: `${u.fullName || 'New Member'} joined`,
                subtitle: u.email,
                timestamp: u.createdAt,
                type: 'USER_JOIN'
            })),
            ...recentCouncils.map(c => ({
                id: `council_${c.id}`,
                title: `${c.name} was created`,
                subtitle: 'New council entity added',
                timestamp: c.createdAt,
                type: 'COUNCIL_CREATE'
            })),
            ...recentSubscriptions.map(s => ({
                id: `sub_${s.id}`,
                title: `Payment received — $${s.amount || 0}`,
                subtitle: `${s.planType} plan subscription`,
                timestamp: s.createdAt,
                type: 'PAYMENT_RECEIVED'
            }))
        ]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 6);

        return successResponse(res, 'Recent activities fetched successfully', activities);
    } catch (err) {
        return errorResponse(res, err.message, 500);
    }
};

/**
 * 3. Get Dashboard Analytics & Charts Data
 */
export const getDashboardAnalytics = async (req, res) => {
    try {
        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(`${currentYear}-01-01T00:00:00.000Z`);

        // Get array of months from January to Current Month (Jan to Aug)
        const allMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const currentMonthIndex = new Date().getMonth();
        const monthsToInclude = allMonths.slice(0, currentMonthIndex + 1);

        // Helper function to fill missing 0s
        const formatChartData = (rawDbData, keyName, isInteger = false) => {
            return monthsToInclude.map(monthName => {
                const existing = rawDbData.find(item => (item.month ? item.month.trim() : '') === monthName);
                let value = 0;
                if (existing && existing[keyName] !== undefined && existing[keyName] !== null) {
                    value = isInteger ? parseInt(existing[keyName], 10) : parseFloat(existing[keyName]);
                }
                return {
                    month: monthName,
                    [keyName]: Number(value.toFixed(2))
                };
            });
        };

        // --- 1. FIXED REVENUE CHART ---
        // Historical dynamic revenue by month (regardless of status changes)
        const monthlyRevenueRaw = await Subscription.findAll({
            attributes: [
                [Sequelize.fn('TO_CHAR', Sequelize.col('createdAt'), 'Mon'), 'month'],
                [Sequelize.fn('EXTRACT', Sequelize.literal('MONTH FROM "Subscription"."createdAt"')), 'month_num'],
                [Sequelize.fn('COALESCE', Sequelize.fn('SUM', Sequelize.col('amount')), 0), 'revenue']
            ],
            where: {
                createdAt: { [Op.gte]: startOfYear },
                amount: { [Op.gt]: 0 } // Sirf actual paid entries sum honge
            },
            group: [
                Sequelize.fn('TO_CHAR', Sequelize.col('createdAt'), 'Mon'),
                Sequelize.fn('EXTRACT', Sequelize.literal('MONTH FROM "Subscription"."createdAt"'))
            ],
            order: [[Sequelize.fn('EXTRACT', Sequelize.literal('MONTH FROM "Subscription"."createdAt"')), 'ASC']],
            raw: true
        });

        // Apply 0 fill formatting
        const revenueChart = formatChartData(monthlyRevenueRaw, 'revenue', false);

        // --- 2. DYNAMIC USER LEADS GROWTH ---
        const monthlyLeadsRaw = await User.findAll({
            attributes: [
                [Sequelize.fn('TO_CHAR', Sequelize.col('createdAt'), 'Mon'), 'month'],
                [Sequelize.fn('EXTRACT', Sequelize.literal('MONTH FROM "User"."createdAt"')), 'month_num'],
                [Sequelize.fn('COUNT', Sequelize.col('id')), 'leads']
            ],
            where: {
                createdAt: { [Op.gte]: startOfYear }
            },
            group: [
                Sequelize.fn('TO_CHAR', Sequelize.col('createdAt'), 'Mon'),
                Sequelize.fn('EXTRACT', Sequelize.literal('MONTH FROM "User"."createdAt"'))
            ],
            order: [[Sequelize.fn('EXTRACT', Sequelize.literal('MONTH FROM "User"."createdAt"')), 'ASC']],
            raw: true
        });

        // Apply 0 fill formatting
        const userLeadsGrowthChart = formatChartData(monthlyLeadsRaw, 'leads', true);
        
        // --- 3. DYNAMIC MEMBERSHIP BREAKDOWN (YEARLY, MONTHLY, TRIAL) ---
        const [yearlyCount, monthlyCount, trialCount] = await Promise.all([
            Subscription.count({ where: { planType: 'YEARLY', status: 'ACTIVE' } }),
            Subscription.count({ where: { planType: 'MONTHLY', status: 'ACTIVE' } }),
            Subscription.count({ where: { planType: 'FREE_TRIAL', status: 'TRIAL' } })
        ]);

        const totalSubs = yearlyCount + monthlyCount + trialCount || 1;

        const membershipBreakdown = {
            yearlyPremium: { 
                count: yearlyCount, 
                percentage: Math.round((yearlyCount / totalSubs) * 100) 
            },
            monthlyPremium: { 
                count: monthlyCount, 
                percentage: Math.round((monthlyCount / totalSubs) * 100) 
            },
            trial: { 
                count: trialCount, 
                percentage: Math.round((trialCount / totalSubs) * 100) 
            }
        };

        // --- 4. DYNAMIC TOP COUNCILS ---
        const topCouncilsRaw = await Council.findAll({
            attributes: [
                'id', 
                'name',
                [Sequelize.fn('COUNT', Sequelize.col('Users.UserBins.id')), 'membersCount']
            ],
            include: [{
                model: User,
                attributes: [],
                include: [{
                    model: UserBin,
                    attributes: []
                }]
            }],
            group: ['Council.id', 'Council.name'],
            order: [[Sequelize.fn('COUNT', Sequelize.col('Users.UserBins.id')), 'DESC']],
            limit: 5,
            subQuery: false,
            raw: true
        });

        const maxMembers = topCouncilsRaw[0]?.membersCount > 0 ? parseInt(topCouncilsRaw[0].membersCount, 10) : 1;

        const topCouncils = topCouncilsRaw.map((c, idx) => ({
            rank: idx + 1,
            name: c.name,
            membersCount: parseInt(c.membersCount || 0, 10),
            activityPercentage: `${Math.round((parseInt(c.membersCount || 0, 10) / maxMembers) * 100)}%`
        }));

        return successResponse(res, 'Analytics charts fetched successfully', {
            revenueChart,
            userLeadsGrowthChart,
            membershipBreakdown,
            topCouncils
        });

    } catch (err) {
        console.error("Dashboard Analytics Error:", err);
        return errorResponse(res, err.message, 500);
    }
};

/**
 * 4. Get System Users List
 */
export const getSystemUsers = async (req, res) => {
    try {
        const { filter = 'all', page = 1, limit = 10, search = '' } = req.query;

        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 10;
        const offset = (pageNum - 1) * limitNum;

        // Search filter (Name or Email)
        const whereClause = {};
        if (search) {
            whereClause[Op.or] = [
                { fullName: { [Op.iLike]: `%${search}%` } },
                { email: { [Op.iLike]: `%${search}%` } }
            ];
        }

        // Apply Subscription Filters at the Database Level
        const subWhereClause = {};
        let isSubRequired = false;

        const filterKey = filter.toLowerCase();
        if (filterKey === 'yearly' || filterKey === 'yearly premium') {
            subWhereClause.planType = { [Op.iLike]: '%year%' };
            subWhereClause.status = 'ACTIVE';
            isSubRequired = true;
        } else if (filterKey === 'monthly' || filterKey === '1 month premium') {
            subWhereClause.planType = { [Op.iLike]: '%month%' };
            subWhereClause.status = 'ACTIVE';
            isSubRequired = true;
        } 

        const includeOption = [
            {
                model: Subscription,
                required: isSubRequired, // Force INNER JOIN if specific plan is requested
                where: Object.keys(subWhereClause).length ? subWhereClause : undefined,
                order: [['createdAt', 'DESC']]
            }
        ];

        // Fetch users from DB with proper pagination
        const { count, rows: users } = await User.findAndCountAll({
            where: whereClause,
            include: includeOption,
            limit: limitNum,
            offset: offset,
            order: [['createdAt', 'DESC']],
            distinct: true
        });

        // Map and resolve membership status
        let formattedUsers = users.map((user) => {
            let membership = 'Normal';
            let sub = null;

            if (Array.isArray(user.Subscriptions) && user.Subscriptions.length > 0) {
                sub = user.Subscriptions[0];
            } else if (user.Subscription) {
                sub = user.Subscription;
            }

            if (sub) {
                const subStatus = (sub.status || '').toLowerCase();
                const plan = (sub.planType || '').toLowerCase();
                const isExpired = sub.expiresAt && new Date(sub.expiresAt) < new Date();

                if (subStatus === 'active' || !isExpired) {
                    if (plan.includes('year') || plan === 'yearly') {
                        membership = 'Yearly Premium';
                    } else if (plan.includes('month') || plan === 'monthly') {
                        membership = '1 Month Premium';
                    } else if (plan) {
                        membership = sub.planType;
                    }
                }
            }

            return {
                userCode: `USR-${user.id}`,
                name: user.fullName,
                email: user.email,
                membership: membership,
                status: user.isActive !== false ? 'Member Active' : 'Inactive',
                createdAt: user.createdAt
            };
        });

        // Retain normal filter for users who don't have active subscriptions
        if (filterKey === 'normal') {
            formattedUsers = formattedUsers.filter(u => u.membership === 'Normal');
        }

        return successResponse(res, 'System users fetched successfully', {
            users: formattedUsers,
            pagination: {
                totalUsers: count,
                currentPage: pageNum,
                totalPages: Math.ceil(count / limitNum),
                limit: limitNum
            }
        });

    } catch (error) {
        console.error('Error fetching system users:', error);
        return errorResponse(res, error.message || 'Failed to fetch system users', 500);
    }
};


export const getAdminRevenueStats = async (req, res) => {
    try {
        const totalRevenue = await Subscription.sum('amount') || 0;

        const activeSubscribersCount = await Subscription.count({
            where: { isActive: true, status: 'ACTIVE' }
        });

        const cancelledSubscribersCount = await Subscription.count({
            where: { status: 'CANCELLED' }
        });

        // Monthly revenue breakup query for updated camelCase/PostgreSQL fields
        const monthlyBreakup = await db.sequelize.query(
            `SELECT 
                TO_CHAR("startsAt", 'YYYY-MM') AS month,
                SUM("amount") AS total_amount,
                COUNT("id") AS total_subscriptions
             FROM "Subscriptions"
             WHERE "status" IN ('ACTIVE', 'EXPIRED', 'CANCELLED')
             GROUP BY TO_CHAR("startsAt", 'YYYY-MM')
             ORDER BY month DESC;`,
            { type: db.Sequelize.QueryTypes.SELECT }
        );

        return successResponse(res, {
            totalRevenue: parseFloat(totalRevenue).toFixed(2),
            activeSubscribers: activeSubscribersCount,
            cancelledSubscribers: cancelledSubscribersCount,
            monthlyBreakup
        }, "Revenue analytics fetched successfully");
    } catch (error) {
        console.error("Admin Revenue Stats Error:", error);
        return errorResponse(res, error.message, 500);
    }
};