import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Upload,
  X,
} from "lucide-react";
import {
  asTableRows,
  getFileStem,
  toCsvString,
  toJsonString,
  type ExtractionResult,
} from "./lib/extractor";

interface ExtractResponse {
  filename: string;
  pageCount: number;
  charCount: number;
  truncated: boolean;
  result: ExtractionResult;
}

export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [modelInput, setModelInput] = useState("gemini-4-hydrogen");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fieldsRaw, setFieldsRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fileStats, setFileStats] = useState<{
    filename: string;
    pageCount: number;
    charCount: number;
    truncated: boolean;
  } | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [jsonExpanded, setJsonExpanded] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { defaultModel?: string } | null) => {
        if (data?.defaultModel) {
          setModelInput(data.defaultModel);
        }
      })
      .catch(() => {
        // Keep default model fallback
      });
  }, []);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (file) {
      setSelectedFile(file);
      setWarningMsg(null);
      setErrorMsg(null);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    if (file) {
      if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
        setErrorMsg("Envie apenas arquivos no formato PDF.");
        return;
      }
      setSelectedFile(file);
      setWarningMsg(null);
      setErrorMsg(null);
    }
  }

  function handleClearFile() {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleExtract() {
    setWarningMsg(null);
    setErrorMsg(null);

    if (!selectedFile) {
      setWarningMsg("Envie um arquivo PDF.");
      return;
    }

    if (selectedFile.size > 25 * 1024 * 1024) {
      setErrorMsg("O arquivo PDF excede o limite de 25 MB.");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("pdf", selectedFile);
      formData.append("fields", fieldsRaw);
      formData.append("model", modelInput.trim());

      const response = await fetch("/api/extract", {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      });

      const rawText = await response.text();
      let payload: (Partial<ExtractResponse> & { error?: string }) | null = null;
      if (rawText) {
        try {
          payload = JSON.parse(rawText) as Partial<ExtractResponse> & {
            error?: string;
          };
        } catch {
          payload = null;
        }
      }

      if (!response.ok) {
        if (payload?.error) {
          setErrorMsg(payload.error);
        } else if (response.status === 413) {
          setErrorMsg("O arquivo PDF excede o limite de tamanho permitido pelo servidor.");
        } else if (response.status === 502 || response.status === 503 || response.status === 504) {
          setErrorMsg("O servidor ainda está iniciando ou demorou para responder. Tente novamente em alguns segundos.");
        } else {
          setErrorMsg(`Erro no servidor (HTTP ${response.status}). Tente novamente.`);
        }
        return;
      }

      if (!payload) {
        setErrorMsg("Resposta inválida do servidor ao processar o PDF.");
        return;
      }

      if (payload.result && payload.filename !== undefined) {
        setFileStats({
          filename: payload.filename,
          pageCount: payload.pageCount ?? 0,
          charCount: payload.charCount ?? 0,
          truncated: Boolean(payload.truncated),
        });
        setResult(payload.result);
      }
    } catch (err) {
      const detail = err instanceof Error && err.message ? ` (${err.message})` : "";
      setErrorMsg(`Falha de conexão com o servidor ao extrair as informações${detail}.`);
    } finally {
      setLoading(false);
    }
  }

  function downloadTextFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const stem = fileStats ? getFileStem(fileStats.filename) : "extracao";
  const tableRows = result ? asTableRows(result) : [];

  return (
    <div className="min-h-screen flex bg-white text-[#31333f] font-sans">
      {sidebarOpen && (
        <aside className="w-72 shrink-0 bg-[#f0f2f6] border-r border-[#e6eaf1] p-6 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#31333f]">Gemini</h2>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 rounded-md text-[#555867] hover:bg-[#e2e6ee] transition-colors"
              aria-label="Recolher barra lateral"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="model-input"
              className="text-sm font-medium text-[#31333f]"
            >
              Modelo
            </label>
            <input
              id="model-input"
              type="text"
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              className="w-full rounded-lg border border-[#d3d8e2] bg-white px-3 py-2 text-sm text-[#31333f] focus:outline-none focus:border-[#ff4b4b]"
            />
            <p className="text-xs text-[#555867] leading-relaxed">
              Mantenha gemini-4-hydrogen para usar a cota gratuita.
            </p>
          </div>
        </aside>
      )}

      <main className="flex-1 min-w-0 px-6 py-8 md:px-12 lg:px-16 max-w-5xl mx-auto">
        {!sidebarOpen && (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="mb-4 inline-flex items-center gap-1.5 rounded-md border border-[#d3d8e2] bg-[#f0f2f6] px-2.5 py-1.5 text-xs font-medium text-[#31333f] hover:bg-[#e4e8f0] transition-colors"
          >
            <PanelLeftOpen className="w-4 h-4" />
            Configurações Gemini
          </button>
        )}

        <header className="mb-6">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#31333f]">
            PDF AI Extractor
          </h1>
          <p className="mt-2 text-sm text-[#555867]">
            Envie um PDF com texto, diga quais campos quer e receba um JSON validado.
            A leitura do arquivo é local. A IA usa a cota gratuita do Google Gemini.
          </p>
        </header>

        <section className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-[#31333f] mb-1.5">
              PDF
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-lg border border-dashed px-4 py-5 transition-colors flex items-center justify-between gap-4 ${
                isDragging
                  ? "border-[#ff4b4b] bg-[#fff5f5]"
                  : "border-[#d3d8e2] bg-[#f0f2f6] hover:border-[#b7becb]"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Upload className="w-5 h-5 shrink-0 text-[#555867]" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#31333f] truncate">
                    {selectedFile
                      ? selectedFile.name
                      : "Arraste e solte o arquivo PDF aqui"}
                  </p>
                  <p className="text-xs text-[#555867]">
                    {selectedFile
                      ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                      : "Limite 25MB • Apenas arquivos .pdf"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {selectedFile && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClearFile();
                    }}
                    className="p-1.5 rounded-md text-[#555867] hover:bg-[#e1e5ed]"
                    aria-label="Remover arquivo"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <span className="rounded-md border border-[#d3d8e2] bg-white px-3 py-1.5 text-xs font-medium text-[#31333f]">
                  Selecionar arquivo
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="fields-textarea"
              className="block text-sm font-medium text-[#31333f] mb-1.5"
            >
              Campos para extrair
            </label>
            <textarea
              id="fields-textarea"
              rows={7}
              value={fieldsRaw}
              onChange={(e) => setFieldsRaw(e.target.value)}
              placeholder={
                "nome: nome completo da pessoa\ncpf\ndata\nvalor: valor total em reais"
              }
              className="w-full rounded-lg border border-[#d3d8e2] bg-[#f0f2f6] px-3.5 py-2.5 text-sm text-[#31333f] placeholder-[#808495] focus:bg-white focus:outline-none focus:border-[#ff4b4b]"
            />
            <p className="mt-1 text-xs text-[#555867]">
              Um campo por linha. Opcionalmente, escreva nome: descrição para
              orientar a extração.
            </p>
          </div>

          <div>
            <button
              type="button"
              onClick={handleExtract}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-[#ff4b4b] px-4 py-2 text-sm font-medium text-white hover:bg-[#ff3333] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading
                ? "Lendo o texto e consultando o Gemini..."
                : "Extrair informações"}
            </button>
          </div>

          {warningMsg && (
            <div className="rounded-lg border border-[#f5d061] bg-[#fff8dc] px-4 py-3 text-sm text-[#7a5a00]">
              {warningMsg}
            </div>
          )}

          {errorMsg && (
            <div className="rounded-lg border border-[#f5a3a3] bg-[#ffecec] px-4 py-3 text-sm text-[#8a1f1f]">
              {errorMsg}
            </div>
          )}

          {fileStats && (
            <div className="space-y-2">
              {fileStats.truncated && (
                <div className="rounded-lg border border-[#f5d061] bg-[#fff8dc] px-4 py-3 text-sm text-[#7a5a00]">
                  O texto foi limitado a {fileStats.charCount} caracteres para caber
                  na cota gratuita.
                </div>
              )}
              <p className="text-sm text-[#31333f] flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#555867]" />
                <span>
                  <strong>{fileStats.filename}</strong> — {fileStats.pageCount}{" "}
                  página(s), {fileStats.charCount} caracteres de texto.
                </span>
              </p>
            </div>
          )}
        </section>

        {result && (
          <section className="mt-8 pt-6 border-t border-[#e6eaf1] space-y-4">
            <h2 className="text-xl font-semibold text-[#31333f]">Resultado</h2>

            <div className="overflow-x-auto rounded-lg border border-[#e6eaf1]">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-[#f0f2f6] border-b border-[#e6eaf1]">
                    <th className="px-4 py-2.5 font-semibold text-[#31333f] w-1/3">
                      Campo
                    </th>
                    <th className="px-4 py-2.5 font-semibold text-[#31333f]">
                      Valor
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => (
                    <tr
                      key={row.campo}
                      className="border-b last:border-b-0 border-[#e6eaf1] hover:bg-[#fafbfc]"
                    >
                      <td className="px-4 py-2.5 font-medium text-[#31333f]">
                        {row.campo}
                      </td>
                      <td className="px-4 py-2.5 text-[#31333f]">
                        {row.valor || (
                          <span className="italic text-[#808495]">null</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(
                    toJsonString(result),
                    `${stem}.json`,
                    "application/json"
                  )
                }
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#d3d8e2] bg-white px-4 py-2 text-sm font-medium text-[#31333f] hover:bg-[#f0f2f6] transition-colors"
              >
                <Download className="w-4 h-4" />
                Baixar JSON
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(
                    toCsvString(result),
                    `${stem}.csv`,
                    "text/csv;charset=utf-8"
                  )
                }
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#d3d8e2] bg-white px-4 py-2 text-sm font-medium text-[#31333f] hover:bg-[#f0f2f6] transition-colors"
              >
                <Download className="w-4 h-4" />
                Baixar CSV
              </button>
            </div>

            <div className="rounded-lg border border-[#e6eaf1]">
              <button
                type="button"
                onClick={() => setJsonExpanded((prev) => !prev)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#31333f] bg-[#f9fafb] hover:bg-[#f0f2f6] rounded-lg transition-colors"
              >
                {jsonExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                JSON
              </button>
              {jsonExpanded && (
                <pre className="p-4 text-xs overflow-x-auto bg-white border-t border-[#e6eaf1] rounded-b-lg text-[#31333f]">
                  {toJsonString(result)}
                </pre>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
