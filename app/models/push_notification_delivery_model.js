export default (sequelize, DataTypes) => {
  return sequelize.define("PushNotificationDelivery", {
    pushNotificationId: { type: DataTypes.INTEGER, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM("SENT", "FAILED"), allowNull: false },
    fcmMessageId: { type: DataTypes.STRING, allowNull: true },
    errorCode: { type: DataTypes.STRING, allowNull: true },
    sentAt: { type: DataTypes.DATE, allowNull: true },
  }, {
    indexes: [
      { unique: true, fields: ["pushNotificationId", "userId"] },
      { fields: ["userId", "createdAt"] },
    ],
  });
};
