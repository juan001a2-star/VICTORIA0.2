import { getDb } from "../api/queries/connection";
import { lotteryUsers, lotteries, prizes, groups } from "./schema";
import { eq } from "drizzle-orm";

function defaultSchedule(open: string, close: string) {
  return JSON.stringify({
    mon: { open, close }, tue: { open, close }, wed: { open, close },
    thu: { open, close }, fri: { open, close }, sat: { open, close },
    sun: { open, close },
  });
}

async function syncAndSeed() {
  const db = getDb();
  console.log("Checking and seeding database...");

  // Check if admin exists
  const existingUsers = await db.select().from(lotteryUsers).where(eq(lotteryUsers.username, "admin"));
  if (existingUsers.length === 0) {
    // Seed admin user
    await db.insert(lotteryUsers).values({
      bankNumber: "B-001",
      name: "Administrador",
      username: "admin",
      password: "admin123",
      phone: "",
      role: "admin",
      groupId: null,
      credit: "100000.00",
      active: true,
    });
    console.log("Admin user created (admin / admin123)");
  } else {
    console.log("Admin user already exists");
  }

  // Check if default group exists
  const existingGroups = await db.select().from(groups);
  if (existingGroups.length === 0) {
    await db.insert(groups).values({
      name: "Grupo Principal",
      maxSalesPerDay: "50000.00",
      active: true,
    });
    console.log("Default group created");
  } else {
    console.log("Groups already exist:", existingGroups.length);
  }

  // Sincronizar el catálogo actual sin borrar filas antiguas que puedan estar
  // referenciadas por tickets o resultados históricos.
  const desiredLotteries = [
    ["Gana Mas", "13:30", "13:00"], ["Nacional", "21:00", "20:30"],
    ["Leídsa", "19:55", "19:25"], ["Real Dia", "11:55", "11:25"],
    ["Real Noche", "19:55", "19:25"], ["Florida Dia", "13:30", "13:00"],
    ["Florida Noche", "21:45", "21:15"], ["New Jersey Dia", "12:59", "12:29"],
    ["New Jersey Noche", "22:57", "22:27"], ["Georgia Dia", "12:29", "11:59"],
    ["Georgia Tarde", "18:59", "18:29"], ["Primera Día", "11:00", "10:30"],
    ["Primera Noche", "18:00", "17:30"], ["La Suerte Día", "11:30", "11:00"],
    ["La Suerte Tarde", "17:00", "16:30"], ["LoteDom Día", "11:00", "10:30"],
    ["LoteDom Noche", "21:00", "20:30"], ["Anguila 9:00 AM", "08:00", "07:30"],
    ["Anguila 10:00 AM", "09:00", "08:30"], ["Anguila 13:00", "12:00", "11:30"],
    ["Anguila 21:00", "20:00", "19:30"], ["Haití 9:30 AM", "09:30", "09:00"],
    ["Haití 19:30", "19:30", "19:00"], ["Loteka Día", "12:30", "12:00"],
    ["Loteka Noche", "19:00", "18:30"], ["King Día", "11:30", "11:00"],
    ["King Noche", "18:30", "18:00"],
  ] as const;
  const existingLotteries = await db.select().from(lotteries);
  const desiredNames = new Set<string>(desiredLotteries.map(([name]) => name));
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

  // Check if prizes exist
  const existingPrizes = await db.select().from(prizes);
  if (existingPrizes.length === 0) {
    await db.insert(prizes).values([
      { playType: "directo", firstPrizeMultiplier: "50.00", secondPrizeMultiplier: "15.00", thirdPrizeMultiplier: "10.00", paleFirstSecondMultiplier: "0.00", paleFirstThirdMultiplier: "0.00", paleSecondThirdMultiplier: "0.00", fixedMultiplier: "0.00", description: "1er premio=50x, 2do=15x, 3ro=10x por euro" },
      { playType: "pale", firstPrizeMultiplier: "0.00", secondPrizeMultiplier: "0.00", thirdPrizeMultiplier: "0.00", paleFirstSecondMultiplier: "25.00", paleFirstThirdMultiplier: "20.00", paleSecondThirdMultiplier: "15.00", fixedMultiplier: "0.00", description: "1er+2do=25x, 1er+3ro=20x, 2do+3ro=15x por euro" },
      { playType: "terna", firstPrizeMultiplier: "0.00", secondPrizeMultiplier: "0.00", thirdPrizeMultiplier: "0.00", paleFirstSecondMultiplier: "0.00", paleFirstThirdMultiplier: "0.00", paleSecondThirdMultiplier: "0.00", fixedMultiplier: "500.00", description: "3 cifras = 500x por euro" },
      { playType: "cuatrena", firstPrizeMultiplier: "0.00", secondPrizeMultiplier: "0.00", thirdPrizeMultiplier: "0.00", paleFirstSecondMultiplier: "0.00", paleFirstThirdMultiplier: "0.00", paleSecondThirdMultiplier: "0.00", fixedMultiplier: "4000.00", description: "4 cifras = 4,000x por euro" },
      { playType: "tripleta", firstPrizeMultiplier: "0.00", secondPrizeMultiplier: "0.00", thirdPrizeMultiplier: "0.00", paleFirstSecondMultiplier: "0.00", paleFirstThirdMultiplier: "0.00", paleSecondThirdMultiplier: "0.00", fixedMultiplier: "10000.00", description: "Tripleta = 10,000x por euro" },
    ]);
    console.log("Default prizes seeded");
  } else {
    console.log("Prizes already exist:", existingPrizes.length);
  }

  console.log("Database sync and seed complete!");
  process.exit(0);
}

syncAndSeed().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
