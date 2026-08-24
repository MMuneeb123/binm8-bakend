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
            references: {
                model: 'Users',
                key: 'id'
            },
            onDelete: 'CASCADE'
        },
        appUserId: {
            type: Sequelize.STRING(255),
            allowNull: true
        },
        originalTransactionId: {
            type: Sequelize.STRING(255),
            allowNull: true
        },
        transactionId: {
            type: Sequelize.STRING(255),
            allowNull: true
        },
        productId: {
            type: Sequelize.STRING(255),
            allowNull: true
        },
        planType: {
            type: Sequelize.ENUM('FREE_TRIAL', 'MONTHLY', 'YEARLY'),
            defaultValue: 'FREE_TRIAL'
        },
        status: {
            type: Sequelize.ENUM('TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED'),
            defaultValue: 'TRIAL'
        },
        isActive: {
            type: Sequelize.BOOLEAN,
            defaultValue: true
        },
        startsAt: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW
        },
        endsAt: {
            type: Sequelize.DATE,
            allowNull: false
        },
        unsubscribedAt: {
            type: Sequelize.DATE,
            allowNull: true
        },
        paymentProvider: {
            type: Sequelize.STRING(50),
            allowNull: true
        },
        amount: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00
        },
        currency: {
            type: Sequelize.STRING(10),
            defaultValue: 'USD'
        }
    }, {
        tableName: 'Subscriptions',
        timestamps: true
    });

    Subscription.associate = (models) => {
        Subscription.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    };

    return Subscription;
};