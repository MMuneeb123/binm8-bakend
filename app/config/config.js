import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Validate required environment variables
const requiredEnvVars = [
    'PORT',
    'NODE_ENV',
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'JWT_SECRET',
    'ADMIN_REGISTRATION_TOKEN'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

// Configuration object
const config = {
    // Server configuration
    server: {
        port: process.env.PORT || 3000,
        env: process.env.NODE_ENV || 'development',
        isDevelopment: process.env.NODE_ENV === 'development',
        isProduction: process.env.NODE_ENV === 'production',
        isTest: process.env.NODE_ENV === 'test'
    },

    // Database configuration
    database: {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT, 10),
        name: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        dialect: 'postgres',
        logging: process.env.NODE_ENV === 'development',
        pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000
        }
    },

    // JWT configuration
    jwt: {
        secret: process.env.JWT_SECRET,
        accessExpiry: process.env.JWT_ACCESS_EXPIRY || '1h',
        refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d'
    },

    // Admin configuration
    admin: {
        registrationToken: process.env.ADMIN_REGISTRATION_TOKEN
    },

    // // Email configuration - Mailtrap API
    // email: {
    //     mailtrap: {
    //         token: process.env.MAILTRAP_API_TOKEN
    //     },
    //     from: {
    //         name: process.env.EMAIL_FROM_NAME || 'BinM8',
    //         email: process.env.EMAIL_FROM_EMAIL || 'hello@binm8.com'
    //     }
    // },
    // Email configuration - Updated to Google/Generic SMTP
    email: {
        smtp: {
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            secure: process.env.SMTP_SECURE === 'true', // port 587 should use false and STARTTLS
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        },
        from: {
            name: process.env.EMAIL_FROM_NAME || 'BinM8',
            email: process.env.EMAIL_FROM_EMAIL || 'tech@techbitess.com'
        }
    },

    // Firebase configuration
    firebase: {
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL
    },

    // Logging configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        filePath: process.env.LOG_FILE_PATH || 'logs/app.log'
    }
};

// Export configuration based on environment
export default {
    development: config,
    production: config,
    test: {
        ...config,
        database: {
            ...config.database,
            name: `${config.database.name}_test`,
            logging: false
        }
    }
}[process.env.NODE_ENV || 'development'];