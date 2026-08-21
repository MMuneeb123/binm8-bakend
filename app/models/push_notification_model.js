export default (sequelize, DataTypes) => {
  return sequelize.define("PushNotification", {
    title: { type: DataTypes.STRING(120), allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    targetType: {
      type: DataTypes.ENUM("GLOBAL", "COUNTRY", "COUNCIL"),
      allowNull: false,
    },
    countryCode: { type: DataTypes.STRING(7), allowNull: true },
    councilId: { type: DataTypes.INTEGER, allowNull: true },
    createdByAdminId: { type: DataTypes.INTEGER, allowNull: true },
    status: {
      type: DataTypes.ENUM("PROCESSING", "SENT", "FAILED"),
      allowNull: false,
      defaultValue: "PROCESSING",
    },
    recipientCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    sentCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    failedCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    completedAt: { type: DataTypes.DATE, allowNull: true },
  }, {
    indexes: [
      { fields: ["createdAt"] },
      { fields: ["targetType", "countryCode"] },
      { fields: ["councilId"] },
    ],
  });
};
