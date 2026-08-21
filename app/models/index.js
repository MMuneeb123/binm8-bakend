import { Sequelize } from "sequelize";
import config from "../config/config.js";
import userModel from "./user_model.js";
import binTypeModel from "./bin_type_model.js";
import userBinModel from "./user_bin_model.js";
import countryModel from "./country_model.js";
import holidayModel from "./holiday_model.js";
import otpModel from "./otp_model.js";
import councilModel from "./council_model.js";
import userStreakModel from "./user_streak_model.js";
import notificationLogModel from "./notification_log_model.js";
import pushNotificationModel from "./push_notification_model.js";
import pushNotificationDeliveryModel from "./push_notification_delivery_model.js";
import subscriptionModel from "./subscription_model.js"; // 👈 Added Subscription Model

const sequelize = new Sequelize(
  config.database.name,
  config.database.user,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect,
    logging: config.database.logging ? console.log : false,
    pool: config.database.pool,
    dialectOptions: (process.env.NODE_ENV === 'production' && config.database.host !== 'postgres' && config.database.host !== 'localhost') ? {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    } : {},
  }
);

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

// Initialize models
db.User = userModel(sequelize, Sequelize);
db.BinType = binTypeModel(sequelize, Sequelize);
db.UserBin = userBinModel(sequelize, Sequelize);
db.Country = countryModel(sequelize, Sequelize);
db.Holiday = holidayModel(sequelize, Sequelize);
db.OTP = otpModel(sequelize, Sequelize);
db.Council = councilModel(sequelize, Sequelize);
db.UserStreak = userStreakModel(sequelize, Sequelize);
db.NotificationLog = notificationLogModel(sequelize, Sequelize);
db.PushNotification = pushNotificationModel(sequelize, Sequelize);
db.PushNotificationDelivery = pushNotificationDeliveryModel(sequelize, Sequelize);
db.Subscription = subscriptionModel(sequelize, Sequelize); // 👈 Initialized Subscription Model

// Define associations
db.User.hasMany(db.UserBin, { foreignKey: "userId", onDelete: "CASCADE" });
db.UserBin.belongsTo(db.User, { foreignKey: "userId", onDelete: "CASCADE" });
db.User.hasMany(db.NotificationLog, { foreignKey: "userId", onDelete: "CASCADE" });
db.NotificationLog.belongsTo(db.User, { foreignKey: "userId", onDelete: "CASCADE" });
db.UserBin.hasMany(db.NotificationLog, { foreignKey: "userBinId", onDelete: "SET NULL" });
db.NotificationLog.belongsTo(db.UserBin, { foreignKey: "userBinId", onDelete: "SET NULL" });
db.PushNotification.belongsTo(db.Country, { foreignKey: "countryCode", targetKey: "code" });
db.PushNotification.belongsTo(db.Council, { foreignKey: "councilId" });
db.PushNotification.hasMany(db.PushNotificationDelivery, { foreignKey: "pushNotificationId", onDelete: "CASCADE" });
db.PushNotificationDelivery.belongsTo(db.PushNotification, { foreignKey: "pushNotificationId", onDelete: "CASCADE" });
db.User.hasMany(db.PushNotificationDelivery, { foreignKey: "userId", onDelete: "CASCADE" });
db.PushNotificationDelivery.belongsTo(db.User, { foreignKey: "userId", onDelete: "CASCADE" });

// db.Country.hasMany(db.Holiday, { foreignKey: "countryCode" });
// db.Holiday.belongsTo(db.Country, { foreignKey: "countryCode" });

// db.User.belongsTo(db.Country, { foreignKey: "country", targetKey: "code" });
// db.Country.hasMany(db.User, { foreignKey: "country", sourceKey: "code" });

db.User.hasMany(db.OTP, { foreignKey: "userId", onDelete: "CASCADE" });
db.OTP.belongsTo(db.User, { foreignKey: "userId", onDelete: "CASCADE" });

db.User.belongsTo(db.Council, { foreignKey: "councilId" });
db.Council.hasMany(db.User, { foreignKey: "councilId" });

db.User.hasOne(db.UserStreak, { foreignKey: "userId", onDelete: "CASCADE" });
db.UserStreak.belongsTo(db.User, { foreignKey: "userId", onDelete: "CASCADE" });

// 👈 Subscription Associations
db.User.hasMany(db.Subscription, { foreignKey: "userId", onDelete: "CASCADE" });
db.Subscription.belongsTo(db.User, { foreignKey: "userId", onDelete: "CASCADE" });

// Test database connection
sequelize
  .authenticate()
  .then(() => {
    console.log("Connection success");
  })
  .catch((err) => {
    console.error("Connection failed:", err);
  });

// Sync all models with database
sequelize
  // .sync({ force: true }) // Set to true to drop tables on each sync
  .sync(process.env.NODE_ENV === "production" ? {} : { alter: false })
  .then(() => {
    console.log("✅ Database & tables created!");
  })
  .catch((err) => {
    console.error("Error syncing database:", err);
  });

export default db;
export const { User, BinType, UserBin, Country, Holiday, OTP, Council, UserStreak, Subscription, NotificationLog, PushNotification, PushNotificationDelivery } = db;
