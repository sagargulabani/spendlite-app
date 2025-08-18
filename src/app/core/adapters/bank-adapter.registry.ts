// core/adapters/bank-adapter.registry.ts
import { BankAdapter } from './bank-adapter.interface';

export class BankAdapterRegistry {
  private static adapters: Map<string, BankAdapter> = new Map();

  static register(adapter: BankAdapter): void {
    this.adapters.set(adapter.bankId, adapter);
  }

  static getAdapter(bankId: string): BankAdapter | undefined {
    return this.adapters.get(bankId);
  }

  static detectAdapter(narration: string): BankAdapter | undefined {
    // Try to auto-detect which bank format this is
    for (const adapter of this.adapters.values()) {
      if (adapter.canHandle(narration)) {
        return adapter;
      }
    }
    return undefined;
  }

  static getAllAdapters(): BankAdapter[] {
    return Array.from(this.adapters.values());
  }

  static clear(): void {
    this.adapters.clear();
  }
}
