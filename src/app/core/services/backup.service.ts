import { Injectable } from '@angular/core';
import { db } from '../models/db';

@Injectable({
  providedIn: 'root'
})
export class BackupService {
  
  async exportData(): Promise<any> {
    const accounts = await db.accounts.toArray();
    const imports = await db.imports.toArray();
    const transactions = await db.transactions.toArray();
    const subCategories = await db.subCategories.toArray();
    const categoryRules = await db.categoryRules.toArray();
    
    return {
      version: 4,
      exportDate: new Date().toISOString(),
      data: {
        accounts,
        imports,
        transactions,
        subCategories,
        categoryRules
      }
    };
  }
  
  async importData(backupData: any): Promise<void> {
    if (!backupData || !backupData.data) {
      throw new Error('Invalid backup data');
    }
    
    // Clear existing data and import new data in a transaction
    // Note: Dexie transaction() can only accept up to 6 table arguments
    // We'll do this in two transactions
    await db.transaction('rw', db.accounts, db.imports, db.transactions, async () => {
      await db.accounts.clear();
      await db.imports.clear();
      await db.transactions.clear();
      
      // Import new data
      if (backupData.data.accounts) {
        await db.accounts.bulkAdd(backupData.data.accounts);
      }
      if (backupData.data.imports) {
        await db.imports.bulkAdd(backupData.data.imports);
      }
      if (backupData.data.transactions) {
        await db.transactions.bulkAdd(backupData.data.transactions);
      }
    });
    
    await db.transaction('rw', db.subCategories, db.categoryRules, async () => {
      await db.subCategories.clear();
      await db.categoryRules.clear();
      
      if (backupData.data.subCategories) {
        await db.subCategories.bulkAdd(backupData.data.subCategories);
      }
      if (backupData.data.categoryRules) {
        await db.categoryRules.bulkAdd(backupData.data.categoryRules);
      }
    });
  }
  
  downloadBackup(): void {
    this.exportData().then(data => {
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `spendlite-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  }
  
  async uploadBackup(file: File): Promise<void> {
    const text = await file.text();
    const data = JSON.parse(text);
    await this.importData(data);
  }
  
  // Auto-save to localStorage as a safety measure
  async autoSaveToLocal(): Promise<void> {
    const data = await this.exportData();
    localStorage.setItem('spendlite-auto-backup', JSON.stringify(data));
    localStorage.setItem('spendlite-auto-backup-date', new Date().toISOString());
  }
  
  async restoreFromLocal(): Promise<boolean> {
    const backup = localStorage.getItem('spendlite-auto-backup');
    if (backup) {
      try {
        const data = JSON.parse(backup);
        await this.importData(data);
        return true;
      } catch (error) {
        console.error('Failed to restore from local backup:', error);
        return false;
      }
    }
    return false;
  }
}