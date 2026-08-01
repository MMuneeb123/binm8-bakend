import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { Op } from "sequelize";
import { User, OTP,Subscription } from "../models/index.js";
import config from "../config/config.js";
import { sendEmail } from "../config/email.js";
import {
  successResponse,
  errorResponse,
  createdResponse,
  unauthorizedResponse,
  badRequestResponse,
} from "../utils/responseHandler.js";
import { UK_COUNTRIES } from "../validations/country_schemas.js";
import { triggerCatchUpForUser } from "../services/notification_service.js";

// Helper function to generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Helper function to generate tokens
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId, tokenType: "access" },
    config.jwt.secret,
    { expiresIn: config.jwt.accessExpiry }
  );
  // make the expire time 5 secon for test purpose.

  const refreshToken = jwt.sign(
    { userId, tokenType: "refresh" },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshExpiry }
  );

  return { accessToken, refreshToken };
};

// Login controller
export async function login(req, res) {
  const { email, password, deviceToken, timezone } = req.body;
  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return unauthorizedResponse(res, "Invalid credentials");
    }

    if (!user.isEmailVerified) {
      return unauthorizedResponse(
        res,
        "Please verify your email before logging in"
      );
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return unauthorizedResponse(res, "Invalid credentials");
    }

    // Generate both tokens
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Update user with new device token and refresh token
    const updateData = {
      refreshToken,
      refreshTokenExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    };

    // Only update device token if it's provided
    if (deviceToken) {
      updateData.deviceToken = deviceToken;
    }
    if (timezone !== undefined) {
      updateData.timezone = timezone;
    }

    await user.update(updateData);

    if (deviceToken) {
      setImmediate(() => {
        triggerCatchUpForUser(user.id).catch((err) => {
          console.error(`Error running post-login catch-up for user ${user.id}:`, err);
        });
      });
    }

    // Return both tokens and user data
    const {
      password: _,
      refreshToken: __,
      refreshTokenExpiry: ___,
      ...userData
    } = user.toJSON();

    return successResponse(res, {
      user: userData,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
}

// Register controller
export async function register(req, res) {
  const { fullName, email, password, country, councilId, adminToken, timezone } = req.body;
  try {
    // Check if this is the first user (to be made admin)
    const userCount = await User.count();
    const isFirstUser = userCount === 0;

    // Validate country code
    const upperCode = country.toUpperCase();
    if (!Object.keys(UK_COUNTRIES).includes(upperCode)) {
      return badRequestResponse(
        res,
        "Invalid country code. Must be one of: GB-ENG, GB-WLS, GB-SCT, GB-NIR"
      );
    }

    // Check for existing user
    const existingUser = await User.findOne({
      where: {
        email,
      },
    });

    if (existingUser) {
      return badRequestResponse(res, "Email already registered");
    }

    // Determine if user should be admin
    let isAdmin = false;
    if (isFirstUser) {
      // First user is automatically made admin
      isAdmin = true;
    } else if (adminToken) {
      // Check if admin token is valid
      if (
        !config.admin.registrationToken ||
        adminToken !== config.admin.registrationToken
      ) {
        return unauthorizedResponse(res, "Invalid admin registration token");
      }
      isAdmin = true;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      fullName,
      email,
      password: hashedPassword,
      country: upperCode,
      councilId: councilId || null,
      ...(timezone !== undefined ? { timezone } : {}),
      isAdmin,
      isEmailVerified: false,
    });

    // Generate OTP for email verification
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Save OTP
    await OTP.create({
      userId: newUser.id,
      code: otpCode,
      type: "EMAIL_VERIFICATION",
      expiresAt,
    });
    // add Subscription for new user
    // Registration function ke andar User creation ke turant baad:
    const trialDays = 7; // 7 din ka trial
    const endsAt = new Date();
    endsAt.setDate(endsAt.getDate() + trialDays);

    await Subscription.create({
        userId: newUser.id,
        planType: 'FREE_TRIAL',
        status: 'TRIAL',
        startsAt: new Date(),
        endsAt: endsAt,
    });

    // Send verification email using new email service
    await sendEmail(email, "verification", otpCode);

    return createdResponse(
      res,
      null,
      "Registration successful. Please check your email for verification code."
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
}

// Refresh token controller
export async function refreshToken(req, res) {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return unauthorizedResponse(res, "Refresh token is required");
  }

  try {
    // Verify the refresh token
    const decoded = jwt.verify(refreshToken, config.jwt.secret);

    if (decoded.tokenType !== "refresh") {
      return unauthorizedResponse(res, "Invalid token type");
    }

    // Find user with this refresh token
    const user = await User.findOne({
      where: {
        id: decoded.userId,
        refreshToken,
        refreshTokenExpiry: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      return unauthorizedResponse(res, "Invalid refresh token");
    }

    // Generate new tokens
    const tokens = generateTokens(user.id);

    return successResponse(res, {
      tokens: {
        accessToken: tokens.accessToken,
      },
    });
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return unauthorizedResponse(res, "Invalid refresh token");
    }
    return errorResponse(res, error.message);
  }
}

// Logout controller
export async function logout(req, res) {
  const { refreshToken } = req.body;

  try {
    // Find user with this refresh token and clear it
    await User.update(
      {
        refreshToken: null,
        refreshTokenExpiry: null,
      },
      {
        where: { refreshToken },
      }
    );

    return successResponse(res, null, "Logged out successfully");
  } catch (error) {
    return errorResponse(res, error.message);
  }
}

// Send verification email
export async function sendVerificationEmail(req, res) {
  const { email } = req.body;
  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return badRequestResponse(res, "User not found");
    }

    if (user.isEmailVerified) {
      return badRequestResponse(res, "Email already verified");
    }

    // Generate OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Save OTP
    await OTP.create({
      userId: user.id,
      code: otpCode,
      type: "EMAIL_VERIFICATION",
      expiresAt,
    });

    // Send email using new email service
    await sendEmail(email, "verification", otpCode);

    return successResponse(res, null, "Verification code sent successfully");
  } catch (error) {
    return errorResponse(res, error.message);
  }
}

// Verify email with OTP
export async function verifyEmail(req, res) {
  const { email, code } = req.body;
  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return badRequestResponse(res, "User not found");
    }

    const otp = await OTP.findOne({
      where: {
        userId: user.id,
        code,
        type: "EMAIL_VERIFICATION",
        isUsed: false,
        expiresAt: { [Op.gt]: new Date() },
      },
    });

    if (!otp) {
      // Increment attempts if OTP exists but is invalid
      const existingOtp = await OTP.findOne({
        where: {
          userId: user.id,
          type: "EMAIL_VERIFICATION",
          isUsed: false,
          expiresAt: { [Op.gt]: new Date() },
        },
      });

      if (existingOtp) {
        await existingOtp.increment("attempts");
        if (existingOtp.attempts >= 3) {
          await existingOtp.update({ isUsed: true });
          return badRequestResponse(
            res,
            "Too many attempts. Please request a new code."
          );
        }
      }

      return badRequestResponse(res, "Invalid or expired verification code");
    }

    // Generate new tokens
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Mark OTP as used, verify email, and update refresh token
    await Promise.all([
      otp.update({ isUsed: true }),
      user.update({
        isEmailVerified: true,
        refreshToken,
        refreshTokenExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      }),
    ]);

    // Return user data and tokens
    const {
      password: _,
      refreshToken: __,
      refreshTokenExpiry: ___,
      ...userData
    } = user.toJSON();

    return successResponse(res, {
      user: userData,
      accessToken,
      refreshToken,
      message: "Email verified successfully",
    });
  } catch (error) {
    return errorResponse(res, error.message);
  }
}

// Modify forgotPassword to use OTP
export async function forgotPassword(req, res) {
  const { email } = req.body;
  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      // Return success even if user doesn't exist (security best practice)
      return successResponse(
        res,
        null,
        "If your email is registered, you will receive a password reset code"
      );
    }

    // Generate OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Save OTP
    await OTP.create({
      userId: user.id,
      code: otpCode,
      type: "PASSWORD_RESET",
      expiresAt,
    });

    // Send email using new email service
    await sendEmail(email, "passwordReset", otpCode);

    return successResponse(
      res,
      null,
      "If your email is registered, you will receive a password reset code"
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
}

// Modify resetPassword to use OTP
export async function resetPassword(req, res) {
  const { email, code, newPassword } = req.body;
  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return badRequestResponse(res, "User not found");
    }

    const otp = await OTP.findOne({
      where: {
        userId: user.id,
        code,
        type: "PASSWORD_RESET",
        isUsed: false,
        expiresAt: { [Op.gt]: new Date() },
      },
    });

    if (!otp) {
      // Increment attempts if OTP exists but is invalid
      const existingOtp = await OTP.findOne({
        where: {
          userId: user.id,
          type: "PASSWORD_RESET",
          isUsed: false,
          expiresAt: { [Op.gt]: new Date() },
        },
      });

      if (existingOtp) {
        await existingOtp.increment("attempts");
        if (existingOtp.attempts >= 3) {
          await existingOtp.update({ isUsed: true });
          return badRequestResponse(
            res,
            "Too many attempts. Please request a new code."
          );
        }
      }

      return badRequestResponse(res, "Invalid or expired reset code");
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and mark OTP as used
    await Promise.all([
      user.update({ password: hashedPassword }),
      otp.update({ isUsed: true }),
    ]);

    return successResponse(res, null, "Password has been reset successfully");
  } catch (error) {
    return errorResponse(res, error.message);
  }
}

// Resend verification OTP
export async function resendVerificationOTP(req, res) {
  const { email } = req.body;
  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return badRequestResponse(res, "User not found");
    }

    if (user.isEmailVerified) {
      return badRequestResponse(res, "Email is already verified");
    }

    // Check for existing unused OTP
    const existingOtp = await OTP.findOne({
      where: {
        userId: user.id,
        type: "EMAIL_VERIFICATION",
        isUsed: false,
        expiresAt: { [Op.gt]: new Date() },
      },
    });

    // If there's an existing OTP, check if we can resend
    if (existingOtp) {
      // Check if the last OTP was sent less than 1 minute ago (rate limiting)
      const timeSinceLastOtp = Date.now() - existingOtp.createdAt;
      if (timeSinceLastOtp < 60000) {
        // 1 minute in milliseconds
        const secondsLeft = Math.ceil((60000 - timeSinceLastOtp) / 1000);
        return badRequestResponse(
          res,
          `Please wait ${secondsLeft} seconds before requesting a new code`
        );
      }

      // Mark existing OTP as used
      await existingOtp.update({ isUsed: true });
    }

    // Generate new OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Save new OTP
    await OTP.create({
      userId: user.id,
      code: otpCode,
      type: "EMAIL_VERIFICATION",
      expiresAt,
    });

    // Send email using new email service
    await sendEmail(email, "verification", otpCode);

    return successResponse(
      res,
      null,
      "New verification code sent successfully"
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
}

// Resend password reset OTP
export async function resendPasswordResetOTP(req, res) {
  const { email } = req.body;
  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      // Return success even if user doesn't exist (security best practice)
      return successResponse(
        res,
        null,
        "If your email is registered, you will receive a new password reset code"
      );
    }

    // Check for existing unused OTP
    const existingOtp = await OTP.findOne({
      where: {
        userId: user.id,
        type: "PASSWORD_RESET",
        isUsed: false,
        expiresAt: { [Op.gt]: new Date() },
      },
    });

    // If there's an existing OTP, check if we can resend
    if (existingOtp) {
      // Check if the last OTP was sent less than 1 minute ago (rate limiting)
      const timeSinceLastOtp = Date.now() - existingOtp.createdAt;
      if (timeSinceLastOtp < 60000) {
        // 1 minute in milliseconds
        const secondsLeft = Math.ceil((60000 - timeSinceLastOtp) / 1000);
        return badRequestResponse(
          res,
          `Please wait ${secondsLeft} seconds before requesting a new code`
        );
      }

      // Mark existing OTP as used
      await existingOtp.update({ isUsed: true });
    }

    // Generate new OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Save new OTP
    await OTP.create({
      userId: user.id,
      code: otpCode,
      type: "PASSWORD_RESET",
      expiresAt,
    });

    // Send email using new email service
    await sendEmail(email, "passwordReset", otpCode);

    return successResponse(
      res,
      null,
      "If your email is registered, you will receive a new password reset code"
    );
  } catch (error) {
    return errorResponse(res, error.message);
  }
}

// Change password controller
export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  try {
    const userId = req.user.id;
    const user = await User.findByPk(userId);
    if (!user) {
      return unauthorizedResponse(res, "User not found");
    }

    const isValidPassword = await bcrypt.compare(
      currentPassword,
      user.password
    );
    if (!isValidPassword) {
      return badRequestResponse(res, "Current password is incorrect");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await user.update({ password: hashedPassword });

    return successResponse(res, null, "Password changed successfully");
  } catch (error) {
    return errorResponse(res, error.message);
  }
}
