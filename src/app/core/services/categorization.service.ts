// core/services/categorization.service.ts
import { Injectable } from '@angular/core';
import { db, Transaction } from '../models/db';
import {
  CategoryRule,
  DEFAULT_KEYWORD_MAP,
  ROOT_CATEGORIES,
  SubCategory
} from '../models/category.model';
import { BankAdapterRegistry, initializeBankAdapters } from '../adapters';
import type { BankAdapter } from '../adapters';
import { TransferMatchingService } from './transfer-matching';

@Injectable({
  providedIn: 'root'
})
export class CategorizationService {

  constructor(private transferMatchingService: TransferMatchingService) {
    // Initialize bank adapters on service creation
    this.initializeAdapters();
  }

  private initializeAdapters(): void {
    // Initialize bank adapters if not already done
    if (BankAdapterRegistry.getAllAdapters().length === 0) {
      console.log('Initializing bank adapters...');
      initializeBankAdapters();
    }
  }

  // Extract merchant key from narration using bank adapters
  extractMerchantKey(narration: string, bankNameOrId?: string): string {
    let adapter: BankAdapter | undefined;

    // If bankNameOrId is provided, try to find adapter
    if (bankNameOrId) {
      // First try as bankId
      adapter = BankAdapterRegistry.getAdapter(bankNameOrId);
      
      // If not found, try to map common bank names to IDs
      if (!adapter) {
        const bankIdMap: { [key: string]: string } = {
          'State Bank of India': 'SBI',
          'HDFC Bank': 'HDFC',
          'ICICI Bank': 'ICICI',
          'Axis Bank': 'AXIS',
          'Kotak Mahindra Bank': 'KOTAK',
          'SBI': 'SBI',
          'HDFC': 'HDFC'
        };
        
        const mappedId = bankIdMap[bankNameOrId];
        if (mappedId) {
          adapter = BankAdapterRegistry.getAdapter(mappedId);
        }
      }
    }

    // If no adapter found or no bankId, try to auto-detect
    if (!adapter) {
      adapter = BankAdapterRegistry.detectAdapter(narration);
    }

    // If we have an adapter, use it
    if (adapter) {
      return adapter.extractMerchantKey(narration);
    }

    // Fallback to generic extraction
    return this.genericMerchantExtraction(narration);
  }

  // Generic merchant extraction for unknown bank formats
  private genericMerchantExtraction(narration: string): string {
    const narrationUpper = narration.toUpperCase();

    // Remove common prefixes
    let cleaned = narrationUpper
      .replace(/^UPI[-\s]/, '')
      .replace(/^IMPS[-\s]/, '')
      .replace(/^NEFT[-\s]/, '')
      .replace(/^RTGS[-\s]/, '')
      .replace(/^\d+[-\s]/, '');

    // Look for the first substantial word
    const words = cleaned.split(/[\s\-\.@\/]/);

    for (const word of words) {
      const cleanWord = word.replace(/[^A-Z0-9]/g, '');

      // Skip if too short, purely numeric, or common terms
      if (cleanWord.length < 3) continue;
      if (/^\d+$/.test(cleanWord)) continue;
      if (['THE', 'AND', 'FOR', 'PAY', 'VIA', 'REF', 'TXN', 'TO', 'FROM'].includes(cleanWord)) continue;

      // Remove common suffixes
      const merchantKey = cleanWord
        .replace(/PRIVATE|LIMITED|LTD|PVT|INDIA|PAYMENT|PAYMENTS|SERVICES/g, '')
        .trim();

      if (merchantKey.length >= 3) {
        return merchantKey.substring(0, 20);
      }
    }

    // Fallback
    const fallback = cleaned
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 20);

    return fallback || 'UNKNOWN';
  }

  // Get categorization hints from bank adapter
  private getCategoryHints(narration: string, bankId?: string): any {
    let adapter: BankAdapter | undefined;

    if (bankId) {
      adapter = BankAdapterRegistry.getAdapter(bankId);
    }

    if (!adapter) {
      adapter = BankAdapterRegistry.detectAdapter(narration);
    }

    if (adapter && adapter.extractHints) {
      return adapter.extractHints(narration);
    }

    return {};
  }

  // Detect category for a transaction
  async detectCategory(transaction: Transaction): Promise<string | null> {
    // Extract merchant key using bank adapter
    const merchantKey = this.extractMerchantKey(transaction.narration, transaction.bankName);

    // Get hints from bank adapter
    const hints = this.getCategoryHints(transaction.narration, transaction.bankName);

    // 1. Check user-defined rules first (highest priority)
    const userRule = await db.categoryRules
      .where('merchantKey')
      .equals(merchantKey)
      .and(rule => rule.createdBy === 'user')
      .first();

    if (userRule) {
      await db.categoryRules.update(userRule.id!, {
        usageCount: userRule.usageCount + 1,
        lastUsed: new Date()
      });
      return userRule.rootCategory;
    }

    // 2. Check for hints from bank adapter and transfers
    if (hints.possibleCategory) {
      // Only use hint if confidence is high (e.g., explicit transfer patterns)
      if (hints.isTransfer === true || this.transferMatchingService.isLikelyTransfer(transaction.narration)) {
        await this.createRule(merchantKey, 'transfers', 'system', 0.8);
        
        // Try to auto-link if it's a transfer
        if (transaction.id) {
          await this.autoLinkTransferIfPossible(transaction);
        }
        
        return 'transfers';
      }
    }

    // 3. Try special pattern detection first (high priority for clear patterns)
    const specialCategory = await this.detectSpecialPatterns(transaction);
    if (specialCategory) {
      await this.createRule(merchantKey, specialCategory, 'system', 0.7);
      return specialCategory;
    }

    // 4. Check for recurring pattern (but exclude fuel/petrol merchants)
    // Fuel merchants often have regular transactions but varying amounts
    // Note: Removed 'GAS' as it conflicts with utility companies like ADANI GAS
    const fuelKeywords = ['PETROL', 'DIESEL', 'FUEL', 'INDIAN OIL', 'BHARAT PETROLEUM', 'HP PETROL', 'SHELL', 'ESSAR'];
    const isFuelMerchant = fuelKeywords.some(keyword => 
      merchantKey.includes(keyword) || transaction.narration.toUpperCase().includes(keyword)
    );
    
    if (!isFuelMerchant) {
      const recurringCheck = await this.detectRecurringMerchant(merchantKey, transaction.accountId);
      if (recurringCheck.isRecurring && recurringCheck.confidence >= 0.7) {
        await this.createRule(merchantKey, 'subscriptions', 'system', recurringCheck.confidence);
        return 'subscriptions';
      }
    } else {
      // For fuel merchants, categorize as transport/fuel
      await this.createRule(merchantKey, 'transport', 'system', 0.9);
      return 'transport';
    }

    // 5. Check system rules
    const systemRule = await db.categoryRules
      .where('merchantKey')
      .equals(merchantKey)
      .and(rule => rule.createdBy === 'system')
      .first();

    if (systemRule) {
      await db.categoryRules.update(systemRule.id!, {
        usageCount: systemRule.usageCount + 1,
        lastUsed: new Date()
      });
      return systemRule.rootCategory;
    }

    // 6. Check default keyword mappings
    if (DEFAULT_KEYWORD_MAP[merchantKey]) {
      await this.createRule(merchantKey, DEFAULT_KEYWORD_MAP[merchantKey], 'system', 0.8);
      return DEFAULT_KEYWORD_MAP[merchantKey];
    }

    // 7. Check for keywords in narration
    const narrationUpper = transaction.narration.toUpperCase();
    for (const [keyword, category] of Object.entries(DEFAULT_KEYWORD_MAP)) {
      if (narrationUpper.includes(keyword)) {
        const keywordIndex = narrationUpper.indexOf(keyword);
        const prevChar = keywordIndex > 0 ? narrationUpper[keywordIndex - 1] : ' ';
        const nextChar = keywordIndex + keyword.length < narrationUpper.length ?
                        narrationUpper[keywordIndex + keyword.length] : ' ';

        const isWordBoundary = /[^A-Z0-9]/.test(prevChar) && /[^A-Z0-9]/.test(nextChar);

        if (isWordBoundary) {
          await this.createRule(merchantKey, category, 'system', 0.5);
          return category;
        }
      }
    }

    // Return null if no category found
    return null;
  }

  // Rest of the methods remain the same...

  // Detect if a merchant has recurring transactions
  async detectRecurringMerchant(merchantKey: string, accountId?: number): Promise<{
    isRecurring: boolean;
    frequency: 'monthly' | 'quarterly' | 'annual' | null;
    averageAmount?: number;
    dayOfMonth?: number;
    confidence: number;
  }> {
    // Implementation remains the same as before
    let query = db.transactions.filter(t => {
      const txnMerchantKey = this.extractMerchantKey(t.narration, t.bankName);
      return txnMerchantKey === merchantKey;
    });

    if (accountId) {
      query = query.and(t => t.accountId === accountId);
    }

    const transactions = await query.toArray();

    if (transactions.length < 2) {
      return { isRecurring: false, frequency: null, confidence: 0 };
    }

    transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const dates = transactions.map(t => new Date(t.date));
    const amounts = transactions.map(t => Math.abs(t.amount));

    // Check patterns (implementation remains the same)
    const monthlyPattern = this.checkMonthlyPattern(dates, amounts);
    if (monthlyPattern.isRecurring) {
      return {
        isRecurring: true,
        frequency: 'monthly',
        averageAmount: monthlyPattern.averageAmount,
        dayOfMonth: monthlyPattern.dayOfMonth,
        confidence: monthlyPattern.confidence
      };
    }

    return { isRecurring: false, frequency: null, confidence: 0 };
  }

  // Pattern checking methods remain the same
  private checkMonthlyPattern(dates: Date[], amounts: number[]): {
    isRecurring: boolean;
    averageAmount: number;
    dayOfMonth: number;
    confidence: number;
  } {
    // Implementation remains the same
    if (dates.length < 2) {
      return { isRecurring: false, averageAmount: 0, dayOfMonth: 0, confidence: 0 };
    }

    const intervals: number[] = [];
    const daysOfMonth: number[] = [];

    for (let i = 1; i < dates.length; i++) {
      const daysDiff = Math.round(
        (dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 60 * 60 * 24)
      );
      intervals.push(daysDiff);
      daysOfMonth.push(dates[i].getDate());
    }

    daysOfMonth.unshift(dates[0].getDate());

    const monthlyIntervals = intervals.filter(i => i >= 28 && i <= 35);
    const monthlyRatio = monthlyIntervals.length / intervals.length;

    const dayMode = this.findMode(daysOfMonth);
    const dayConsistency = daysOfMonth.filter(d => Math.abs(d - dayMode) <= 3).length / daysOfMonth.length;

    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    
    // Calculate amount variance - lower variance means more consistent amounts (subscriptions)
    const amountVariance = amounts.reduce((sum, amount) => {
      return sum + Math.pow((amount - avgAmount) / avgAmount, 2);
    }, 0) / amounts.length;
    
    // Amount consistency: for subscriptions, amounts should be very similar (within 5%)
    const strictAmountConsistency = amounts.filter(a =>
      Math.abs(a - avgAmount) / avgAmount <= 0.05
    ).length / amounts.length;
    
    // If amounts vary significantly (>10% variance), it's likely not a subscription
    const isLikelySubscription = amountVariance < 0.01 && strictAmountConsistency > 0.8;
    
    // For subscriptions, require high amount consistency
    // For other recurring transactions (like petrol), focus on timing patterns
    let confidence;
    if (isLikelySubscription) {
      // For subscriptions: timing and amount both matter
      confidence = (monthlyRatio * 0.3 + dayConsistency * 0.3 + strictAmountConsistency * 0.4);
    } else {
      // For recurring purchases: mainly timing matters, less emphasis on amount
      confidence = (monthlyRatio * 0.5 + dayConsistency * 0.4 + strictAmountConsistency * 0.1);
    }
    
    const isRecurring = dates.length >= 3 && confidence >= 0.7 && isLikelySubscription;

    return {
      isRecurring,
      averageAmount: avgAmount,
      dayOfMonth: dayMode,
      confidence
    };
  }

  private findMode(numbers: number[]): number {
    const frequency: Record<number, number> = {};
    let maxFreq = 0;
    let mode = numbers[0];

    for (const num of numbers) {
      frequency[num] = (frequency[num] || 0) + 1;
      if (frequency[num] > maxFreq) {
        maxFreq = frequency[num];
        mode = num;
      }
    }

    return mode;
  }

  // Special pattern detection (simplified, bank-agnostic)
  private async detectSpecialPatterns(transaction: Transaction): Promise<string | null> {
    const narrationUpper = transaction.narration.toUpperCase();
    const amount = transaction.amount;

    // Only detect very clear, bank-agnostic patterns
    
    // Handle refunds intelligently - categorize based on merchant
    if (narrationUpper.includes('REFUND')) {
      // Try to identify the merchant and categorize accordingly
      const merchantKey = this.extractMerchantKey(transaction.narration, transaction.bankName);
      
      // Check if we have a known category for this merchant
      if (DEFAULT_KEYWORD_MAP[merchantKey]) {
        return DEFAULT_KEYWORD_MAP[merchantKey];
      }
      
      // Check for specific refund patterns
      for (const [keyword, category] of Object.entries(DEFAULT_KEYWORD_MAP)) {
        if (narrationUpper.includes(keyword)) {
          return category; // Return the merchant's category, not 'income'
        }
      }
      
      // If we can't identify the merchant, default to income
      return 'income';
    }
    
    // Other income patterns
    if (narrationUpper.includes('CASHBACK') ||
        narrationUpper.includes('INTEREST PAID') ||
        narrationUpper.includes('INTEREST CREDIT')) {
      return 'income';
    }

    if (amount > 0 && narrationUpper.includes('SALARY')) {
      return 'income';
    }
    
    // Insurance claims are income (check before insurance premiums)
    if (narrationUpper.includes('INSURANCE CLAIM') ||
        narrationUpper.includes('CLAIM SETTLEMENT') ||
        narrationUpper.includes('CLAIM AMOUNT')) {
      return 'income';
    }
    
    // Car/Vehicle insurance goes to transport
    if (narrationUpper.includes('CAR INSURANCE') ||
        narrationUpper.includes('VEHICLE INSURANCE') ||
        narrationUpper.includes('MOTOR INSURANCE') ||
        narrationUpper.includes('AUTO INSURANCE') ||
        narrationUpper.includes('TWO WHEELER INSURANCE') ||
        narrationUpper.includes('BIKE INSURANCE')) {
      return 'transport';
    }
    
    // Health and life insurance premiums go to health (check after claims and vehicle insurance)
    if (narrationUpper.includes('INSURANCE PREMIUM') ||
        narrationUpper.includes('LIC PREMIUM') ||
        narrationUpper.includes('HEALTH INSURANCE') ||
        narrationUpper.includes('LIFE INSURANCE') ||
        narrationUpper.includes('MEDICAL INSURANCE')) {
      return 'health';
    }
    
    // Investments (check before fees to catch SIP correctly)
    if (narrationUpper.includes('MUTUAL FUND') ||
        narrationUpper.includes('SIP') ||
        narrationUpper.includes('TRADING')) {
      return 'investments';
    }

    // Loans and EMIs
    if (narrationUpper.includes('EMI') ||
        narrationUpper.includes('LOAN PAYMENT') ||
        narrationUpper.includes('CREDIT CARD PAYMENT')) {
      return 'loans';
    }
    
    // Bank fees and charges (check after SIP to avoid false positives)
    if (narrationUpper.includes('SERVICE CHARGE') ||
        narrationUpper.includes('BANK CHARGE') ||
        narrationUpper.includes('PROCESSING FEE') ||
        narrationUpper.includes('TRANSACTION FEE') ||
        narrationUpper.includes('ATM FEE') ||
        narrationUpper.includes('PENALTY') ||
        narrationUpper.includes('LATE FEE') ||
        narrationUpper.includes('RETURN CHARGE') ||
        narrationUpper.includes('ACH DEBIT RETURN CHARGE') ||
        narrationUpper.includes('CHEQUE BOUNCE') ||
        narrationUpper.includes('MIN BAL CHARGE') ||
        narrationUpper.includes('ANNUAL FEE') ||
        narrationUpper.includes('MAINTENANCE CHARGE')) {
      return 'fees';
    }

    if (narrationUpper.includes('SCHOOL FEE') ||
        narrationUpper.includes('COLLEGE FEE') ||
        narrationUpper.includes('TUITION FEE')) {
      return 'education';
    }

    if (narrationUpper.includes('ELECTRICITY BILL') ||
        narrationUpper.includes('WATER BILL') ||
        narrationUpper.includes('GAS BILL')) {
      return 'utilities';
    }

    if (narrationUpper.includes('FLIGHT') ||
        narrationUpper.includes('AIRLINE') ||
        narrationUpper.includes('HOTEL BOOKING')) {
      return 'travel';
    }

    if (narrationUpper.includes('MONTHLY SUBSCRIPTION') ||
        narrationUpper.includes('AUTOPAY') ||
        narrationUpper.includes('RECURRING PAYMENT')) {
      return 'subscriptions';
    }

    return null;
  }

  // Rule management methods remain the same
  async createRule(
    merchantKey: string,
    rootCategory: string,
    createdBy: 'user' | 'system',
    confidence: number = 1.0
  ): Promise<void> {
    const existingRule = await db.categoryRules
      .where('merchantKey')
      .equals(merchantKey)
      .first();

    if (existingRule) {
      if (createdBy === 'user' || confidence > existingRule.confidence) {
        await db.categoryRules.update(existingRule.id!, {
          rootCategory,
          confidence: createdBy === 'user' ? 1.0 : confidence,
          createdBy,
          usageCount: existingRule.usageCount + 1,
          lastUsed: new Date()
        });
      }
    } else {
      await db.categoryRules.add({
        merchantKey,
        rootCategory,
        confidence,
        createdBy,
        usageCount: 1,
        lastUsed: new Date(),
        createdAt: new Date()
      });
    }
  }

  // Auto-link transfer if possible during categorization
  private async autoLinkTransferIfPossible(transaction: Transaction): Promise<void> {
    try {
      // Extract account hints from narration
      const hints = this.transferMatchingService.extractAccountHints(transaction.narration);
      
      if (!hints.accountLast4) {
        return; // No account info to match
      }

      // Find matching account
      const accounts = await db.accounts.toArray();
      const targetAccount = accounts.find(a => 
        a.accountNumber?.endsWith(hints.accountLast4!) &&
        a.id !== transaction.accountId
      );

      if (!targetAccount || !targetAccount.id) {
        return; // No matching account found
      }

      // Find potential matching transaction
      const matches = await this.transferMatchingService.findPotentialMatches(
        transaction, 
        targetAccount.id, 
        3
      );

      // Auto-link if we have a high-confidence match
      if (matches.length > 0 && (matches[0].confidence === 'exact' || matches[0].confidence === 'high')) {
        await this.transferMatchingService.linkTransfer({
          sourceTransactionId: transaction.id!,
          linkedAccountId: targetAccount.id,
          linkedTransactionId: matches[0].transaction.id
        });
      } else {
        // Just mark the account but don't link to specific transaction
        await this.transferMatchingService.linkTransfer({
          sourceTransactionId: transaction.id!,
          linkedAccountId: targetAccount.id
        });
      }
    } catch (error) {
      console.error('Error auto-linking transfer:', error);
      // Don't fail categorization if linking fails
    }
  }

  // Other methods remain the same...
}
