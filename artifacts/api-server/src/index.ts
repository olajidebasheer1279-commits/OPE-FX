import app from "./app";
import { logger } from "./lib/logger";
import { marketEngine } from "./lib/market-data/engine";
import { alertEngine } from "./lib/alert-engine";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Attach the alert tick handler before providers connect so startup
  // snapshots/ticks cannot arrive before the Alert Engine is listening.
  try {
    await alertEngine.start();
    logger.info("Alert engine started");
  } catch (startErr) {
    logger.error({ err: startErr }, "Alert engine failed to start");
  }

  // Start market data providers only after the Alert Engine is attached.
  try {
    await marketEngine.start();
    logger.info("Market data engine started");
  } catch (startErr) {
    logger.error({ err: startErr }, "Market data engine failed to start");
  }
});
