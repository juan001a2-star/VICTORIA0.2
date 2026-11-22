import { z } from "zod";
import { createRouter, managerLotteryQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { tickets, plays, lotteryUsers, groups, lotteries } from "@db/schema";
import { eq, desc, and, gte, lte, ne, sql } from "drizzle-orm";

export const reportRouter = createRouter({
  // Dashboard summary
  dashboard: managerLotteryQuery.query(async () => {
    const db = getDb();
    const allTickets = await db.select().from(tickets);
    const activeTickets = allTickets.filter((t) => t.status !== "cancelled");
    const cancelledTickets = allTickets.filter((t) => t.status === "cancelled");
    const allUsers = await db.select().from(lotteryUsers);
    const allGroups = await db.select().from(groups);
    const allLotteries = await db.select().from(lotteries);

    const totalSales = activeTickets.reduce((sum, t) => sum + Number(t.total), 0);

    return {
      totalUsers: allUsers.length,
      activeUsers: allUsers.filter((u) => u.active).length,
      totalGroups: allGroups.length,
      totalLotteries: allLotteries.length,
      totalTickets: allTickets.length,
      totalSales: totalSales.toFixed(2),
      cancelledTickets: cancelledTickets.length,
    };
  }),

  // Sales by group
  salesByGroup: managerLotteryQuery
    .input(z.object({ groupId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const members = await db.select().from(lotteryUsers).where(eq(lotteryUsers.groupId, input.groupId));
      const memberIds = members.map((m) => m.id);

      const groupTickets = await db.select().from(tickets);
      const filteredTickets = groupTickets.filter((t) => memberIds.includes(t.userId) && t.status !== "cancelled");

      const total = filteredTickets.reduce((sum, t) => sum + Number(t.total), 0);

      return {
        memberCount: members.length,
        ticketCount: filteredTickets.length,
        totalSales: total.toFixed(2),
        members: members.map((m) => ({ id: m.id, name: m.name, role: m.role, credit: m.credit })),
      };
    }),

  // Tickets by group
  ticketsByGroup: managerLotteryQuery
    .input(z.object({ groupId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const members = await db.select().from(lotteryUsers).where(eq(lotteryUsers.groupId, input.groupId));
      const memberIds = members.map((m) => m.id);

      const allTickets = await db.select().from(tickets).orderBy(desc(tickets.createdAt));
      return allTickets.filter((t) => memberIds.includes(t.userId));
    }),

  // Sales by user
  salesByUser: managerLotteryQuery
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      const userTickets = await db.select().from(tickets)
        .where(eq(tickets.userId, input.userId));
      const active = userTickets.filter((t) => t.status !== "cancelled");
      const total = active.reduce((sum, t) => sum + Number(t.total), 0);
      return {
        totalTickets: userTickets.length,
        activeTickets: active.length,
        totalSales: total.toFixed(2),
      };
    }),

  /**
   * Monitoreo / Contabilidad
   * Totales por tipo de jugada + detalle por número/combinación
   * Filtros: rango de fechas y opcionalmente vendedor
   */
  monitoring: managerLotteryQuery
    .input(z.object({
      fromDate: z.string(), // YYYY-MM-DD
      toDate: z.string(),
      userId: z.number().optional(), // filtrar por vendedor
    }))
    .query(async ({ input }) => {
      const db = getDb();
      const from = new Date(input.fromDate + "T00:00:00");
      const to = new Date(input.toDate + "T23:59:59.999");

      // Tickets no anulados en el rango
      let ticketRows = await db.select().from(tickets);
      ticketRows = ticketRows.filter((t) => {
        if (t.status === "cancelled") return false;
        const d = new Date(t.createdAt);
        if (d < from || d > to) return false;
        if (input.userId != null && t.userId !== input.userId) return false;
        return true;
      });

      const ticketIds = ticketRows.map((t) => t.id);
      const totalTickets = ticketRows.length;
      const totalSales = ticketRows.reduce((s, t) => s + Number(t.total || 0), 0);
      const totalPrizes = ticketRows.reduce((s, t) => s + Number(t.prizeAmount || 0), 0);
      // Comisión aproximada (promedio de los tickets)
      const totalCommission = ticketRows.reduce((s, t) => {
        const total = Number(t.total || 0);
        const commissionPct = Number(t.commission || 10) / 100;
        return s + total * commissionPct;
      }, 0);

      if (ticketIds.length === 0) {
        return {
          summary: {
            totalSales: "0.00",
            totalTickets: 0,
            totalCommission: "0.00",
            totalPrizes: "0.00",
          },
          byType: [] as { type: string; count: number; amount: string }[],
          byNumber: [] as { type: string; number: string; count: number; amount: string }[],
        };
      }

      const allPlays = await db.select().from(plays);
      const relevantPlays = allPlays.filter((p) => ticketIds.includes(p.ticketId));

      // Agregar por tipo
      const typeMap = new Map<string, { count: number; amount: number }>();
      // Agregar por tipo+número
      const numberMap = new Map<string, { type: string; number: string; count: number; amount: number }>();

      for (const p of relevantPlays) {
        const type = p.type || "directo";
        const num = p.number || "";
        const amt = Number(p.amount || 0);

        const tEntry = typeMap.get(type) || { count: 0, amount: 0 };
        tEntry.count += 1;
        tEntry.amount += amt;
        typeMap.set(type, tEntry);

        const key = `${type}|${num}`;
        const nEntry = numberMap.get(key) || { type, number: num, count: 0, amount: 0 };
        nEntry.count += 1;
        nEntry.amount += amt;
        numberMap.set(key, nEntry);
      }

      const byType = Array.from(typeMap.entries())
        .map(([type, v]) => ({ type, count: v.count, amount: v.amount.toFixed(2) }))
        .sort((a, b) => b.count - a.count);

      const byNumber = Array.from(numberMap.values())
        .map((v) => ({ type: v.type, number: v.number, count: v.count, amount: v.amount.toFixed(2) }))
        .sort((a, b) => b.count - a.count || a.number.localeCompare(b.number));

      return {
        summary: {
          totalSales: totalSales.toFixed(2),
          totalTickets,
          totalCommission: totalCommission.toFixed(2),
          totalPrizes: totalPrizes.toFixed(2),
        },
        byType,
        byNumber,
      };
    }),
});
