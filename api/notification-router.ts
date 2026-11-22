import { z } from "zod";
import { createRouter, lotteryAuthedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { notifications, lotteryUsers } from "@db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const notificationRouter = createRouter({
  /** Lista de notificaciones del usuario logueado (más recientes primero) */
  list: lotteryAuthedQuery
    .input(z.object({ limit: z.number().min(1).max(100).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.lotteryUser!.id;
      const limit = input?.limit ?? 50;
      const rows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(limit);
      return rows;
    }),

  /** Cantidad de no leídas (para el badge de la campanita) */
  unreadCount: lotteryAuthedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.lotteryUser!.id;
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
    return { count: rows[0]?.count ?? 0 };
  }),

  /** Marcar una como leída */
  markRead: lotteryAuthedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const userId = ctx.lotteryUser!.id;
      const rows = await db.select().from(notifications).where(eq(notifications.id, input.id));
      const n = rows[0];
      if (!n || n.userId !== userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Notificación no encontrada" });
      }
      await db
        .update(notifications)
        .set({ read: true, readAt: new Date() })
        .where(eq(notifications.id, input.id));
      return { ok: true };
    }),

  /** Marcar todas como leídas */
  markAllRead: lotteryAuthedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    const userId = ctx.lotteryUser!.id;
    await db
      .update(notifications)
      .set({ read: true, readAt: new Date() })
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
    return { ok: true };
  }),

  /**
   * Crear notificación (uso interno / admin).
   * También se puede llamar desde el procesamiento de sorteos.
   */
  create: lotteryAuthedQuery
    .input(
      z.object({
        userId: z.number(),
        ticketId: z.number().optional(),
        type: z.enum(["ticket_ganador", "ticket_anulado", "sistema"]),
        title: z.string().min(1).max(150),
        message: z.string().min(1),
        dataExtra: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const role = ctx.lotteryUser!.role;
      if (!["admin", "supervisor"].includes(role) && input.userId !== ctx.lotteryUser!.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sin permiso" });
      }
      const db = getDb();
      const result = await db
        .insert(notifications)
        .values({
          userId: input.userId,
          ticketId: input.ticketId ?? null,
          type: input.type,
          title: input.title,
          message: input.message,
          read: false,
          dataExtra: input.dataExtra ?? null,
        })
        .returning();
      return result[0];
    }),
});

/**
 * Helper para crear notificaciones desde otros routers (ej. winner-router)
 * sin pasar por tRPC.
 */
export async function createNotificationForUsers(params: {
  userIds: number[];
  ticketId?: number;
  type: "ticket_ganador" | "ticket_anulado" | "sistema";
  title: string;
  message: string;
  dataExtra?: string;
}) {
  const db = getDb();
  const values = params.userIds.map((userId) => ({
    userId,
    ticketId: params.ticketId ?? null,
    type: params.type,
    title: params.title,
    message: params.message,
    read: false,
    dataExtra: params.dataExtra ?? null,
  }));
  if (values.length === 0) return;
  await db.insert(notifications).values(values);
}
