import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import config from '../config/config.js';

export const authenticateToken = async (req, res, next) => {
  try {
    // Get the token from the Authorization header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        status: 'error',
        message: 'Authentication token is required' 
      });
    }

    // Verify the token
    const decoded = jwt.verify(token, config.jwt.secret);

    // Find the user
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return res.status(401).json({ 
        status: 'error',
        message: 'User not found' 
      });
    }

    // Attach user to request object
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        status: 'error',
        message: 'Invalid token' 
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        status: 'error',
        message: 'Token has expired' 
      });
    }
    res.status(500).json({ 
      status: 'error',
      message: 'Authentication failed' 
    });
  }
}; 