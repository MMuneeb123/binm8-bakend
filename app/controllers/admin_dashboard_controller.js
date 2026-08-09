import { Sequelize, Op } from 'sequelize';
import db from '../models/index.js';
import { successResponse, errorResponse } from '../utils/responseHandler.js';

const { User, Council, Subscription, UserBin } = db;

/**
 * 1. Get Summary Cards & KPIs Stats
 */
export const getDashboardOverview = async (req, res) => {
    try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const yesterdayStart = new Date();
        yesterdayStart.setDate(yesterdayStart.getDate() - 1);
        yesterdayStart.setHours(0, 0, 0, 0);

        const lastWeekStart = new Date();
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);

        // --- Quick Bar Stats ---
        // Active session tracking using recently updated users (last 15 mins)
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
        // 1. Total Users & % change from yesterday
        const totalUsers = await User.count();
        const usersYesterday = await User.count({ 
            where: { createdAt: { [Op.lt]: todayStart } } 
        });
        const userPercentageChange = usersYesterday > 0 
            ? (((totalUsers - usersYesterday) / usersYesterday) * 100).toFixed(1) 
            : '0.0';

        // 2. Paid Users & % change from last week
        const paidUsers = await Subscription.count({ 
            where: { status: 'ACTIVE' } 
        });
        const paidUsersLastWeek = await Subscription.count({
            where: { status: 'ACTIVE', createdAt: { [Op.lt]: lastWeekStart } }
        });
        const paidPercentageChange = paidUsersLastWeek > 0 
            ? (((paidUsers - paidUsersLastWeek) / paidUsersLastWeek) * 100).toFixed(1) 
            : '0.0';

        // 3. Trial Users & % change from yesterday
        const trialUsers = await Subscription.count({ 
            where: { status: 'FREE_TRIAL' } 
        });
        const trialYesterday = await Subscription.count({
            where: { status: 'FREE_TRIAL', createdAt: { [Op.lt]: todayStart } }
        });
        const trialPercentageChange = trialYesterday > 0 
            ? (((trialUsers - trialYesterday) / trialYesterday) * 100).toFixed(1) 
            : '0.0';

        // 4. Total Councils & % change from yesterday
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
        const recentUsers = await User.findAll({
            limit: 5,
            order: [['createdAt', 'DESC']],
            attributes: ['id', 'fullName', 'email', 'createdAt']
        });

        const recentCouncils = await Council.findAll({
            limit: 5,
            order: [['createdAt', 'DESC']],
            attributes: ['id', 'name', 'createdAt']
        });

        const recentSubscriptions = await Subscription.findAll({
            limit: 5,
            order: [['createdAt', 'DESC']],
            attributes: ['id', 'userId', 'planType', 'amount', 'createdAt']
        });

        // Event Logs Array Formatting
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

        // --- 1. DYNAMIC REVENUE CHART ---
        const monthlyRevenueRaw = await Subscription.findAll({
            attributes: [
                [Sequelize.fn('TO_CHAR', Sequelize.col('createdAt'), 'Mon'), 'month'],
                [Sequelize.fn('EXTRACT', Sequelize.literal('MONTH FROM "createdAt"')), 'month_num'],
                [Sequelize.fn('SUM', Sequelize.col('amount')), 'revenue']
            ],
            where: {
                status: 'ACTIVE',
                createdAt: { [Op.gte]: startOfYear }
            },
            group: [
                Sequelize.fn('TO_CHAR', Sequelize.col('createdAt'), 'Mon'),
                Sequelize.fn('EXTRACT', Sequelize.literal('MONTH FROM "createdAt"'))
            ],
            order: [[Sequelize.fn('EXTRACT', Sequelize.literal('MONTH FROM "createdAt"')), 'ASC']],
            raw: true
        });

        const revenueChart = monthlyRevenueRaw.map(item => ({
            month: item.month ? item.month.trim() : '',
            revenue: parseFloat(item.revenue || 0)
        }));

        // --- 2. DYNAMIC USER LEADS GROWTH ---
        const monthlyLeadsRaw = await User.findAll({
            attributes: [
                [Sequelize.fn('TO_CHAR', Sequelize.col('createdAt'), 'Mon'), 'month'],
                [Sequelize.fn('EXTRACT', Sequelize.literal('MONTH FROM "createdAt"')), 'month_num'],
                [Sequelize.fn('COUNT', Sequelize.col('id')), 'leads']
            ],
            where: {
                createdAt: { [Op.gte]: startOfYear }
            },
            group: [
                Sequelize.fn('TO_CHAR', Sequelize.col('createdAt'), 'Mon'),
                Sequelize.fn('EXTRACT', Sequelize.literal('MONTH FROM "createdAt"'))
            ],
            order: [[Sequelize.fn('EXTRACT', Sequelize.literal('MONTH FROM "createdAt"')), 'ASC']],
            raw: true
        });

        const userLeadsGrowthChart = monthlyLeadsRaw.map(item => ({
            month: item.month ? item.month.trim() : '',
            leads: parseInt(item.leads || 0, 10)
        }));
        
        // --- 3. DYNAMIC MEMBERSHIP BREAKDOWN ---
        const yearlyCount = await Subscription.count({ where: { planType: 'YEARLY', status: 'ACTIVE' } });
        const monthlyCount = await Subscription.count({ where: { planType: 'MONTHLY', status: 'ACTIVE' } });
        const trialCount = await Subscription.count({ where: { planType: 'FREE_TRIAL', status: 'TRIAL' } });

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

        // --- 4. DYNAMIC TOP COUNCILS (FIXED ASSOCIATIONS) ---
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

        // Include Subscription table with latest order first
        const includeOption = [
            {
                model: Subscription,
                required: false,
                order: [['createdAt', 'DESC']]
            }
        ];

        // Fetch users from DB
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

            // Extract subscription record
            let sub = null;
            if (Array.isArray(user.Subscriptions) && user.Subscriptions.length > 0) {
                sub = user.Subscriptions[0];
            } else if (Array.isArray(user.subscriptions) && user.subscriptions.length > 0) {
                sub = user.subscriptions[0];
            } else if (user.Subscription || user.subscription) {
                sub = user.Subscription || user.subscription;
            }

            // Check if subscription is active and determine plan type
            if (sub) {
                const subStatus = (sub.status || '').toLowerCase();
                const plan = (sub.planType || sub.plan_type || sub.plan || '').toLowerCase();
                const isExpired = sub.expiresAt && new Date(sub.expiresAt) < new Date();

                if (subStatus === 'active' || subStatus === 'active_recurring' || !isExpired) {
                    if (plan.includes('year') || plan === 'yearly') {
                        membership = 'Yearly Premium';
                    } else if (plan.includes('month') || plan === 'monthly') {
                        membership = '1 Month Premium';
                    } else if (plan) {
                        membership = sub.planType || sub.plan;
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

        // Apply Tab Filter ('all' | 'yearly' | 'monthly' | 'normal')
        if (filter && filter.toLowerCase() !== 'all') {
            const filterKey = filter.toLowerCase();
            formattedUsers = formattedUsers.filter(u => {
                if (filterKey === 'yearly' || filterKey === 'yearly premium') {
                    return u.membership === 'Yearly Premium';
                }
                if (filterKey === 'monthly' || filterKey === '1 month premium') {
                    return u.membership === '1 Month Premium';
                }
                if (filterKey === 'normal') {
                    return u.membership === 'Normal';
                }
                return true;
            });
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