import { User, UserBin, OTP } from '../models/index.js';
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

    // Get all users (admin only)
    async getUsers(req, res) {
        try {
            const users = await User.findAll({
                attributes: { exclude: ['password', 'refreshToken', 'refreshTokenExpiry'] },
                order: [['createdAt', 'DESC']]
            });
            return successResponse(res, users);
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
