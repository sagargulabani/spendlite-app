import Dexie, { Table } from 'dexie';

// Account Model
export interface Account {
  id?: number;
  name: string;
  bankName: string;
  accountType: 'savings' | 'current' | 'credit';
  accountNumber?: string; // Last 4 digits only for privacy
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Import Record Model
export interface ImportRecord {
  id?: number;
  accountId: number;
  fileName: string;
  fileSize: number;
  importedAt: Date;
  totalRows: number;
  successCount: number;
  errorCount: number;
  debitCount: number;
  creditCount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string;
}

// Transaction Model (for future use)
export interface Transaction {
  id?: number;
  accountId: number;
  importId: number;
  date: string;
  narration: string;
  amount: number;
  balance?: number;
  category?: string;
  tags?: string[];
  isReconciled: boolean;
  createdAt: Date;
}

// Database Class
export class SpendLiteDB extends Dexie {
  accounts!: Table<Account>;
  imports!: Table<ImportRecord>;
  transactions!: Table<Transaction>;

  constructor() {
    super('SpendLiteDB');

    // Define schema
    this.version(1).stores({
      accounts: '++id, name, bankName, isActive',
      imports: '++id, accountId, importedAt, status',
      transactions: '++id, accountId, importId, date, amount, [accountId+date]'
    });
  }
}

// Create database instance
export const db = new SpendLiteDB();
