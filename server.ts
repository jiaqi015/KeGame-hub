import express from "express";
import fs from "node:fs/promises";
import http from "node:http";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import formidable from "formidable";
import { authorizeRequest, validateActivationKey } from "./lib/activation.js";
import { compareModels, streamCompareModel } from "./lib/compare.js";
import { AVAILABLE_MODELS } from "./lib/models.js";
import { ensureRuntimeTempDir } from "./lib/runtimeTemp.js";
import { handleOpenDayCatalog } from "./modules/open-day/interfaces/http/openDayCatalogHandler.js";
import { handleOpenDaySnapshotGet } from "./modules/open-day/interfaces/http/openDaySnapshotGetHandler.js";
import { handleOpenDayWorkbookParse } from "./modules/open-day/interfaces/http/openDayWorkbookParseHandler.js";
import { handleOpenDayScenarioGet } from "./modules/open-day/interfaces/http/openDayScenarioGetHandler.js";
import { handleOpenDayScenarioList } from "./modules/open-day/interfaces/http/openDayScenarioListHandler.js";
import { handleOpenDayScenarioSave } from "./modules/open-day/interfaces/http/openDayScenarioSaveHandler.js";
import { handleOpenDaySnapshotList } from "./modules/open-day/interfaces/http/openDaySnapshotListHandler.js";
import { handleOpenDayScore } from "./modules/open-day/interfaces/http/openDayScoreHandler.js";
import { openDayDisambiguationHandler } from "./modules/open-day/interfaces/http/openDayDisambiguationHandler.js";

dotenv.config();

async function parseMultipart(req: Parameters<typeof formidable>[0]) {
  const uploadDir = await ensureRuntimeTempDir("uploads");
  const form = formidable({
    multiples: false,
    maxFiles: 1,
    uploadDir,
  });

  return new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
    form.parse(req, (error, fields, files) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ fields, files });
    });
  });
}

function getFirstFieldValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0].trim() : "";
  }

  return typeof value === "string" ? value.trim() : "";
}

async function startServer() {
  const app = express();
  const preferredPort = Number(process.env.PORT || 3000);
  const hmrPort = Number(process.env.VITE_HMR_PORT || 24700);

  app.use(express.json());

  app.post("/api/activate", (req, res) => {
    const key = typeof req.body?.key === "string" ? req.body.key.trim() : "";
    const validation = validateActivationKey(key);

    if (!validation.ok) {
      return res.status(validation.status).json({ error: validation.error });
    }

    return res.json({ ok: true });
  });

  app.use("/api", (req, res, next) => {
    if (req.path === "/activate") {
      return next();
    }

    const authorization = authorizeRequest(req);

    if (!authorization.ok) {
      return res.status(authorization.status).json({ error: authorization.error });
    }

    return next();
  });

  app.get("/api/models", (_req, res) => {
    res.json({ models: AVAILABLE_MODELS });
  });

  app.get("/api/open-day-catalog", (_req, res) => {
    return res.json(handleOpenDayCatalog());
  });

  app.get("/api/open-day-analyses", async (req, res) => {
    try {
      if (typeof req.query?.id === "string" && req.query.id) {
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
      if (typeof req.query?.id === "string" && req.query.id) {
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

  app.post("/api/parse-workbook", async (req, res) => {
    try {
      const { fields, files } = await parseMultipart(req);
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

  app.post("/api/open-day-score", async (req, res) => {
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

  app.post("/api/compare", async (req, res) => {
    const { prompt, models } = req.body;

    if (!prompt || !models || !Array.isArray(models)) {
      return res.status(400).json({ error: "Invalid request parameters" });
    }

    const results = await compareModels(prompt, models);
    res.json({ results });
  });

  app.post("/api/compare-stream", async (req, res) => {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
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
        onDelta: async (delta) => {
          writeEvent({ type: "delta", delta });
        },
      });

      if (!controller.signal.aborted) {
        if (result.status === "completed") {
          writeEvent({ type: "completed", result: result.result });
        } else {
          writeEvent({ type: "error", error: result.result });
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
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          port: hmrPort,
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

  const server = http.createServer(app);
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
