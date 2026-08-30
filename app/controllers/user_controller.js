import { User, UserBin, OTP, Subscription, Council } from '../models/index.js';
import {
    validateCollectionReminders,
    isValidIanaTimezone,
    getRemindersForApiResponse,
} from '../services/reminder_schedule_service.js';
import {
    attachTimezoneAliases,
    conflictingTimeZoneKeys,
    readTimeZoneFromBody,
} from '../utils/userTimeZone.js';
import { Op } from 'sequelize';
import bcrypt from 'bcrypt';
import { 
    successResponse, 
    errorResponse, 
    createdResponse, 
    badRequestResponse,
    notFoundResponse 
} from '../utils/responseHandler.js';
import { UK_COUNTRIES } from '../validations/country_schemas.js';
import { triggerCatchUpForUser } from '../services/notification_service.js';

// Helper function to get subscription details (outside of controller object)
async function getSubscriptionDetails(userId) {
    try {
        const subscription = await Subscription.findOne({
            where: { userId },
            order: [["endsAt", "DESC"]], // Get most recent
        });

        if (!subscription) {
            return {
                subscriptionType: null,
                remainingSubscriptionDays: null,
                remainingTrialDays: null,
            };
        }

        const now = new Date();
        const endsAt = new Date(subscription.endsAt);
        const daysRemaining = Math.ceil((endsAt - now) / (1000 * 60 * 60 * 24));

        const remainingDays = daysRemaining > 0 ? daysRemaining : 0;

        return {
            subscriptionType: subscription.planType,
            remainingSubscriptionDays:
                subscription.status === "TRIAL" ? null : remainingDays,
            remainingTrialDays: subscription.status === "TRIAL" ? remainingDays : null,
        };
    } catch (error) {
        console.error(`Error fetching subscription details for user ${userId}:`, error);
        return {
            subscriptionType: null,
            remainingSubscriptionDays: null,
            remainingTrialDays: null,
        };
    }
}

export const userController = {

    // create for a uset to get his profile
    


    // Create a new user (admin only)
    async createUser(req, res) {
        const { fullName, email, password, country, isAdmin } = req.body;
        try {
            // Validate country code
            const upperCode = country.toUpperCase();
            if (!Object.keys(UK_COUNTRIES).includes(upperCode)) {
                return badRequestResponse(res, 'Invalid country code. Must be one of: GB-ENG, GB-WLS, GB-SCT, GB-NIR');
            }

            const existingUser = await User.findOne({ 
                where: { 
                    email
                } 
            });
            
            if (existingUser) {
                return badRequestResponse(res, "Email already registered");
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const newUser = await User.create({
                fullName,
                email,
                password: hashedPassword,
                country: upperCode,
                isAdmin: isAdmin || false
            });

            const {
                password: _,
                refreshToken: __,
                refreshTokenExpiry: ___,
                ...userData
            } = newUser.toJSON();

            return createdResponse(res, {
                message: 'User created successfully',
                user: userData
            });
        } catch (error) {
            return errorResponse(res, error.message);
        }
    },

    // Get all users (admin only) with pagination and optional filters
    async getUsers(req, res) {
        try {
            const requestedPage = Number.parseInt(req.query.page, 10);
            const requestedLimit = Number.parseInt(req.query.limit, 10);
            const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
            const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
                ? Math.min(requestedLimit, 100)
                : 20;
            const offset = (page - 1) * limit;

            const search = String(req.query.search || '').trim();
            const subscriptionFilter = String(req.query.subscription || '').trim().toUpperCase();
            const isActiveParam = req.query.isActive;

            const whereClause = {};

            if (search) {
                whereClause[Op.or] = [
                    { fullName: { [Op.iLike]: `%${search}%` } },
                    { email: { [Op.iLike]: `%${search}%` } }
                ];
            }

            if (isActiveParam !== undefined && isActiveParam !== null && isActiveParam !== '') {
                const raw = String(isActiveParam).trim().toLowerCase();
                if (raw === 'true' || raw === 'false') {
                    whereClause.isActive = raw === 'true';
                }
            }

            const include = [{
                model: Council,
                attributes: ['id', 'name', 'type', 'country', 'isActive']
            }];

            if (subscriptionFilter) {
                include.push({
                    model: Subscription,
                    attributes: ['id', 'planType', 'status', 'isActive'],
                    required: false,
                    where: {
                        [Op.or]: [
                            { status: subscriptionFilter },
                            { planType: subscriptionFilter }
                        ]
                    }
                });
            }

            const { count, rows } = await User.findAndCountAll({
                where: whereClause,
                attributes: { exclude: ['password', 'refreshToken', 'refreshTokenExpiry'] },
                include,
                order: [['createdAt', 'DESC']],
                limit,
                offset,
                distinct: true
            });
            
            const usersWithSubscription = await Promise.all(
                rows.map(async (user) => {
                    const userData = user.toJSON();
                    userData.subscription = await getSubscriptionDetails(user.id);
                    userData.council = userData.Council || null;
                    delete userData.Council;

                    userData.bins = await UserBin.findAll({
                        where: { userId: user.id },
                        order: [['createdAt', 'ASC']]
                    });

                    return userData;
                })
            );
            
            return successResponse(res, {
                users: usersWithSubscription,
                pagination: {
                    total: count,
                    page,
                    limit,
                    totalPages: Math.ceil(count / limit)
                },
                filters: {
                    search,
                    subscription: subscriptionFilter || null,
                    isActive: isActiveParam !== undefined && isActiveParam !== '' ? String(isActiveParam).trim().toLowerCase() : null
                }
            });
        } catch (error) {
            return errorResponse(res, error.message);
        }
    },

    // Dedicated search endpoint for admin user filters
    async searchUsers(req, res) {
        return this.getUsers(req, res);
    },

    // Get specific user by ID with subscription details and bins (admin only)
    async getUserById(req, res) {
        try {
            const { userId } = req.params;
            const user = await User.findByPk(userId, {
                attributes: { exclude: ['password', 'refreshToken', 'refreshTokenExpiry'] },
                include: [{
                    model: Council,
                    attributes: ['id', 'name', 'type', 'country', 'isActive']
                }]
            });
            
            if (!user) {
                return notFoundResponse(res, 'User not found');
            }
            
            const userData = user.toJSON();
            userData.subscription = await getSubscriptionDetails(user.id);
            userData.council = userData.Council || null;
            delete userData.Council;
            userData.bins = await UserBin.findAll({
                where: { userId: user.id },
                order: [['createdAt', 'ASC']]
            });
            
            return successResponse(res, userData, 'User details fetched successfully');
        } catch (error) {
            return errorResponse(res, error.message);
        }
    },

    // Update user (admin only)
    async updateUser(req, res) {
        const { userId } = req.params;
        const { fullName, email, country, councilId, isAdmin } = req.body;
        try {
            const user = await User.findByPk(userId);
            if (!user) {
                return notFoundResponse(res, 'User not found');
            }

            // Validate country if provided
            if (country) {
                const upperCode = country.toUpperCase();
                if (!Object.keys(UK_COUNTRIES).includes(upperCode)) {
                    return badRequestResponse(res, 'Invalid country code. Must be one of: GB-ENG, GB-WLS, GB-SCT, GB-NIR');
                }
            }

            // Check for duplicate email/username if updating
            if (email) {
                const existingUser = await User.findOne({
                    where: {
                        email,
                        id: { [Op.ne]: userId }
                    }
                });
                if (existingUser) {
                    return badRequestResponse(res, 'Email already in use');
                }
            }

            await user.update({
                fullName: fullName || user.fullName,
                email: email || user.email,
                country: country ? country.toUpperCase() : user.country,
                councilId: councilId !== undefined ? councilId : user.councilId,
                isAdmin: isAdmin !== undefined ? isAdmin : user.isAdmin
            });

            const {
                password: _,
                refreshToken: __,
                refreshTokenExpiry: ___,
                ...userData
            } = user.toJSON();

            return successResponse(res, {
                message: 'User updated successfully',
                user: userData
            });
        } catch (error) {
            return errorResponse(res, error.message);
        }
    },

    // Delete user (admin only)
    async deleteUser(req, res) {
        const { userId } = req.params;
        try {
            const user = await User.findByPk(userId);
            if (!user) {
                return notFoundResponse(res, 'User not found');
            }

            await user.destroy();
            return successResponse(res, null, 'User deleted successfully');
        } catch (error) {
            return errorResponse(res, error.message);
        }
    },

    // Get the authenticated user's profile
    async getProfile(req, res) {
        try {
            // Assuming req.user is set by authentication middleware
            const userId = req.user.id;
            const user = await User.findByPk(userId, {
                attributes: { exclude: ['password', 'refreshToken', 'refreshTokenExpiry'] }
            });
            if (!user) {
                return notFoundResponse(res, 'User not found');
            }
            const payload = user.toJSON();
            payload.timezone = payload.timezone || 'Europe/London';
            payload.collectionReminders = getRemindersForApiResponse(user);
            
            // Add subscription details
            payload.subscription = await getSubscriptionDetails(userId);
            
            return successResponse(res, attachTimezoneAliases(payload), null);
        } catch (error) {
            return errorResponse(res, error.message);
        }
    },

    // Update the authenticated user's profile (name, country, council, and deviceToken)
    async editProfile(req, res) {
        try {
            const userId = req.user.id;
            const { fullName, country, councilId, deviceToken, collectionReminders } = req.body;
            const tzConflict = conflictingTimeZoneKeys(req.body);
            if (tzConflict) {
                return badRequestResponse(res, tzConflict);
            }
            const tzRaw = readTimeZoneFromBody(req.body);

            console.log(`📝 [PROFILE UPDATE] User ${userId} - Request body:`, {
                hasFullName: !!fullName,
                hasCountry: !!country,
                hasCouncilId: councilId !== undefined,
                hasDeviceToken: !!deviceToken,
                deviceTokenLength: deviceToken ? deviceToken.length : 0,
                hasTimezone: tzRaw !== undefined,
                hasCollectionReminders: collectionReminders !== undefined,
            });

            // Validate country if provided
            let upperCode;
            if (country) {
                upperCode = country.toUpperCase();
                if (!Object.keys(UK_COUNTRIES).includes(upperCode)) {
                    return badRequestResponse(res, 'Invalid country code. Must be one of: GB-ENG, GB-WLS, GB-SCT, GB-NIR');
                }
            }

            const user = await User.findByPk(userId);
            if (!user) {
                return notFoundResponse(res, 'User not found');
            }

            // Update provided fields
            if (fullName) user.fullName = fullName;
            if (country) user.country = upperCode;
            if (councilId !== undefined) user.councilId = councilId;
            if (deviceToken !== undefined) {
                user.deviceToken = deviceToken;
                console.log(`📱 Updated deviceToken for user ${userId} (${user.email})`);
            }
            if (tzRaw !== undefined) {
                const tz = String(tzRaw).trim();
                if (!isValidIanaTimezone(tz)) {
                    return badRequestResponse(res, 'Invalid IANA timezone');
                }
                user.timezone = tz;
            }
            if (collectionReminders !== undefined) {
                try {
                    validateCollectionReminders(collectionReminders);
                } catch (e) {
                    return badRequestResponse(res, e.message || 'Invalid collectionReminders');
                }
                user.collectionReminders = collectionReminders;
            }

            await user.save();

            if (deviceToken !== undefined && typeof deviceToken === 'string' && deviceToken.trim()) {
                setImmediate(() => {
                    triggerCatchUpForUser(userId).catch((err) => {
                        console.error(`Error running post-profile-update catch-up for user ${userId}:`, err);
                    });
                });
            }

            const {
                password: _,
                refreshToken: __,
                refreshTokenExpiry: ___,
                ...userData
            } = user.toJSON();
            userData.timezone = userData.timezone || 'Europe/London';
            userData.collectionReminders = getRemindersForApiResponse(user);

            return successResponse(res, {
                message: 'Profile updated successfully',
                user: attachTimezoneAliases(userData)
            });
        } catch (error) {
            return errorResponse(res, error.message);
        }
    },

    /** PATCH /users/me — timezone + collectionReminders (full replace for array when sent) */
    async patchMe(req, res) {
        try {
            const userId = req.user.id;
            const { collectionReminders } = req.body;
            const tzConflict = conflictingTimeZoneKeys(req.body);
            if (tzConflict) {
                return badRequestResponse(res, tzConflict);
            }
            const tzRaw = readTimeZoneFromBody(req.body);

            const user = await User.findByPk(userId);
            if (!user) {
                return notFoundResponse(res, 'User not found');
            }

            if (tzRaw !== undefined) {
                const tz = String(tzRaw).trim();
                if (!isValidIanaTimezone(tz)) {
                    return badRequestResponse(res, 'Invalid IANA timezone');
                }
                user.timezone = tz;
            }

            if (collectionReminders !== undefined) {
                try {
                    validateCollectionReminders(collectionReminders);
                } catch (e) {
                    return badRequestResponse(res, e.message || 'Invalid collectionReminders');
                }
                user.collectionReminders = collectionReminders;
            }

            await user.save();

            const {
                password: __p,
                refreshToken: __r,
                refreshTokenExpiry: __e,
                ...userData
            } = user.toJSON();
            userData.timezone = userData.timezone || 'Europe/London';
            userData.collectionReminders = getRemindersForApiResponse(user);

            return successResponse(res, attachTimezoneAliases(userData), 'Preferences updated successfully');
        } catch (error) {
            return errorResponse(res, error.message);
        }
    },

    // Delete the authenticated user's own account
    async deleteAccount(req, res) {
        try {
            const userId = req.user.id;
            const { password, confirm } = req.body;

            // Verify confirmation
            if (confirm !== true) {
                return badRequestResponse(res, 'Account deletion must be confirmed');
            }

            // Get user with password
            const user = await User.findByPk(userId);
            if (!user) {
                return notFoundResponse(res, 'User not found');
            }

            // Verify password
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                return badRequestResponse(res, 'Invalid password. Account deletion requires password confirmation.');
            }

            // Delete all related data first (cascading deletes)
            // Delete all user bins
            await UserBin.destroy({
                where: { userId: userId }
            });

            // Delete all OTP records
            await OTP.destroy({
                where: { userId: userId }
            });

            // Finally, delete the user account
            await user.destroy();

            return successResponse(res, null, 'Account deleted successfully. All your data has been permanently removed.');
        } catch (error) {
            console.error('Error deleting account:', error);
            return errorResponse(res, error.message);
        }
    }

};
