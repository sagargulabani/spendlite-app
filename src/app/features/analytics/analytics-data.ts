import { Injectable } from '@angular/core';
import { db, Transaction, Account } from '../../core/models/db';
import { ROOT_CATEGORIES, isExpenseCategory } from '../../core/models/category.model';

export interface AnalyticsFilters {
  startDate?: Date;
  endDate?: Date;
  accountIds?: number[];
}

export interface AnalyticsKPI {
  totalIncome: number;
  totalInvestments: number;
  totalExpenses: number;
  transactionCount: number;
  categorizedCount: number;
  uncategorizedCount: number;
}

export interface CategoryAnalytics {
  categoryId: string;
  label: string;
  icon?: string;
  color?: string;
  amount: number;
  count: number;
  percentage: number;
}

@Injectable({
  providedIn: 'root'
})
export class AnalyticsDataService {

  async getAnalytics(filters: AnalyticsFilters): Promise<{
    kpis: AnalyticsKPI;
    categoryBreakdown: CategoryAnalytics[];
    monthlyTrend: any[];
  }> {
    // Build query
    let query = db.transactions.toArray();
    const transactions = await query;
    
    // Apply filters
    let filteredTransactions = transactions;
    
    if (filters.startDate || filters.endDate) {
      filteredTransactions = filteredTransactions.filter(t => {
        const txnDate = new Date(t.date);
        if (filters.startDate && txnDate < filters.startDate) return false;
        if (filters.endDate && txnDate > filters.endDate) return false;
        return true;
      });
    }
    
    if (filters.accountIds && filters.accountIds.length > 0) {
      filteredTransactions = filteredTransactions.filter(t => 
        filters.accountIds!.includes(t.accountId)
      );
    }

    // Calculate KPIs
    console.log(`Calculating KPIs for ${filteredTransactions.length} filtered transactions`);
    const kpis = this.calculateKPIs(filteredTransactions);
    
    // Calculate category breakdown
    const categoryBreakdown = this.calculateCategoryBreakdown(filteredTransactions);
    
    // Calculate monthly trend
    const monthlyTrend = this.calculateMonthlyTrend(filteredTransactions);

    return {
      kpis,
      categoryBreakdown,
      monthlyTrend
    };
  }

  private calculateKPIs(transactions: Transaction[]): AnalyticsKPI {
    let totalIncome = 0;
    let totalInvestments = 0;
    let totalExpenses = 0;
    let categorizedCount = 0;
    let uncategorizedCount = 0;

    // Debug: Track expenses by category and refunds
    const expensesByCategory: Record<string, number> = {};
    const refundsByCategory: Record<string, { count: number; amount: number }> = {};
    
    let investmentCount = 0;
    let skippedInvestments = 0;

    for (const txn of transactions) {
      // Track categorization status
      if (txn.category) {
        categorizedCount++;
      } else {
        uncategorizedCount++;
      }

      // Skip uncategorized transactions from income/expense calculations
      // We don't know what they are yet
      if (!txn.category) {
        continue;
      }

      // Skip internal transfers from income/expense calculations
      if (txn.isInternalTransfer) {
        if (txn.category === 'investments') {
          skippedInvestments++;
          console.log(`Skipping internal transfer investment: ${txn.narration}, Amount: ${txn.amount}`);
        }
        continue; // Don't count in income or expenses
      }

      // Income is transactions with 'income' category
      if (txn.category === 'income') {
        totalIncome += Math.abs(txn.amount);
      } else if (txn.category === 'investments') {
        // Track NET investments (money out minus money back)
        investmentCount++;
        if (txn.amount < 0) {
          // Money going into investments
          const absAmount = Math.abs(txn.amount);
          totalInvestments += absAmount;
          console.log(`Investment OUT #${investmentCount}: Amount: ${txn.amount}, Added: +${absAmount}, Running total: ${totalInvestments}`);
        } else {
          // Money coming back from investments (redemptions/returns) - SUBTRACT from total
          totalInvestments -= txn.amount;
          console.log(`Investment RETURN #${investmentCount}: Amount: ${txn.amount}, Subtracted: -${txn.amount}, Running total: ${totalInvestments}`);
        }
      } else if (isExpenseCategory(txn.category)) {
        // Use shared logic to determine if it's an expense
        if (txn.amount < 0) {
          const expenseAmount = Math.abs(txn.amount);
          totalExpenses += expenseAmount;
          
          // Debug: Track by category
          if (!expensesByCategory[txn.category]) {
            expensesByCategory[txn.category] = 0;
          }
          expensesByCategory[txn.category] += expenseAmount;
        } else {
          // Positive amounts in expense categories are refunds
          totalExpenses -= txn.amount;
          
          // Debug: Track refunds
          if (!expensesByCategory[txn.category]) {
            expensesByCategory[txn.category] = 0;
          }
          expensesByCategory[txn.category] -= txn.amount;
          
          // Track refund details
          if (!refundsByCategory[txn.category]) {
            refundsByCategory[txn.category] = { count: 0, amount: 0 };
          }
          refundsByCategory[txn.category].count++;
          refundsByCategory[txn.category].amount += txn.amount;
        }
      }
      // Note: transfers are automatically excluded by isExpenseCategory
    }

    // Debug logging
    console.log('=== KPI Calculation Debug ===');
    console.log('Total transactions:', transactions.length);
    console.log('Categorized:', categorizedCount);
    console.log('Uncategorized:', uncategorizedCount);
    console.log('Total Income:', totalIncome);
    console.log(`Total Investments: ${totalInvestments} (from ${investmentCount} transactions, skipped ${skippedInvestments} internal transfers)`);
    console.log('Total Expenses (after refunds):', totalExpenses);
    console.log('Expenses by Category (net after refunds):', expensesByCategory);
    
    // Log refunds if any
    if (Object.keys(refundsByCategory).length > 0) {
      console.log('REFUNDS DETECTED:');
      for (const [category, data] of Object.entries(refundsByCategory)) {
        console.log(`  ${category}: ${data.count} refunds totaling ₹${data.amount}`);
      }
    }
    
    // Calculate sum to verify
    const calculatedSum = Object.values(expensesByCategory).reduce((sum, val) => sum + val, 0);
    console.log('Calculated sum from categories:', calculatedSum);
    console.log('============================');

    return {
      totalIncome,
      totalInvestments,
      totalExpenses: totalExpenses, // Keep the actual value, even if negative
      transactionCount: transactions.length,
      categorizedCount,
      uncategorizedCount
    };
  }

  private calculateCategoryBreakdown(transactions: Transaction[]): CategoryAnalytics[] {
    const categoryMap = new Map<string, { amount: number; count: number; isTransfer?: boolean }>();

    for (const txn of transactions) {
      // Use 'uncategorized' as the category ID for uncategorized transactions
      const categoryId = txn.category || 'uncategorized';
      
      const existing = categoryMap.get(categoryId) || { amount: 0, count: 0 };
      
      // For expense categories, handle refunds properly
      if (isExpenseCategory(categoryId) && !txn.isInternalTransfer) {
        if (txn.amount < 0) {
          // Normal expense - add the absolute amount
          existing.amount += Math.abs(txn.amount);
        } else {
          // Refund - subtract from the total
          existing.amount -= txn.amount;
        }
      } else {
        // For income, investments, transfers, and uncategorized - use absolute value
        existing.amount += Math.abs(txn.amount);
      }
      
      existing.count++;
      
      // Mark transfers category if it contains internal transfers
      if (txn.category === 'transfers' && txn.isInternalTransfer) {
        existing.isTransfer = true;
      }
      
      categoryMap.set(categoryId, existing);
    }

    const totalAmount = Array.from(categoryMap.values())
      .filter(cat => cat.amount > 0) // Only count positive amounts for percentage calculation
      .reduce((sum, cat) => sum + cat.amount, 0);

    const breakdown: CategoryAnalytics[] = [];
    for (const [categoryId, data] of categoryMap.entries()) {
      // Skip categories with zero or negative amounts (net refunds)
      if (data.amount <= 0) {
        continue;
      }
      
      if (categoryId === 'uncategorized') {
        // Add uncategorized as a special category
        breakdown.push({
          categoryId: 'uncategorized',
          label: 'Uncategorized',
          icon: '❓',
          color: '#9CA3AF',
          amount: data.amount,
          count: data.count,
          percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0
        });
      } else {
        const rootCategory = ROOT_CATEGORIES.find(c => c.id === categoryId);
        if (rootCategory) {
          breakdown.push({
            categoryId,
            label: rootCategory.label,
            icon: rootCategory.icon,
            color: rootCategory.color,
            amount: data.amount,
            count: data.count,
            percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0
          });
        }
      }
    }

    // Sort by amount descending
    breakdown.sort((a, b) => b.amount - a.amount);

    // Debug: Log category breakdown for expense categories
    console.log('=== Category Breakdown Debug ===');
    const expenseCategories = breakdown.filter(cat => 
      cat.categoryId !== 'income' && 
      cat.categoryId !== 'investments' && 
      cat.categoryId !== 'transfers' &&
      cat.categoryId !== 'uncategorized'
    );
    
    console.log('Expense Categories:');
    expenseCategories.forEach(cat => {
      console.log(`${cat.label}: ${cat.amount}`);
    });
    
    const totalExpenseFromBreakdown = expenseCategories.reduce((sum, cat) => sum + cat.amount, 0);
    console.log('Total from expense categories:', totalExpenseFromBreakdown);
    console.log('================================');

    return breakdown;
  }

  private calculateMonthlyTrend(transactions: Transaction[]): any[] {
    const monthlyData = new Map<string, { income: number; expenses: number; transfers: number; investments: number; uncategorized: number }>();

    console.log('=== Monthly Trend Calculation ===');
    console.log('Total transactions to process:', transactions.length);

    for (const txn of transactions) {
      const date = new Date(txn.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const existing = monthlyData.get(monthKey) || { income: 0, expenses: 0, transfers: 0, investments: 0, uncategorized: 0 };
      
      // Track uncategorized separately
      if (!txn.category) {
        existing.uncategorized += Math.abs(txn.amount);
        monthlyData.set(monthKey, existing);
        continue;
      }
      
      // Skip internal transfers from income/expense trends
      if (txn.isInternalTransfer) {
        existing.transfers += Math.abs(txn.amount);
        monthlyData.set(monthKey, existing);
        continue;
      }
      
      // Track investments separately
      if (txn.category === 'investments') {
        existing.investments += Math.abs(txn.amount);
        monthlyData.set(monthKey, existing);
        continue;
      }
      
      if (txn.category === 'income') {
        existing.income += Math.abs(txn.amount);
      } else if (isExpenseCategory(txn.category)) {
        // Use the same logic as KPI calculation for consistency
        if (txn.amount < 0) {
          // Normal expense - add the absolute amount
          existing.expenses += Math.abs(txn.amount);
        } else {
          // Refund in expense category - reduce expenses
          existing.expenses -= txn.amount;
        }
      }
      
      monthlyData.set(monthKey, existing);
    }

    // Convert to array and sort by month
    const trend = Array.from(monthlyData.entries())
      .map(([month, data]) => ({
        month,
        ...data,
        net: data.income - data.expenses
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Debug logging
    console.log('Monthly Trend Summary:');
    trend.forEach(month => {
      console.log(`${month.month}: Income: ₹${month.income}, Expenses: ₹${month.expenses}, Net: ₹${month.net}`);
      if (month.transfers > 0) console.log(`  - Transfers: ₹${month.transfers}`);
      if (month.investments > 0) console.log(`  - Investments: ₹${month.investments}`);
      if (month.uncategorized > 0) console.log(`  - Uncategorized: ₹${month.uncategorized}`);
    });
    console.log('=================================');

    return trend;
  }

  async getAccounts(): Promise<Account[]> {
    const accounts = await db.accounts.toArray();
    return accounts.filter(a => a.isActive);
  }

  async getDateRange(): Promise<{ minDate: Date | null; maxDate: Date | null }> {
    const transactions = await db.transactions.orderBy('date').toArray();
    
    if (transactions.length === 0) {
      return { minDate: null, maxDate: null };
    }

    return {
      minDate: new Date(transactions[0].date),
      maxDate: new Date(transactions[transactions.length - 1].date)
    };
  }
}