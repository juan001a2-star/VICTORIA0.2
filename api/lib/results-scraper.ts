/**
 * Scraper de resultados de loterías para Banca Victoria.
 *
 * Fuente principal: loterias.do (HTML estático / semi-estático).
 * Fallback: nacionalloteria.com y estructuras genéricas.
 *
 * NO guarda nada automáticamente. Solo obtiene números para vista previa.
 * El admin/supervisor debe confirmar antes de importar vía winner.create.
 */

export type ScrapedResult = {
  /** Nombre de lotería tal como aparece en el sistema (seed) */
  systemName: string;
  /** Nombre detectado en la fuente externa */
  sourceName: string;
  firstPrize: string;
  secondPrize: string;
  thirdPrize: string;
  /** YYYY-MM-DD */
  date: string;
  source: string;
  confidence: "high" | "medium" | "low";
};

/** Mapeo: nombre en el sistema → posibles nombres/aliases en fuentes externas */
export const LOTTERY_ALIASES: Record<string, string[]> = {
  "Gana Mas": ["gana mas", "gana más", "nacional gana mas", "juega mas pega mas"],
  Nacional: ["nacional", "loteria nacional", "lotería nacional", "nacional noche"],
  "Leídsa": ["leidsa", "leídsa", "quiniela pale", "quiniela palé", "pega 3 mas", "pega 3 más"],
  "Real Dia": ["real dia", "real día", "quiniela real", "loteria real dia"],
  "Real Noche": ["real noche", "quiniela real noche"],
  "Florida Dia": ["florida dia", "florida día", "florida mid-day", "florida midday"],
  "Florida Noche": ["florida noche", "florida evening", "florida night"],
  "New Jersey Dia": ["new jersey dia", "new jersey día", "nj mid-day", "jersey mid"],
  "New Jersey Noche": ["new jersey noche", "nj evening", "jersey evening"],
  "Georgia Dia": ["georgia dia", "georgia día", "georgia mid-day"],
  "Georgia Tarde": ["georgia tarde", "georgia evening", "georgia night"],
  "Primera Día": ["primera dia", "primera día", "la primera dia", "quiniela la primera"],
  "Primera Noche": ["primera noche", "la primera noche"],
  "La Suerte Día": ["la suerte dia", "la suerte día", "suerte dia"],
  "La Suerte Tarde": ["la suerte tarde", "suerte tarde", "suerte noche"],
  "LoteDom Día": ["lotedom dia", "lotedom día", "lote dom dia"],
  "LoteDom Noche": ["lotedom noche", "lote dom noche"],
  "Anguila 9:00 AM": ["anguila 9", "anguila 09", "anguilla 9"],
  "Anguila 10:00 AM": ["anguila 10", "anguilla 10"],
  "Anguila 13:00": ["anguila 13", "anguila 1:00", "anguilla 13"],
  "Anguila 21:00": ["anguila 21", "anguila 9:00 pm", "anguilla 21"],
  "Haití 9:30 AM": ["haiti 9", "haití 9", "haiti 09"],
  "Haití 19:30": ["haiti 19", "haití 19", "haiti noche"],
  "Loteka Día": ["loteka dia", "loteka día", "quiniela loteka"],
  "Loteka Noche": ["loteka noche"],
  "King Día": ["king dia", "king día", "king lottery dia"],
  "King Noche": ["king noche", "king lottery noche"],
};

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pad2(n: string): string {
  const digits = n.replace(/\D/g, "");
  if (!digits) return "";
  return digits.padStart(2, "0").slice(-2);
}

function matchSystemName(sourceLabel: string): string | null {
  const n = normalize(sourceLabel);
  for (const [systemName, aliases] of Object.entries(LOTTERY_ALIASES)) {
    if (aliases.some((a) => n.includes(a) || a.includes(n))) return systemName;
    if (n === normalize(systemName)) return systemName;
  }
  return null;
}

function todayISO(): string {
  const d = new Date();
  // America/Santo_Domingo ≈ UTC-4
  const local = new Date(d.getTime() - 4 * 60 * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function parseDateFromText(text: string): string | null {
  // dd-mm-yyyy or dd/mm/yyyy
  const m1 = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m1) {
    const [, dd, mm, yyyy] = m1;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  // yyyy-mm-dd
  const m2 = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return m2[0];
  return null;
}

/** Extrae trios de números (00-99) de un bloque de texto */
function extractTriple(text: string): [string, string, string] | null {
  const nums = text.match(/\b\d{1,2}\b/g);
  if (!nums || nums.length < 3) return null;
  const a = pad2(nums[0]);
  const b = pad2(nums[1]);
  const c = pad2(nums[2]);
  if (!a || !b || !c) return null;
  return [a, b, c];
}

/**
 * Parseo genérico de HTML: busca secciones con nombres de lotería
 * y los 3 números siguientes.
 */
function parseGenericHtml(html: string, sourceUrl: string): ScrapedResult[] {
  const results: ScrapedResult[] = [];
  const date = parseDateFromText(html) || todayISO();

  // Quitar scripts/styles
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");

  // Buscar por cada alias conocido
  for (const [systemName, aliases] of Object.entries(LOTTERY_ALIASES)) {
    for (const alias of aliases) {
      const re = new RegExp(
        `${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^0-9]{0,40}(\\d{1,2})\\D{1,8}(\\d{1,2})\\D{1,8}(\\d{1,2})`,
        "i"
      );
      const m = clean.match(re);
      if (m) {
        const first = pad2(m[1]);
        const second = pad2(m[2]);
        const third = pad2(m[3]);
        if (first && second && third) {
          // Evitar duplicados del mismo systemName
          if (!results.some((r) => r.systemName === systemName)) {
            results.push({
              systemName,
              sourceName: alias,
              firstPrize: first,
              secondPrize: second,
              thirdPrize: third,
              date,
              source: sourceUrl,
              confidence: "medium",
            });
          }
          break;
        }
      }
    }
  }

  return results;
}

async function fetchText(url: string, timeoutMs = 12000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; BancaVictoria/1.0; +results-preview)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

const SOURCES = [
  "https://loterias.do/",
  "https://loterias.do/leidsa/",
  "https://www.nacionalloteria.com/republica-dominicana/resultados-leidsa.php",
];

/**
 * Obtiene resultados de todas las fuentes configuradas.
 * Nunca lanza si una fuente falla; acumula lo que pueda.
 */
export async function scrapeAllResults(opts?: {
  date?: string;
  onlySystemNames?: string[];
}): Promise<{ results: ScrapedResult[]; errors: string[]; scrapedAt: string }> {
  const errors: string[] = [];
  const bySystem = new Map<string, ScrapedResult>();

  for (const url of SOURCES) {
    try {
      const html = await fetchText(url);
      const parsed = parseGenericHtml(html, url);
      for (const r of parsed) {
        if (opts?.onlySystemNames && !opts.onlySystemNames.includes(r.systemName)) continue;
        // Preferir primera aparición (fuentes en orden de prioridad)
        if (!bySystem.has(r.systemName)) {
          if (opts?.date) r.date = opts.date;
          bySystem.set(r.systemName, r);
        }
      }
    } catch (e: any) {
      errors.push(`${url}: ${e?.message || String(e)}`);
    }
  }

  // Si faltan loterías críticas y está instalado Playwright, intentar JS-render
  const missingCritical = (opts?.onlySystemNames || Object.keys(LOTTERY_ALIASES)).filter(
    (n) => !bySystem.has(n) && /leidsa|nacional|loteka|real|gana/i.test(n)
  );
  if (missingCritical.length > 0) {
    try {
      const pw = await scrapeWithPlaywrightOptional(missingCritical);
      for (const r of pw.results) {
        if (!bySystem.has(r.systemName)) bySystem.set(r.systemName, r);
      }
      errors.push(...pw.errors);
    } catch (e: any) {
      errors.push(`playwright: ${e?.message || String(e)}`);
    }
  }

  return {
    results: Array.from(bySystem.values()),
    errors,
    scrapedAt: new Date().toISOString(),
  };
}

/**
 * Playwright opcional: solo si está instalado `playwright` en node_modules.
 * No es dependencia obligatoria; si no está, se ignora en silencio.
 */
async function scrapeWithPlaywrightOptional(
  systemNames: string[]
): Promise<{ results: ScrapedResult[]; errors: string[] }> {
  const errors: string[] = [];
  const results: ScrapedResult[] = [];
  let playwright: any;
  try {
    // @ts-ignore optional dependency
    playwright = await import("playwright");
  } catch {
    return { results, errors: ["Playwright no instalado (opcional). Usa: npm i playwright && npx playwright install chromium"] };
  }

  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const urls = ["https://loterias.do/", "https://www.leidsa.com/"];
    for (const url of urls) {
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
        await page.waitForTimeout(1500);
        const html = await page.content();
        const parsed = parseGenericHtml(html, url + "#pw");
        for (const r of parsed) {
          if (systemNames.length && !systemNames.includes(r.systemName)) continue;
          if (!results.some((x) => x.systemName === r.systemName)) {
            results.push({ ...r, confidence: "high", source: url + " (playwright)" });
          }
        }
      } catch (e: any) {
        errors.push(`pw ${url}: ${e?.message || String(e)}`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return { results, errors };
}

/**
 * Vista previa manual: el operador puede pegar 3 números por lotería
 * (útil cuando el scraper no encuentra algo).
 */
export function buildManualPreview(

  items: Array<{ systemName: string; first: string; second: string; third: string; date?: string }>
): ScrapedResult[] {
  const date = todayISO();
  return items
    .map((it) => {
      const first = pad2(it.first);
      const second = pad2(it.second);
      const third = pad2(it.third);
      if (!first || !second || !third) return null;
      return {
        systemName: it.systemName,
        sourceName: "manual",
        firstPrize: first,
        secondPrize: second,
        thirdPrize: third,
        date: it.date || date,
        source: "manual",
        confidence: "high" as const,
      };
    })
    .filter(Boolean) as ScrapedResult[];
}

export { matchSystemName, todayISO, pad2 };
