export default (sequelize, DataTypes) => {
  return sequelize.define("NotificationLog", {
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Users", key: "id" } },
    userBinId: { type: DataTypes.INTEGER, allowNull: true, references: { model: "UserBins", key: "id" } },
    title: { type: DataTypes.STRING, allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    notificationType: { type: DataTypes.STRING, allowNull: false, defaultValue: "collection_reminder" },
    status: { type: DataTypes.ENUM("SENT"), allowNull: false, defaultValue: "SENT" },
    fcmMessageId: { type: DataTypes.STRING, allowNull: true },
    collectionDate: { type: DataTypes.DATEONLY, allowNull: true },
    scheduledFor: { type: DataTypes.DATE, allowNull: true },
    sentAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    offsetDays: { type: DataTypes.INTEGER, allowNull: true },
    isCatchUp: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  }, {
    indexes: [
      { fields: ["sentAt"] },
      { fields: ["userId", "sentAt"] },
      { fields: ["userBinId", "sentAt"] },
    ],
  });
};
