import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import helmet from "helmet";
import compression from "compression";
import path from "path";
import { existsSync } from "fs";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const isProduction = process.env.NODE_ENV === "production";

const app: Express = express();

// Trust reverse-proxy headers (required for Render, Railway, Cloud Run, etc.)
app.set("trust proxy", 1);

// Security headers
app.use(helmet({ contentSecurityPolicy: false }));

// Gzip compression
app.use(compression());

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// Top-level health check (not under /api so load-balancers can reach it)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", version: "2.1" });
});

app.use("/api", router);

// Serve the Vite-built frontend in production
if (isProduction) {
  const distPath =
    process.env.FRONTEND_DIST_PATH ??
    path.resolve(process.cwd(), "artifacts/ope-fx/dist/public");

  if (existsSync(distPath)) {
    app.use(express.static(distPath));
    // Unknown routes → SPA index.html
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    logger.warn({ distPath }, "Frontend dist not found — static serving disabled");
  }
}

// Production error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const status =
    (err as unknown as Record<string, number>).status ??
    (err as unknown as Record<string, number>).statusCode ??
    500;
  logger.error({ err }, "Unhandled error");
  if (isProduction) {
    res.status(status).json({ error: "Internal server error" });
  } else {
    res.status(status).json({ error: err.message, stack: err.stack });
  }
});

export default app;
