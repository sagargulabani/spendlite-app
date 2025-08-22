import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { BackupService, BackupData } from './backup.service';
import { db } from '../models/db';
import Dexie from 'dexie';

describe('BackupService', () => {
  let service: BackupService;
  
  // Mock data for testing
  const mockAccounts = [
    {
      id: 1,
      name: 'Test Savings',
      bankName: 'HDFC',
      accountType: 'savings' as const,
      accountNumber: '1234',
      isActive: true,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01')
    },
    {
      id: 2,
      name: 'Test Current',
      bankName: 'SBI',
      accountType: 'current' as const,
      accountNumber: '5678',
      isActive: true,
      createdAt: new Date('2024-01-02'),
      updatedAt: new Date('2024-01-02')
    }
  ];

  const mockImports = [
    {
      id: 1,
      accountId: 1,
      displayName: 'January Import',
      fileName: 'test.csv',
      fileSize: 1024,
      fileFormat: 'csv' as const,
      bankName: 'HDFC',
      importedAt: new Date('2024-01-15'),
      totalRows: 10,
      successCount: 10,
      errorCount: 0,
      duplicateCount: 0,
      debitCount: 5,
      creditCount: 5,
      status: 'completed' as const
    }
  ];

  const mockTransactions = [
    {
      id: 1,
      accountId: 1,
      importId: 1,
      date: '2024-01-10',
      narration: 'Test Transaction 1',
      amount: -1000,
      bankName: 'HDFC',
      fingerprint: 'test-fingerprint-1',
      isDuplicate: false,
      isReconciled: false,
      category: 'shopping',
      createdAt: new Date('2024-01-15')
    },
    {
      id: 2,
      accountId: 1,
      importId: 1,
      date: '2024-01-11',
      narration: 'Test Transaction 2',
      amount: 5000,
      bankName: 'HDFC',
      fingerprint: 'test-fingerprint-2',
      isDuplicate: false,
      isReconciled: false,
      category: 'income',
      createdAt: new Date('2024-01-15')
    }
  ];

  const mockCategoryRules = [
    {
      id: 1,
      merchantKey: 'AMAZON',
      rootCategory: 'shopping',
      confidence: 0.9,
      createdBy: 'user',
      usageCount: 5,
      lastUsed: new Date('2024-01-20'),
      createdAt: new Date('2024-01-10')
    }
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        BackupService
      ]
    });
    service = TestBed.inject(BackupService);
    
    // Clear localStorage before each test
    localStorage.clear();
    
    // Mock the database methods
    spyOn(db, 'isOpen').and.returnValue(true);
    spyOn(db, 'open').and.returnValue(Promise.resolve() as any);
  });

  afterEach(() => {
    localStorage.clear();
    // Uninstall jasmine clock if it was installed
    try {
      jasmine.clock().uninstall();
    } catch (e) {
      // Clock was not installed, ignore
    }
  });

  describe('exportBackup', () => {
    it('should export all data as JSON string', async () => {
      // Mock database queries
      spyOn(db.accounts, 'toArray').and.returnValue(Promise.resolve(mockAccounts) as any);
      spyOn(db.imports, 'toArray').and.returnValue(Promise.resolve(mockImports) as any);
      spyOn(db.transactions, 'toArray').and.returnValue(Promise.resolve(mockTransactions) as any);
      spyOn(db.subCategories, 'toArray').and.returnValue(Promise.resolve([]) as any);
      spyOn(db.categoryRules, 'toArray').and.returnValue(Promise.resolve(mockCategoryRules) as any);

      const result = await service.exportBackup();
      const backup = JSON.parse(result);

      expect(backup.version).toBe('1.0.0');
      expect(backup.createdAt).toBeDefined();
      // Compare the data content, dates will be serialized as strings
      expect(backup.accounts.length).toBe(mockAccounts.length);
      expect(backup.accounts[0].name).toBe(mockAccounts[0].name);
      expect(backup.imports.length).toBe(mockImports.length);
      expect(backup.transactions.length).toBe(mockTransactions.length);
      expect(backup.categoryRules.length).toBe(mockCategoryRules.length);
    });

    it('should handle empty database gracefully', async () => {
      spyOn(db.accounts, 'toArray').and.returnValue(Promise.resolve([]) as any);
      spyOn(db.imports, 'toArray').and.returnValue(Promise.resolve([]) as any);
      spyOn(db.transactions, 'toArray').and.returnValue(Promise.resolve([]) as any);
      spyOn(db.subCategories, 'toArray').and.returnValue(Promise.resolve([]) as any);
      spyOn(db.categoryRules, 'toArray').and.returnValue(Promise.resolve([]) as any);

      const result = await service.exportBackup();
      const backup = JSON.parse(result);

      expect(backup.accounts).toEqual([]);
      expect(backup.imports).toEqual([]);
      expect(backup.transactions).toEqual([]);
      expect(backup.subCategories).toEqual([]);
      expect(backup.categoryRules).toEqual([]);
    });

    it('should handle database errors', async () => {
      spyOn(db.accounts, 'toArray').and.returnValue(Promise.reject(new Error('Database error')) as any);

      await expectAsync(service.exportBackup()).toBeRejectedWithError('Database error');
    });
  });

  describe('downloadBackup', () => {
    it('should create and download a backup file', async () => {
      spyOn(service, 'exportBackup').and.returnValue(Promise.resolve('{"test":"data"}'));
      
      // Mock DOM methods
      const mockAnchor = {
        href: '',
        download: '',
        click: jasmine.createSpy('click')
      };
      spyOn(document, 'createElement').and.returnValue(mockAnchor as any);
      spyOn(document.body, 'appendChild');
      spyOn(document.body, 'removeChild');
      spyOn(URL, 'createObjectURL').and.returnValue('blob:test-url');
      spyOn(URL, 'revokeObjectURL');

      await service.downloadBackup();

      expect(service.exportBackup).toHaveBeenCalled();
      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(mockAnchor.download).toContain('spendlite-backup-');
      expect(mockAnchor.download).toContain('.json');
      expect(mockAnchor.click).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
    });
  });

  describe('restoreBackup', () => {
    let validBackup: BackupData;

    beforeEach(() => {
      validBackup = {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        accounts: mockAccounts as any,
        imports: mockImports as any,
        transactions: mockTransactions as any,
        subCategories: [],
        categoryRules: mockCategoryRules as any
      };

      // Mock database clear and bulk operations
      spyOn(db.accounts, 'clear').and.returnValue(Promise.resolve() as any);
      spyOn(db.imports, 'clear').and.returnValue(Promise.resolve() as any);
      spyOn(db.transactions, 'clear').and.returnValue(Promise.resolve() as any);
      spyOn(db.subCategories, 'clear').and.returnValue(Promise.resolve() as any);
      spyOn(db.categoryRules, 'clear').and.returnValue(Promise.resolve() as any);

      spyOn(db.accounts, 'bulkPut').and.returnValue(Promise.resolve() as any);
      spyOn(db.imports, 'bulkPut').and.returnValue(Promise.resolve() as any);
      spyOn(db.transactions, 'bulkPut').and.returnValue(Promise.resolve() as any);
      spyOn(db.subCategories, 'bulkPut').and.returnValue(Promise.resolve() as any);
      spyOn(db.categoryRules, 'bulkPut').and.returnValue(Promise.resolve() as any);
    });

    it('should restore valid backup data', async () => {
      const jsonData = JSON.stringify(validBackup);
      
      await service.restoreBackup(jsonData);

      expect(db.accounts.clear).toHaveBeenCalled();
      expect(db.imports.clear).toHaveBeenCalled();
      expect(db.transactions.clear).toHaveBeenCalled();
      expect(db.subCategories.clear).toHaveBeenCalled();
      expect(db.categoryRules.clear).toHaveBeenCalled();

      expect(db.accounts.bulkPut).toHaveBeenCalled();
      expect(db.imports.bulkPut).toHaveBeenCalled();
      expect(db.transactions.bulkPut).toHaveBeenCalled();
      expect(db.categoryRules.bulkPut).toHaveBeenCalled();
    });

    it('should convert date strings to Date objects', async () => {
      const backupWithStringDates = {
        ...validBackup,
        accounts: [{
          ...mockAccounts[0],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z'
        }]
      };

      await service.restoreBackup(JSON.stringify(backupWithStringDates));

      const bulkPutCall = (db.accounts.bulkPut as jasmine.Spy).calls.mostRecent();
      const restoredAccounts = bulkPutCall.args[0];
      
      expect(restoredAccounts[0].createdAt).toEqual(jasmine.any(Date));
      expect(restoredAccounts[0].updatedAt).toEqual(jasmine.any(Date));
    });

    it('should handle invalid JSON', async () => {
      const invalidJson = 'not valid json';
      
      await expectAsync(service.restoreBackup(invalidJson)).toBeRejected();
    });

    it('should reject invalid backup format', async () => {
      const invalidBackup = {
        notValid: 'backup structure'
      };
      
      await expectAsync(service.restoreBackup(JSON.stringify(invalidBackup)))
        .toBeRejectedWithError('Invalid backup file format');
    });

    it('should handle large transaction sets in batches', async () => {
      const largeBackup = {
        ...validBackup,
        transactions: Array(250).fill(null).map((_, i) => ({
          ...mockTransactions[0],
          id: i + 1,
          narration: `Transaction ${i + 1}`
        }))
      };

      await service.restoreBackup(JSON.stringify(largeBackup));

      // Should be called 3 times (100 + 100 + 50)
      expect(db.transactions.bulkPut).toHaveBeenCalledTimes(3);
    });

    it('should open database if not already open', async () => {
      (db.isOpen as jasmine.Spy).and.returnValue(false);
      
      await service.restoreBackup(JSON.stringify(validBackup));

      expect(db.open).toHaveBeenCalled();
    });
  });

  describe('uploadAndRestore', () => {
    it('should read file and restore backup', async () => {
      const mockFile = new File(['{"test":"data"}'], 'backup.json', { type: 'application/json' });
      spyOn(service, 'restoreBackup').and.returnValue(Promise.resolve());

      await service.uploadAndRestore(mockFile);

      expect(service.restoreBackup).toHaveBeenCalledWith('{"test":"data"}');
    });

    it('should handle file read errors', async () => {
      const mockFile = {} as File; // Invalid file object
      
      await expectAsync(service.uploadAndRestore(mockFile)).toBeRejected();
    });
  });

  describe('getBackupStats', () => {
    it('should return database statistics', async () => {
      spyOn(db.accounts, 'count').and.returnValue(Promise.resolve(2) as any);
      spyOn(db.transactions, 'count').and.returnValue(Promise.resolve(50) as any);
      spyOn(db.imports, 'count').and.returnValue(Promise.resolve(3) as any);
      spyOn(db.subCategories, 'count').and.returnValue(Promise.resolve(10) as any);
      spyOn(db.categoryRules, 'count').and.returnValue(Promise.resolve(15) as any);
      
      spyOn(db.transactions, 'orderBy').and.returnValue({
        first: () => Promise.resolve({ date: '2024-01-01' }),
        reverse: () => ({
          first: () => Promise.resolve({ date: '2024-12-31' })
        })
      } as any);

      const stats = await service.getBackupStats();

      expect(stats.accountsCount).toBe(2);
      expect(stats.transactionsCount).toBe(50);
      expect(stats.importsCount).toBe(3);
      expect(stats.categoriesCount).toBe(10);
      expect(stats.rulesCount).toBe(15);
      expect(stats.oldestTransaction).toBe('2024-01-01');
      expect(stats.newestTransaction).toBe('2024-12-31');
    });

    it('should handle empty database', async () => {
      spyOn(db.accounts, 'count').and.returnValue(Promise.resolve(0) as any);
      spyOn(db.transactions, 'count').and.returnValue(Promise.resolve(0) as any);
      spyOn(db.imports, 'count').and.returnValue(Promise.resolve(0) as any);
      spyOn(db.subCategories, 'count').and.returnValue(Promise.resolve(0) as any);
      spyOn(db.categoryRules, 'count').and.returnValue(Promise.resolve(0) as any);
      
      spyOn(db.transactions, 'orderBy').and.returnValue({
        first: () => Promise.resolve(undefined),
        reverse: () => ({
          first: () => Promise.resolve(undefined)
        })
      } as any);

      const stats = await service.getBackupStats();

      expect(stats.accountsCount).toBe(0);
      expect(stats.transactionsCount).toBe(0);
      expect(stats.oldestTransaction).toBeUndefined();
      expect(stats.newestTransaction).toBeUndefined();
    });
  });

  describe('Auto-backup functionality', () => {

    it('should enable auto-backup and store settings', async () => {
      spyOn(window, 'setInterval').and.returnValue(123 as any);
      
      await service.enableAutoBackup(24);

      expect(localStorage.getItem('autoBackupEnabled')).toBe('true');
      expect(localStorage.getItem('autoBackupInterval')).toBe('86400000'); // 24 hours in ms
      expect(window.setInterval).toHaveBeenCalledWith(jasmine.any(Function), 86400000);
    });

    it('should enable auto-backup and save auto-backup manually', async () => {
      spyOn(service, 'exportBackup').and.returnValue(Promise.resolve('{"backup":"data"}'));
      
      // Enable auto-backup
      await service.enableAutoBackup(1); // 1 hour interval
      expect(localStorage.getItem('autoBackupEnabled')).toBe('true');
      expect(localStorage.getItem('autoBackupInterval')).toBe('3600000');
      
      // Manually trigger an auto-backup
      await service.saveAutoBackup();
      
      // Check if auto-backup key exists (starts with autoBackup_)
      const backupKeys = Object.keys(localStorage).filter(key => key.startsWith('autoBackup_'));
      expect(backupKeys.length).toBeGreaterThan(0);
      
      const backupData = localStorage.getItem(backupKeys[0]);
      expect(backupData).toBe('{"backup":"data"}');
    });

    it('should keep only last 5 auto-backups', () => {
      // Create 7 mock auto-backups
      for (let i = 1; i <= 7; i++) {
        localStorage.setItem(`autoBackup_${i}`, `backup${i}`);
      }

      // Call the private method through the service
      (service as any).cleanOldAutoBackups();

      const remainingBackups = Object.keys(localStorage).filter(key => key.startsWith('autoBackup_'));
      expect(remainingBackups.length).toBe(5);
      expect(localStorage.getItem('autoBackup_1')).toBeNull(); // Oldest removed
      expect(localStorage.getItem('autoBackup_2')).toBeNull(); // Second oldest removed
      expect(localStorage.getItem('autoBackup_7')).toBeDefined(); // Newest kept
    });

    it('should get list of auto-backups', () => {
      const now = Date.now();
      localStorage.setItem(`autoBackup_${now - 3600000}`, 'backup1'); // 1 hour ago
      localStorage.setItem(`autoBackup_${now - 7200000}`, 'backup2'); // 2 hours ago
      localStorage.setItem(`autoBackup_${now}`, 'backup3'); // Now

      const backups = service.getAutoBackups();

      expect(backups.length).toBe(3);
      expect(backups[0].key).toBe(`autoBackup_${now}`); // Most recent first
      expect(backups[0].date.getTime()).toBe(now);
      expect(backups[0].size).toBe('backup3'.length);
    });

    it('should restore specific auto-backup', async () => {
      const backupData = JSON.stringify({ test: 'data' });
      localStorage.setItem('autoBackup_123456', backupData);
      spyOn(service, 'restoreBackup').and.returnValue(Promise.resolve());

      await service.restoreAutoBackup('autoBackup_123456');

      expect(service.restoreBackup).toHaveBeenCalledWith(backupData);
    });

    it('should throw error when auto-backup not found', async () => {
      await expectAsync(service.restoreAutoBackup('nonexistent'))
        .toBeRejectedWithError('Auto-backup not found');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle corrupted backup data gracefully', async () => {
      const corruptedBackup = {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        accounts: 'not an array', // Invalid data type
        imports: null,
        transactions: undefined
      };

      await expectAsync(service.restoreBackup(JSON.stringify(corruptedBackup)))
        .toBeRejectedWithError('Invalid backup file format');
    });

    it('should handle database connection errors during restore', async () => {
      (db.isOpen as jasmine.Spy).and.returnValue(false);
      (db.open as jasmine.Spy).and.returnValue(Promise.reject(new Error('Database connection failed')));

      const validBackup = {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        accounts: [],
        imports: [],
        transactions: [],
        subCategories: [],
        categoryRules: []
      };

      await expectAsync(service.restoreBackup(JSON.stringify(validBackup)))
        .toBeRejectedWithError('Database connection failed');
    });

    it('should handle partial restore failures', async () => {
      const validBackup = {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        accounts: mockAccounts,
        imports: mockImports,
        transactions: mockTransactions,
        subCategories: [],
        categoryRules: []
      };

      spyOn(db.accounts, 'clear').and.returnValue(Promise.resolve() as any);
      spyOn(db.imports, 'clear').and.returnValue(Promise.resolve() as any);
      spyOn(db.transactions, 'clear').and.returnValue(Promise.resolve() as any);
      spyOn(db.subCategories, 'clear').and.returnValue(Promise.resolve() as any);
      spyOn(db.categoryRules, 'clear').and.returnValue(Promise.resolve() as any);

      spyOn(db.accounts, 'bulkPut').and.returnValue(Promise.resolve() as any);
      spyOn(db.imports, 'bulkPut').and.returnValue(Promise.reject(new Error('Bulk put failed')) as any);

      await expectAsync(service.restoreBackup(JSON.stringify(validBackup)))
        .toBeRejectedWithError('Bulk put failed');
    });
  });
});