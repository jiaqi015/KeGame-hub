import express from "express";
import fs from "node:fs/promises";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import formidable from "formidable";
import { authorizeRequest, validateActivationKey } from "./lib/activation.js";
import { compareModels, streamCompareModel } from "./lib/compare.js";
import { AVAILABLE_MODELS } from "./lib/models.js";
import { parseWorkbookBuffer } from "./lib/openDayWorkbook.js";

dotenv.config();

function parseMultipart(req: Parameters<typeof formidable>[0]) {
  const form = formidable({ multiples: false, maxFiles: 1 });

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
  const PORT = 3000;

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

  app.post("/api/parse-workbook", async (req, res) => {
    try {
      const { fields, files } = await parseMultipart(req);
      const file = Array.isArray(files.file) ? files.file[0] : files.file;

      if (!file?.filepath) {
        return res.status(400).send("缺少 Excel 文件。");
      }

      const buffer = await fs.readFile(file.filepath);
      const payload = parseWorkbookBuffer(buffer, getFirstFieldValue(fields.sheet));
      return res.json(payload);
    } catch (error) {
      return res.status(400).send(error instanceof Error ? error.message : "Excel 解析失败");
    }
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
      server: { middlewareMode: true },
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
