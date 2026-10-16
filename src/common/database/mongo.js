import mongoose from "mongoose";
import env from "../config/env.config.js";
import { logger } from "../logging/logger.js";
import { tenantMongo } from "../tenancy/context.js";

let watching = false;

/* Connection changes after start-up are worth a log line each */
const watchConnection = () => {
  if (watching) return;
  watching = true;
  mongoose.connection.on("disconnected", () => logger.warn("MongoDB disconnected"));
  mongoose.connection.on("reconnected", () => logger.info("MongoDB reconnected"));
  mongoose.connection.on("error", error => logger.error({ err: error }, "MongoDB connection error"));
};

export const connectMongo = async () => {
  mongoose.set("strictQuery", true);
  watchConnection();

  /* Production builds indexes explicitly with `npm run mongo:sync-indexes` */
  await mongoose.connect(env.mongoUri, {
    autoIndex: !env.isProduction
  });

  logger.info("MongoDB connected");
};

export const closeMongo = () => mongoose.disconnect();

/* Models live in each school's own MongoDB database. tenantModel(name, schema) returns a
   stand-in that resolves to the model on the CURRENT school's connection on every use, so
   module code keeps writing `Notification.find(...)`, `new AuditLog(...)` as before. */
const schemas = new Map();

export const modelOn = (connection, name) => connection.models[name] ?? connection.model(name, schemas.get(name));

export const tenantModel = (name, schema) => {
  schemas.set(name, schema);
  const resolve = () => modelOn(tenantMongo(), name);
  return new Proxy(function TenantModel() {}, {
    get: (_, property) => {
      const model = resolve();
      const value = model[property];
      return typeof value === "function" ? value.bind(model) : value;
    },
    construct: (_, args) => new (resolve())(...args)
  });
};

/* Every tenant model's name (index sync, least-privilege roles) */
export const tenantModelNames = () => [...schemas.keys()];

/* Build every model on a school's connection, e.g. to sync its indexes */
export const modelsOn = connection => [...schemas.keys()].map(name => modelOn(connection, name));
