import Joi from "joi";
import { UK_COUNTRIES } from './country_schemas.js';
import { isValidIanaTimezone } from "../utils/timezone.js";

// Common validation patterns
const patterns = {
  hexColor: /^#[0-9A-F]{6}$/i,
  hexColorOptionalHash: /^#?[0-9A-F]{6}$/i, // for add bin: with or without #
  password: /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,}$/,
};

const timezoneSchema = Joi.string()
  .min(2)
  .max(64)
  .custom((value, helpers) => {
    const tz = String(value).trim();
    if (!isValidIanaTimezone(tz)) {
      return helpers.error("any.invalid");
    }
    return tz;
  }, "IANA timezone validation")
  .messages({
    "any.invalid": "timezone must be a valid IANA timezone",
  });

// Auth validation schemas
export const authSchemas = {
  register: Joi.object({
    fullName: Joi.string().min(2).max(50).required().messages({
      "string.empty": "Full name is required",
      "string.min": "Full name must be at least 2 characters long",
      "string.max": "Full name cannot exceed 50 characters",
    }),
    email: Joi.string().email().required().messages({
      "string.email": "Please provide a valid email address",
      "string.empty": "Email is required",
    }),
    password: Joi.string()
      .pattern(patterns.password)
      .required()
      .messages({
        "string.pattern.base":
          "Password must be at least 8 characters long, contain at least one letter, one number.",
        "string.empty": "Password is required",
      }),
    country: Joi.string()
      .valid(...Object.keys(UK_COUNTRIES))
      .required()
      .messages({
        'any.only': 'Country code must be one of: GB-ENG, GB-WLS, GB-SCT, GB-NIR',
        'string.empty': 'Country is required'
      }),
    councilId: Joi.number().integer().positive().optional().messages({
      "number.base": "Council ID must be a number",
      "number.positive": "Council ID must be a positive number"
    }),
    adminToken: Joi.string().optional().messages({
      'string.empty': 'Admin token cannot be empty if provided'
    }),
    timezone: timezoneSchema.optional(),
  }),

  login: Joi.object({
    email: Joi.string().email().required().messages({
      "string.email": "Please provide a valid email address",
      "string.empty": "Email is required",
    }),
    password: Joi.string().required().messages({
      "string.empty": "Password is required",
    }),
    deviceToken: Joi.string().optional(),
    timezone: timezoneSchema.optional(),
  }),

  forgotPassword: Joi.object({
    email: Joi.string().email().required().messages({
      "string.email": "Please provide a valid email address",
      "string.empty": "Email is required",
    }),
  }),

  logout: Joi.object({
    refreshToken: Joi.string().required().messages({
      "string.empty": "Refresh token is required",
    }),
  }),

  sendVerification: Joi.object({
    email: Joi.string().email().required().messages({
      "string.email": "Please provide a valid email address",
      "string.empty": "Email is required",
    }),
  }),

  verifyEmail: Joi.object({
    email: Joi.string().email().required().messages({
      "string.email": "Please provide a valid email address",
      "string.empty": "Email is required",
    }),
    code: Joi.string().length(6).required().messages({
      "string.length": "Verification code must be 6 digits",
      "string.empty": "Verification code is required",
    }),
  }),

  resendVerification: Joi.object({
    email: Joi.string().email().required().messages({
      "string.email": "Please provide a valid email address",
      "string.empty": "Email is required",
    }),
  }),

  resendPasswordReset: Joi.object({
    email: Joi.string().email().required().messages({
      "string.email": "Please provide a valid email address",
      "string.empty": "Email is required",
    }),
  }),

  resetPassword: Joi.object({
    email: Joi.string().email().required().messages({
      "string.email": "Please provide a valid email address",
      "string.empty": "Email is required",
    }),
    code: Joi.string().length(6).required().messages({
      "string.length": "Reset code must be 6 digits",
      "string.empty": "Reset code is required",
    }),
    newPassword: Joi.string().pattern(patterns.password).required().messages({
      "string.pattern.base":
        "Password must be at least 8 characters long, contain at least one letter, one number, and may contain special characters (@$!%*?&).",
      "string.empty": "New password is required",
    }),
  }),

  refreshToken: Joi.object({
    refreshToken: Joi.string().required().messages({
      "string.empty": "Refresh token is required",
    }),
  }),
};

/** User-level collection reminder slot (PATCH/PUT /users/me). */
const collectionReminderItem = Joi.object({
  enabled: Joi.boolean().required(),
  offsetDays: Joi.number().integer().min(-30).max(0).required(),
  localTime: Joi.string()
    .pattern(/^([01]?\d|2[0-3]):[0-5]\d$/)
    .required(),
});

/** Per-bin reminder rule (0–5 per bin). Server assigns UUID `id` when omitted. */
const binReminderRuleItem = Joi.object({
  id: Joi.string().max(64).optional().allow(null, ""),
  enabled: Joi.boolean().default(true),
  daysBeforeCollection: Joi.number().integer().min(0).max(30).required().messages({
    "number.base": "daysBeforeCollection must be a number",
    "number.min": "daysBeforeCollection must be at least 0 (collection day)",
    "number.max": "daysBeforeCollection cannot exceed 30",
    "any.required": "daysBeforeCollection is required",
  }),
    time: Joi.string()
    .pattern(/^([01]?\d|2[0-3]):[0-5]\d$/)
    .required()
    .messages({
      "string.pattern.base": "time must be HH:mm (24h)",
      "any.required": "time is required",
    }),
}).unknown(false);

// Bin validation schemas
export const binSchemas = {
  addBin: Joi.object({
    binType: Joi.string()
      .valid("recycle", "garden", "general")
      .required()
      .messages({
        "any.only": "Bin type must be one of: recycle, garden, general",
        "string.empty": "Bin type is required",
      }),
    bodyColor: Joi.string().pattern(patterns.hexColorOptionalHash).required().messages({
      "string.pattern.base": "Body color must be a valid hex color code (e.g. #808080 or 808080)",
      "string.empty": "Body color is required",
    }),
    headColor: Joi.string().pattern(patterns.hexColorOptionalHash).required().messages({
      "string.pattern.base": "Head color must be a valid hex color code (e.g. #808080 or 808080)",
      "string.empty": "Head color is required",
    }),
    lastCollectionDate: Joi.date().max("now").required().messages({
      "date.base": "Last collection date must be a valid date",
      "date.max": "Last collection date cannot be in the future",
      "any.required": "Last collection date is required",
    }),
    collectionInterval: Joi.number().integer().min(1).required().messages({
      "number.base": "Collection interval must be a number",
      "number.min": "Collection interval must be at least 1 day",
      "any.required": "Collection interval is required",
    }),
    notifyDaysBefore: Joi.number().integer().min(0).default(1).messages({
      "number.base": "Notify days before must be a number",
      "number.min": "Notify days before cannot be negative",
    }),
    reminderRules: Joi.array().max(5).items(binReminderRuleItem).optional().messages({
      "array.max": "At most 5 reminder rules per bin",
    }),
  }),

  updateBinSchedule: Joi.object({
    lastCollectionDate: Joi.date().max("now").required().messages({
      "date.base": "Last collection date must be a valid date",
      "date.max": "Last collection date cannot be in the future",
      "any.required": "Last collection date is required",
    }),
    collectionInterval: Joi.number().integer().min(1).required().messages({
      "number.base": "Collection interval must be a number",
      "number.min": "Collection interval must be at least 1 day",
      "any.required": "Collection interval is required",
    }),
    reminderRules: Joi.array().max(5).items(binReminderRuleItem).optional().messages({
      "array.max": "At most 5 reminder rules per bin",
    }),
  }),

  /** PUT /bins/:id/reminders — full replace */
  replaceBinReminders: Joi.object({
    reminderRules: Joi.array().max(5).items(binReminderRuleItem).required().messages({
      "array.max": "At most 5 reminder rules per bin",
      "any.required": "reminderRules is required (use [] to disable all bin reminders)",
    }),
  }).unknown(false),

  updateBinAppearance: Joi.object({
    bodyColor: Joi.string().pattern(patterns.hexColor).required().messages({
      "string.pattern.base": "Body color must be a valid hex color code",
      "string.empty": "Body color is required",
    }),
    headColor: Joi.string().pattern(patterns.hexColor).required().messages({
      "string.pattern.base": "Head color must be a valid hex color code",
      "string.empty": "Head color is required",
    }),
  }),

  getUpcomingCollections: Joi.object({
    days: Joi.number().integer().min(1).max(30).default(7).messages({
      "number.base": "Days must be a number",
      "number.min": "Days must be at least 1",
      "number.max": "Days cannot exceed 30",
    }),
  }),

  markCollected: Joi.object({
    collectionDate: Joi.date().max("now").required().messages({
      "date.base": "Collection date must be a valid date",
      "date.max": "Collection date cannot be in the future",
      "any.required": "Collection date is required",
    }),
    markedVia: Joi.string().valid("bin_buddy", "schedule", "manual").default("bin_buddy"),
  }),
};

// Streak validation schemas
export const streakSchemas = {
  record: Joi.object({
    binId: Joi.number().integer().positive().required().messages({
      "number.base": "Bin ID must be a number",
      "any.required": "Bin ID is required",
    }),
    collectionDate: Joi.date().max("now").required().messages({
      "date.base": "Collection date must be a valid date",
      "date.max": "Collection date cannot be in the future",
      "any.required": "Collection date is required",
    }),
    binType: Joi.string().valid("recycle", "garden", "general").optional(),
  }),

  sync: Joi.object({
    localStreak: Joi.number().integer().min(0).optional(),
    localLastCollectionDate: Joi.date().optional(),
    localTotalCollections: Joi.number().integer().min(0).optional(),
    localLongestStreak: Joi.number().integer().min(0).optional(),
  }),
};

export const userSchemas = {
    createUser: Joi.object({
        fullName: Joi.string().min(2).max(50).required().messages({
            "string.empty": "Full name is required",
            "string.min": "Full name must be at least 2 characters long",
            "string.max": "Full name cannot exceed 50 characters",
        }),
        email: Joi.string().email().required().messages({
            "string.email": "Please provide a valid email address",
            "string.empty": "Email is required",
        }),
        password: Joi.string().pattern(patterns.password).required().messages({
            "string.pattern.base": "Password must be at least 8 characters long, contain at least one letter, one number.",
            "string.empty": "Password is required",
        }),
        country: Joi.string()
            .valid(...Object.keys(UK_COUNTRIES))
            .required()
            .messages({
                'any.only': 'Country code must be one of: GB-ENG, GB-WLS, GB-SCT, GB-NIR',
                'string.empty': 'Country is required'
            }),
        isAdmin: Joi.boolean().default(false)
    }),

    updateUser: Joi.object({
        fullName: Joi.string().min(2).max(50).messages({
            "string.min": "Full name must be at least 2 characters long",
            "string.max": "Full name cannot exceed 50 characters",
        }),
        email: Joi.string().email().messages({
            "string.email": "Please provide a valid email address",
        }),
        country: Joi.string()
            .valid(...Object.keys(UK_COUNTRIES))
            .messages({
                'any.only': 'Country code must be one of: GB-ENG, GB-WLS, GB-SCT, GB-NIR'
            }),
        councilId: Joi.number().integer().positive().messages({
            "number.base": "Council ID must be a number",
            "number.positive": "Council ID must be a positive number"
        }),
        isAdmin: Joi.boolean()
    }),

    deleteAccount: Joi.object({
        password: Joi.string().required().messages({
            "string.empty": "Password is required to confirm account deletion",
        }),
        confirm: Joi.boolean().valid(true).required().messages({
            "any.only": "You must confirm account deletion",
            "any.required": "Confirmation is required"
        })
    }),

    /** PATCH /users/me — timezone + collectionReminders (full replace for array when present) */
    patchMeReminders: Joi.object({
        timezone: Joi.string().min(2).max(64).optional(),
        timeZone: Joi.string().min(2).max(64).optional(),
        collectionReminders: Joi.array().max(6).items(collectionReminderItem).optional(),
    })
        .or("timezone", "timeZone", "collectionReminders")
        .messages({
            "object.missing":
                "Provide at least one of timezone, timeZone, or collectionReminders",
        }),

    /** PUT /users/me — profile fields; at least one property required */
    editProfile: Joi.object({
        fullName: Joi.string().min(2).max(50).optional(),
        country: Joi.string()
            .valid(...Object.keys(UK_COUNTRIES))
            .optional(),
        councilId: Joi.number().integer().optional().allow(null),
        deviceToken: Joi.string().optional().allow(null, ""),
        timezone: Joi.string().min(2).max(64).optional(),
        timeZone: Joi.string().min(2).max(64).optional(),
        collectionReminders: Joi.array().max(6).items(collectionReminderItem).optional(),
    })
        .min(1)
        .messages({
            "object.min": "At least one of fullName, country, councilId, deviceToken, timezone, timeZone, or collectionReminders must be provided",
        }),
};

// Council validation schemas
export const councilSchemas = {
    getCouncils: Joi.object({
        type: Joi.string()
            .valid('Metropolitan District', 'London Borough', 'Unitary Authority', 'County Council', 'District Council', 'Special')
            .messages({
                'any.only': 'Invalid council type'
            }),
        search: Joi.string().min(1).max(100).messages({
            "string.min": "Search term must be at least 1 character",
            "string.max": "Search term cannot exceed 100 characters"
        }),
        country: Joi.string().trim().max(7).uppercase()
    }),

    addCouncil: Joi.object({
        name: Joi.string().min(2).max(100).required().messages({
            "string.empty": "Council name is required",
            "string.min": "Council name must be at least 2 characters",
            "string.max": "Council name cannot exceed 100 characters"
        }),
        type: Joi.string()
            .valid('Metropolitan District', 'London Borough', 'Unitary Authority', 'County Council', 'District Council', 'Special')
            .required()
            .messages({
                'any.only': 'Invalid council type',
                'string.empty': 'Council type is required'
            }),
        country: Joi.string().default('GB-ENG').messages({
            'string.empty': 'Country code cannot be empty'
        })
    }),

    updateCouncil: Joi.object({
        name: Joi.string().min(2).max(100).messages({
            "string.min": "Council name must be at least 2 characters",
            "string.max": "Council name cannot exceed 100 characters"
        }),
        type: Joi.string()
            .valid('Metropolitan District', 'London Borough', 'Unitary Authority', 'County Council', 'District Council', 'Special')
            .messages({
                'any.only': 'Invalid council type'
            }),
        isActive: Joi.boolean().messages({
            'boolean.base': 'isActive must be a boolean'
        })
    }),

    bulkAddCouncils: Joi.object({
        councils: Joi.array().items(
            Joi.object({
                name: Joi.string().min(2).max(100).required(),
                type: Joi.string()
                    .valid('Metropolitan District', 'London Borough', 'Unitary Authority', 'County Council', 'District Council', 'Special')
                    .required(),
                country: Joi.string().default('GB-ENG')
            })
        ).min(1).required().messages({
            "array.min": "At least one council is required",
            "array.base": "Councils must be an array"
        })
    })
};
