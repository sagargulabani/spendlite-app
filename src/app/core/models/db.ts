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

  // Transfer linking fields
  isInternalTransfer?: boolean;
  linkedAccountId?: number; // The account on the other side of the transfer
  linkedTransactionId?: number; // The matching transaction in the linked account
  transferGroupId?: string; // UUID to group related transfer transactions
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

    // Version 1: Initial schema
    this.version(1).stores({
      accounts: '++id, name, bankName, isActive',
      imports: '++id, accountId, importedAt, status',
      transactions: '++id, accountId, importId, date, amount, fingerprint, [accountId+fingerprint], [accountId+date]',
      subCategories: '++id, rootId, label',
      categoryRules: '++id, merchantKey, rootCategory, createdBy'
    });

    // Version 2: Added fingerprinting (no schema change needed)
    this.version(2).stores({
      accounts: '++id, name, bankName, isActive',
      imports: '++id, accountId, importedAt, status',
      transactions: '++id, accountId, importId, date, amount, fingerprint, [accountId+fingerprint], [accountId+date]',
      subCategories: '++id, rootId, label',
      categoryRules: '++id, merchantKey, rootCategory, createdBy'
    });

    // Version 3: Added category index
    this.version(3).stores({
      accounts: '++id, name, bankName, isActive',
      imports: '++id, accountId, importedAt, status',
      transactions: '++id, accountId, importId, date, amount, fingerprint, [accountId+fingerprint], [accountId+date], category',
      subCategories: '++id, rootId, label',
      categoryRules: '++id, merchantKey, rootCategory, createdBy'
    });

    // Version 4: Added transfer linking
    this.version(4).stores({
      accounts: '++id, name, bankName, isActive',
      imports: '++id, accountId, importedAt, status',
      transactions: '++id, accountId, importId, date, amount, fingerprint, [accountId+fingerprint], [accountId+date], category, linkedAccountId, transferGroupId',
      subCategories: '++id, rootId, label',
      categoryRules: '++id, merchantKey, rootCategory, createdBy'
    }).upgrade(trans => {
      // No data transformation needed, just schema changes
    });

    // Handle database open errors gracefully
    this.on('blocked', () => {
      console.warn('Database upgrade blocked by another tab. Please close other tabs and reload.');
    });

    this.on('versionchange', () => {
      console.log('Database version changed in another tab');
    });
  }
}

// Storage persistence utilities
export async function requestPersistentStorage(): Promise<boolean> {
  if ('storage' in navigator && 'persist' in navigator.storage) {
    try {
      // First check if already persisted
      const isPersisted = await navigator.storage.persisted();
      console.log('Current persistence status:', isPersisted);
      
      if (isPersisted) {
        console.log('✅ Storage is already persistent');
        return true;
      }

      // Log browser info for debugging
      console.log('Browser info:', {
        userAgent: navigator.userAgent,
        cookieEnabled: navigator.cookieEnabled,
        onLine: navigator.onLine,
        storage: 'storage' in navigator,
        persist: 'persist' in navigator.storage
      });

      // Request persistence
      console.log('Requesting persistent storage...');
      const granted = await navigator.storage.persist();
      
      // Check again to confirm
      const isNowPersisted = await navigator.storage.persisted();
      
      console.log('Persistence request result:', {
        granted,
        isNowPersisted,
        timestamp: new Date().toISOString()
      });

      if (granted || isNowPersisted) {
        console.log('✅ Persistent storage granted');
        return true;
      } else {
        console.warn('⚠️ Persistent storage denied. Chrome requirements:');
        console.warn('- Site must be bookmarked OR');
        console.warn('- High site engagement score OR');
        console.warn('- Site added to home screen OR');
        console.warn('- Push notifications enabled');
        return false;
      }
    } catch (error) {
      console.error('Error requesting persistent storage:', error);
      return false;
    }
  } else {
    console.warn('Persistent Storage API not supported in this browser');
    return false;
  }
}

export async function getStorageEstimate(): Promise<{
  usage: number;
  quota: number;
  percentage: number;
} | null> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percentage = quota > 0 ? (usage / quota) * 100 : 0;
      
      return {
        usage,
        quota,
        percentage
      };
    } catch (error) {
      console.error('Error getting storage estimate:', error);
      return null;
    }
  }
  return null;
}

// Create database instance
export const db = new SpendLiteDB();

// Initialize database with persistence
let isDbInitialized = false;
let persistenceRequested = false;

export async function initializeDatabase(): Promise<boolean> {
  if (isDbInitialized) return true;
  
  try {
    // Open the database
    await db.open();
    console.log('✅ Database opened successfully');
    
    // Check if already persistent
    const isPersisted = await checkPersistenceStatus();
    if (isPersisted) {
      console.log('✅ Storage is already persistent');
      persistenceRequested = true;
    } else {
      console.log('ℹ️ Persistent storage not yet granted. Will request on first user interaction.');
    }
    
    // Check storage quota
    const estimate = await getStorageEstimate();
    if (estimate) {
      console.log(`📊 Storage: ${(estimate.usage / 1024 / 1024).toFixed(2)}MB / ${(estimate.quota / 1024 / 1024).toFixed(2)}MB (${estimate.percentage.toFixed(2)}%)`);
      
      // Warn if storage is getting full
      if (estimate.percentage > 80) {
        console.warn('⚠️ Storage usage is above 80%. Consider exporting and cleaning old data.');
      }
    }
    
    isDbInitialized = true;
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    throw error;
  }
}

export async function checkPersistenceStatus(): Promise<boolean> {
  if ('storage' in navigator && 'persisted' in navigator.storage) {
    try {
      return await navigator.storage.persisted();
    } catch (error) {
      console.error('Error checking persistence status:', error);
      return false;
    }
  }
  return false;
}

// Request persistence on user interaction
export async function requestPersistenceOnInteraction(): Promise<boolean> {
  if (persistenceRequested) return true;
  
  const granted = await requestPersistentStorage();
  if (granted) {
    persistenceRequested = true;
  }
  return granted;
}
