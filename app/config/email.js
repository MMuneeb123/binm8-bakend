import nodemailer from 'nodemailer';
import config from './config.js';

// Reusable generic SMTP transporter mapping config fields
const transporter = nodemailer.createTransport({
    host: config.email.smtp.host,
    port: config.email.smtp.port,
    secure: config.email.smtp.secure,
    auth: {
        user: config.email.smtp.auth.user,
        pass: config.email.smtp.auth.pass
    }
});

// Email templates
const emailTemplates = {
    verification: {
        subject: 'Verify Your Email Address',
        generateHtml: (code) => `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Email Verification</h2>
                <p>Thank you for registering! Please use the following code to verify your email address:</p>
                <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0;">
                    <strong>${code}</strong>
                </div>
                <p>This code will expire in 15 minutes.</p>
                <p>If you didn't request this verification, please ignore this email.</p>
                <hr style="border: 1px solid #eee; margin: 20px 0;">
                <p style="color: #666; font-size: 12px;">This is an automated message, please do not reply.</p>
            </div>
        `
    },
    passwordReset: {
        subject: 'Reset Your Password',
        generateHtml: (code) => `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Password Reset Request</h2>
                <p>We received a request to reset your password. Use the following code to proceed:</p>
                <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0;">
                    <strong>${code}</strong>
                </div>
                <p>This code will expire in 15 minutes.</p>
                <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
                <hr style="border: 1px solid #eee; margin: 20px 0;">
                <p style="color: #666; font-size: 12px;">This is an automated message, please do not reply.</p>
            </div>
        `
    }
};

/**
 * Send an email using the specified template
 */
export const sendEmail = async (to, type, code) => {
    const template = emailTemplates[type];
    if (!template) {
        throw new Error(`Invalid email template type: ${type}`);
    }

    const mailOptions = {
        from: {
            address: config.email.from.email,
            name: config.email.from.name
        },
        to,
        subject: template.subject,
        html: template.generateHtml(code)
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', info.messageId);
    } catch (error) {
        console.error('Error sending email:', error);
        throw new Error('Failed to send email');
    }
};

/**
 * Verify email configuration
 */
export const verifyEmailConfig = async () => {
    try {
        await transporter.verify();
        console.log('Email server is ready to send messages');
    } catch (error) {
        console.error('Email configuration error:', error);
        throw new Error('Invalid email configuration');
    }
};

export default {
    sendEmail,
    verifyEmailConfig
};