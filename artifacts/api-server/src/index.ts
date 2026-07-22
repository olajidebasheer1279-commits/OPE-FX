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

  // Start market data engine (connects WebSocket providers)
  try {
    await marketEngine.start();
    logger.info("Market data engine started");
  } catch (startErr) {
    logger.error({ err: startErr }, "Market data engine failed to start");
  }

  // Start alert engine (subscribes to price ticks, evaluates conditions)
  try {
    await alertEngine.start();
    logger.info("Alert engine started");
  } catch (startErr) {
    logger.error({ err: startErr }, "Alert engine failed to start");
  }
});
