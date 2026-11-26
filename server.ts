import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import { extractText } from "unpdf";
import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { parseFields, type ExtractionResult } from "./src/lib/extractor.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENV_MODEL = process.env.GEMINI_MODEL?.trim();
const DEFAULT_MODEL =
  !ENV_MODEL || ENV_MODEL === "gemini-3.8-flash"
    ? "gemini-4-hydrogen"
    : ENV_MODEL;
const MAX_TEXT_CHARS = 120_000;
const PORT = Number(process.env.PORT) || 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "A chave GEMINI_API_KEY não está configurada no servidor. Configure-a em Settings > Secrets."
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const lower = rawMessage.toLowerCase();

  if (lower.includes("api_key_invalid") || lower.includes("permission_denied") || lower.includes("403")) {
    return {
      status: 400,
      message:
        "Chave da API do Gemini inválida ou sem permissão. Verifique GEMINI_API_KEY em Settings > Secrets.",
    };
  }
  if (lower.includes("resource_exhausted") || lower.includes("429")) {
    return {
      status: 429,
      message:
        "Limite de cota da API do Gemini atingido. Aguarde alguns instantes ou verifique o modelo configurado.",
    };
  }
  if (lower.includes("not_found") || lower.includes("404")) {
    return {
      status: 404,
      message: `Modelo não encontrado ou não suportado. Use "${DEFAULT_MODEL}".`,
    };
  }
  return {
    status: 500,
    message: `Erro ao consultar o Gemini: ${rawMessage}`,
  };
}

async function generateWithRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      const isTransient = msg.includes("503") || msg.includes("unavailable") || msg.includes("timeout");
      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get("/api/config", (_req, res) => {
    res.json({
      defaultModel: DEFAULT_MODEL,
    });
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/extract", (req, res, next) => {
    upload.single("pdf")(req, res, (uploadErr: unknown) => {
      if (uploadErr) {
        if (uploadErr instanceof multer.MulterError && uploadErr.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ error: "O arquivo PDF excede o limite de 25 MB." });
          return;
        }
        const msg = uploadErr instanceof Error ? uploadErr.message : "Erro ao receber o arquivo PDF.";
        res.status(400).json({ error: msg });
        return;
      }
      next();
    });
  }, async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "Envie um arquivo PDF." });
        return;
      }

      const isPdf =
        file.mimetype === "application/pdf" ||
        file.originalname.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        res.status(400).json({ error: "O arquivo enviado precisa ser um PDF válido." });
        return;
      }

      const fieldsRaw = typeof req.body?.fields === "string" ? req.body.fields : "";
      const specs = parseFields(fieldsRaw);

      const requestedModel =
        typeof req.body?.model === "string" && req.body.model.trim()
          ? req.body.model.trim()
          : DEFAULT_MODEL;

      let extractedText = "";
      let pageCount = 0;
      try {
        const pdfData = await extractText(new Uint8Array(file.buffer), {
          mergePages: true,
        });
        pageCount = pdfData.totalPages ?? 0;
        extractedText = (typeof pdfData.text === "string" ? pdfData.text : "").trim();
      } catch (pdfErr) {
        const detail = pdfErr instanceof Error ? pdfErr.message : String(pdfErr);
        res.status(400).json({
          error: `Não foi possível ler o arquivo PDF (${detail}).`,
        });
        return;
      }

      if (!extractedText) {
        res.status(400).json({
          error:
            "Nenhum texto selecionável foi encontrado no PDF. PDFs compostos apenas por imagens não são suportados nesta versão.",
        });
        return;
      }

      let truncated = false;
      let textForModel = extractedText;
      if (extractedText.length > MAX_TEXT_CHARS) {
        textForModel = extractedText.slice(0, MAX_TEXT_CHARS);
        truncated = true;
      }

      const ai = getGeminiClient();

      const properties: Record<string, Schema> = {};
      const fieldInstructions: string[] = [];
      for (const spec of specs) {
        properties[spec.name] = {
          type: Type.STRING,
          description:
            spec.description || `Valor correspondente ao campo "${spec.name}".`,
          nullable: true,
        };
        fieldInstructions.push(
          spec.description
            ? `- ${spec.name}: ${spec.description}`
            : `- ${spec.name}`
        );
      }

      const prompt = [
        "Extraia exatamente os campos solicitados a partir do texto do PDF abaixo.",
        "Se alguma informação não estiver presente no texto, retorne null para o campo correspondente.",
        "Não invente valores nem adicione campos extras.",
        "",
        "Campos solicitados:",
        ...fieldInstructions,
        "",
        "Texto do PDF:",
        textForModel,
      ].join("\n");

      let responseText: string | undefined;
      try {
        const response = await generateWithRetry(() =>
          ai.models.generateContent({
            model: requestedModel,
            contents: prompt,
            config: {
              systemInstruction:
                "Você é um extrator preciso de dados estruturados a partir de documentos PDF. " +
                "Responda apenas com JSON válido aderindo estritamente ao schema fornecido. " +
                "Use null quando um campo não existir no documento.",
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties,
                required: specs.map((s) => s.name),
              },
            },
          })
        );
        responseText = response.text;
      } catch (geminiErr) {
        const mapped = formatGeminiError(geminiErr);
        res.status(mapped.status).json({ error: mapped.message });
        return;
      }

      if (!responseText) {
        res.status(500).json({
          error: "O Gemini retornou uma resposta vazia. Tente novamente.",
        });
        return;
      }

      let parsedJson: Record<string, unknown>;
      try {
        parsedJson = JSON.parse(responseText) as Record<string, unknown>;
      } catch {
        res.status(500).json({
          error: "A resposta do Gemini não pôde ser interpretada como JSON válido.",
        });
        return;
      }

      const normalized: ExtractionResult = {};
      for (const spec of specs) {
        const val = parsedJson[spec.name];
        if (val === null || val === undefined) {
          normalized[spec.name] = null;
        } else if (typeof val === "string") {
          const trimmedVal = val.trim();
          normalized[spec.name] = trimmedVal === "" ? null : trimmedVal;
        } else {
          normalized[spec.name] = String(val);
        }
      }

      res.json({
        filename: file.originalname,
        pageCount,
        charCount: textForModel.length,
        truncated,
        result: normalized,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro inesperado ao processar o PDF.";
      res.status(400).json({ error: message });
    }
  });

  app.use(
    "/api",
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const message =
        err instanceof Error ? err.message : "Erro interno no servidor.";
      res.status(500).json({ error: message });
    }
  );

  if (process.env.NODE_ENV === "production") {
    const distDir = path.join(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`PDF AI Extractor listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
