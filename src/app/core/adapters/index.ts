// core/adapters/index.ts
import { BankAdapterRegistry } from './bank-adapter.registry';
import { HDFCAdapter } from './hdfc.adapter';
import { SBIAdapter } from './sbi.adapter';

// Initialize all bank adapters
export function initializeBankAdapters(): void {
  // Clear any existing adapters
  BankAdapterRegistry.clear();

  // Register all available adapters
  BankAdapterRegistry.register(new HDFCAdapter());
  BankAdapterRegistry.register(new SBIAdapter());

  // Add more adapters as you create them:
  // BankAdapterRegistry.register(new AxisAdapter());
  // BankAdapterRegistry.register(new KotakAdapter());
  // BankAdapterRegistry.register(new CitiAdapter());
}

// Export for convenience
export type { BankAdapter } from './bank-adapter.interface';
export { BankAdapterRegistry } from './bank-adapter.registry';
export { HDFCAdapter } from './hdfc.adapter';
export { SBIAdapter } from './sbi.adapter';
