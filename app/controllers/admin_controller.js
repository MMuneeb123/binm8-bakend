import db from '../models/index.js'; // models ka path
const { User, Subscription } = db;

// 1. Get All Users with Subscriptions & Pagination
export const getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    const { count, rows: users } = await User.findAndCountAll({
      limit: limit,
      offset: offset,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'fullName', 'email', 'isActive', 'createdAt'],
      include: [
        {
          model: Subscription,
          as: 'Subscriptions',
          attributes: ['id', 'planType', 'amount', 'status', 'createdAt'],
          required: false
        }
      ],
      distinct: true
    });

    return res.status(200).json({
      status: 'success',
      data: {
        totalUsers: count,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        users
      }
    });

  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// 2. Update User Active/Inactive Status (0 or 1)
export const updateUserStatus = async (req, res) => {
  try {
    const { userId, isActive } = req.body;

    if (userId === undefined || isActive === undefined) {
      return res.status(400).json({
        status: 'error',
        message: 'userId and isActive parameters are required.'
      });
    }

    if (![0, 1, false, true].includes(isActive)) {
      return res.status(400).json({
        status: 'error',
        message: 'isActive must be either 0 (deactivate) or 1 (activate).'
      });
    }

    const isUserActive = Boolean(Number(isActive));

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found.'
      });
    }

    user.isActive = isUserActive;
    await user.save();

    return res.status(200).json({
      status: 'success',
      message: `User account has been successfully ${isUserActive ? 'activated' : 'deactivated'}.`,
      data: {
        userId: user.id,
        isActive: user.isActive
      }
    });

  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};