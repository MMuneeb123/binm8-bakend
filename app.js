import "./instrument.js";
import { Sentry } from "./instrument.js";
import express, { json } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { errorResponse, notFoundResponse } from "./app/utils/responseHandler.js";
import authRoutes from "./app/routes/auth_routes.js";
import binRoutes from "./app/routes/bin_routes.js";
import countryRoutes from "./app/routes/country_routes.js";
import userRoutes from './app/routes/user_routes.js';
import councilRoutes from './app/routes/council_routes.js';
import streakRoutes from './app/routes/streak_routes.js';
import config from './app/config/config.js';
import './app/cron/collection_cron.js';

const app = express();

// Trust proxy - Required for rate limiting behind Nginx
// Trust only the first proxy (Nginx)
app.set('trust proxy', 1);

// Security Middleware
app.use(helmet({
    contentSecurityPolicy: config.server.isProduction ? undefined : false,
    crossOriginEmbedderPolicy: false,
}));

// CORS Configuration
const corsOptions = {
    origin: config.server.isProduction 
        ? function (origin, callback) {
            // Allow requests with no origin (mobile apps, Postman, etc.)
            if (!origin) return callback(null, true);
            
            // Allowed origins for production
            const allowedOrigins = [
                'https://binm8.com',
                'http://binm8.com',
                'https://www.binm8.com',
                'http://www.binm8.com',
                'http://213.165.92.224',
                'https://213.165.92.224',
                // Added server IP for new deployment
                'http://178.105.192.226',
                'https://178.105.192.226',
                // Add your Flutter app URL when deployed
            ];
            
            if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('localhost')) {
                callback(null, true);
            } else {
                callback(null, true); // Allow all for now, can restrict later
            }
        }
        : '*', // Allow all origins in development
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Rate limiting for all routes
// validate: { trustProxy: false } - we're behind Nginx (one proxy); trust proxy is set above
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: config.server.isProduction ? 100 : 1000, // Limit each IP to 100 requests per windowMs in production
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false },
});

// Rate limiting for auth routes (register, login, forgot-password, reset-password, verify-email, etc.)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: config.server.isProduction ? 20 : 100, // 20 auth requests per 15 min (enough for forgot-password flow + login + retries)
    message: 'Too many authentication attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false },
});

app.use('/api/v1/auth', authLimiter);
app.use('/api/', generalLimiter);

// Body parser
app.use(json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/bins", binRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/countries", countryRoutes);
app.use("/api/v1/councils", councilRoutes);
app.use("/api/v1/streaks", streakRoutes);

// Verify Sentry (non-production only)
if (!config.server.isProduction) {
    app.get("/debug-sentry", () => {
        throw new Error("My first Sentry error!");
    });
}

// Sentry error handler: after all routes, before other error middleware
Sentry.setupExpressErrorHandler(app);

// Error handling middleware (runs after Sentry captures the event)
app.use((err, req, res, next) => {
    console.error(err.stack);
    const status = err.statusCode || 500;
    return errorResponse(res, err.message || 'Something went wrong', status);
});

// 404 handler
app.use((req, res) => {
    return notFoundResponse(res);
});

// Start server - Listen on all network interfaces (0.0.0.0) for local network access
const HOST = '0.0.0.0';
app.listen(config.server.port, HOST, () => {
    console.log(`Server is running in ${config.server.env} mode on port ${config.server.port}`);
    console.log(`Local access: http://localhost:${config.server.port}`);
    console.log(`Network access: http://<your-local-ip>:${config.server.port}`);
    console.log('\nTo find your local IP:');
    console.log('  macOS/Linux: ifconfig | grep "inet " | grep -v 127.0.0.1');
    console.log('  Windows: ipconfig');
});
