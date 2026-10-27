import express from "express";
import { seedDemoPulse } from "./fixtures.ts";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import { Store, errors, uuid, IDS, digest } from "./core.ts";
import { createProviders, type Providers } from "./providers/index.ts";
import { configFromEnv, type Config } from "./config.ts";
import { attachFakeRealtime } from "./fake-realtime.ts";
import { v1xRoutes } from "./v1x.ts";
import { meetingRoutes } from "./meetings.ts";
import { participantRoutes } from "./participant.ts";
export interface AppOptions {
  store?: Store;
  origin?: string;
  fetchImpl?: typeof fetch;
  dataFile?: string;
  config?: Config;
  providers?: Providers;
}
export function createApp(options: AppOptions = {}) {
  const app = express(),
    store = options.store ?? new Store(options.dataFile);
  const origin = options.origin;
  const config = options.config ?? configFromEnv({});
  const providers =
    options.providers ?? createProviders(config.providers, options.fetchImpl);
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.locals.requestId = uuid();
    res.setHeader("X-Request-Id", res.locals.requestId);
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, Idempotency-Key",
      );
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });
  if (origin)
    app.use(
      "/api/mobile/v1",
      express.raw({ type: () => true, limit: "26mb" }),
      async (req, res) => {
        const target = new URL("/api/mobile/v1" + req.url, origin);
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers))
          if (v && !["host", "connection", "content-length"].includes(k))
            headers.set(k, Array.isArray(v) ? v.join(",") : v);
        const upstream = await (options.fetchImpl ?? fetch)(target, {
          method: req.method,
          headers,
          body: ["GET", "HEAD"].includes(req.method)
            ? undefined
            : (req.body as BodyInit),
          redirect: "manual",
        });
        upstream.headers.forEach((v, k) => {
          if (
            ![
              "transfer-encoding",
              "connection",
              "content-length",
              "content-encoding",
            ].includes(k)
          )
            res.setHeader(k, v);
        });
        res
          .status(upstream.status)
          .send(Buffer.from(await upstream.arrayBuffer()));
      },
    );
  app.use(express.json({ limit: "2mb" }));
  app.get("/health", (_req, res) =>
    res.json({
      ok: true,
      mode: origin ? "proxy" : "fake",
      fixtureAdditions: !!origin,
      providers: providers.metadata,
    }),
  );
  if (!origin) app.use("/api/mobile/v1", participantRoutes(store));
  app.post("/dev/pairing-code", (req, res) => {
    const ip = req.socket.remoteAddress;
    if (!["::1", "127.0.0.1", "::ffff:127.0.0.1"].includes(ip ?? "")) {
      res.status(403).json({
        code: "PERSON_FORBIDDEN",
        message: "Create pairing codes on the local computer.",
        retryable: false,
        requestId: res.locals.requestId,
      });
      return;
    }
    const pairingCode = randomBytes(12).toString("base64url"),
      expiresAt = Date.now() + 5 * 60000;
    store.pairing[digest(pairingCode)] = {
      companyId: IDS.company,
      personId: IDS.advisor,
      expiresAt,
    };
    store.save();
    res.json({ pairingCode, expiresAt: new Date(expiresAt).toISOString() });
  });
  app.use("/api/mobile/meetings/v1", meetingRoutes(store, providers, config));
  seedDemoPulse(store);
  app.use(
    "/api/mobile/v1x",
    (req, res, next) => {
      if (origin) {
        const token = req.header("Authorization")?.replace(/^Bearer /, "");
        if (
          !token ||
          !Object.values(store.sessions).some(
            (s) => s.accessHash === digest(token) && !s.revoked,
          )
        ) {
          res.status(404).json({
            code: "NOT_AVAILABLE",
            message:
              "These proposed features need a local development session.",
            retryable: false,
            requestId: res.locals.requestId,
          });
          return;
        }
      }
      next();
    },
    v1xRoutes(store, providers, config),
  );
  app.use((_req, res) =>
    res.status(404).json({
      code: "NOT_AVAILABLE",
      message: "This operation is not available.",
      retryable: false,
      requestId: res.locals.requestId,
    }),
  );
  app.use(errors);
  return { app, store };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { app } = createApp({
    origin: process.env.DUTYGRAPH_ORIGIN,
    dataFile: process.env.DEV_SERVER_DATA_FILE,
    config: configFromEnv(process.env),
  });
  const server = createServer(app);
  attachFakeRealtime(server);
  server.listen(
    Number(process.env.PORT ?? 4417),
    process.env.HOST ?? "127.0.0.1",
    () => console.info("DutyGraph dev server ready."),
  );
}
