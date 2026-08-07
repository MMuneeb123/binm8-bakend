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
                title: `${u.name || 'New Member'} joined`,
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
        const trialCount = await Subscription.count({ where: { planType: 'FREE_TRIAL', status: 'FREE_TRIAL' } });
        const adminCount = await User.count({ where: { role: 'ADMIN' } });

        const totalSubs = yearlyCount + monthlyCount + trialCount + adminCount || 1;

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
            },
            admin: { 
                count: adminCount, 
                percentage: Math.round((adminCount / totalSubs) * 100) 
            }
        };

        // --- 4. DYNAMIC TOP COUNCILS ---
        const topCouncilsRaw = await Council.findAll({
            attributes: [
                'id', 
                'name',
                [Sequelize.fn('COUNT', Sequelize.col('UserBins.id')), 'membersCount']
            ],
            include: [{
                model: UserBin,
                attributes: []
            }],
            group: ['Council.id', 'Council.name'],
            order: [[Sequelize.fn('COUNT', Sequelize.col('UserBins.id')), 'DESC']],
            limit: 5,
            subQuery: false,
            raw: true
        });

        const maxMembers = topCouncilsRaw[0]?.membersCount > 0 ? topCouncilsRaw[0].membersCount : 1;

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