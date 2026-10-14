import type { BudgetStore } from "./budget-ledger";
import type { LlmEvent } from "./types";

export class MemoryBudget implements BudgetStore {
  spend = new Map<string, number>();
  features = new Map<string, number>();
  events: LlmEvent[] = [];

  async getSpend(userId: string, month: string): Promise<number> {
    return this.spend.get(`${userId}:${month}`) ?? 0;
  }

  async addSpend(userId: string, month: string, amount: number, feature: string): Promise<number> {
    const key = `${userId}:${month}`;
    const next = (this.spend.get(key) ?? 0) + amount;
    this.spend.set(key, next);
    const featureKey = `${key}:${feature}`;
    this.features.set(featureKey, (this.features.get(featureKey) ?? 0) + amount);
    return next;
  }

  async recordEvent(event: LlmEvent): Promise<void> {
    this.events.push(event);
  }
}
