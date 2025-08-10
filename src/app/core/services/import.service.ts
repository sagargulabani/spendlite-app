import { Injectable } from '@angular/core';
import { db, ImportRecord } from '../models/db';
import { ExtendedParsedTransaction } from '../services/csv-parser.service';

@Injectable({
  providedIn: 'root'
})
export class ImportService {

  async createImportRecord(
    accountId: number,
    displayName: string,
    fileName: string,
    fileSize: number,
    transactions: any[], // Can be ExtendedParsedTransaction or UnifiedTransaction
    errorCount: number,
    duplicateCount: number = 0,
    bankName?: string
  ): Promise<number> {
    // Detect file format from extension
    const ext = fileName.toLowerCase();
    let fileFormat: 'csv' | 'txt' | 'excel' = 'csv';
    if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
      fileFormat = 'excel';
    } else if (ext.endsWith('.txt')) {
      fileFormat = 'txt';
    }

    const importRecord: ImportRecord = {
      accountId,
      displayName: displayName || fileName,
      fileName,
      fileSize,
      fileFormat,
      bankName,
      importedAt: new Date(),
      totalRows: transactions.length + errorCount + duplicateCount,
      successCount: transactions.length,
      errorCount,
      duplicateCount,
      debitCount: transactions.filter(t => t.amount < 0).length,
      creditCount: transactions.filter(t => t.amount > 0).length,
      status: 'completed'
    };

    try {
      const id = await db.imports.add(importRecord);
      return id as number;
    } catch (error) {
      console.error('Failed to create import record:', error);
      throw new Error('Failed to save import record');
    }
  }

  async updateImportDisplayName(id: number, displayName: string): Promise<void> {
    try {
      await db.imports.update(id, { displayName });
    } catch (error) {
      console.error('Failed to update import name:', error);
      throw error;
    }
  }

  async updateImportAccount(id: number, newAccountId: number): Promise<void> {
    try {
      await db.imports.update(id, { accountId: newAccountId });
      // Note: Transaction account updates should be handled by TransactionService
    } catch (error) {
      console.error('Failed to update import account:', error);
      throw error;
    }
  }

  async getImportsByAccount(accountId: number): Promise<ImportRecord[]> {
    return await db.imports
      .where('accountId')
      .equals(accountId)
      .reverse()
      .sortBy('importedAt');
  }

  async getAllImports(): Promise<ImportRecord[]> {
    return await db.imports
      .orderBy('importedAt')
      .reverse()
      .toArray();
  }

  async getRecentImports(limit: number = 10): Promise<ImportRecord[]> {
    return await db.imports
      .orderBy('importedAt')
      .reverse()
      .limit(limit)
      .toArray();
  }

  async deleteImport(id: number): Promise<void> {
    await db.transaction('rw', db.imports, db.transactions, async () => {
      // Delete related transactions
      await db.transactions.where('importId').equals(id).delete();
      // Delete the import record
      await db.imports.delete(id);
    });
  }

  async getImportStats(accountId?: number): Promise<{
    totalImports: number;
    totalTransactions: number;
    lastImportDate: Date | null;
  }> {
    let imports: ImportRecord[];

    if (accountId) {
      imports = await db.imports.where('accountId').equals(accountId).toArray();
    } else {
      imports = await db.imports.toArray();
    }

    const totalTransactions = imports.reduce((sum, imp) => sum + imp.successCount, 0);
    const lastImport = imports.sort((a, b) =>
      b.importedAt.getTime() - a.importedAt.getTime()
    )[0];

    return {
      totalImports: imports.length,
      totalTransactions,
      lastImportDate: lastImport?.importedAt || null
    };
  }

  async getImportWithAccount(id: number): Promise<(ImportRecord & { accountName?: string }) | undefined> {
    const importRecord = await db.imports.get(id);
    if (!importRecord) return undefined;

    const account = await db.accounts.get(importRecord.accountId);
    return {
      ...importRecord,
      accountName: account?.name
    };
  }
}
