import admin from 'firebase-admin';
import config from './config.js';

let messaging = null;

// Initialize Firebase Admin if Firebase config is provided
if (config.firebase.projectId && config.firebase.privateKey && config.firebase.clientEmail) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: config.firebase.projectId,
                privateKey: config.firebase.privateKey,
                clientEmail: config.firebase.clientEmail
            })
        });
        messaging = admin.messaging();
        console.log('Firebase initialized successfully');
    } catch (error) {
        console.log('here')
        console.error('Error initializing Firebase:', error);
    }
} else {
    console.log('Firebase not configured - push notifications will be disabled');
}

export { messaging };