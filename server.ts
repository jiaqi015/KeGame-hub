import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- Domain & Infrastructure (DDD Lite) ---
  
  // Infrastructure: Gemini Adapter
  const callGemini = async (prompt: string, modelName: string) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
      });
      return response.text;
    } catch (error: any) {
      console.error(`Gemini Error (${modelName}):`, error);
      return `Error: ${error.message || "Failed to fetch result"}`;
    }
  };

  // Application Service: Orchestrator
  app.post("/api/compare", async (req, res) => {
    const { prompt, models } = req.body;

    if (!prompt || !models || !Array.isArray(models)) {
      return res.status(400).json({ error: "Invalid request parameters" });
    }

    // In a real DDD app, this would be handled by a Domain Service
    const tasks = models.map(async (modelId: string) => {
      let result = "";
      
      // Route to appropriate adapter based on model ID
      if (modelId.startsWith("gemini")) {
        result = await callGemini(prompt, modelId);
      } else {
        // Mocking other providers for the demo structure
        await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 2000));
        result = `[Demo Mode] This is a simulated response for ${modelId}. To enable real results, add the ${modelId.split('-')[0].toUpperCase()} adapter and API key in server.ts.`;
      }

      return { modelId, result };
    });

    const results = await Promise.all(tasks);
    res.json({ results });
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
