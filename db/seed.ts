import { getDb } from "../api/queries/connection";
import { lotteries, lotteryUsers, groups, prizes } from "./schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "../api/lib/password";

// Default schedule for all days
function defaultSchedule(open: string, close: string) {
  return JSON.stringify({
    mon: { open, close },
    tue: { open, close },
    wed: { open, close },
    thu: { open, close },
    fri: { open, close },
    sat: { open, close },
    sun: { open, close },
  });
}

async function seed() {
  const db = getDb();
  console.log("Seeding database...");

  try {
    // Seed default group
    const existingGroup = (await db.select().from(groups).where(eq(groups.name, "Grupo Principal")))[0];
    const groupId = existingGroup?.id ?? (await db.insert(groups).values({ name: "Grupo Principal", maxSalesPerDay: "50000.00", active: true }).returning())[0].id;
    console.log("Default group id:", groupId);

    // Seed admin user
    const existingAdmin = (await db.select().from(lotteryUsers).where(eq(lotteryUsers.username, "admin")))[0];
    if (!existingAdmin) await db.insert(lotteryUsers).values({
      bankNumber: "B-001",
      name: "Administrador",
      username: "admin",
      password: await hashPassword("admin123"),
      phone: "",
      role: "admin",
      groupId: groupId,
      credit: "100000.00",
      commission: "0",
      active: true,
    });
    console.log("Default admin ready.");

    // Reconciliar el catálogo completo de loterías. Se conservan los IDs existentes
    // para las loterías que mantienen el mismo nombre y se desactivan las antiguas
    // para no romper tickets ni resultados históricos.
    const desiredLotteries = [
      ["Gana Mas", "13:30", "13:00"],
      ["Nacional", "21:00", "20:30"],
      ["Leídsa", "19:55", "19:25"],
      ["Real Dia", "11:55", "11:25"],
      ["Real Noche", "19:55", "19:25"],
      ["Florida Dia", "13:30", "13:00"],
      ["Florida Noche", "21:45", "21:15"],
      ["New Jersey Dia", "12:59", "12:29"],
      ["New Jersey Noche", "22:57", "22:27"],
      ["Georgia Dia", "12:29", "11:59"],
      ["Georgia Tarde", "18:59", "18:29"],
      ["Primera Día", "11:00", "10:30"],
      ["Primera Noche", "18:00", "17:30"],
      ["La Suerte Día", "11:30", "11:00"],
      ["La Suerte Tarde", "17:00", "16:30"],
      ["LoteDom Día", "11:00", "10:30"],
      ["LoteDom Noche", "21:00", "20:30"],
      ["Anguila 9:00 AM", "08:00", "07:30"],
      ["Anguila 10:00 AM", "09:00", "08:30"],
      ["Anguila 13:00", "12:00", "11:30"],
      ["Anguila 21:00", "20:00", "19:30"],
      ["Haití 9:30 AM", "09:30", "09:00"],
      ["Haití 19:30", "19:30", "19:00"],
      ["Loteka Día", "12:30", "12:00"],
      ["Loteka Noche", "19:00", "18:30"],
      ["King Día", "11:30", "11:00"],
      ["King Noche", "18:30", "18:00"],
    ] as const;

    const existingLotteries = await db.select().from(lotteries);
    const desiredNames = new Set(desiredLotteries.map(([name]) => name));
    for (const [name, drawTime, closeTime] of desiredLotteries) {
      const existing = existingLotteries.find((item) => item.name === name);
      const values = {
        name, drawTime, openTime: "06:00", closeTime,
        schedule: defaultSchedule("06:00", closeTime), active: true,
      };
      if (existing) {
        await db.update(lotteries).set(values).where(eq(lotteries.id, existing.id));
      } else {
        await db.insert(lotteries).values(values);
      }
    }
    for (const oldLottery of existingLotteries) {
      if (!desiredNames.has(oldLottery.name)) {
        await db.update(lotteries).set({ active: false }).where(eq(lotteries.id, oldLottery.id));
      }
    }
    console.log(`Lottery catalog synchronized: ${desiredLotteries.length} active lotteries`);

    // Seed default prizes
    const prizeCount = await db.select({ id: prizes.id }).from(prizes).limit(1);
    if (prizeCount.length === 0) await db.insert(prizes).values([
      { playType: "directo", firstPrizeMultiplier: "50", secondPrizeMultiplier: "15", thirdPrizeMultiplier: "10", paleFirstSecondMultiplier: "0", paleFirstThirdMultiplier: "0", paleSecondThirdMultiplier: "0", fixedMultiplier: "0", description: "1er=50x, 2do=15x, 3ro=10x" },
      { playType: "pale", firstPrizeMultiplier: "0", secondPrizeMultiplier: "0", thirdPrizeMultiplier: "0", paleFirstSecondMultiplier: "25", paleFirstThirdMultiplier: "20", paleSecondThirdMultiplier: "15", fixedMultiplier: "0", description: "1+2=25x, 1+3=20x, 2+3=15x" },
      { playType: "terna", firstPrizeMultiplier: "0", secondPrizeMultiplier: "0", thirdPrizeMultiplier: "0", paleFirstSecondMultiplier: "0", paleFirstThirdMultiplier: "0", paleSecondThirdMultiplier: "0", fixedMultiplier: "500", description: "3 cifras = 500x" },
      { playType: "cuatrena", firstPrizeMultiplier: "0", secondPrizeMultiplier: "0", thirdPrizeMultiplier: "0", paleFirstSecondMultiplier: "0", paleFirstThirdMultiplier: "0", paleSecondThirdMultiplier: "0", fixedMultiplier: "4000", description: "4 cifras = 4,000x" },
      { playType: "tripleta", firstPrizeMultiplier: "0", secondPrizeMultiplier: "0", thirdPrizeMultiplier: "0", paleFirstSecondMultiplier: "0", paleFirstThirdMultiplier: "0", paleSecondThirdMultiplier: "0", fixedMultiplier: "10000", description: "Tripleta = 10,000x" },
    ]);
    console.log("Created 5 default prizes");

    console.log("Seeding complete!");
  } catch (err) {
    console.log("Seed error (may already exist):", (err as Error).message);
  }
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
