export interface FieldSpec {
  name: string;
  description: string;
}

export interface TableRow {
  campo: string;
  valor: string;
}

export type ExtractionResult = Record<string, string | null>;

export function parseFields(raw: string): FieldSpec[] {
  const specs: FieldSpec[] = [];
  const seen = new Set<string>();

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const colonIndex = trimmed.indexOf(":");
    let name: string;
    let description: string;

    if (colonIndex !== -1) {
      name = trimmed.slice(0, colonIndex).trim();
      description = trimmed.slice(colonIndex + 1).trim();
    } else {
      name = trimmed;
      description = "";
    }

    if (!name) {
      throw new Error(`Linha inválida nos campos: "${trimmed}".`);
    }

    if (seen.has(name)) {
      throw new Error(`Campo duplicado: "${name}".`);
    }

    seen.add(name);
    specs.push({ name, description });
  }

  if (specs.length === 0) {
    throw new Error("Informe pelo menos um campo para extrair.");
  }

  return specs;
}

export function asTableRows(result: ExtractionResult): TableRow[] {
  return Object.entries(result).map(([campo, value]) => ({
    campo,
    valor: value === null || value === undefined ? "" : String(value),
  }));
}

export function toJsonString(result: ExtractionResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsvString(result: ExtractionResult): string {
  const lines = ["campo,valor"];
  for (const { campo, valor } of asTableRows(result)) {
    lines.push(`${escapeCsvCell(campo)},${escapeCsvCell(valor)}`);
  }
  return `${lines.join("\n")}\n`;
}

export function getFileStem(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const stem = base.replace(/\.[^.]+$/, "").trim();
  return stem || "extracao";
}
