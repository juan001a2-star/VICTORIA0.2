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
  "New York Tarde": ["new york tarde", "new york dia", "new york día", "ny midday", "new york midday", "new york mid-day"],
  "New York Noche": ["new york noche", "ny evening", "new york evening", "new york night"],
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
  // Fecha de operación del importador: República Dominicana.
  // Intl maneja correctamente el huso horario sin offsets fijos.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
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

const REFERENCE_HOME_URL = "https://www.conectate.com.do/";
const REFERENCE_LOTTERIES_URL = "https://www.conectate.com.do/loterias/";

const SOURCES = [
  "https://loterias.do/",
  "https://loterias.do/leidsa/",
  "https://www.nacionalloteria.com/republica-dominicana/resultados-leidsa.php",
  // Índice de resultados de Conectate; también descubre páginas individuales.
  REFERENCE_LOTTERIES_URL,
];

/** Extrae enlaces a páginas individuales de loterías desde el directorio Conectate. */
function extractConectateLotteryLinks(html: string): Array<{ systemName: string; url: string }> {
  const found = new Map<string, string>();
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(html))) {
    const href = match[1].replace(/&amp;/g, "&");
    const label = match[2].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").trim();
    let url: URL;
    try { url = new URL(href, REFERENCE_LOTTERIES_URL); } catch { continue; }
    if (!/(^|\.)conectate\.com\.do$/i.test(url.hostname)) continue;
    if (!url.pathname.toLowerCase().includes("loterias") && !url.hostname.toLowerCase().startsWith("loterias.")) continue;
    const systemName = matchSystemName(`${label} ${url.pathname.replace(/[\/-]+/g, " ")}`);
    if (!systemName || found.has(systemName)) continue;
    found.set(systemName, url.toString());
  }
  return Array.from(found, ([systemName, url]) => ({ systemName, url }));
}

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

  const conectateLinks: Array<{ systemName: string; url: string }> = [];
  for (const url of SOURCES) {
    try {
      const html = await fetchText(url);
      // El índice de Conectate sirve para descubrir enlaces, no para extraer
      // premios: sus horarios y textos podrían confundirse con números ganadores.
      const parsed = url === REFERENCE_LOTTERIES_URL ? [] : parseGenericHtml(html, url);
      for (const r of parsed) {
        if (opts?.onlySystemNames && !opts.onlySystemNames.includes(r.systemName)) continue;
        if (!bySystem.has(r.systemName)) {
          if (opts?.date) r.date = opts.date;
          bySystem.set(r.systemName, r);
        }
      }
      if (url === REFERENCE_LOTTERIES_URL) conectateLinks.push(...extractConectateLotteryLinks(html));
    } catch (e: any) {
      errors.push(`${url}: ${e?.message || String(e)}`);
    }
  }

  // La portada solo se usa para descubrir enlaces; no se parsea como resultados.
  try {
    const homeHtml = await fetchText(REFERENCE_HOME_URL);
    conectateLinks.push(...extractConectateLotteryLinks(homeHtml));
  } catch (e: any) {
    errors.push(`${REFERENCE_HOME_URL} (índice): ${e?.message || String(e)}`);
  }

  const uniqueConectateLinks = Array.from(new Map(conectateLinks.map((item) => [item.systemName, item])).values());
  for (const item of uniqueConectateLinks) {
    if (opts?.onlySystemNames && !opts.onlySystemNames.includes(item.systemName)) continue;
    if (bySystem.has(item.systemName)) continue;
    try {
      const html = await fetchText(item.url);
      const parsed = parseGenericHtml(html, item.url);
      const result = parsed.find((r) => r.systemName === item.systemName);
      if (result) {
        if (opts?.date) result.date = opts.date;
        bySystem.set(result.systemName, result);
      }
    } catch (e: any) {
      errors.push(`${item.systemName} (${item.url}): ${e?.message || String(e)}`);
    }
  }

  // Si quedan sorteos sin datos, intentar una segunda lectura con Chromium.
  // Esto no evita bloqueos del sitio: si Conectate responde 403 también al
  // navegador, se registra el error y el resultado permanece sin datos.
  const missingForBrowser = (opts?.onlySystemNames || Object.keys(LOTTERY_ALIASES)).filter(
    (n) => !bySystem.has(n)
  );
  if (missingForBrowser.length > 0) {
    try {
      const pw = await scrapeWithPlaywrightOptional(missingForBrowser);
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
 * Playwright instalado en el contenedor Docker de producción.
 * Se conserva la captura de errores para que el panel muestre fallos por fuente.
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
  } catch (e: any) {
    return {
      results,
      errors: [`Playwright no disponible: ${e?.message || String(e)}. Verifica la instalación durante el build de Docker.`],
    };
  }

  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const urls = [
      "https://loterias.do/",
      "https://loterias.do/leidsa/",
      "https://www.leidsa.com/",
      REFERENCE_LOTTERIES_URL,
      "https://www.conectate.com.do/loterias/americanas/new-york-medio-dia/",
      "https://www.conectate.com.do/loterias/americanas/new-york-noche/",
    ];

    // Intentar descubrir enlaces del directorio incluso si su HTML inicial
    // depende de JavaScript. No se interpreta el índice como resultados.
    const discovered: Array<{ systemName: string; url: string }> = [];
    try {
      const response = await page.goto(REFERENCE_LOTTERIES_URL, {
        waitUntil: "domcontentloaded",
        timeout: 25000,
      });
      if (response && response.status() >= 400) {
        errors.push(`pw ${REFERENCE_LOTTERIES_URL}: HTTP ${response.status()}`);
      } else {
        await page.waitForTimeout(1200);
        discovered.push(...extractConectateLotteryLinks(await page.content()));
      }
    } catch (e: any) {
      errors.push(`pw ${REFERENCE_LOTTERIES_URL}: ${e?.message || String(e)}`);
    }

    const allUrls = Array.from(new Set([
      ...urls.filter((url) => url !== REFERENCE_LOTTERIES_URL),
      ...discovered.map((item) => item.url),
    ]));

    for (const url of allUrls) {
      try {
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 25000,
        });
        if (response && response.status() >= 400) {
          errors.push(`pw ${url}: HTTP ${response.status()}`);
          continue;
        }
        await page.waitForTimeout(1200);
        const html = await page.content();
        const parsed = parseGenericHtml(html, url + "#playwright");
        for (const r of parsed) {
          if (systemNames.length && !systemNames.includes(r.systemName)) continue;
          if (!results.some((x) => x.systemName === r.systemName)) {
            // El parseo genérico requiere confirmación humana; no elevar a high.
            results.push({ ...r, confidence: "medium", source: url + " (playwright)" });
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
