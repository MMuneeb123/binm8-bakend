export default (sequelize, DataTypes) => {
  return sequelize.define("User", {
    fullName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    deviceToken: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Firebase device token for push notifications'
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    country: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    councilId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Councils',
        key: 'id'
      },
      comment: 'User\'s local council for bin collection'
    },
    refreshToken: {
      type: DataTypes.STRING,
      allowNull: true
    },
    refreshTokenExpiry: {
      type: DataTypes.DATE,
      allowNull: true
    },
    isAdmin: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Whether the user has admin privileges'
    },
    isEmailVerified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Whether the user has verified their email address'
    },
    timezone: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "Europe/London",
      comment: "IANA timezone for collection reminder scheduling",
    },
    collectionReminders: {
      type: DataTypes.JSON,
      allowNull: true,
      comment:
        "Up to 6 reminders: [{ enabled, offsetDays, localTime }]. null = use server defaults",
    },
  });
};
