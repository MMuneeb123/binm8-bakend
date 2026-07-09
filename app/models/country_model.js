export default (sequelize, DataTypes) => {
    return sequelize.define("Country", {
        code: {
            type: DataTypes.STRING(7),
            allowNull: false,
            unique: true,
            primaryKey: true,
            comment: 'UK country code (e.g., GB-ENG, GB-WLS, GB-SCT, GB-NIR)'
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        }
    });
}; 