import { Injectable } from '@angular/core';
import { db, Transaction, Account } from '../../core/models/db';
import { ROOT_CATEGORIES } from '../../core/models/category.model';

export interface AnalyticsFilters {
  startDate?: Date;
  endDate?: Date;
  accountIds?: number[];
}

export interface AnalyticsKPI {
  totalIncome: number;
  totalExpenses: number;
  netAmount: number;
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
    let totalExpenses = 0;
    let categorizedCount = 0;
    let uncategorizedCount = 0;

    for (const txn of transactions) {
      // Skip internal transfers from income/expense calculations
      if (txn.isInternalTransfer) {
        if (txn.category) {
          categorizedCount++;
        } else {
          uncategorizedCount++;
        }
        continue; // Don't count in income or expenses
      }

      // Income is transactions with 'income' category
      if (txn.category === 'income') {
        totalIncome += Math.abs(txn.amount);
      } else if (txn.amount < 0) {
        // Expenses are negative amounts (excluding income category and transfers)
        totalExpenses += Math.abs(txn.amount);
      } else if (txn.amount > 0 && txn.category !== 'income') {
        // Positive amounts that aren't categorized as income might be refunds
        // We'll count them as reducing expenses
        totalExpenses -= txn.amount;
      }

      if (txn.category) {
        categorizedCount++;
      } else {
        uncategorizedCount++;
      }
    }

    return {
      totalIncome,
      totalExpenses: Math.max(0, totalExpenses), // Ensure non-negative
      netAmount: totalIncome - totalExpenses,
      transactionCount: transactions.length,
      categorizedCount,
      uncategorizedCount
    };
  }

  private calculateCategoryBreakdown(transactions: Transaction[]): CategoryAnalytics[] {
    const categoryMap = new Map<string, { amount: number; count: number; isTransfer?: boolean }>();

    for (const txn of transactions) {
      if (!txn.category) continue;
      
      const existing = categoryMap.get(txn.category) || { amount: 0, count: 0 };
      existing.amount += Math.abs(txn.amount);
      existing.count++;
      
      // Mark transfers category if it contains internal transfers
      if (txn.category === 'transfers' && txn.isInternalTransfer) {
        existing.isTransfer = true;
      }
      
      categoryMap.set(txn.category, existing);
    }

    const totalAmount = Array.from(categoryMap.values())
      .reduce((sum, cat) => sum + cat.amount, 0);

    const breakdown: CategoryAnalytics[] = [];
    for (const [categoryId, data] of categoryMap.entries()) {
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

    // Sort by amount descending
    breakdown.sort((a, b) => b.amount - a.amount);

    return breakdown;
  }

  private calculateMonthlyTrend(transactions: Transaction[]): any[] {
    const monthlyData = new Map<string, { income: number; expenses: number; transfers: number }>();

    for (const txn of transactions) {
      // Skip internal transfers from income/expense trends
      if (txn.isInternalTransfer) {
        const date = new Date(txn.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const existing = monthlyData.get(monthKey) || { income: 0, expenses: 0, transfers: 0 };
        existing.transfers += Math.abs(txn.amount);
        monthlyData.set(monthKey, existing);
        continue;
      }
      
      const date = new Date(txn.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      const existing = monthlyData.get(monthKey) || { income: 0, expenses: 0, transfers: 0 };
      
      if (txn.category === 'income') {
        existing.income += Math.abs(txn.amount);
      } else if (txn.amount < 0) {
        existing.expenses += Math.abs(txn.amount);
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