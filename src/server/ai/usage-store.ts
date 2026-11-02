import { prisma } from "@/lib/prisma";
import type { UsageStore } from "./usage";

/** Implementação de UsageStore sobre o Prisma (a tabela AiUsage já existe). */
export const prismaUsageStore: UsageStore = {
  async record(data) {
    const row = await prisma.aiUsage.create({
      data: { ...data, costMicroUsd: BigInt(Math.round(data.costMicroUsd)) },
      select: { id: true },
    });
    return row;
  },
  async apiSpentMicroUsd(since) {
    const sum = await prisma.aiUsage.aggregate({
      where: { createdAt: { gte: since }, success: true, model: { startsWith: "anthropic-api:" } },
      _sum: { costMicroUsd: true },
    });
    return Number(sum._sum.costMicroUsd ?? 0);
  },
  async markFailed(id, error) {
    await prisma.aiUsage.update({ where: { id }, data: { success: false, error } });
  },
};
