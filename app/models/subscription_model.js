// import { DataTypes } from 'sequelize';
// import sequelize from '../config/database.js'; // Ensure target path matches your sequelize connection config

// const Subscription = sequelize.define('Subscription', {
//     id: {
//         type: DataTypes.INTEGER,
//         primaryKey: true,
//         autoIncrement: true
//     },
//     user_id: {
//         type: DataTypes.INTEGER,
//         allowNull: false,
//         references: {
//             model: 'Users',
//             key: 'id'
//         },
//         onDelete: 'CASCADE'
//     },
//     plan_type: {
//         type: DataTypes.ENUM('FREE_TRIAL', 'MONTHLY', 'YEARLY'),
//         defaultValue: 'FREE_TRIAL'
//     },
//     status: {
//         type: DataTypes.ENUM('TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED'),
//         defaultValue: 'TRIAL'
//     },
//     starts_at: {
//         type: DataTypes.DATE,
//         defaultValue: DataTypes.NOW
//     },
//     ends_at: {
//         type: DataTypes.DATE,
//         allowNull: false
//     },
//     payment_provider: {
//         type: DataTypes.STRING(50),
//         allowNull: true
//     },
//     transaction_id: {
//         type: DataTypes.STRING(255),
//         allowNull: true
//     }
// }, {
//     tableName: 'Subscriptions',
//     timestamps: true,
//     createdAt: 'created_at',
//     updatedAt: 'updated_at'
// });

// export default Subscription;

export default (sequelize, Sequelize) => {
    const Subscription = sequelize.define('Subscription', {
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        userId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            field: 'user_id',
            references: {
                model: 'Users',
                key: 'id'
            },
            onDelete: 'CASCADE'
        },
        planType: {
            type: Sequelize.ENUM('FREE_TRIAL', 'MONTHLY', 'YEARLY'),
            defaultValue: 'FREE_TRIAL',
            field: 'plan_type'
        },
        status: {
            type: Sequelize.ENUM('TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED'),
            defaultValue: 'TRIAL'
        },
        startsAt: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW,
            field: 'starts_at'
        },
        endsAt: {
            type: Sequelize.DATE,
            allowNull: false,
            field: 'ends_at'
        },
        paymentProvider: {
            type: Sequelize.STRING(50),
            allowNull: true,
            field: 'payment_provider'
        },
        transactionId: {
            type: Sequelize.STRING(255),
            allowNull: true,
            field: 'transaction_id'
        }
    }, {
        tableName: 'Subscriptions',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

    return Subscription;
};