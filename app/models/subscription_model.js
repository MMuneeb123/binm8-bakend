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
        planType: {
            type: Sequelize.ENUM('FREE_TRIAL', 'MONTHLY', 'YEARLY'),
            defaultValue: 'FREE_TRIAL'
        },
        status: {
            type: Sequelize.ENUM('TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED'),
            defaultValue: 'TRIAL'
        },
        startsAt: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.NOW
        },
        endsAt: {
            type: Sequelize.DATE,
            allowNull: false
        },
        paymentProvider: {
            type: Sequelize.STRING(50),
            allowNull: true
        },
        transactionId: {
            type: Sequelize.STRING(255),
            allowNull: true
        },
        amount: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00
        }
    }, {
        tableName: 'Subscriptions',
        timestamps: true // Yeh by default 'createdAt' aur 'updatedAt' search karega
    });

    return Subscription;
};