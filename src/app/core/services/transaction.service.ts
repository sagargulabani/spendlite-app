import { Injectable } from '@angular/core';
import { db, Transaction, DuplicateCheckResult } from '../models/db';
import { UnifiedTransaction } from '../parsers/bank-parser.abstract';
import { ParserFactoryService } from './parser-factory.service';

@Injectable({
  providedIn: 'root'
})
export class TransactionService {

  constructor(private parserFactory: ParserFactoryService) {}

  /**
   * Generate a unique fingerprint for a transaction
   * Now uses bank-specific fingerprinting
   */
  generateFingerprint(
    transaction: UnifiedTransaction,
    accountId: number
  ): string {
    // Get the appropriate parser for fingerprinting
    const parser = this.parserFactory.getParserForBank(transaction.bankName);

    if (parser) {
      return parser.generateFingerprint(transaction, accountId);
    }

    // Fallback to generic fingerprint
    return this.generateGenericFingerprint(transaction, accountId);
  }

  /**
   * Generic fingerprint for unknown banks
   */
  private generateGenericFingerprint(
    transaction: UnifiedTransaction,
    accountId: number
  ): string {
    const parts = [
      accountId,
      transaction.bankName || 'UNKNOWN',
      transaction.date,
      transaction.description.toLowerCase().replace(/\s+/g, ''),
      transaction.amount,
      transaction.balance || ''
    ];

    return parts.filter(p => p !== '').join('_');
  }

  /**
   * Check for duplicates in the database
   */
  async checkForDuplicates(
    transactions: UnifiedTransaction[],
    accountId: number
  ): Promise<DuplicateCheckResult[]> {
    const results: DuplicateCheckResult[] = [];

    // Get all existing transactions for this account
    const existingTransactions = await db.transactions
      .where('accountId')
      .equals(accountId)
      .toArray();

    // Create a map of existing fingerprints for O(1) lookup
    const existingFingerprintMap = new Map<string, Transaction>();
    existingTransactions.forEach(txn => {
      existingFingerprintMap.set(txn.fingerprint, txn);
    });

    // Check each new transaction
    for (const txn of transactions) {
      const fingerprint = this.generateFingerprint(txn, accountId);
      const existingTxn = existingFingerprintMap.get(fingerprint);

      if (existingTxn) {
        // Exact duplicate found
        results.push({
          transaction: txn,
          isExactDuplicate: true,
          existingTransaction: existingTxn,
          confidence: 'exact'
        });
      } else {
        // Check for possible duplicates (same date, amount, and bank)
        const possibleDuplicates = existingTransactions.filter(
          existing =>
            existing.date === txn.date &&
            existing.amount === txn.amount &&
            existing.bankName === txn.bankName
        );

        if (possibleDuplicates.length > 0) {
          // Possible duplicate - needs review
          results.push({
            transaction: txn,
            isExactDuplicate: false,
            existingTransaction: possibleDuplicates[0],
            confidence: 'medium'
          });
        } else {
          // New transaction
          results.push({
            transaction: txn,
            isExactDuplicate: false,
            confidence: 'low'
          });
        }
      }
    }

    return results;
  }

  /**
   * Save transactions to database
   */
  async saveTransactions(
    transactions: UnifiedTransaction[],
    accountId: number,
    importId: number,
    skipDuplicates: boolean = true
  ): Promise<{ saved: number; skipped: number }> {
    let saved = 0;
    let skipped = 0;

    // Check for duplicates if needed
    const duplicateResults = skipDuplicates
      ? await this.checkForDuplicates(transactions, accountId)
      : transactions.map(txn => ({
          transaction: txn,
          isExactDuplicate: false,
          confidence: 'low' as const
        }));

    // Prepare transactions for saving
    const transactionsToSave: Transaction[] = [];

    for (let i = 0; i < transactions.length; i++) {
      const txn = transactions[i];
      const duplicateResult = duplicateResults[i];

      if (duplicateResult.isExactDuplicate && skipDuplicates) {
        skipped++;
        continue;
      }

      const fingerprint = this.generateFingerprint(txn, accountId);

      transactionsToSave.push({
        accountId,
        importId,
        date: txn.date,
        narration: txn.description, // Always use description as narration for consistency
        amount: txn.amount,

        // Store additional fields
        valueDate: txn.valueDate,
        withdrawalAmt: txn.transactionType === 'debit' ? Math.abs(txn.amount) : undefined,
        depositAmt: txn.transactionType === 'credit' ? txn.amount : undefined,
        closingBalance: txn.balance,

        // Bank info
        bankName: txn.bankName,
        referenceNo: txn.referenceNo,

        // Fingerprint and flags
        fingerprint,
        isDuplicate: false,
        isReconciled: false,
        createdAt: new Date()
      });
    }

    // Bulk save transactions
    if (transactionsToSave.length > 0) {
      await db.transactions.bulkAdd(transactionsToSave);
      saved = transactionsToSave.length;
    }

    return { saved, skipped };
  }

  /**
   * Get transactions by import ID
   */
  async getTransactionsByImport(importId: number): Promise<Transaction[]> {
    return await db.transactions
      .where('importId')
      .equals(importId)
      .toArray();
  }

  /**
   * Get transactions by account ID
   */
  async getTransactionsByAccount(accountId: number): Promise<Transaction[]> {
    return await db.transactions
      .where('accountId')
      .equals(accountId)
      .sortBy('date');
  }

  /**
   * Update account for all transactions of an import
   */
  async updateTransactionsAccount(importId: number, newAccountId: number): Promise<void> {
    const transactions = await this.getTransactionsByImport(importId);

    // Update each transaction with new fingerprint
    for (const txn of transactions) {
      // Create UnifiedTransaction for fingerprinting
      const unified: UnifiedTransaction = {
        date: txn.date,
        description: txn.narration,
        amount: txn.amount,
        balance: txn.closingBalance,
        bankName: txn.bankName || 'UNKNOWN',
        source: `${txn.bankName}-IMPORT`,
        originalData: {}
      };

      const newFingerprint = this.generateFingerprint(unified, newAccountId);

      await db.transactions.update(txn.id!, {
        accountId: newAccountId,
        fingerprint: newFingerprint
      });
    }
  }

  /**
   * Delete transactions by import ID
   */
  async deleteTransactionsByImport(importId: number): Promise<void> {
    await db.transactions
      .where('importId')
      .equals(importId)
      .delete();
  }
}
