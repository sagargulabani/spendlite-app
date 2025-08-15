// core/services/categorization.service.ts
import { Injectable } from '@angular/core';
import { db, Transaction } from '../models/db';
import {
  CategoryRule,
  DEFAULT_KEYWORD_MAP,
  ROOT_CATEGORIES,
  SubCategory
} from '../models/category.model';

@Injectable({
  providedIn: 'root'
})
export class CategorizationService {

  // Extract merchant key from narration - IMPROVED VERSION
  extractMerchantKey(narration: string): string {
    // Remove common prefixes
    let cleaned = narration.toUpperCase()
      .replace(/^UPI-/, '')
      .replace(/^IMPS-/, '')
      .replace(/^NEFT-/, '')
      .replace(/^RTGS-/, '')
      .replace(/^ACH\s*D?-/, '')
      .replace(/^IB\s+/, '')
      .replace(/^ATW-/, '')
      .replace(/^\d+-/, ''); // Remove leading numbers

    // Handle UPI format specially (merchant-email@bank-code)
    if (narration.toUpperCase().startsWith('UPI-')) {
      // For UPI transactions, extract the first meaningful part
      const parts = cleaned.split('-');

      // Skip numeric-only parts and very short parts
      for (const part of parts) {
        // Remove special characters for checking
        const cleanPart = part.replace(/[^A-Z0-9]/g, '');

        // If it's not purely numeric and has at least 3 chars, use it
        if (cleanPart.length >= 3 && !/^\d+$/.test(cleanPart)) {
          // Remove email domains and special chars
          const merchantName = part
            .split('@')[0]
            .split('.')[0]
            .replace(/[^A-Z0-9]/g, '');

          // Remove common payment gateway suffixes
          const finalName = merchantName
            .replace(/RAZORPAY|PAYTM|PHONEPE|GOOGLEPAY|BHARATPE|PAYMENT|PAY$/g, '');

          if (finalName.length >= 3) {
            return finalName.substring(0, 20);
          }
        }
      }
    }

    // For other formats, try to extract merchant name
    // Look for the first substantial alphabetic word
    const words = cleaned.split(/[\s\-\.@\/]/);

    for (const word of words) {
      // Clean the word
      const cleanWord = word.replace(/[^A-Z0-9]/g, '');

      // Skip if too short, purely numeric, or common terms
      if (cleanWord.length < 3) continue;
      if (/^\d+$/.test(cleanWord)) continue;
      if (['THE', 'AND', 'FOR', 'PAY', 'VIA', 'REF', 'TXN', 'TO', 'FROM'].includes(cleanWord)) continue;

      // Remove common suffixes
      const merchantKey = cleanWord
        .replace(/PRIVATE|LIMITED|LTD|PVT|INDIA|PAYMENT|PAYMENTS|SERVICES|RAZORPAY|PAYTM/g, '')
        .trim();

      // If we still have something substantial, use it
      if (merchantKey.length >= 3) {
        return merchantKey.substring(0, 20);
      }
    }

    // Fallback: take first meaningful part
    const fallback = cleaned
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 20);

    return fallback || 'UNKNOWN';
  }

  // Detect if a merchant has recurring transactions
  async detectRecurringMerchant(merchantKey: string, accountId?: number): Promise<{
    isRecurring: boolean;
    frequency: 'monthly' | 'quarterly' | 'annual' | null;
    averageAmount?: number;
    dayOfMonth?: number;
    confidence: number;
  }> {
    // Get all transactions for this merchant
    let query = db.transactions.filter(t =>
      this.extractMerchantKey(t.narration) === merchantKey
    );

    if (accountId) {
      query = query.and(t => t.accountId === accountId);
    }

    const transactions = await query.toArray();

    // Need at least 2 transactions to detect pattern
    if (transactions.length < 2) {
      return { isRecurring: false, frequency: null, confidence: 0 };
    }

    // Sort by date
    transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Analyze transaction patterns
    const dates = transactions.map(t => new Date(t.date));
    const amounts = transactions.map(t => Math.abs(t.amount));

    // Check for monthly pattern
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

    // Check for quarterly pattern
    const quarterlyPattern = this.checkQuarterlyPattern(dates, amounts);
    if (quarterlyPattern.isRecurring) {
      return {
        isRecurring: true,
        frequency: 'quarterly',
        averageAmount: quarterlyPattern.averageAmount,
        confidence: quarterlyPattern.confidence
      };
    }

    // Check for annual pattern
    const annualPattern = this.checkAnnualPattern(dates, amounts);
    if (annualPattern.isRecurring) {
      return {
        isRecurring: true,
        frequency: 'annual',
        averageAmount: annualPattern.averageAmount,
        confidence: annualPattern.confidence
      };
    }

    return { isRecurring: false, frequency: null, confidence: 0 };
  }

  // Check for monthly recurring pattern
  private checkMonthlyPattern(dates: Date[], amounts: number[]): {
    isRecurring: boolean;
    averageAmount: number;
    dayOfMonth: number;
    confidence: number;
  } {
    if (dates.length < 2) {
      return { isRecurring: false, averageAmount: 0, dayOfMonth: 0, confidence: 0 };
    }

    // Calculate intervals between consecutive transactions
    const intervals: number[] = [];
    const daysOfMonth: number[] = [];

    for (let i = 1; i < dates.length; i++) {
      const daysDiff = Math.round(
        (dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 60 * 60 * 24)
      );
      intervals.push(daysDiff);
      daysOfMonth.push(dates[i].getDate());
    }

    // Add first date's day
    daysOfMonth.unshift(dates[0].getDate());

    // Check if intervals are roughly monthly (28-35 days)
    const monthlyIntervals = intervals.filter(i => i >= 28 && i <= 35);
    const monthlyRatio = monthlyIntervals.length / intervals.length;

    // Check consistency of day of month
    const dayMode = this.findMode(daysOfMonth);
    const dayConsistency = daysOfMonth.filter(d => Math.abs(d - dayMode) <= 3).length / daysOfMonth.length;

    // Check amount consistency (within 20% variation)
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const amountConsistency = amounts.filter(a =>
      Math.abs(a - avgAmount) / avgAmount <= 0.2
    ).length / amounts.length;

    // Calculate confidence score
    const confidence = (monthlyRatio * 0.4 + dayConsistency * 0.4 + amountConsistency * 0.2);

    // Need at least 3 occurrences and 70% confidence
    const isRecurring = dates.length >= 3 && confidence >= 0.7;

    return {
      isRecurring,
      averageAmount: avgAmount,
      dayOfMonth: dayMode,
      confidence
    };
  }

  // Check for quarterly recurring pattern
  private checkQuarterlyPattern(dates: Date[], amounts: number[]): {
    isRecurring: boolean;
    averageAmount: number;
    confidence: number;
  } {
    if (dates.length < 2) {
      return { isRecurring: false, averageAmount: 0, confidence: 0 };
    }

    const intervals: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      const daysDiff = Math.round(
        (dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 60 * 60 * 24)
      );
      intervals.push(daysDiff);
    }

    // Check if intervals are roughly quarterly (85-95 days)
    const quarterlyIntervals = intervals.filter(i => i >= 85 && i <= 95);
    const quarterlyRatio = quarterlyIntervals.length / intervals.length;

    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const amountConsistency = amounts.filter(a =>
      Math.abs(a - avgAmount) / avgAmount <= 0.2
    ).length / amounts.length;

    const confidence = (quarterlyRatio * 0.6 + amountConsistency * 0.4);
    const isRecurring = dates.length >= 2 && confidence >= 0.7;

    return {
      isRecurring,
      averageAmount: avgAmount,
      confidence
    };
  }

  // Check for annual recurring pattern
  private checkAnnualPattern(dates: Date[], amounts: number[]): {
    isRecurring: boolean;
    averageAmount: number;
    confidence: number;
  } {
    if (dates.length < 2) {
      return { isRecurring: false, averageAmount: 0, confidence: 0 };
    }

    const intervals: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      const daysDiff = Math.round(
        (dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 60 * 60 * 24)
      );
      intervals.push(daysDiff);
    }

    // Check if intervals are roughly annual (355-375 days)
    const annualIntervals = intervals.filter(i => i >= 355 && i <= 375);
    const annualRatio = annualIntervals.length / intervals.length;

    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const amountConsistency = amounts.filter(a =>
      Math.abs(a - avgAmount) / avgAmount <= 0.2
    ).length / amounts.length;

    const confidence = (annualRatio * 0.6 + amountConsistency * 0.4);
    const isRecurring = dates.length >= 2 && confidence >= 0.7;

    return {
      isRecurring,
      averageAmount: avgAmount,
      confidence
    };
  }

  // Helper function to find mode (most common value)
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

  // Detect category for a transaction - ENHANCED WITH BETTER LOGIC
  async detectCategory(transaction: Transaction): Promise<string | null> {
    const merchantKey = this.extractMerchantKey(transaction.narration);

    // 1. Check user-defined rules first (highest priority)
    const userRule = await db.categoryRules
      .where('merchantKey')
      .equals(merchantKey)
      .and(rule => rule.createdBy === 'user')
      .first();

    if (userRule) {
      // Update usage count
      await db.categoryRules.update(userRule.id!, {
        usageCount: userRule.usageCount + 1,
        lastUsed: new Date()
      });
      return userRule.rootCategory;
    }

    // 2. Check for recurring pattern (before system rules)
    const recurringCheck = await this.detectRecurringMerchant(merchantKey, transaction.accountId);
    if (recurringCheck.isRecurring && recurringCheck.confidence >= 0.7) {
      // Create a system rule for this recurring merchant
      await this.createRule(merchantKey, 'subscriptions', 'system', recurringCheck.confidence);
      return 'subscriptions';
    }

    // 3. Check system rules
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

    // 4. Try special pattern detection first (more specific)
    const specialCategory = await this.detectSpecialPatterns(transaction);
    if (specialCategory) {
      await this.createRule(merchantKey, specialCategory, 'system', 0.7);
      return specialCategory;
    }

    // 5. Check default keyword mappings
    if (DEFAULT_KEYWORD_MAP[merchantKey]) {
      // Create a system rule for future use
      await this.createRule(merchantKey, DEFAULT_KEYWORD_MAP[merchantKey], 'system', 0.8);
      return DEFAULT_KEYWORD_MAP[merchantKey];
    }

    // 6. Check for keywords in narration - with conservative confidence
    const narrationUpper = transaction.narration.toUpperCase();

    for (const [keyword, category] of Object.entries(DEFAULT_KEYWORD_MAP)) {
      if (narrationUpper.includes(keyword)) {
        // Only create rule if keyword match is strong enough
        // Avoid partial matches that might be wrong
        const keywordIndex = narrationUpper.indexOf(keyword);
        const prevChar = keywordIndex > 0 ? narrationUpper[keywordIndex - 1] : ' ';
        const nextChar = keywordIndex + keyword.length < narrationUpper.length ?
                        narrationUpper[keywordIndex + keyword.length] : ' ';

        // Check if it's a word boundary (not part of another word)
        const isWordBoundary = /[^A-Z0-9]/.test(prevChar) && /[^A-Z0-9]/.test(nextChar);

        if (isWordBoundary) {
          // Create a system rule with lower confidence
          await this.createRule(merchantKey, category, 'system', 0.5);
          return category;
        }
      }
    }

    // If nothing matches confidently, return null (uncategorized)
    return null;
  }

  // Detect special patterns - CONSERVATIVE VERSION
  private async detectSpecialPatterns(transaction: Transaction): Promise<string | null> {
    const narrationUpper = transaction.narration.toUpperCase();
    const amount = transaction.amount;

    // 1. Handle refunds - only categorize if we're confident about the source
    if (narrationUpper.includes('REFUND')) {
      // Try to identify the source of the refund
      for (const [keyword, category] of Object.entries(DEFAULT_KEYWORD_MAP)) {
        if (narrationUpper.includes(keyword)) {
          // For known merchants, keep in original category
          if (category === 'digital' || category === 'subscriptions' ||
              category === 'food' || category === 'shopping' || category === 'travel') {
            return category;
          }
        }
      }
      // Don't assume it's income - leave uncategorized
      return null;
    }

    // 2. Handle income patterns - only very clear cases
    if (narrationUpper.includes('CASHBACK')) {
      return 'income';
    }

    if (amount > 0 && narrationUpper.includes('SALARY')) {
      return 'income';
    }

    // 3. Loan/EMI detection - only very specific patterns
    if (narrationUpper.includes('EMI') ||
        narrationUpper.includes('LOAN PAYMENT') ||
        narrationUpper.includes('CREDIT CARD PAYMENT') ||
        narrationUpper.includes('CC PAYMENT')) {
      return 'loans';
    }

    // 4. Investment detection - only when explicitly mentioned
    if (narrationUpper.includes('MUTUAL FUND') ||
        narrationUpper.includes('SIP') ||
        narrationUpper.includes('TRADING') ||
        narrationUpper.includes('DEMAT') ||
        narrationUpper.includes('STOCK') ||
        narrationUpper.includes('SHARES')) {
      return 'investments';
    }

    // 5. Insurance detection - only when explicitly mentioned
    if (narrationUpper.includes('INSURANCE') ||
        narrationUpper.includes('LIC PREMIUM')) {
      return 'health';
    }

    // 6. Education detection - only clear cases
    if (narrationUpper.includes('SCHOOL FEE') ||
        narrationUpper.includes('COLLEGE FEE') ||
        narrationUpper.includes('TUITION FEE') ||
        narrationUpper.includes('EDUCATION FEE')) {
      return 'education';
    }

    // 7. Utility bills - only when explicitly mentioned
    if (narrationUpper.includes('ELECTRICITY BILL') ||
        narrationUpper.includes('WATER BILL') ||
        narrationUpper.includes('GAS BILL') ||
        narrationUpper.includes('INTERNET BILL') ||
        narrationUpper.includes('MOBILE BILL') ||
        narrationUpper.includes('POSTPAID BILL')) {
      return 'utilities';
    }

    // 8. Digital services detection - only clear cases
    if (narrationUpper.includes('APP STORE') ||
        narrationUpper.includes('PLAY STORE') ||
        narrationUpper.includes('SOFTWARE LICENSE')) {
      return 'digital';
    }

    // 9. Travel detection - flights, hotels, train bookings
    if (narrationUpper.includes('FLIGHT') ||
        narrationUpper.includes('AIRLINE') ||
        narrationUpper.includes('AIRWAYS') ||
        narrationUpper.includes('HOTEL BOOKING') ||
        narrationUpper.includes('TRAIN BOOKING') ||
        narrationUpper.includes('RAILWAY BOOKING')) {
      return 'travel';
    }

    // 10. Transfer detection - only self transfers
    if (narrationUpper.includes('SELF TRANSFER') ||
        narrationUpper.includes('OWN ACCOUNT')) {
      return 'transfers';
    }

    // 11. Subscription detection - only clear recurring patterns
    if (narrationUpper.includes('MONTHLY SUBSCRIPTION') ||
        narrationUpper.includes('AUTOPAY') ||
        narrationUpper.includes('RECURRING PAYMENT')) {
      return 'subscriptions';
    }

    // When in doubt, return null (uncategorized)
    return null;
  }

  // Create or update a categorization rule
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
      // Update existing rule only if new one has higher confidence or is user-created
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
      // Create new rule
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

  // Detect all recurring merchants in the database
  async detectAllRecurringMerchants(accountId?: number): Promise<Array<{
    merchantKey: string;
    frequency: 'monthly' | 'quarterly' | 'annual';
    averageAmount: number;
    confidence: number;
    transactionCount: number;
  }>> {
    // Get all unique merchant keys
    let query = db.transactions.toArray();
    if (accountId) {
      query = db.transactions.where('accountId').equals(accountId).toArray();
    }

    const transactions = await query;
    const merchantKeys = new Set<string>();

    for (const txn of transactions) {
      merchantKeys.add(this.extractMerchantKey(txn.narration));
    }

    const recurringMerchants = [];

    for (const merchantKey of merchantKeys) {
      const pattern = await this.detectRecurringMerchant(merchantKey, accountId);
      if (pattern.isRecurring && pattern.frequency) {
        const merchantTxns = transactions.filter(t =>
          this.extractMerchantKey(t.narration) === merchantKey
        );

        recurringMerchants.push({
          merchantKey,
          frequency: pattern.frequency,
          averageAmount: pattern.averageAmount || 0,
          confidence: pattern.confidence,
          transactionCount: merchantTxns.length
        });
      }
    }

    return recurringMerchants.sort((a, b) => b.confidence - a.confidence);
  }

  // Categorize a single transaction
  async categorizeTransaction(
    transactionId: number,
    category: string,
    saveRule: boolean = true
  ): Promise<void> {
    const transaction = await db.transactions.get(transactionId);
    if (!transaction) return;

    // Update transaction
    await db.transactions.update(transactionId, { category });

    // Save as rule if requested
    if (saveRule) {
      const merchantKey = this.extractMerchantKey(transaction.narration);
      await this.createRule(merchantKey, category, 'user');
    }
  }

  // Bulk categorize transactions
  async bulkCategorize(
    transactionIds: number[],
    category: string
  ): Promise<void> {
    for (const id of transactionIds) {
      await this.categorizeTransaction(id, category, true);
    }
  }

  // Auto-categorize all uncategorized transactions
  async autoCategorizeTransactions(
    importId?: number
  ): Promise<{ success: number; failed: number }> {
    let query = db.transactions.filter(t => !t.category);

    if (importId) {
      query = query.and(t => t.importId === importId);
    }

    const uncategorized = await query.toArray();
    let success = 0;
    let failed = 0;

    for (const txn of uncategorized) {
      const category = await this.detectCategory(txn);
      if (category) {
        await db.transactions.update(txn.id!, { category });
        success++;
      } else {
        failed++;
      }
    }

    return { success, failed };
  }

  // Get categorization stats
  async getCategoryStats(accountId?: number): Promise<any> {
    let query = db.transactions.toArray();

    if (accountId) {
      query = db.transactions.where('accountId').equals(accountId).toArray();
    }

    const transactions = await query;
    const stats: Record<string, { count: number; amount: number; percentage: number }> = {};

    for (const txn of transactions) {
      const category = txn.category || 'uncategorized';
      if (!stats[category]) {
        stats[category] = { count: 0, amount: 0, percentage: 0 };
      }
      stats[category].count++;
      stats[category].amount += txn.amount;
    }

    // Calculate percentages
    const total = transactions.length;
    for (const category in stats) {
      stats[category].percentage = total > 0 ? (stats[category].count / total) * 100 : 0;
    }

    return stats;
  }

  // Get rules for a merchant
  async getRulesForMerchant(merchantKey: string): Promise<CategoryRule[]> {
    return await db.categoryRules
      .where('merchantKey')
      .equals(merchantKey)
      .toArray();
  }

  // Delete a rule
  async deleteRule(ruleId: number): Promise<void> {
    await db.categoryRules.delete(ruleId);
  }

  // Get all rules
  async getAllRules(): Promise<CategoryRule[]> {
    return await db.categoryRules.toArray();
  }

  // Debug helper - useful for testing
  debugMerchantExtraction(narration: string): void {
    const merchantKey = this.extractMerchantKey(narration);
    console.log('Narration:', narration);
    console.log('Extracted Key:', merchantKey);
    console.log('---');
  }

  // Find similar uncategorized transactions
  async findSimilarTransactions(merchantKey: string, importId?: number): Promise<Transaction[]> {
    let query = db.transactions.filter(t => !t.category);

    if (importId) {
      query = query.and(t => t.importId === importId);
    }

    const uncategorized = await query.toArray();

    return uncategorized.filter(t =>
      this.extractMerchantKey(t.narration) === merchantKey
    );
  }

  // Bulk categorize by merchant
  async categorizeMerchantTransactions(
    merchantKey: string,
    category: string,
    importId?: number
  ): Promise<number> {
    const similar = await this.findSimilarTransactions(merchantKey, importId);

    for (const txn of similar) {
      await db.transactions.update(txn.id!, { category });
    }

    // Create or update rule
    await this.createRule(merchantKey, category, 'user');

    return similar.length;
  }
}
