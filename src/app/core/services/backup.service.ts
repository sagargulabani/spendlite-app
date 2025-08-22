import { Injectable } from '@angular/core';
import { db } from '../models/db';

export interface BackupData {
  version: string;
  createdAt: string;
  accounts: any[];
  imports: any[];
  transactions: any[];
  subCategories: any[];
  categoryRules: any[];
}

@Injectable({
  providedIn: 'root'
})
export class BackupService {
  private readonly BACKUP_VERSION = '1.0.0';

  async exportBackup(): Promise<string> {
    try {
      console.log('📦 Starting backup export...');
      
      // Collect all data from database
      const accounts = await db.accounts.toArray();
      const imports = await db.imports.toArray();
      const transactions = await db.transactions.toArray();
      const subCategories = await db.subCategories.toArray();
      const categoryRules = await db.categoryRules.toArray();

      const backup: BackupData = {
        version: this.BACKUP_VERSION,
        createdAt: new Date().toISOString(),
        accounts,
        imports,
        transactions,
        subCategories,
        categoryRules
      };

      const json = JSON.stringify(backup, null, 2);
      console.log('✅ Backup created successfully');
      return json;
    } catch (error) {
      console.error('❌ Backup failed:', error);
      throw error;
    }
  }

  async downloadBackup(): Promise<void> {
    try {
      const json = await this.exportBackup();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `spendlite-backup-${timestamp}.json`;
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      URL.revokeObjectURL(url);
      console.log(`✅ Backup downloaded as ${filename}`);
    } catch (error) {
      console.error('❌ Download failed:', error);
      throw error;
    }
  }

  async restoreBackup(jsonData: string): Promise<void> {
    try {
      console.log('📥 Starting backup restore...');
      
      const backup: BackupData = JSON.parse(jsonData);
      
      // Validate backup structure
      if (!this.isValidBackup(backup)) {
        throw new Error('Invalid backup file format');
      }

      console.log('Backup contains:', {
        accounts: backup.accounts?.length || 0,
        imports: backup.imports?.length || 0,
        transactions: backup.transactions?.length || 0,
        subCategories: backup.subCategories?.length || 0,
        categoryRules: backup.categoryRules?.length || 0
      });

      // Ensure database is open
      if (!db.isOpen()) {
        console.log('Opening database...');
        await db.open();
      }

      // Clear all existing data first
      console.log('Clearing existing data...');
      try {
        await db.accounts.clear();
      } catch (e) {
        console.log('Accounts table might not exist yet');
      }
      
      try {
        await db.imports.clear();
      } catch (e) {
        console.log('Imports table might not exist yet');
      }
      
      try {
        await db.transactions.clear();
      } catch (e) {
        console.log('Transactions table might not exist yet');
      }
      
      try {
        await db.subCategories.clear();
      } catch (e) {
        console.log('SubCategories table might not exist yet');
      }
      
      try {
        await db.categoryRules.clear();
      } catch (e) {
        console.log('CategoryRules table might not exist yet');
      }

      // Restore data table by table (not in a transaction to avoid issues)
      console.log('Restoring accounts...');
      if (backup.accounts?.length) {
        // Convert date strings to Date objects if needed
        const cleanAccounts = backup.accounts.map(acc => {
          const cleanAcc = { ...acc };
          // Convert date strings to Date objects if needed
          if (typeof cleanAcc.createdAt === 'string') {
            cleanAcc.createdAt = new Date(cleanAcc.createdAt);
          }
          if (typeof cleanAcc.updatedAt === 'string') {
            cleanAcc.updatedAt = new Date(cleanAcc.updatedAt);
          }
          return cleanAcc;
        });
        // Use bulkPut instead of bulkAdd to handle existing IDs
        await db.accounts.bulkPut(cleanAccounts);
      }

      console.log('Restoring imports...');
      if (backup.imports?.length) {
        const cleanImports = backup.imports.map(imp => {
          const cleanImp = { ...imp };
          // Convert date strings to Date objects
          if (typeof cleanImp.importedAt === 'string') {
            cleanImp.importedAt = new Date(cleanImp.importedAt);
          }
          return cleanImp;
        });
        await db.imports.bulkPut(cleanImports);
      }

      console.log('Restoring transactions...');
      if (backup.transactions?.length) {
        const cleanTransactions = backup.transactions.map(tx => {
          const cleanTx = { ...tx };
          // Convert date strings to Date objects
          if (typeof cleanTx.createdAt === 'string') {
            cleanTx.createdAt = new Date(cleanTx.createdAt);
          }
          return cleanTx;
        });
        // Add in batches to avoid memory issues
        const batchSize = 100;
        for (let i = 0; i < cleanTransactions.length; i += batchSize) {
          const batch = cleanTransactions.slice(i, i + batchSize);
          await db.transactions.bulkPut(batch);
          console.log(`Restored ${Math.min(i + batchSize, cleanTransactions.length)} of ${cleanTransactions.length} transactions`);
        }
      }

      console.log('Restoring subcategories...');
      if (backup.subCategories?.length) {
        await db.subCategories.bulkPut(backup.subCategories);
      }

      console.log('Restoring category rules...');
      if (backup.categoryRules?.length) {
        const cleanRules = backup.categoryRules.map(rule => {
          const cleanRule = { ...rule };
          // Convert date strings to Date objects
          if (typeof cleanRule.lastUsed === 'string') {
            cleanRule.lastUsed = new Date(cleanRule.lastUsed);
          }
          if (typeof cleanRule.createdAt === 'string') {
            cleanRule.createdAt = new Date(cleanRule.createdAt);
          }
          return cleanRule;
        });
        await db.categoryRules.bulkPut(cleanRules);
      }

      console.log('✅ Backup restored successfully');
    } catch (error) {
      console.error('❌ Restore failed:', error);
      throw error;
    }
  }

  async uploadAndRestore(file: File): Promise<void> {
    try {
      const text = await file.text();
      await this.restoreBackup(text);
    } catch (error) {
      console.error('❌ Upload and restore failed:', error);
      throw error;
    }
  }

  private isValidBackup(data: any): data is BackupData {
    return data 
      && typeof data === 'object'
      && 'version' in data
      && 'createdAt' in data
      && 'accounts' in data
      && 'transactions' in data;
  }

  async getBackupStats(): Promise<{
    accountsCount: number;
    transactionsCount: number;
    importsCount: number;
    categoriesCount: number;
    rulesCount: number;
    oldestTransaction?: string;
    newestTransaction?: string;
  }> {
    const accounts = await db.accounts.count();
    const transactions = await db.transactions.count();
    const imports = await db.imports.count();
    const categories = await db.subCategories.count();
    const rules = await db.categoryRules.count();

    const oldestTx = await db.transactions.orderBy('date').first();
    const newestTx = await db.transactions.orderBy('date').reverse().first();

    return {
      accountsCount: accounts,
      transactionsCount: transactions,
      importsCount: imports,
      categoriesCount: categories,
      rulesCount: rules,
      oldestTransaction: oldestTx?.date,
      newestTransaction: newestTx?.date
    };
  }

  // Auto-backup functionality
  async enableAutoBackup(intervalHours: number = 24): Promise<void> {
    const intervalMs = intervalHours * 60 * 60 * 1000;
    
    // Store in localStorage
    localStorage.setItem('autoBackupEnabled', 'true');
    localStorage.setItem('autoBackupInterval', intervalMs.toString());
    
    // Schedule backups
    this.scheduleAutoBackup(intervalMs);
  }

  private scheduleAutoBackup(intervalMs: number): void {
    setInterval(async () => {
      try {
        const json = await this.exportBackup();
        const key = `autoBackup_${Date.now()}`;
        localStorage.setItem(key, json);
        
        // Keep only last 5 auto-backups
        this.cleanOldAutoBackups();
        
        console.log('✅ Auto-backup completed');
      } catch (error) {
        console.error('❌ Auto-backup failed:', error);
      }
    }, intervalMs);
  }

  private cleanOldAutoBackups(): void {
    const backupKeys = Object.keys(localStorage)
      .filter(key => key.startsWith('autoBackup_'))
      .sort()
      .reverse();
    
    // Keep only the 5 most recent
    if (backupKeys.length > 5) {
      backupKeys.slice(5).forEach(key => {
        localStorage.removeItem(key);
      });
    }
  }

  getAutoBackups(): Array<{ key: string; date: Date; size: number }> {
    return Object.keys(localStorage)
      .filter(key => key.startsWith('autoBackup_'))
      .map(key => {
        const timestamp = parseInt(key.split('_')[1]);
        const data = localStorage.getItem(key) || '';
        return {
          key,
          date: new Date(timestamp),
          size: data.length
        };
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  async restoreAutoBackup(key: string): Promise<void> {
    const data = localStorage.getItem(key);
    if (data) {
      await this.restoreBackup(data);
    } else {
      throw new Error('Auto-backup not found');
    }
  }

  // Manual save for testing
  async saveAutoBackup(): Promise<void> {
    const json = await this.exportBackup();
    const key = `autoBackup_${Date.now()}`;
    localStorage.setItem(key, json);
    this.cleanOldAutoBackups();
  }
}