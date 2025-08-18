// src/app/core/models/db.ts
import Dexie, { Table } from 'dexie';
import { SubCategory, CategoryRule } from './category.model';

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

// Import Record Model - Updated with bank info
export interface ImportRecord {
  id?: number;
  accountId: number;
  displayName?: string; // User-provided name for the import
  fileName: string;
  fileSize: number;
  fileFormat?: 'csv' | 'txt' | 'excel'; // File format
  bankName?: string; // Which bank this import is from
  importedAt: Date;
  totalRows: number;
  successCount: number;
  errorCount: number;
  debitCount: number;
  creditCount: number;
  duplicateCount?: number; // New field for tracking duplicates
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string;
}

// Transaction Model - Updated with bank info and fingerprint
export interface Transaction {
  id?: number;
  accountId: number;
  importId: number;
  date: string;
  narration: string;
  amount: number;

  // Bank-specific fields
  bankName?: string;
  referenceNo?: string;

  // Original fields for fingerprint generation
  valueDate?: string;
  withdrawalAmt?: number;
  depositAmt?: number;
  closingBalance?: number;

  // Deduplication fields
  fingerprint: string; // Unique hash for duplicate detection
  isDuplicate?: boolean;
  originalTransactionId?: number; // Reference to original if duplicate

  category?: string;
  tags?: string[];
  isReconciled: boolean;
  createdAt: Date;
}

// Duplicate detection result
export interface DuplicateCheckResult {
  transaction: any; // Using any to handle both UnifiedTransaction and ExtendedParsedTransaction
  isExactDuplicate: boolean;
  existingTransaction?: Transaction;
  confidence: 'exact' | 'high' | 'medium' | 'low';
}

// Database Class
export class SpendLiteDB extends Dexie {
  accounts!: Table<Account>;
  imports!: Table<ImportRecord>;
  transactions!: Table<Transaction>;
  subCategories!: Table<SubCategory>;
  categoryRules!: Table<CategoryRule>;

  constructor() {
    super('SpendLiteDB');

    // Define schema - Version 2 with fingerprint index
    this.version(3).stores({
      accounts: '++id, name, bankName, isActive',
      imports: '++id, accountId, importedAt, status',
      transactions: '++id, accountId, importId, date, amount, fingerprint, [accountId+fingerprint], [accountId+date], category',
      subCategories: '++id, rootId, label',
      categoryRules: '++id, merchantKey, rootCategory, createdBy'
    });
  }
}

// Create database instance
export const db = new SpendLiteDB();
