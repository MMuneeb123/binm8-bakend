export default (sequelize, DataTypes) => {
  return sequelize.define("UserStreak", {
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      references: { model: "Users", key: "id" },
    },
    currentStreak: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: "Current consecutive collection streak (days)",
    },
    longestStreak: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: "Longest streak ever",
    },
    totalCollections: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: "Total number of collections recorded",
    },
    lastCollectionDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: "Date of last recorded collection (YYYY-MM-DD)",
    },
    streakStartDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: "Date when current streak started",
    },
  }, {
    indexes: [{ unique: true, fields: ["userId"] }],
  });
};
