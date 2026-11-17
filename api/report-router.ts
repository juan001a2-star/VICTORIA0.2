import { z } from "zod";
import { createRouter, managerLotteryQuery, creditOpsLotteryQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { tickets, lotteryUsers, groups, lotteries, plays } from "@db/schema";
import { eq, desc, and, gte, lte, inArray, sql, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

function startOfDay(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00");
}
function endOfDay(dateStr: string): Date {
  return new Date(dateStr + "T23:59:59.999");
}

/** Resolve which userIds a manager is allowed to see */
async function resolveScopedUserIds(
  db: ReturnType<typeof getDb>,
  ctxUser: { id: number; role: string; groupId?: number | null },
  filterGroupId?: number | null,
  filterUserId?: number | null
): Promise<number[] | "all"> {
  if (ctxUser.role === "admin") {
    if (filterUserId) return [filterUserId];
    if (filterGroupId) {
      const members = await db.select({ id: lotteryUsers.id }).from(lotteryUsers).where(eq(lotteryUsers.groupId, filterGroupId));
      return members.map((m) => m.id);
    }
    return "all";
  }

  // supervisor / collector: only their group
  const groupId = ctxUser.groupId;
  if (!groupId) return [];
  const members = await db.select({ id: lotteryUsers.id }).from(lotteryUsers).where(eq(lotteryUsers.groupId, groupId));
  let ids = members.map((m) => m.id);
  if (filterUserId) ids = ids.filter((id) => id === filterUserId);
  return ids;
}

export const reportRouter = createRouter({
  // Dashboard summary (scoped)
  dashboard: managerLotteryQuery.query(async ({ ctx }) => {
    const db = getDb();
    const scoped = await resolveScopedUserIds(db, ctx.lotteryUser!);
    const allTickets = await db.select().from(tickets);
    const scopedTickets =
      scoped === "all" ? allTickets : allTickets.filter((t) => scoped.includes(t.userId));
    const activeTickets = scopedTickets.filter((t) => t.status !== "cancelled");
    const cancelledTickets = scopedTickets.filter((t) => t.status === "cancelled");
    const allUsers = await db.select().from(lotteryUsers);
    const scopedUsers =
      scoped === "all" ? allUsers : allUsers.filter((u) => scoped.includes(u.id));
    const allGroups = await db.select().from(groups);
    const allLotteries = await db.select().from(lotteries);

    const totalSales = activeTickets.reduce((sum, t) => sum + Number(t.total), 0);

    return {
      totalUsers: scopedUsers.length,
      activeUsers: scopedUsers.filter((u) => u.active).length,
      totalGroups: ctx.lotteryUser!.role === "admin" ? allGroups.length : 1,
      totalLotteries: allLotteries.filter((l) => l.active).length,
      totalTickets: scopedTickets.length,
      totalSales: totalSales.toFixed(2),
      cancelledTickets: cancelledTickets.length,
    };
  }),

  // Sales by group
  salesByGroup: managerLotteryQuery
    .input(z.object({ groupId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.lotteryUser!.role !== "admin" && ctx.lotteryUser!.groupId !== input.groupId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tiene acceso a este grupo." });
      }
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
    .query(async ({ input, ctx }) => {
      if (ctx.lotteryUser!.role !== "admin" && ctx.lotteryUser!.groupId !== input.groupId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tiene acceso a este grupo." });
      }
      const db = getDb();
      const members = await db.select().from(lotteryUsers).where(eq(lotteryUsers.groupId, input.groupId));
      const memberIds = members.map((m) => m.id);

      const allTickets = await db.select().from(tickets).orderBy(desc(tickets.createdAt));
      return allTickets.filter((t) => memberIds.includes(t.userId));
    }),

  // Sales by user
  salesByUser: managerLotteryQuery
    .input(z.object({ userId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const scoped = await resolveScopedUserIds(db, ctx.lotteryUser!);
      if (scoped !== "all" && !scoped.includes(input.userId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No tiene acceso a este usuario." });
      }
      const userTickets = await db.select().from(tickets).where(eq(tickets.userId, input.userId));
      const active = userTickets.filter((t) => t.status !== "cancelled");
      const total = active.reduce((sum, t) => sum + Number(t.total), 0);
      return {
        totalTickets: userTickets.length,
        activeTickets: active.length,
        totalSales: total.toFixed(2),
      };
    }),

  /**
   * Frecuencia de números / combinaciones
   * Quién vendió, qué se vendió, cuántas veces y cuánto dinero representa.
   * Scoped por rol (admin = todo, supervisor = su grupo).
   */
  numberFrequency: creditOpsLotteryQuery
    .input(
      z.object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        lotteryId: z.number().optional(),
        playType: z.string().optional(),
        groupId: z.number().optional(),
        userId: z.number().optional(),
        limit: z.number().min(1).max(500).default(100),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const scopedUserIds = await resolveScopedUserIds(
        db,
        ctx.lotteryUser!,
        input.groupId ?? null,
        input.userId ?? null
      );

      if (Array.isArray(scopedUserIds) && scopedUserIds.length === 0) {
        return { rows: [], totalPlays: 0, totalAmount: "0.00" };
      }

      // Get active (non-cancelled) tickets in date range, scoped
      const fromDt = startOfDay(input.from);
      const toDt = endOfDay(input.to);

      let ticketQuery = db
        .select({
          id: tickets.id,
          userId: tickets.userId,
          lotteryId: tickets.lotteryId,
          status: tickets.status,
          createdAt: tickets.createdAt,
        })
        .from(tickets)
        .where(
          and(
            ne(tickets.status, "cancelled"),
            gte(tickets.createdAt, fromDt),
            lte(tickets.createdAt, toDt)
          )
        );

      const ticketRows = await ticketQuery;
      let allowedTicketIds = ticketRows.map((t) => t.id);

      if (scopedUserIds !== "all") {
        const allowedSet = new Set(scopedUserIds);
        allowedTicketIds = ticketRows.filter((t) => allowedSet.has(t.userId)).map((t) => t.id);
      }

      if (allowedTicketIds.length === 0) {
        return { rows: [], totalPlays: 0, totalAmount: "0.00" };
      }

      // Fetch plays for those tickets
      const playRows = await db
        .select({
          number: plays.number,
          type: plays.type,
          amount: plays.amount,
          lotteryId: plays.lotteryId,
          ticketId: plays.ticketId,
        })
        .from(plays)
        .where(inArray(plays.ticketId, allowedTicketIds));

      // Aggregate in memory (safe for typical daily volumes)
      type AggKey = string;
      const map = new Map<
        AggKey,
        { number: string; type: string; lotteryId: number; count: number; totalAmount: number; ticketIds: Set<number> }
      >();

      for (const p of playRows) {
        if (input.lotteryId && p.lotteryId !== input.lotteryId) continue;
        if (input.playType && p.type !== input.playType) continue;

        const key = `${p.lotteryId}|${p.type}|${p.number}`;
        const existing = map.get(key);
        const amt = Number(p.amount) || 0;
        if (existing) {
          existing.count += 1;
          existing.totalAmount += amt;
          existing.ticketIds.add(p.ticketId);
        } else {
          map.set(key, {
            number: p.number,
            type: p.type,
            lotteryId: p.lotteryId,
            count: 1,
            totalAmount: amt,
            ticketIds: new Set([p.ticketId]),
          });
        }
      }

      // Lottery names
      const lotteryList = await db.select({ id: lotteries.id, name: lotteries.name }).from(lotteries);
      const lotteryName = new Map(lotteryList.map((l) => [l.id, l.name]));

      let rows = Array.from(map.values()).map((r) => ({
        number: r.number,
        type: r.type,
        lotteryId: r.lotteryId,
        lotteryName: lotteryName.get(r.lotteryId) || `Lotería ${r.lotteryId}`,
        count: r.count,
        ticketCount: r.ticketIds.size,
        totalAmount: r.totalAmount.toFixed(2),
        totalAmountNum: r.totalAmount,
      }));

      // Sort by total amount desc, then count desc
      rows.sort((a, b) => b.totalAmountNum - a.totalAmountNum || b.count - a.count);

      const totalPlays = rows.reduce((s, r) => s + r.count, 0);
      const totalAmount = rows.reduce((s, r) => s + r.totalAmountNum, 0);

      // Limit
      rows = rows.slice(0, input.limit);

      return {
        rows: rows.map(({ totalAmountNum, ...rest }) => rest),
        totalPlays,
        totalAmount: totalAmount.toFixed(2),
      };
    }),

  /**
   * Detalle de ventas por vendedor en un rango (quién vendió / cuánto)
   */
  salesBreakdown: creditOpsLotteryQuery
    .input(
      z.object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        groupId: z.number().optional(),
        userId: z.number().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const scopedUserIds = await resolveScopedUserIds(
        db,
        ctx.lotteryUser!,
        input.groupId ?? null,
        input.userId ?? null
      );

      if (Array.isArray(scopedUserIds) && scopedUserIds.length === 0) {
        return { sellers: [], totals: { tickets: 0, sales: "0.00", net: "0.00" } };
      }

      const fromDt = startOfDay(input.from);
      const toDt = endOfDay(input.to);

      const ticketRows = await db
        .select()
        .from(tickets)
        .where(
          and(
            ne(tickets.status, "cancelled"),
            gte(tickets.createdAt, fromDt),
            lte(tickets.createdAt, toDt)
          )
        );

      const filtered =
        scopedUserIds === "all"
          ? ticketRows
          : ticketRows.filter((t) => (scopedUserIds as number[]).includes(t.userId));

      const userMap = new Map<number, { tickets: number; sales: number; net: number }>();
      for (const t of filtered) {
        const cur = userMap.get(t.userId) || { tickets: 0, sales: 0, net: 0 };
        cur.tickets += 1;
        cur.sales += Number(t.total) || 0;
        cur.net += Number(t.netDeduction) || 0;
        userMap.set(t.userId, cur);
      }

      const userIds = Array.from(userMap.keys());
      const users =
        userIds.length > 0
          ? await db.select().from(lotteryUsers).where(inArray(lotteryUsers.id, userIds))
          : [];
      const userInfo = new Map(users.map((u) => [u.id, u]));

      const sellers = Array.from(userMap.entries())
        .map(([userId, stats]) => {
          const u = userInfo.get(userId);
          return {
            userId,
            name: u?.name || `Usuario ${userId}`,
            bankNumber: u?.bankNumber || "",
            groupId: u?.groupId ?? null,
            tickets: stats.tickets,
            sales: stats.sales.toFixed(2),
            net: stats.net.toFixed(2),
            salesNum: stats.sales,
          };
        })
        .sort((a, b) => b.salesNum - a.salesNum)
        .map(({ salesNum, ...rest }) => rest);

      const totals = {
        tickets: filtered.length,
        sales: filtered.reduce((s, t) => s + (Number(t.total) || 0), 0).toFixed(2),
        net: filtered.reduce((s, t) => s + (Number(t.netDeduction) || 0), 0).toFixed(2),
      };

      return { sellers, totals };
    }),
});
