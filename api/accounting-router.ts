import { z } from "zod";
import { createRouter, managerLotteryQuery, lotteryAuthedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { tickets, plays, lotteryUsers, groups, notifications } from "@db/schema";
import { and, desc, eq, gte, lt, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

function dateBounds(from: string, to: string) {
  // Render stores timestamps in UTC; the app's operating timezone is America/Cayenne (UTC-3).
  const start = new Date(`${from}T03:00:00.000Z`);
  const end = new Date(`${to}T03:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export const accountingRouter = createRouter({
  monitoring: managerLotteryQuery.input(z.object({
    from: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),
    to: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),
    userId: z.number().optional(),
    groupId: z.number().optional(),
    view: z.enum(["general", "group", "seller"]).default("general"),
  })).query(async ({ input, ctx }) => {
    if (input.to < input.from) throw new TRPCError({ code: "BAD_REQUEST", message: "La fecha final debe ser igual o posterior a la inicial." });
    const db = getDb();
    const { start, end } = dateBounds(input.from, input.to);
    const actor = ctx.lotteryUser!;
    const users = await db.select().from(lotteryUsers);
    const groupsRows = await db.select().from(groups);
    let allowed = users;
    if (actor.role === "supervisor" || actor.role === "collector") allowed = users.filter(u => u.groupId === actor.groupId);
    if (input.groupId) allowed = allowed.filter(u => u.groupId === input.groupId);
    if (input.userId) allowed = allowed.filter(u => u.id === input.userId);
    const ids = allowed.map(u => u.id);
    if (!ids.length) return { summary: { sales: 0, tickets: 0, commissions: 0, prizes: 0 }, byType: [], details: [], sellers: [], groups: groupsRows };
    const rows = await db.select().from(tickets).where(and(gte(tickets.createdAt, start), lt(tickets.createdAt, end), inArray(tickets.userId, ids)));
    const valid = rows.filter(t => t.status !== "cancelled");
    const ticketIds = valid.map(t => t.id);
    const playRows = ticketIds.length ? await db.select().from(plays).where(inArray(plays.ticketId, ticketIds)) : [];
    const byTypeMap = new Map<string, { type: string; count: number; amount: number }>();
    const detailMap = new Map<string, { type: string; number: string; count: number; amount: number }>();
    for (const play of playRows) {
      const type = play.type === "terna" ? "tres_cifras" : play.type === "cuatrena" ? "cuatro_cifras" : play.type;
      const b = byTypeMap.get(type) || { type, count: 0, amount: 0 };
      b.count += 1; b.amount += Number(play.amount); byTypeMap.set(type, b);
      const number = (play.type === "pale" || play.type === "tripleta") ? play.number.split("+").map(x => x.trim()).sort().join("-") : play.number.replace(/[^0-9]/g, "");
      const key = `${type}|${number}`;
      const d = detailMap.get(key) || { type, number, count: 0, amount: 0 };
      d.count += 1; d.amount += Number(play.amount); detailMap.set(key, d);
    }
    const sales = valid.reduce((s,t) => s + Number(t.total), 0);
    const commissions = valid.reduce((s,t) => s + Math.max(0, Number(t.total) - Number(t.netDeduction)), 0);
    const prizes = valid.reduce((s,t) => s + Number(t.prizeAmount || 0), 0);
    const bySellerMap = new Map<number, { userId: number; name: string; bankNumber: string; tickets: number; sales: number; commissions: number; prizes: number }>();
    const userMap = new Map<number, (typeof allowed)[number]>(allowed.map(u => [u.id, u] as const));
    const byGroupMap = new Map<number, { groupId: number; name: string; tickets: number; sales: number; commissions: number; prizes: number }>();
    for (const ticket of valid) {
      const seller = userMap.get(ticket.userId);
      if (!seller) continue;
      const sellerRow = bySellerMap.get(seller.id) || { userId: seller.id, name: seller.name, bankNumber: seller.bankNumber, tickets: 0, sales: 0, commissions: 0, prizes: 0 };
      sellerRow.tickets += 1;
      sellerRow.sales += Number(ticket.total);
      sellerRow.commissions += Math.max(0, Number(ticket.total) - Number(ticket.netDeduction));
      sellerRow.prizes += Number(ticket.prizeAmount || 0);
      bySellerMap.set(seller.id, sellerRow);
      if (seller.groupId) {
        const group = groupsRows.find(g => g.id === seller.groupId);
        const groupRow = byGroupMap.get(seller.groupId) || { groupId: seller.groupId, name: group?.name || `Grupo ${seller.groupId}`, tickets: 0, sales: 0, commissions: 0, prizes: 0 };
        groupRow.tickets += 1;
        groupRow.sales += Number(ticket.total);
        groupRow.commissions += Math.max(0, Number(ticket.total) - Number(ticket.netDeduction));
        groupRow.prizes += Number(ticket.prizeAmount || 0);
        byGroupMap.set(seller.groupId, groupRow);
      }
    }
    return {
      summary: { sales, tickets: valid.length, commissions, prizes },
      byType: [...byTypeMap.values()].sort((a,b) => a.type.localeCompare(b.type)),
      details: [...detailMap.values()],
      bySeller: [...bySellerMap.values()].sort((a,b) => b.sales-a.sales),
      byGroup: [...byGroupMap.values()].sort((a,b) => b.sales-a.sales),
      sellers: allowed.map(u => ({ id: u.id, name: u.name, bankNumber: u.bankNumber, groupId: u.groupId })),
      groups: groupsRows,
    };
  }),

  tickets: managerLotteryQuery.input(z.object({
    from: z.string(), to: z.string(), userId: z.number().optional(),
    status: z.enum(["all", "active", "cancelled", "winner", "paid"]).default("all"),
    search: z.string().optional(),
  })).query(async ({ input, ctx }) => {
    const db = getDb();
    const { start, end } = dateBounds(input.from, input.to);
    let rows = await db.select().from(tickets).where(and(gte(tickets.createdAt, start), lt(tickets.createdAt, end))).orderBy(desc(tickets.createdAt));
    const actor = ctx.lotteryUser!;
    if (actor.role !== "admin") {
      const groupRows = actor.groupId ? await db.select({ id: lotteryUsers.id }).from(lotteryUsers).where(eq(lotteryUsers.groupId, actor.groupId)) : [];
      const ids = groupRows.map(r => r.id);
      rows = rows.filter(t => ids.includes(t.userId));
    }
    if (input.userId) rows = rows.filter(t => t.userId === input.userId);
    if (input.status !== "all") rows = rows.filter(t => t.status === input.status);
    if (input.search) rows = rows.filter(t => t.code.toLowerCase().includes(input.search!.toLowerCase()));
    const users = await db.select().from(lotteryUsers);
    const userMap = new Map(users.map(u => [u.id, u]));
    return rows.map(t => ({ ...t, sellerName: userMap.get(t.userId)?.name || "—", sellerCode: userMap.get(t.userId)?.bankNumber || "—" }));
  }),

  notificationList: lotteryAuthedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db.select().from(notifications).where(eq(notifications.userId, ctx.lotteryUser!.id)).orderBy(desc(notifications.createdAt)).limit(100);
  }),
  unreadCount: lotteryAuthedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db.select().from(notifications).where(and(eq(notifications.userId, ctx.lotteryUser!.id), eq(notifications.read, false)));
    return rows.length;
  }),
  markRead: lotteryAuthedQuery.input(z.object({ id: z.number().optional(), all: z.boolean().default(false) })).mutation(async ({ input, ctx }) => {
    const db = getDb();
    if (input.all) await db.update(notifications).set({ read: true, readAt: new Date() }).where(eq(notifications.userId, ctx.lotteryUser!.id));
    else if (input.id) await db.update(notifications).set({ read: true, readAt: new Date() }).where(and(eq(notifications.id, input.id), eq(notifications.userId, ctx.lotteryUser!.id)));
    return { ok: true };
  }),
});
