/**
 * Sentry must load before other app code. Import this file first in app.js.
 * Override DSN with env: SENTRY_DSN (optional; default below is the project DSN).
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import * as Sentry from "@sentry/node";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const dsn =
  process.env.SENTRY_DSN?.trim() ||
  "https://f4123b878cd33e4cc9fc2f03fbd18325@o4511010915221504.ingest.de.sentry.io/4511168997097552";

Sentry.init({
  dsn,
  sendDefaultPii: true,
  environment: process.env.NODE_ENV || "development",
});

export { Sentry };
export default Sentry;
