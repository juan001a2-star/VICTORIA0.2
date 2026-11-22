import { z } from "zod";
import { createRouter, managerLotteryQuery, creditOpsLotteryQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { lotteries, winners } from "@db/schema";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  scrapeAllResults,
  buildManualPreview,
  todayISO,
  pad2,
  type ScrapedResult,
} from "./lib/results-scraper";

function drawDateYmd(isoDate: string): string {
  // YYYY-MM-DD → YYYYMMDD
  return isoDate.replace(/-/g, "");
}

export const resultsRouter = createRouter({
  /**
   * Vista previa: scrapea fuentes externas y cruza con loterías del sistema.
   * NO guarda nada. Solo para que el operador revise.
   */
  preview: managerLotteryQuery
    .input(
      z
        .object({
          date: z.string().optional(), // YYYY-MM-DD
          lotteryIds: z.array(z.number()).optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = getDb();
      const allLotteries = await db.select().from(lotteries);
      const active = allLotteries.filter((l) => l.active !== false);

      const onlyNames =
        input?.lotteryIds && input.lotteryIds.length > 0
          ? active.filter((l) => input.lotteryIds!.includes(l.id)).map((l) => l.name)
          : undefined;

      const { results, errors, scrapedAt } = await scrapeAllResults({
        date: input?.date,
        onlySystemNames: onlyNames,
      });

      const dateIso = input?.date || todayISO();
      const drawDate = drawDateYmd(dateIso);

      // Cruzar con loterías del sistema + estado (ya importado o no)
      const enriched = [];
      for (const lot of active) {
        const scraped = results.find((r) => r.systemName === lot.name);
        const existing = await db
          .select()
          .from(winners)
          .where(and(eq(winners.lotteryId, lot.id), eq(winners.drawDate, drawDate)));

        enriched.push({
          lotteryId: lot.id,
          lotteryName: lot.name,
          drawTime: lot.drawTime,
          closeTime: lot.closeTime,
          date: dateIso,
          drawDate,
          alreadyImported: existing.length > 0,
          existingId: existing[0]?.id ?? null,
          existingNumbers: existing[0]
            ? {
                firstPrize: existing[0].firstPrize,
                secondPrize: existing[0].secondPrize,
                thirdPrize: existing[0].thirdPrize,
              }
            : null,
          scraped: scraped
            ? {
                firstPrize: scraped.firstPrize,
                secondPrize: scraped.secondPrize,
                thirdPrize: scraped.thirdPrize,
                source: scraped.source,
                confidence: scraped.confidence,
                sourceName: scraped.sourceName,
              }
            : null,
        });
      }

      const found = enriched.filter((e) => e.scraped).length;
      const missing = enriched.filter((e) => !e.scraped).length;
      const already = enriched.filter((e) => e.alreadyImported).length;

      return {
        scrapedAt,
        date: dateIso,
        drawDate,
        errors,
        summary: { total: enriched.length, found, missing, alreadyImported: already },
        items: enriched,
      };
    }),

  /**
   * Importar resultados confirmados por el operador.
   * Solo importa los que el usuario envía explícitamente (después de la vista previa).
   * Si ya existe resultado para esa lotería+fecha → error (usar update).
   */
  importConfirmed: creditOpsLotteryQuery
    .input(
      z.object({
        date: z.string().min(8), // YYYY-MM-DD
        items: z
          .array(
            z.object({
              lotteryId: z.number(),
              firstPrize: z.string().min(1).max(6),
              secondPrize: z.string().min(1).max(6),
              thirdPrize: z.string().min(1).max(6),
            })
          )
          .min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const drawDate = drawDateYmd(input.date);
      const imported: Array<{ lotteryId: number; winnerId: number }> = [];
      const skipped: Array<{ lotteryId: number; reason: string }> = [];

      for (const item of input.items) {
        const first = pad2(item.firstPrize);
        const second = pad2(item.secondPrize);
        const third = pad2(item.thirdPrize);
        if (!first || !second || !third) {
          skipped.push({ lotteryId: item.lotteryId, reason: "Números inválidos" });
          continue;
        }

        const lotRows = await db.select().from(lotteries).where(eq(lotteries.id, item.lotteryId));
        if (!lotRows[0]) {
          skipped.push({ lotteryId: item.lotteryId, reason: "Lotería no existe" });
          continue;
        }

        const dup = await db
          .select()
          .from(winners)
          .where(and(eq(winners.lotteryId, item.lotteryId), eq(winners.drawDate, drawDate)));
        if (dup.length > 0) {
          skipped.push({ lotteryId: item.lotteryId, reason: "Ya existe resultado para esta fecha" });
          continue;
        }

        // Reutilizar la lógica de create del winner-router vía insert + el caller
        // debe haber revisado en preview. Aquí insertamos y dejamos que el flujo
        // de premios se dispare igual que winner.create.
        // Para no duplicar todo el cálculo de premios, delegamos llamando internamente
        // la misma estructura: insert winner; el cálculo de tickets ganadores está
        // en winner.create — por eso importamos solo si no existe y luego el
        // operador puede usar el flujo normal, O reutilizamos create vía procedimiento.

        // Insert directo + marcar; el procesamiento de premios se hace en winner.create.
        // Mejor: devolver lista y que el frontend llame winner.create uno a uno
        // para aprovechar el cálculo de premios existente.
        imported.push({
          lotteryId: item.lotteryId,
          winnerId: 0, // se completará en el cliente con winner.create
        });
      }

      // Devolvemos los items validados para que el cliente invoque winner.create
      // (así se reutiliza el cálculo de premios y créditos sin duplicar lógica).
      const toCreate = input.items
        .filter((it) => !skipped.some((s) => s.lotteryId === it.lotteryId))
        .map((it) => ({
          lotteryId: it.lotteryId,
          firstPrize: pad2(it.firstPrize),
          secondPrize: pad2(it.secondPrize),
          thirdPrize: pad2(it.thirdPrize),
          drawDate,
        }));

      return {
        ok: true,
        drawDate,
        toCreate,
        skipped,
        message:
          toCreate.length > 0
            ? `${toCreate.length} resultado(s) listos para registrar. ${skipped.length} omitidos.`
            : "Nada que importar.",
      };
    }),

  /**
   * Chequeo rápido: ¿hay resultados nuevos scrapeados que aún no están en BD?
   * Para alertas internas.
   */
  checkNew: managerLotteryQuery.query(async () => {
    const db = getDb();
    const dateIso = todayISO();
    const drawDate = drawDateYmd(dateIso);
    const { results, errors, scrapedAt } = await scrapeAllResults({ date: dateIso });
    const allLotteries = await db.select().from(lotteries);
    const active = allLotteries.filter((l) => l.active !== false);

    const pending: Array<{
      lotteryId: number;
      lotteryName: string;
      firstPrize: string;
      secondPrize: string;
      thirdPrize: string;
    }> = [];

    for (const r of results) {
      const lot = active.find((l) => l.name === r.systemName);
      if (!lot) continue;
      const existing = await db
        .select()
        .from(winners)
        .where(and(eq(winners.lotteryId, lot.id), eq(winners.drawDate, drawDate)));
      if (existing.length === 0) {
        pending.push({
          lotteryId: lot.id,
          lotteryName: lot.name,
          firstPrize: r.firstPrize,
          secondPrize: r.secondPrize,
          thirdPrize: r.thirdPrize,
        });
      }
    }

    return {
      scrapedAt,
      date: dateIso,
      pendingCount: pending.length,
      pending,
      errors,
    };
  }),

  /**
   * Loterías que ya cerraron hace ≥ delayMinutes y aún no tienen resultado del día.
   * Sirve para el job automático / alerta post-cierre (sin importar todavía).
   */
  dueAfterClose: managerLotteryQuery
    .input(
      z
        .object({
          /** Minutos después del cierre para empezar a avisar (default 10) */
          delayMinutes: z.number().min(0).max(120).optional(),
          /** Ventana máxima en horas desde el cierre (default 6) */
          windowHours: z.number().min(1).max(24).optional(),
          /** Si true, intenta scrape solo de las que están due */
          scrape: z.boolean().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const { lotteriesDueForResults } = await import("./lib/lottery-schedule");
      const db = getDb();
      const delayMinutes = input?.delayMinutes ?? 10;
      const windowHours = input?.windowHours ?? 6;
      const allLotteries = await db.select().from(lotteries);
      const active = allLotteries.filter((l) => l.active !== false);

      const due = lotteriesDueForResults(active, delayMinutes, windowHours);

      const missing: Array<{
        lotteryId: number;
        lotteryName: string;
        minutesSinceClose: number;
        drawDate: string;
        alreadyImported: boolean;
        scraped: null | {
          firstPrize: string;
          secondPrize: string;
          thirdPrize: string;
          source: string;
        };
      }> = [];

      let scrapeErrors: string[] = [];
      let scrapedMap = new Map<string, ScrapedResult>();

      if (input?.scrape !== false && due.length > 0) {
        const names = due.map((d) => d.lotteryName);
        const { results, errors } = await scrapeAllResults({
          onlySystemNames: names,
        });
        scrapeErrors = errors;
        for (const r of results) scrapedMap.set(r.systemName, r);
      }

      for (const d of due) {
        const existing = await db
          .select()
          .from(winners)
          .where(and(eq(winners.lotteryId, d.lotteryId), eq(winners.drawDate, d.drawDate)));
        const sc = scrapedMap.get(d.lotteryName);
        missing.push({
          lotteryId: d.lotteryId,
          lotteryName: d.lotteryName,
          minutesSinceClose: d.minutesSinceClose,
          drawDate: d.drawDate,
          alreadyImported: existing.length > 0,
          scraped: sc
            ? {
                firstPrize: sc.firstPrize,
                secondPrize: sc.secondPrize,
                thirdPrize: sc.thirdPrize,
                source: sc.source,
              }
            : null,
        });
      }

      const needAction = missing.filter((m) => !m.alreadyImported);

      return {
        checkedAt: new Date().toISOString(),
        delayMinutes,
        dueCount: due.length,
        needActionCount: needAction.length,
        withNumbers: needAction.filter((m) => m.scraped).length,
        withoutNumbers: needAction.filter((m) => !m.scraped).length,
        items: missing,
        needAction,
        scrapeErrors,
      };
    }),
});
