import { Injectable } from '@angular/core';
import { db, ImportRecord } from '../models/db';
import { ParsedTransaction } from '../models/transaction.model';

@Injectable({
  providedIn: 'root'
})
export class ImportService {

  async createImportRecord(
    accountId: number,
    fileName: string,
    fileSize: number,
    transactions: ParsedTransaction[],
    errorCount: number
  ): Promise<number> {
    const importRecord: ImportRecord = {
      accountId,
      fileName,
      fileSize,
      importedAt: new Date(),
      totalRows: transactions.length + errorCount,
      successCount: transactions.length,
      errorCount,
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

  async getImportsByAccount(accountId: number): Promise<ImportRecord[]> {
    return await db.imports
      .where('accountId')
      .equals(accountId)
      .reverse()
      .sortBy('importedAt');
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
      // In the future, also delete related transactions
      await db.transactions.where('importId').equals(id).delete();
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
}
