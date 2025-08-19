import { Injectable } from '@angular/core';
import { db, Transaction, Account } from '../models/db';

export interface TransferMatch {
  transaction: Transaction;
  confidence: 'exact' | 'high' | 'medium' | 'low';
  matchReason: string;
}

export interface TransferLinkRequest {
  sourceTransactionId: number;
  linkedAccountId: number;
  linkedTransactionId?: number; // Optional, for manual linking to existing transaction
}

@Injectable({
  providedIn: 'root'
})
export class TransferMatchingService {

  /**
   * Find potential matching transactions for a transfer
   */
  async findPotentialMatches(
    transaction: Transaction,
    targetAccountId: number,
    dateRangeDays: number = 3
  ): Promise<TransferMatch[]> {
    const matches: TransferMatch[] = [];
    
    // Calculate date range
    const txnDate = new Date(transaction.date);
    const startDate = new Date(txnDate);
    startDate.setDate(startDate.getDate() - dateRangeDays);
    const endDate = new Date(txnDate);
    endDate.setDate(endDate.getDate() + dateRangeDays);

    // Query transactions in the target account within date range
    const potentialMatches = await db.transactions
      .where('accountId')
      .equals(targetAccountId)
      .filter(t => {
        const tDate = new Date(t.date);
        return tDate >= startDate && tDate <= endDate;
      })
      .toArray();

    // Check each potential match
    for (const candidate of potentialMatches) {
      // Skip if already linked to another transaction
      if (candidate.linkedTransactionId && candidate.linkedTransactionId !== transaction.id) {
        continue;
      }

      // Check if amounts match (opposite signs)
      const amountMatches = Math.abs(transaction.amount + candidate.amount) < 0.01;
      
      if (amountMatches) {
        // Exact amount match on same day
        if (transaction.date === candidate.date) {
          matches.push({
            transaction: candidate,
            confidence: 'exact',
            matchReason: 'Same date and matching amount'
          });
        }
        // Amount match within date range
        else {
          const daysDiff = Math.abs((new Date(transaction.date).getTime() - new Date(candidate.date).getTime()) / (1000 * 60 * 60 * 24));
          const confidence = daysDiff <= 1 ? 'high' : 'medium';
          matches.push({
            transaction: candidate,
            confidence,
            matchReason: `Matching amount, ${Math.round(daysDiff)} day(s) apart`
          });
        }
      }
    }

    // Sort by confidence and date proximity
    matches.sort((a, b) => {
      const confidenceOrder = { exact: 0, high: 1, medium: 2, low: 3 };
      const confDiff = confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
      if (confDiff !== 0) return confDiff;
      
      // If same confidence, sort by date proximity
      const dateA = Math.abs(new Date(a.transaction.date).getTime() - txnDate.getTime());
      const dateB = Math.abs(new Date(b.transaction.date).getTime() - txnDate.getTime());
      return dateA - dateB;
    });

    return matches;
  }

  /**
   * Link two transactions as a transfer pair
   */
  async linkTransfer(request: TransferLinkRequest): Promise<void> {
    const sourceTransaction = await db.transactions.get(request.sourceTransactionId);
    if (!sourceTransaction) {
      throw new Error('Source transaction not found');
    }

    // Generate a transfer group ID if not exists
    const transferGroupId = sourceTransaction.transferGroupId || this.generateTransferGroupId();

    // Update source transaction
    await db.transactions.update(request.sourceTransactionId, {
      category: 'transfers',
      isInternalTransfer: true,
      linkedAccountId: request.linkedAccountId,
      linkedTransactionId: request.linkedTransactionId,
      transferGroupId
    });

    // If a specific linked transaction is provided, update it too
    if (request.linkedTransactionId) {
      await db.transactions.update(request.linkedTransactionId, {
        category: 'transfers',
        isInternalTransfer: true,
        linkedAccountId: sourceTransaction.accountId,
        linkedTransactionId: request.sourceTransactionId,
        transferGroupId
      });
    }
  }

  /**
   * Unlink a transfer
   */
  async unlinkTransfer(transactionId: number): Promise<void> {
    const transaction = await db.transactions.get(transactionId);
    if (!transaction) return;

    // If there's a linked transaction, unlink it too
    if (transaction.linkedTransactionId) {
      await db.transactions.update(transaction.linkedTransactionId, {
        isInternalTransfer: undefined,
        linkedAccountId: undefined,
        linkedTransactionId: undefined,
        transferGroupId: undefined
      });
    }

    // Unlink this transaction
    await db.transactions.update(transactionId, {
      isInternalTransfer: undefined,
      linkedAccountId: undefined,
      linkedTransactionId: undefined,
      transferGroupId: undefined
    });
  }

  /**
   * Auto-detect if a transaction might be a transfer based on narration
   */
  isLikelyTransfer(narration: string): boolean {
    const transferKeywords = [
      'SELF',
      'OWN ACCOUNT',
      'TRANSFER-INB',
      'BY TRANSFER',
      'TO TRANSFER',
      'IMPS/P2A', // Person to Account
      'NEFT.*SELF',
      'RTGS.*SELF'
    ];

    const upper = narration.toUpperCase();
    return transferKeywords.some(keyword => {
      const regex = new RegExp(keyword);
      return regex.test(upper);
    });
  }

  /**
   * Extract account hints from narration (account numbers, bank names)
   */
  extractAccountHints(narration: string): { bankName?: string; accountLast4?: string } {
    const hints: { bankName?: string; accountLast4?: string } = {};

    // Look for bank names
    const bankPatterns = [
      /HDFC-XX(\d{3,4})/i,
      /SBI-XX(\d{3,4})/i,
      /ICICI-XX(\d{3,4})/i,
      /AXIS-XX(\d{3,4})/i,
      /KOTAK-XX(\d{3,4})/i
    ];

    for (const pattern of bankPatterns) {
      const match = narration.match(pattern);
      if (match) {
        const bankName = pattern.source.split('-')[0];
        hints.bankName = bankName;
        hints.accountLast4 = match[1];
        break;
      }
    }

    return hints;
  }

  /**
   * Get all transactions in a transfer group
   */
  async getTransferGroup(transferGroupId: string): Promise<Transaction[]> {
    return await db.transactions
      .where('transferGroupId')
      .equals(transferGroupId)
      .toArray();
  }

  /**
   * Generate a unique transfer group ID
   */
  private generateTransferGroupId(): string {
    return 'tg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Auto-link transfers during import
   * Called after transactions are saved to database
   */
  async autoLinkTransfers(importId: number): Promise<number> {
    let linkedCount = 0;
    
    // Get all transactions from this import
    const importTransactions = await db.transactions
      .where('importId')
      .equals(importId)
      .toArray();

    // Get all accounts for matching
    const accounts = await db.accounts.toArray();

    for (const transaction of importTransactions) {
      // Skip if already linked or not a transfer
      if (transaction.linkedTransactionId || transaction.category !== 'transfers') {
        continue;
      }

      // Check if narration suggests it's a transfer
      if (this.isLikelyTransfer(transaction.narration)) {
        const hints = this.extractAccountHints(transaction.narration);
        
        // Try to find matching account
        let targetAccount: Account | undefined;
        if (hints.accountLast4) {
          targetAccount = accounts.find(a => 
            a.accountNumber?.endsWith(hints.accountLast4!) &&
            a.id !== transaction.accountId
          );
        }

        if (targetAccount) {
          // Look for matching transaction
          const matches = await this.findPotentialMatches(transaction, targetAccount.id!, 3);
          
          // Auto-link if we have a high-confidence match
          if (matches.length > 0 && (matches[0].confidence === 'exact' || matches[0].confidence === 'high')) {
            await this.linkTransfer({
              sourceTransactionId: transaction.id!,
              linkedAccountId: targetAccount.id!,
              linkedTransactionId: matches[0].transaction.id
            });
            linkedCount++;
          }
        }
      }
    }

    return linkedCount;
  }
}