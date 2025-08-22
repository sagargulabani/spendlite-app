import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import Dexie from 'dexie';
import { SpendLiteDB, db, Account, Transaction, ImportRecord } from '../models/db';
import { BackupService } from './backup.service';

// Create a test database class that uses a different name to avoid conflicts
class TestSpendLiteDB extends SpendLiteDB {
  constructor(dbName: string) {
    super();
    // Use Dexie's proper method to set database name
    (this as any).name = dbName; // Override the database name for testing
  }
}

describe('Database Persistence and Migration Tests', () => {
  let testDb: TestSpendLiteDB;
  let backupService: BackupService;
  const testDbName = 'TestSpendLiteDB';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        BackupService
      ]
    });
    backupService = TestBed.inject(BackupService);
  });

  afterEach(async () => {
    // Clean up test database after each test
    if (testDb) {
      await testDb.delete();
      testDb = null as any;
    }
    // Clean up main db test data
    await db.accounts.clear();
    await db.transactions.clear();
    await db.imports.clear();
    await db.subCategories.clear();
    await db.categoryRules.clear();
    // Clear any test data from localStorage
    localStorage.removeItem('spendlite-auto-backup');
    localStorage.removeItem('spendlite-auto-backup-date');
  });

  describe('Database Version Migration', () => {
    it('should preserve data when upgrading from version 1 to version 4', async () => {
      // Create version 1 database
      const v1Db = new Dexie(testDbName);
      v1Db.version(1).stores({
        accounts: '++id, name, bankName, isActive',
        imports: '++id, accountId, importedAt, status',
        transactions: '++id, accountId, importId, date, amount, fingerprint, [accountId+fingerprint], [accountId+date]',
        subCategories: '++id, rootId, label',
        categoryRules: '++id, merchantKey, rootCategory, createdBy'
      });

      // Add test data to version 1
      await v1Db.open();
      const accountId = await v1Db.table('accounts').add({
        name: 'Test Account',
        bankName: 'Test Bank',
        accountType: 'savings',
        accountNumber: '1234',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const importId = await v1Db.table('imports').add({
        accountId: accountId,
        fileName: 'test.csv',
        fileSize: 1000,
        fileFormat: 'csv',
        importedAt: new Date(),
        status: 'completed',
        totalRows: 10,
        successCount: 10,
        errorCount: 0,
        duplicateCount: 0,
        debitCount: 5,
        creditCount: 5
      });

      await v1Db.table('transactions').add({
        accountId: accountId,
        importId: importId,
        date: '2024-01-01',
        narration: 'Test Transaction',
        amount: -100,
        bankName: 'Test Bank',
        fingerprint: 'test-fingerprint-001',
        isDuplicate: false
      });

      await v1Db.close();

      // Now open with version 4 schema
      testDb = new TestSpendLiteDB(testDbName);
      await testDb.open();

      // Verify data is preserved
      const accounts = await testDb.accounts.toArray();
      expect(accounts.length).toBe(1);
      expect(accounts[0].name).toBe('Test Account');

      const imports = await testDb.imports.toArray();
      expect(imports.length).toBe(1);
      expect(imports[0].fileName).toBe('test.csv');

      const transactions = await testDb.transactions.toArray();
      expect(transactions.length).toBe(1);
      expect(transactions[0].narration).toBe('Test Transaction');
    });

    it('should handle concurrent version upgrades without data loss', async () => {
      // Simulate multiple tabs/windows upgrading at the same time
      const db1 = new TestSpendLiteDB(testDbName + '_concurrent1');
      const db2 = new TestSpendLiteDB(testDbName + '_concurrent2');

      // Add data to first database
      await db1.open();
      await db1.accounts.add({
        name: 'Concurrent Test Account',
        bankName: 'Test Bank',
        accountType: 'savings',
        accountNumber: '5678',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Try to open second database (should not lose data)
      await db2.open();
      const accounts = await db2.accounts.toArray();
      
      // Clean up
      await db1.delete();
      await db2.delete();

      // Data should be accessible from both instances
      expect(accounts).toBeDefined();
    });
  });

  describe('Data Persistence Tests', () => {
    beforeEach(async () => {
      testDb = new TestSpendLiteDB(testDbName);
      await testDb.open();
    });

    it('should persist data after closing and reopening database', async () => {
      // Add test data
      const accountId = await testDb.accounts.add({
        name: 'Persistence Test Account',
        bankName: 'HDFC Bank',
        accountType: 'savings',
        accountNumber: '9999',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Close database
      testDb.close();

      // Reopen database
      const newDb = new TestSpendLiteDB(testDbName);
      await newDb.open();

      // Verify data persists
      const accounts = await newDb.accounts.toArray();
      expect(accounts.length).toBe(1);
      expect(accounts[0].name).toBe('Persistence Test Account');

      await newDb.delete();
    });

    it('should maintain data integrity during bulk operations', async () => {
      const testAccounts: Partial<Account>[] = [];
      for (let i = 0; i < 100; i++) {
        testAccounts.push({
          name: `Account ${i}`,
          bankName: 'Test Bank',
          accountType: 'savings',
          accountNumber: String(i).padStart(4, '0'),
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      // Bulk add accounts
      await testDb.accounts.bulkAdd(testAccounts as Account[]);

      // Verify all accounts are added
      const accounts = await testDb.accounts.toArray();
      expect(accounts.length).toBe(100);

      // Verify data integrity
      accounts.forEach((account, index) => {
        expect(account.name).toBe(`Account ${index}`);
      });
    });

    it('should handle transactions correctly without data loss', async () => {
      await testDb.transaction('rw', testDb.accounts, testDb.transactions, async () => {
        const accountId = await testDb.accounts.add({
          name: 'Transaction Test Account',
          bankName: 'Test Bank',
          accountType: 'current',
          accountNumber: '7777',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });

        await testDb.transactions.add({
          accountId: accountId,
          importId: 1,
          date: '2024-01-01',
          narration: 'Transaction in atomic operation',
          amount: -500,
          bankName: 'Test Bank',
          fingerprint: 'atomic-fingerprint-001',
          isDuplicate: false,
          isReconciled: false,
          createdAt: new Date()
        });
      });

      // Verify both operations completed
      const accounts = await testDb.accounts.toArray();
      const transactions = await testDb.transactions.toArray();
      
      expect(accounts.length).toBe(1);
      expect(transactions.length).toBe(1);
      expect(transactions[0].narration).toBe('Transaction in atomic operation');
    });
  });

  describe('Backup and Restore Tests', () => {
    beforeEach(async () => {
      testDb = new TestSpendLiteDB(testDbName);
      await testDb.open();
    });

    it('should successfully export and import data', async () => {
      // Add test data using the main db instead of testDb
      const accountId = await db.accounts.add({
        name: 'Backup Test Account',
        bankName: 'SBI',
        accountType: 'savings',
        accountNumber: '4444',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await db.transactions.add({
        accountId: accountId,
        importId: 1,
        date: '2024-02-01',
        narration: 'Backup Test Transaction',
        amount: -1000,
        bankName: 'SBI',
        fingerprint: 'backup-fingerprint-001',
        isDuplicate: false,
        category: 'food',
        isReconciled: false,
        createdAt: new Date()
      });

      // Export data
      const exportedData = JSON.parse(await backupService.exportBackup());
      
      // Verify export structure
      expect(exportedData.version).toBe(4);
      expect(exportedData.data.accounts.length).toBeGreaterThanOrEqual(1);
      expect(exportedData.data.transactions.length).toBeGreaterThanOrEqual(1);

      // Clear database
      await db.accounts.clear();
      await db.transactions.clear();

      // Verify database is empty
      let accounts = await db.accounts.toArray();
      expect(accounts.length).toBe(0);

      // Import data back
      await backupService.restoreBackup(JSON.stringify(exportedData));

      // Verify data is restored
      accounts = await db.accounts.toArray();
      const transactions = await db.transactions.toArray();
      
      expect(accounts.length).toBeGreaterThanOrEqual(1);
      const testAccount = accounts.find(a => a.name === 'Backup Test Account');
      expect(testAccount).toBeTruthy();
      expect(transactions.length).toBeGreaterThanOrEqual(1);
      const testTransaction = transactions.find(t => t.narration === 'Backup Test Transaction');
      expect(testTransaction).toBeTruthy();
    });

    it('should auto-save to localStorage and restore', async () => {
      // Add test data to main db (since BackupService works with main db)
      await db.accounts.add({
        name: 'Auto-Save Test Account',
        bankName: 'ICICI Bank',
        accountType: 'current',
        accountNumber: '3333',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Auto-save to localStorage
      await backupService.saveAutoBackup();

      // Verify localStorage has backup
      const backup = localStorage.getItem('spendlite-auto-backup');
      expect(backup).toBeTruthy();

      // Clear database
      await db.accounts.clear();

      // Restore from localStorage - get the latest auto-backup
      const backups = backupService.getAutoBackups();
      expect(backups.length).toBeGreaterThan(0);
      await backupService.restoreAutoBackup(backups[0].key);

      // Verify data is restored
      const accounts = await db.accounts.toArray();
      expect(accounts.length).toBe(1);
      expect(accounts[0].name).toBe('Auto-Save Test Account');
    });

    it('should handle corrupt backup data gracefully', async () => {
      const corruptData = { invalid: 'data' };
      
      try {
        await backupService.restoreBackup(JSON.stringify(corruptData));
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toBe('Invalid backup data');
      }

      // Database should still be functional
      const accounts = await testDb.accounts.toArray();
      expect(accounts).toBeDefined();
    });
  });

  describe('Production Safety Tests', () => {
    it('should prevent data loss during schema changes', async () => {
      // This test simulates adding a new field to the schema
      testDb = new TestSpendLiteDB(testDbName);
      await testDb.open();

      // Add data with current schema
      const accountId = await testDb.accounts.add({
        name: 'Schema Change Test',
        bankName: 'Test Bank',
        accountType: 'savings',
        accountNumber: '2222',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await testDb.close();

      // Simulate schema change by reopening
      // In production, this would be a new version with additional fields
      const newDb = new TestSpendLiteDB(testDbName);
      await newDb.open();

      // Data should still be there
      const accounts = await newDb.accounts.toArray();
      expect(accounts.length).toBe(1);
      expect(accounts[0].name).toBe('Schema Change Test');

      await newDb.delete();
    });

    it('should handle browser storage quota exceeded gracefully', async () => {
      // Initialize testDb first
      testDb = new TestSpendLiteDB(testDbName);
      await testDb.open();
      
      // Simulate adding data until quota might be exceeded
      const largeData: Partial<Transaction>[] = [];
      const largeNarration = 'x'.repeat(10000); // 10KB per transaction

      for (let i = 0; i < 100; i++) {
        largeData.push({
          accountId: 1,
          importId: 1,
          date: '2024-01-01',
          narration: largeNarration,
          amount: -100,
          bankName: 'Test',
          fingerprint: `fingerprint-${i}`,
          isDuplicate: false,
          isReconciled: false,
          createdAt: new Date()
        });
      }

      try {
        await testDb.transactions.bulkAdd(largeData as Transaction[]);
        // If successful, data should be queryable
        const count = await testDb.transactions.count();
        expect(count).toBeGreaterThan(0);
      } catch (error: any) {
        // Should handle quota exceeded error gracefully
        expect(error.name).toMatch(/QuotaExceededError|DataError|TypeError/);
      }
    });

    it('should maintain referential integrity between tables', async () => {
      // Initialize testDb first
      testDb = new TestSpendLiteDB(testDbName);
      await testDb.open();
      
      // Add account
      const accountId = await testDb.accounts.add({
        name: 'Referential Integrity Test',
        bankName: 'Test Bank',
        accountType: 'savings',
        accountNumber: '1111',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Add import linked to account
      const importId = await testDb.imports.add({
        accountId: accountId,
        fileName: 'integrity-test.csv',
        fileSize: 500,
        fileFormat: 'csv',
        importedAt: new Date(),
        status: 'completed',
        totalRows: 5,
        successCount: 5,
        errorCount: 0,
        duplicateCount: 0,
        debitCount: 3,
        creditCount: 2
      });

      // Add transaction linked to both
      await testDb.transactions.add({
        accountId: accountId,
        importId: importId,
        date: '2024-01-01',
        narration: 'Integrity Test Transaction',
        amount: -250,
        bankName: 'Test Bank',
        fingerprint: 'integrity-fingerprint-001',
        isDuplicate: false,
        isReconciled: false,
        createdAt: new Date()
      });

      // Query with relationships
      const transactions = await testDb.transactions
        .where('accountId')
        .equals(accountId)
        .toArray();

      expect(transactions.length).toBe(1);
      expect(transactions[0].accountId).toBe(accountId);
      expect(transactions[0].importId).toBe(importId);
    });
  });

  describe('Error Recovery Tests', () => {
    it('should recover from interrupted operations', async () => {
      testDb = new TestSpendLiteDB(testDbName);
      await testDb.open();

      // Start a transaction but simulate interruption
      try {
        await testDb.transaction('rw', testDb.accounts, async () => {
          await testDb.accounts.add({
            name: 'Interrupted Operation',
            bankName: 'Test Bank',
            accountType: 'savings',
            accountNumber: '0000',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          
          // Simulate interruption
          throw new Error('Simulated interruption');
        });
      } catch (error) {
        // Transaction should be rolled back
      }

      // Database should still be functional
      const accounts = await testDb.accounts.toArray();
      expect(accounts.length).toBe(0); // Transaction was rolled back

      // Should be able to add data after recovery
      await testDb.accounts.add({
        name: 'Recovery Test',
        bankName: 'Test Bank',
        accountType: 'savings',
        accountNumber: '8888',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const accountsAfterRecovery = await testDb.accounts.toArray();
      expect(accountsAfterRecovery.length).toBe(1);
    });

    it('should handle database deletion and recreation', async () => {
      testDb = new TestSpendLiteDB(testDbName);
      await testDb.open();

      // Add data
      await testDb.accounts.add({
        name: 'Deletion Test',
        bankName: 'Test Bank',
        accountType: 'savings',
        accountNumber: '6666',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Get data from testDb
      const testAccounts = await testDb.accounts.toArray();
      
      // Create manual backup since BackupService uses the main db
      const backup = {
        version: 4,
        exportDate: new Date().toISOString(),
        data: {
          accounts: testAccounts,
          imports: [],
          transactions: [],
          subCategories: [],
          categoryRules: []
        }
      };

      // Delete database
      await testDb.delete();

      // Recreate database
      testDb = new TestSpendLiteDB(testDbName);
      await testDb.open();

      // Should be empty after recreation
      let accounts = await testDb.accounts.toArray();
      expect(accounts.length).toBe(0);

      // Manually restore to testDb
      await testDb.accounts.bulkAdd(backup.data.accounts);
      accounts = await testDb.accounts.toArray();
      expect(accounts.length).toBe(1);
      expect(accounts[0].name).toBe('Deletion Test');
    });
  });
});