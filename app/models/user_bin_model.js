export default (sequelize, DataTypes) => {
    return sequelize.define("UserBin", {
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        }
      },
      binType: {
        type: DataTypes.ENUM('recycle', 'garden', 'general'),
        allowNull: false,
        comment: 'Type of bin (recycle, garden, or general)'
      },
      // Bin appearance
      bodyColor: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Color of the bin body'
      },
      headColor: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Color of the bin head'
      },
      // Collection schedule
      lastCollectionDate: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: 'Date of last collection'
      },
      collectionInterval: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'Days between collections'
      },
      nextCollectionDate: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: 'Calculated next collection date'
      },
      // Notification preferences
      notificationEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      notifyDaysBefore: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment:
          "Deprecated: use reminderRules. Kept for backward compatibility with older clients."
      },
      reminderRules: {
        type: DataTypes.JSON,
        allowNull: true,
        comment:
          "0–5 per-bin rules { id, enabled, daysBeforeCollection, time }. null = inherit user profile reminders; [] = none",
      },
      lastNotificationTime: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Time of the last notification sent for this bin'
      },
      reminderSentKeys: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {},
        comment:
          "Map of reminder slot keys sent for current cycle, e.g. { \"2026-02-10_-1_18:00\": true }",
      }
    }, {
      indexes: [
        {
          unique: true,
          fields: ['userId', 'binType'],
          name: 'user_bin_type_unique'
        },
        {
          fields: ['notificationEnabled', 'nextCollectionDate'],
          name: 'idx_bin_notification_schedule'
        }
      ]
    });
  };