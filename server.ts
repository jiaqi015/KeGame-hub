import express from "express";
import fs from "node:fs/promises";
import http from "node:http";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import {
  authorizeSession,
  clearSessionCookie,
  completeEmailLogin,
  isSessionAuthorizationFailure,
  refreshSession,
  setAuthCookie,
  startEmailLogin,
} from "./lib/auth.js";
import { authorizeRequest, validateActivationKey } from "./lib/activation.js";
import { compareModels, streamCompareModel } from "./lib/compare.js";
import { AVAILABLE_MODELS } from "./lib/models.js";
import { handleOpenDayCatalog } from "./modules/open-day/interfaces/http/openDayCatalogHandler.js";
import { handleOpenDaySnapshotGet } from "./modules/open-day/interfaces/http/openDaySnapshotGetHandler.js";
import { handleOpenDayWorkbookParse } from "./modules/open-day/interfaces/http/openDayWorkbookParseHandler.js";
import { handleOpenDayScenarioGet } from "./modules/open-day/interfaces/http/openDayScenarioGetHandler.js";
import { handleOpenDayScenarioList } from "./modules/open-day/interfaces/http/openDayScenarioListHandler.js";
import { handleOpenDayScenarioSave } from "./modules/open-day/interfaces/http/openDayScenarioSaveHandler.js";
import { handleOpenDayScenarioDelete } from "./modules/open-day/interfaces/http/openDayScenarioDeleteHandler.js";
import { handleOpenDayScenarioVersionList } from "./modules/open-day/interfaces/http/openDayScenarioVersionListHandler.js";
import { handleOpenDaySnapshotList } from "./modules/open-day/interfaces/http/openDaySnapshotListHandler.js";
import { handleOpenDayScore } from "./modules/open-day/interfaces/http/openDayScoreHandler.js";
import { openDayDisambiguationHandler } from "./modules/open-day/interfaces/http/openDayDisambiguationHandler.js";
import {
  handleMaintainerRunCreate,
  handleMaintainerRunGet,
  handleMaintainerRunList,
  handleMaintainerRunSave,
  buildMaintainerRunIdentityContext,
  isMaintainerSyncConflictError,
} from "./src/selling-houses/interfaces/http/maintainerRunHandlers.js";
import {
  handleMaintainerLeaderboardDetail,
  handleMaintainerLeaderboardList,
} from "./src/selling-houses/interfaces/http/maintainerLeaderboardHandler.js";
import {
  handleSellingHousesScenarioGet,
  handleSellingHousesScenarioList,
} from "./src/selling-houses/interfaces/http/sellingHousesScenarioHandlers.js";
import {
  getFirstFieldValue,
  hasQueryValue,
  isMaintainerLeaderboardDetailQuery,
  isMaintainerLeaderboardQuery,
  isOpenDayScenarioVersionQuery,
  isOpenDaySnapshotDetailQuery,
  isStreamRequested,
  parseMultipartUpload,
} from "./api/_request.js";

dotenv.config({ path: ".env.local", override: false });
dotenv.config({ path: ".env", override: false });

async function startServer() {
  const app = express();
  const preferredPort = Number(process.env.PORT || 3000);
  const server = http.createServer(app);

  app.use(express.json({ limit: "4mb" }));

  app.post("/api/auth-start", async (req, res) => {
    try {
      const email = typeof req.body?.email === "string" ? req.body.email : "";
      const result = await startEmailLogin(email);
      return res.json({
        ok: true,
        email: result.email,
        mode: result.mode,
        expiresAt: result.expiresAt || null,
        user: result.user || null,
      });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "登录初始化失败。" });
    }
  });

  app.post("/api/auth", async (req, res, next) => {
    if (req.query?.mode === "activate") {
      const key = typeof req.body?.key === "string" ? req.body.key.trim() : "";
      const validation = validateActivationKey(key);

      if (!validation.ok) {
        return res.status(validation.status).json({ error: validation.error });
      }

      return res.json({
        ok: true,
        key: validation.key,
        allowedWorkspaces: validation.allowedWorkspaces,
      });
    }

    if (req.query?.mode !== "start") {
      return next();
    }

    try {
      const email = typeof req.body?.email === "string" ? req.body.email : "";
      const result = await startEmailLogin(email);
      return res.json({
        ok: true,
        email: result.email,
        mode: result.mode,
        expiresAt: result.expiresAt || null,
        user: result.user || null,
      });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "登录初始化失败。" });
    }
  });

  app.post("/api/auth-complete", (req, res) => {
    try {
      const result = completeEmailLogin({
        email: typeof req.body?.email === "string" ? req.body.email : "",
        code: typeof req.body?.code === "string" ? req.body.code : "",
        activationKey: typeof req.body?.activationKey === "string" ? req.body.activationKey : "",
      });
      setAuthCookie(res, result.cookie);
      return res.json({ ok: true, user: result.user, sessionExpiresAt: result.expiresAt });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "登录失败。" });
    }
  });

  app.post("/api/auth", (req, res, next) => {
    if (req.query?.mode !== "complete") {
      return next();
    }

    try {
      const result = completeEmailLogin({
        email: typeof req.body?.email === "string" ? req.body.email : "",
        code: typeof req.body?.code === "string" ? req.body.code : "",
        activationKey: typeof req.body?.activationKey === "string" ? req.body.activationKey : "",
      });
      setAuthCookie(res, result.cookie);
      return res.json({ ok: true, user: result.user, sessionExpiresAt: result.expiresAt });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "登录失败。" });
    }
  });

  app.get("/api/auth-me", (req, res) => {
    const authorization = authorizeSession(req);
    if (isSessionAuthorizationFailure(authorization)) {
      return res.status(authorization.status).json({ error: authorization.error });
    }

    let sessionExpiresAt: string | null = null;
    if (authorization.source === "session") {
      const refreshed = refreshSession({
        accountId: authorization.accountId,
        email: authorization.email,
        nickname: authorization.nickname,
        displayName: authorization.displayName,
        allowedWorkspaces: authorization.allowedWorkspaces,
      });
      setAuthCookie(res, refreshed.cookie);
      sessionExpiresAt = refreshed.expiresAt;
    }

    return res.json({
      ok: true,
      user: {
        accountId: authorization.accountId,
        email: authorization.email,
        nickname: authorization.nickname,
        displayName: authorization.displayName,
        allowedWorkspaces: authorization.allowedWorkspaces,
        source: authorization.source,
      },
      sessionExpiresAt,
    });
  });

  app.get("/api/auth", (req, res, next) => {
    if (req.query?.mode !== "me") {
      return next();
    }

    const authorization = authorizeSession(req);
    if (isSessionAuthorizationFailure(authorization)) {
      return res.status(authorization.status).json({ error: authorization.error });
    }

    let sessionExpiresAt: string | null = null;
    if (authorization.source === "session") {
      const refreshed = refreshSession({
        accountId: authorization.accountId,
        email: authorization.email,
        nickname: authorization.nickname,
        displayName: authorization.displayName,
        allowedWorkspaces: authorization.allowedWorkspaces,
      });
      setAuthCookie(res, refreshed.cookie);
      sessionExpiresAt = refreshed.expiresAt;
    }

    return res.json({
      ok: true,
      user: {
        accountId: authorization.accountId,
        email: authorization.email,
        nickname: authorization.nickname,
        displayName: authorization.displayName,
        allowedWorkspaces: authorization.allowedWorkspaces,
        source: authorization.source,
      },
      sessionExpiresAt,
    });
  });

  app.post("/api/auth-logout", (_req, res) => {
    setAuthCookie(res, clearSessionCookie());
    return res.json({ ok: true });
  });

  app.post("/api/auth", (req, res, next) => {
    if (req.query?.mode !== "logout") {
      return next();
    }

    setAuthCookie(res, clearSessionCookie());
    return res.json({ ok: true });
  });

  app.use("/api", (req, res, next) => {
    if (
      req.path === "/auth"
      || req.path === "/auth-start"
      || req.path === "/auth-complete"
      || req.path === "/auth-me"
      || req.path === "/auth-logout"
    ) {
      return next();
    }

    const authorization = authorizeRequest(req);

    if (!authorization.ok) {
      return res.status(authorization.status).json({ error: authorization.error });
    }

    return next();
  });

  app.get("/api/open-day-catalog", (_req, res) => {
    return res.json(handleOpenDayCatalog());
  });

  app.get("/api/open-day-analyses", async (req, res) => {
    try {
      if (isOpenDaySnapshotDetailQuery(req.query)) {
        const payload = await handleOpenDaySnapshotGet(req.query);
        return res.json(payload);
      }

      const payload = await handleOpenDaySnapshotList(req.query);
      return res.json(payload);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "开放日历史查询失败" });
    }
  });

  app.get("/api/open-day-scenarios", async (req, res) => {
    try {
      if (isOpenDayScenarioVersionQuery(req.query)) {
        const payload = await handleOpenDayScenarioVersionList(req.query);
        return res.json(payload);
      }

      if (hasQueryValue(req.query, "id")) {
        const payload = await handleOpenDayScenarioGet(req.query);
        return res.json(payload);
      }

      const payload = await handleOpenDayScenarioList(req.query);
      return res.json(payload);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "开放日方案查询失败" });
    }
  });

  app.post("/api/open-day-scenarios", async (req, res) => {
    try {
      const payload = await handleOpenDayScenarioSave(req.body);
      return res.json(payload);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "开放日方案保存失败" });
    }
  });

  app.delete("/api/open-day-scenarios", async (req, res) => {
    try {
      const payload = await handleOpenDayScenarioDelete(req.query);
      return res.json(payload);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "开放日方案删除失败" });
    }
  });

  app.post("/api/parse-workbook", async (req, res) => {
    try {
      const { fields, files } = await parseMultipartUpload(req);
      const file = Array.isArray(files.file) ? files.file[0] : files.file;

      if (!file?.filepath) {
        return res.status(400).send("缺少 Excel 文件。");
      }

      const buffer = await fs.readFile(file.filepath);
      const payload = await handleOpenDayWorkbookParse({
        buffer,
        requestedSheet: getFirstFieldValue(fields.sheet),
        originalFilename: file.originalFilename || file.newFilename || "开放日工作簿.xlsx",
        contentType: file.mimetype || "",
        persistArtifact: !getFirstFieldValue(fields.sheet),
      });
      return res.json(payload);
    } catch (error) {
      return res.status(400).send(error instanceof Error ? error.message : "Excel 解析失败");
    }
  });

  app.post("/api/open-day-analyses", async (req, res) => {
    try {
      const payload = await handleOpenDayScore(req.body);
      return res.json(payload);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "开放日测算失败" });
    }
  });

  app.post("/api/open-day-disambiguate", async (req, res) => {
    await openDayDisambiguationHandler(req, res);
  });

  app.get("/api/maintainer-runs", async (req, res) => {
    try {
      const authorization = authorizeRequest(req, "selling-houses");
      if (!authorization.ok) {
        return res.status(authorization.status).json({ error: authorization.error });
      }
      const identity = buildMaintainerRunIdentityContext(authorization);

      if (isMaintainerLeaderboardDetailQuery(req.query)) {
        const payload = await handleMaintainerLeaderboardDetail(req.query);
        return res.json(payload);
      }

      if (isMaintainerLeaderboardQuery(req.query)) {
        const payload = await handleMaintainerLeaderboardList(req.query);
        return res.json(payload);
      }

      if (hasQueryValue(req.query, "id")) {
        const payload = await handleMaintainerRunGet(req.query, identity);
        return res.json(payload);
      }

      const payload = await handleMaintainerRunList(req.query, identity);
      return res.json(payload);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "云端存档查询失败" });
    }
  });

  app.post("/api/maintainer-runs", async (req, res) => {
    try {
      const authorization = authorizeRequest(req, "selling-houses");
      if (!authorization.ok) {
        return res.status(authorization.status).json({ error: authorization.error });
      }

      const payload = await handleMaintainerRunCreate(req.body, buildMaintainerRunIdentityContext(authorization));
      return res.json(payload);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "云端存档创建失败" });
    }
  });

  app.put("/api/maintainer-runs", async (req, res) => {
    try {
      const authorization = authorizeRequest(req, "selling-houses");
      if (!authorization.ok) {
        return res.status(authorization.status).json({ error: authorization.error });
      }

      const payload = await handleMaintainerRunSave(req.body, buildMaintainerRunIdentityContext(authorization));
      return res.json(payload);
    } catch (error) {
      if (isMaintainerSyncConflictError(error)) {
        return res.status(409).json({ error: error.message, latest: error.latest });
      }

      return res.status(400).json({ error: error instanceof Error ? error.message : "云端存档保存失败" });
    }
  });

  app.get("/api/selling-houses-scenarios", async (req, res) => {
    try {
      if (hasQueryValue(req.query, "id")) {
        const payload = await handleSellingHousesScenarioGet(req.query || {});
        return res.json(payload);
      }

      const payload = await handleSellingHousesScenarioList(req.query || {});
      return res.json(payload);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "剧本查询失败" });
    }
  });

  app.get("/api/compare", (_req, res) => {
    res.json({ models: AVAILABLE_MODELS });
  });

  app.post("/api/compare", async (req, res) => {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    const streamRequested = isStreamRequested(req.query, req.body);

    if (streamRequested) {
      const modelId = typeof req.body?.modelId === "string" ? req.body.modelId.trim() : "";

      if (!prompt || !modelId) {
        return res.status(400).json({ error: "Invalid request parameters" });
      }

      const controller = new AbortController();
      req.on("close", () => controller.abort());

      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      const writeEvent = (payload: Record<string, unknown> | "[DONE]") => {
        if (res.writableEnded) {
          return;
        }

        const data = payload === "[DONE]" ? payload : JSON.stringify(payload);
        res.write(`data: ${data}\n\n`);
      };

      try {
        const result = await streamCompareModel(prompt, modelId, {
          signal: controller.signal,
          onDelta: async (delta, channel) => {
            writeEvent({ type: "delta", delta, channel });
          },
        });

        if (!controller.signal.aborted) {
          if (result.status === "completed") {
            writeEvent({ type: "completed", result: result.result, reasoning: result.reasoning });
          } else {
            writeEvent({ type: "error", error: result.result, reasoning: result.reasoning });
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          writeEvent({
            type: "error",
            error: error instanceof Error ? error.message : "流式比较失败。",
          });
        }
      } finally {
        if (!res.writableEnded) {
          writeEvent("[DONE]");
          res.end();
        }
      }

      return;
    }

    const models = Array.isArray(req.body?.models) ? req.body.models : [];

    if (!prompt || models.length === 0) {
      return res.status(400).json({ error: "Invalid request parameters" });
    }

    const results = await compareModels(prompt, models);
    res.json({ results });
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server,
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  let currentPort = preferredPort;
  const maxPortAttempts = 10;

  await new Promise<void>((resolve, reject) => {
    const tryListen = () => {
      const onListening = () => {
        server.off("error", onError);
        console.log(`Server running on http://localhost:${currentPort}`);
        if (currentPort !== preferredPort) {
          console.log(`Port ${preferredPort} is busy, auto-fallback to ${currentPort}.`);
        }
        resolve();
      };

      const onError = (error: NodeJS.ErrnoException) => {
        server.off("listening", onListening);

        if (error.code === "EADDRINUSE" && currentPort < preferredPort + maxPortAttempts) {
          currentPort += 1;
          tryListen();
          return;
        }

        reject(error);
      };

      server.once("listening", onListening);
      server.once("error", onError);
      server.listen(currentPort, "0.0.0.0");
    };

    tryListen();
  });
}

startServer();
