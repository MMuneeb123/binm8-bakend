export default (sequelize, DataTypes) => {
    return sequelize.define("Holiday", {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        countryCode: {
            type: DataTypes.STRING(7),
            allowNull: false,
            references: {
                model: 'Countries',
                key: 'code'
            },
            comment: 'UK country code (e.g., GB-ENG, GB-WLS, GB-SCT, GB-NIR)'
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        day: {
            type: DataTypes.INTEGER,
            allowNull: false,
            validate: {
                min: 1,
                max: 31
            }
        },
        month: {
            type: DataTypes.INTEGER,
            allowNull: false,
            validate: {
                min: 1,
                max: 12
            }
        },
        year: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Null means the holiday occurs every year'
        },
        description: {
            type: DataTypes.STRING,
            allowNull: true
        }
    }, {
        indexes: [
            {
                unique: true,
                fields: ['countryCode', 'day', 'month', 'year'],
                name: 'country_holiday_date_unique'
            }
        ]
    });
}; 