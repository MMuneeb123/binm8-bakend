export default (sequelize, DataTypes) => {
    return sequelize.define("BinType", {
      name: {
        type: DataTypes.ENUM('recycle', 'garden', 'general'),
        allowNull: false,
        unique: true
      },
      defaultInterval: {
        type: DataTypes.INTEGER, // in days
        allowNull: false,
        comment: 'Default collection interval in days'
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Description of the bin type'
      }
    });
  };