import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { AnalyticsDataService } from './analytics-data';
import { db, Transaction } from '../../core/models/db';

describe('AnalyticsDataService', () => {
  let service: AnalyticsDataService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        AnalyticsDataService
      ]
    });
    service = TestBed.inject(AnalyticsDataService);
  });

  afterEach(async () => {
    // Clear test data from database
    await db.transactions.clear();
    await db.accounts.clear();
  });

  describe('KPI Calculations', () => {
    it('should calculate income correctly', async () => {
      // Arrange
      const transactions: Partial<Transaction>[] = [
        { id: 1, amount: 50000, category: 'income', date: '2024-01-01', accountId: 1, narration: 'Salary' },
        { id: 2, amount: 10000, category: 'income', date: '2024-01-02', accountId: 1, narration: 'Freelance' },
        { id: 3, amount: -5000, category: 'shopping', date: '2024-01-03', accountId: 1, narration: 'Shopping' }
      ];
      await db.transactions.bulkAdd(transactions as Transaction[]);

      // Act
      const result = await service.getAnalytics({});

      // Assert
      expect(result.kpis.totalIncome).toBe(60000);
    });

    it('should calculate expenses correctly with refunds', async () => {
      // Arrange
      const transactions: Partial<Transaction>[] = [
        { id: 1, amount: -10000, category: 'shopping', date: '2024-01-01', accountId: 1, narration: 'Amazon' },
        { id: 2, amount: -5000, category: 'food', date: '2024-01-02', accountId: 1, narration: 'Restaurant' },
        { id: 3, amount: 2000, category: 'shopping', date: '2024-01-03', accountId: 1, narration: 'Amazon Refund' },
        { id: 4, amount: -3000, category: 'transport', date: '2024-01-04', accountId: 1, narration: 'Uber' }
      ];
      await db.transactions.bulkAdd(transactions as Transaction[]);

      // Act
      const result = await service.getAnalytics({});

      // Assert
      // Total expenses: 10000 + 5000 + 3000 - 2000 (refund) = 16000
      expect(result.kpis.totalExpenses).toBe(16000);
    });

    it('should calculate net investments (invested minus redeemed)', async () => {
      // Arrange
      const transactions: Partial<Transaction>[] = [
        { id: 1, amount: -25000, category: 'investments', date: '2024-01-01', accountId: 1, narration: 'Mutual Fund Purchase' },
        { id: 2, amount: -15000, category: 'investments', date: '2024-01-02', accountId: 1, narration: 'Stock Purchase' },
        { id: 3, amount: 5000, category: 'investments', date: '2024-01-03', accountId: 1, narration: 'Dividend' },
        { id: 4, amount: 10000, category: 'investments', date: '2024-01-04', accountId: 1, narration: 'MF Redemption' },
        { id: 5, amount: -10000, category: 'shopping', date: '2024-01-05', accountId: 1, narration: 'Shopping' }
      ];
      await db.transactions.bulkAdd(transactions as Transaction[]);

      // Act
      const result = await service.getAnalytics({});

      // Assert
      // Net investments: (25000 + 15000) - (5000 + 10000) = 40000 - 15000 = 25000
      expect(result.kpis.totalInvestments).toBe(25000);
      expect(result.kpis.totalExpenses).toBe(10000); // Only shopping expense
    });

    it('should handle negative net investments when redemptions exceed investments', async () => {
      // Arrange
      const transactions: Partial<Transaction>[] = [
        { id: 1, amount: -50000, category: 'investments', date: '2024-01-01', accountId: 1, narration: 'FD Investment' },
        { id: 2, amount: 100000, category: 'investments', date: '2024-01-02', accountId: 1, narration: 'FD Maturity' },
        { id: 3, amount: 5000, category: 'investments', date: '2024-01-03', accountId: 1, narration: 'Interest' }
      ];
      await db.transactions.bulkAdd(transactions as Transaction[]);

      // Act
      const result = await service.getAnalytics({});

      // Assert
      // Net investments: 50000 - (100000 + 5000) = 50000 - 105000 = -55000
      // Negative means more money came back than was invested
      expect(result.kpis.totalInvestments).toBe(-55000);
    });

    it('should calculate investments correctly with mixed transactions', async () => {
      // Arrange
      const transactions: Partial<Transaction>[] = [
        { id: 1, amount: -100000, category: 'investments', date: '2024-01-01', accountId: 1, narration: 'Zerodha' },
        { id: 2, amount: -50000, category: 'investments', date: '2024-01-02', accountId: 1, narration: 'ETMoney' },
        { id: 3, amount: 25000, category: 'investments', date: '2024-01-03', accountId: 1, narration: 'Partial Redemption' },
        { id: 4, amount: -30000, category: 'investments', date: '2024-01-04', accountId: 1, narration: 'SIP' },
        { id: 5, amount: 10000, category: 'investments', date: '2024-01-05', accountId: 1, narration: 'Dividend' }
      ];
      await db.transactions.bulkAdd(transactions as Transaction[]);

      // Act
      const result = await service.getAnalytics({});

      // Assert
      // Investments: 100000 + 50000 + 30000 = 180000
      // Redemptions: 25000 + 10000 = 35000
      // Net: 180000 - 35000 = 145000
      expect(result.kpis.totalInvestments).toBe(145000);
    });

    it('should exclude internal transfers from all KPIs', async () => {
      // Arrange
      const transactions: Partial<Transaction>[] = [
        { id: 1, amount: 50000, category: 'income', date: '2024-01-01', accountId: 1, narration: 'Salary' },
        { id: 2, amount: -20000, category: 'transfers', isInternalTransfer: true, date: '2024-01-02', accountId: 1, narration: 'Transfer to Savings' },
        { id: 3, amount: 20000, category: 'transfers', isInternalTransfer: true, date: '2024-01-02', accountId: 2, narration: 'Transfer from Current' },
        { id: 4, amount: -5000, category: 'shopping', date: '2024-01-03', accountId: 1, narration: 'Shopping' }
      ];
      await db.transactions.bulkAdd(transactions as Transaction[]);

      // Act
      const result = await service.getAnalytics({});

      // Assert
      expect(result.kpis.totalIncome).toBe(50000);
      expect(result.kpis.totalExpenses).toBe(5000);
      expect(result.kpis.totalInvestments).toBe(0);
    });

    it('should exclude loans from expenses', async () => {
      // Arrange
      const transactions: Partial<Transaction>[] = [
        { id: 1, amount: -50000, category: 'loans', date: '2024-01-01', accountId: 1, narration: 'Home Loan EMI' },
        { id: 2, amount: -10000, category: 'loans', date: '2024-01-02', accountId: 1, narration: 'Personal Loan EMI' },
        { id: 3, amount: 200000, category: 'loans', date: '2024-01-03', accountId: 1, narration: 'Loan Disbursement' },
        { id: 4, amount: -5000, category: 'shopping', date: '2024-01-04', accountId: 1, narration: 'Shopping' },
        { id: 5, amount: -3000, category: 'food', date: '2024-01-05', accountId: 1, narration: 'Groceries' }
      ];
      await db.transactions.bulkAdd(transactions as Transaction[]);

      // Act
      const result = await service.getAnalytics({});

      // Assert
      expect(result.kpis.totalExpenses).toBe(8000); // Only shopping + food, not loans
      expect(result.kpis.totalIncome).toBe(0); // Loan disbursement is not income
      expect(result.kpis.totalInvestments).toBe(0);
      
      // Loans should still appear in category breakdown but not affect expenses
      const loansCategory = result.categoryBreakdown.find(c => c.categoryId === 'loans');
      expect(loansCategory).toBeDefined();
      expect(loansCategory!.amount).toBe(260000); // Total of all loan transactions (absolute values)
    });

    it('should exclude uncategorized transactions from financial KPIs', async () => {
      // Arrange
      const transactions: Partial<Transaction>[] = [
        { id: 1, amount: 50000, category: 'income', date: '2024-01-01', accountId: 1, narration: 'Salary' },
        { id: 2, amount: -10000, date: '2024-01-02', accountId: 1, narration: 'Unknown Payment' },
        { id: 3, amount: 5000, category: undefined, date: '2024-01-03', accountId: 1, narration: 'Unknown Credit' },
        { id: 4, amount: -3000, category: 'shopping', date: '2024-01-04', accountId: 1, narration: 'Shopping' }
      ];
      await db.transactions.bulkAdd(transactions as Transaction[]);

      // Act
      const result = await service.getAnalytics({});

      // Assert
      expect(result.kpis.totalIncome).toBe(50000);
      expect(result.kpis.totalExpenses).toBe(3000);
      expect(result.kpis.uncategorizedCount).toBe(2);
      expect(result.kpis.categorizedCount).toBe(2);
    });

    it('should handle edge case of negative total expenses', async () => {
      // Arrange - More refunds than expenses
      const transactions: Partial<Transaction>[] = [
        { id: 1, amount: -5000, category: 'shopping', date: '2024-01-01', accountId: 1, narration: 'Shopping' },
        { id: 2, amount: 10000, category: 'shopping', date: '2024-01-02', accountId: 1, narration: 'Big Refund' }
      ];
      await db.transactions.bulkAdd(transactions as Transaction[]);

      // Act
      const result = await service.getAnalytics({});

      // Assert
      expect(result.kpis.totalExpenses).toBe(-5000); // Now shows actual negative value
    });

    it('should count transactions correctly', async () => {
      // Arrange
      const transactions: Partial<Transaction>[] = [
        { id: 1, amount: 50000, category: 'income', date: '2024-01-01', accountId: 1, narration: 'Salary' },
        { id: 2, amount: -10000, category: 'shopping', date: '2024-01-02', accountId: 1, narration: 'Shopping' },
        { id: 3, amount: -5000, date: '2024-01-03', accountId: 1, narration: 'Unknown' },
        { id: 4, amount: -3000, category: 'food', date: '2024-01-04', accountId: 1, narration: 'Restaurant' }
      ];
      await db.transactions.bulkAdd(transactions as Transaction[]);

      // Act
      const result = await service.getAnalytics({});

      // Assert
      expect(result.kpis.transactionCount).toBe(4);
      expect(result.kpis.categorizedCount).toBe(3);
      expect(result.kpis.uncategorizedCount).toBe(1);
    });
  });

  describe('Filters', () => {
    beforeEach(async () => {
      // Setup test data
      const transactions: Partial<Transaction>[] = [
        { id: 1, amount: 50000, category: 'income', date: '2024-01-15', accountId: 1, narration: 'Salary' },
        { id: 2, amount: -10000, category: 'shopping', date: '2024-02-10', accountId: 1, narration: 'Shopping' },
        { id: 3, amount: -5000, category: 'food', date: '2024-03-05', accountId: 2, narration: 'Restaurant' },
        { id: 4, amount: 30000, category: 'income', date: '2024-02-20', accountId: 2, narration: 'Bonus' }
      ];
      await db.transactions.bulkAdd(transactions as Transaction[]);
    });

    it('should filter by date range', async () => {
      // Act
      const result = await service.getAnalytics({
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-28')
      });

      // Assert
      expect(result.kpis.totalIncome).toBe(30000); // Only February income
      expect(result.kpis.totalExpenses).toBe(10000); // Only February expense
    });

    it('should filter by account IDs', async () => {
      // Act
      const result = await service.getAnalytics({
        accountIds: [1]
      });

      // Assert
      expect(result.kpis.totalIncome).toBe(50000); // Only account 1 income
      expect(result.kpis.totalExpenses).toBe(10000); // Only account 1 expense
    });

    it('should combine multiple filters', async () => {
      // Act
      const result = await service.getAnalytics({
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-03-31'),
        accountIds: [2]
      });

      // Assert
      expect(result.kpis.totalIncome).toBe(30000); // Account 2, Feb-Mar
      expect(result.kpis.totalExpenses).toBe(5000); // Account 2, Feb-Mar
    });
  });

  describe('Category Breakdown', () => {
    it('should calculate category breakdown correctly', async () => {
      // Arrange
      const transactions: Partial<Transaction>[] = [
        { id: 1, amount: -10000, category: 'shopping', date: '2024-01-01', accountId: 1, narration: 'Amazon' },
        { id: 2, amount: -5000, category: 'shopping', date: '2024-01-02', accountId: 1, narration: 'Flipkart' },
        { id: 3, amount: -8000, category: 'food', date: '2024-01-03', accountId: 1, narration: 'Restaurant' },
        { id: 4, amount: -3000, category: 'transport', date: '2024-01-04', accountId: 1, narration: 'Uber' },
        { id: 5, amount: -2000, date: '2024-01-05', accountId: 1, narration: 'Unknown' }
      ];
      await db.transactions.bulkAdd(transactions as Transaction[]);

      // Act
      const result = await service.getAnalytics({});

      // Assert
      expect(result.categoryBreakdown.length).toBe(4); // shopping, food, transport, uncategorized
      
      const shopping = result.categoryBreakdown.find(c => c.categoryId === 'shopping');
      expect(shopping?.amount).toBe(15000);
      expect(shopping?.count).toBe(2);
      expect(shopping?.percentage).toBeCloseTo(53.57, 1); // 15000/28000 * 100

      const uncategorized = result.categoryBreakdown.find(c => c.categoryId === 'uncategorized');
      expect(uncategorized?.amount).toBe(2000);
      expect(uncategorized?.count).toBe(1);
    });

    it('should handle refunds in category breakdown for expense categories', async () => {
      // Arrange - Testing the exact scenario from the bug
      const transactions: Partial<Transaction>[] = [
        { id: 1, amount: -2104, category: 'digital', date: '2024-01-01', accountId: 1, narration: 'App purchase 1' },
        { id: 2, amount: 109, category: 'digital', date: '2024-01-02', accountId: 1, narration: 'App refund' },
        { id: 3, amount: -636, category: 'travel', date: '2024-01-03', accountId: 1, narration: 'Flight ticket' },
        { id: 4, amount: 1005.4, category: 'travel', date: '2024-01-04', accountId: 1, narration: 'Flight refund' }
      ];
      await db.transactions.bulkAdd(transactions as Transaction[]);

      // Act
      const result = await service.getAnalytics({});

      // Assert
      const digital = result.categoryBreakdown.find(c => c.categoryId === 'digital');
      expect(digital?.amount).toBe(1995); // 2104 - 109 = 1995 (net amount after refund)
      
      // Travel should not appear as it has negative net amount
      const travel = result.categoryBreakdown.find(c => c.categoryId === 'travel');
      expect(travel).toBeUndefined(); // Should be excluded as net is -369.4
    });

    it('should exclude categories with negative net amounts from breakdown', async () => {
      // Arrange - More refunds than expenses in a category
      const transactions: Partial<Transaction>[] = [
        { id: 1, amount: -100, category: 'shopping', date: '2024-01-01', accountId: 1, narration: 'Purchase' },
        { id: 2, amount: 500, category: 'shopping', date: '2024-01-02', accountId: 1, narration: 'Big refund' },
        { id: 3, amount: -1000, category: 'food', date: '2024-01-03', accountId: 1, narration: 'Groceries' }
      ];
      await db.transactions.bulkAdd(transactions as Transaction[]);

      // Act
      const result = await service.getAnalytics({});

      // Assert
      expect(result.categoryBreakdown.length).toBe(1); // Only food should appear
      const food = result.categoryBreakdown.find(c => c.categoryId === 'food');
      expect(food?.amount).toBe(1000);
      
      // Shopping should not appear due to negative net
      const shopping = result.categoryBreakdown.find(c => c.categoryId === 'shopping');
      expect(shopping).toBeUndefined();
    });

    it('should calculate correct percentages with refunds', async () => {
      // Arrange
      const transactions: Partial<Transaction>[] = [
        { id: 1, amount: -1000, category: 'food', date: '2024-01-01', accountId: 1, narration: 'Restaurant' },
        { id: 2, amount: 200, category: 'food', date: '2024-01-02', accountId: 1, narration: 'Food refund' },
        { id: 3, amount: -600, category: 'transport', date: '2024-01-03', accountId: 1, narration: 'Uber' },
        { id: 4, amount: -400, category: 'shopping', date: '2024-01-04', accountId: 1, narration: 'Amazon' }
      ];
      await db.transactions.bulkAdd(transactions as Transaction[]);

      // Act
      const result = await service.getAnalytics({});

      // Assert
      // Net amounts: food=800, transport=600, shopping=400, total=1800
      const food = result.categoryBreakdown.find(c => c.categoryId === 'food');
      expect(food?.amount).toBe(800);
      expect(food?.percentage).toBeCloseTo(44.44, 1); // 800/1800

      const transport = result.categoryBreakdown.find(c => c.categoryId === 'transport');
      expect(transport?.amount).toBe(600);
      expect(transport?.percentage).toBeCloseTo(33.33, 1); // 600/1800

      const shopping = result.categoryBreakdown.find(c => c.categoryId === 'shopping');
      expect(shopping?.amount).toBe(400);
      expect(shopping?.percentage).toBeCloseTo(22.22, 1); // 400/1800
    });

    it('should handle income and investment categories differently (no refund logic)', async () => {
      // Arrange
      const transactions: Partial<Transaction>[] = [
        { id: 1, amount: 50000, category: 'income', date: '2024-01-01', accountId: 1, narration: 'Salary' },
        { id: 2, amount: 5000, category: 'income', date: '2024-01-02', accountId: 1, narration: 'Bonus' },
        { id: 3, amount: -10000, category: 'investments', date: '2024-01-03', accountId: 1, narration: 'MF' },
        { id: 4, amount: 2000, category: 'investments', date: '2024-01-04', accountId: 1, narration: 'Dividend' }
      ];
      await db.transactions.bulkAdd(transactions as Transaction[]);

      // Act  
      const result = await service.getAnalytics({});

      // Assert
      const income = result.categoryBreakdown.find(c => c.categoryId === 'income');
      expect(income?.amount).toBe(55000); // Both positive amounts added (no refund logic)
      
      const investments = result.categoryBreakdown.find(c => c.categoryId === 'investments');
      expect(investments?.amount).toBe(12000); // Absolute values: 10000 + 2000
    });

    it('should sort categories by amount descending', async () => {
      // Arrange
      const transactions: Partial<Transaction>[] = [
        { id: 1, amount: -5000, category: 'food', date: '2024-01-01', accountId: 1, narration: 'Food' },
        { id: 2, amount: -10000, category: 'shopping', date: '2024-01-02', accountId: 1, narration: 'Shopping' },
        { id: 3, amount: -3000, category: 'transport', date: '2024-01-03', accountId: 1, narration: 'Transport' }
      ];
      await db.transactions.bulkAdd(transactions as Transaction[]);

      // Act
      const result = await service.getAnalytics({});

      // Assert
      expect(result.categoryBreakdown[0].categoryId).toBe('shopping'); // Highest amount
      expect(result.categoryBreakdown[1].categoryId).toBe('food');
      expect(result.categoryBreakdown[2].categoryId).toBe('transport'); // Lowest amount
    });
  });

  describe('Monthly Trend', () => {
    it('should calculate expenses using isExpenseCategory helper', async () => {
      // This test ensures expenses are calculated correctly using category logic
      // not just by checking if amount is negative
      const transactions: Partial<Transaction>[] = [
        // January - Various expense categories
        { id: 1, amount: -5000, category: 'food', date: '2024-01-01', accountId: 1, narration: 'Groceries' },
        { id: 2, amount: -3000, category: 'transport', date: '2024-01-05', accountId: 1, narration: 'Uber' },
        { id: 3, amount: -10000, category: 'shopping', date: '2024-01-10', accountId: 1, narration: 'Amazon' },
        { id: 4, amount: 2000, category: 'shopping', date: '2024-01-15', accountId: 1, narration: 'Amazon Refund' },
        
        // Non-expense categories that should NOT be counted as expenses
        { id: 5, amount: -20000, category: 'investments', date: '2024-01-20', accountId: 1, narration: 'Mutual Fund' },
        { id: 6, amount: -15000, category: 'transfers', isInternalTransfer: true, date: '2024-01-22', accountId: 1, narration: 'Transfer to Savings' },
        { id: 7, amount: -5000, category: 'loans', date: '2024-01-25', accountId: 1, narration: 'Loan EMI' },
        { id: 8, amount: 50000, category: 'income', date: '2024-01-28', accountId: 1, narration: 'Salary' },
        
        // February - Test refunds properly reduce expenses
        { id: 9, amount: -8000, category: 'health', date: '2024-02-01', accountId: 1, narration: 'Hospital' },
        { id: 10, amount: 3000, category: 'health', date: '2024-02-05', accountId: 1, narration: 'Insurance Claim' },
        { id: 11, amount: -2000, category: 'utilities', date: '2024-02-10', accountId: 1, narration: 'Electricity' }
      ];
      await db.transactions.bulkAdd(transactions as Transaction[]);

      // Act
      const result = await service.getAnalytics({});

      // Assert
      const jan = result.monthlyTrend.find(m => m.month === '2024-01');
      // January expenses: food(5000) + transport(3000) + shopping(10000-2000) = 16000
      // NOT including investments(20000), transfers(15000), or loans(5000)
      expect(jan?.expenses).toBe(16000);
      expect(jan?.income).toBe(50000);
      expect(jan?.investments).toBe(20000);
      expect(jan?.transfers).toBe(15000);
      expect(jan?.net).toBe(34000); // 50000 - 16000

      const feb = result.monthlyTrend.find(m => m.month === '2024-02');
      // February expenses: health(8000-3000) + utilities(2000) = 7000
      expect(feb?.expenses).toBe(7000);
    });

    it('should handle negative expenses when refunds exceed purchases', async () => {
      // Test case for when refunds are greater than expenses in a month
      const transactions: Partial<Transaction>[] = [
        { id: 1, amount: -1000, category: 'shopping', date: '2024-01-01', accountId: 1, narration: 'Small purchase' },
        { id: 2, amount: 5000, category: 'shopping', date: '2024-01-05', accountId: 1, narration: 'Big refund' },
        { id: 3, amount: -500, category: 'food', date: '2024-01-10', accountId: 1, narration: 'Lunch' }
      ];
      await db.transactions.bulkAdd(transactions as Transaction[]);

      // Act
      const result = await service.getAnalytics({});

      // Assert
      const jan = result.monthlyTrend.find(m => m.month === '2024-01');
      // Expenses: shopping(1000-5000=-4000) + food(500) = -3500
      expect(jan?.expenses).toBe(-3500);
      expect(jan?.net).toBe(3500); // 0 income - (-3500) expenses = 3500
    });

    it('should correctly categorize all transaction types in monthly trend', async () => {
      // Comprehensive test for all transaction categorization
      const transactions: Partial<Transaction>[] = [
        // All different types in one month
        { id: 1, amount: 100000, category: 'income', date: '2024-03-01', accountId: 1, narration: 'Salary' },
        { id: 2, amount: -30000, category: 'housing', date: '2024-03-02', accountId: 1, narration: 'Rent' },
        { id: 3, amount: -5000, category: 'utilities', date: '2024-03-03', accountId: 1, narration: 'Bills' },
        { id: 4, amount: -10000, category: 'food', date: '2024-03-04', accountId: 1, narration: 'Groceries' },
        { id: 5, amount: -50000, category: 'investments', date: '2024-03-05', accountId: 1, narration: 'SIP' },
        { id: 6, amount: 10000, category: 'investments', date: '2024-03-06', accountId: 1, narration: 'Dividend' },
        { id: 7, amount: -20000, category: 'transfers', isInternalTransfer: true, date: '2024-03-07', accountId: 1, narration: 'To Savings' },
        { id: 8, amount: -15000, category: 'loans', date: '2024-03-08', accountId: 1, narration: 'EMI' },
        { id: 9, amount: -8000, date: '2024-03-09', accountId: 1, narration: 'Unknown transaction' }
      ];
      await db.transactions.bulkAdd(transactions as Transaction[]);

      // Act
      const result = await service.getAnalytics({});

      // Assert
      const mar = result.monthlyTrend.find(m => m.month === '2024-03');
      expect(mar?.income).toBe(100000);
      // Expenses: housing(30000) + utilities(5000) + food(10000) = 45000
      // NOT loans, investments, transfers, or uncategorized
      expect(mar?.expenses).toBe(45000);
      expect(mar?.investments).toBe(60000); // 50000 + 10000 (absolute values)
      expect(mar?.transfers).toBe(20000);
      expect(mar?.uncategorized).toBe(8000);
      expect(mar?.net).toBe(55000); // 100000 - 45000
    });

    it('should calculate monthly trend correctly', async () => {
      // Arrange
      const transactions: Partial<Transaction>[] = [
        { id: 1, amount: 50000, category: 'income', date: '2024-01-15', accountId: 1, narration: 'Salary' },
        { id: 2, amount: -10000, category: 'shopping', date: '2024-01-20', accountId: 1, narration: 'Shopping' },
        { id: 3, amount: -5000, category: 'investments', date: '2024-01-25', accountId: 1, narration: 'MF' },
        { id: 4, amount: 60000, category: 'income', date: '2024-02-15', accountId: 1, narration: 'Salary' },
        { id: 5, amount: -15000, category: 'food', date: '2024-02-20', accountId: 1, narration: 'Food' },
        { id: 6, amount: -3000, date: '2024-02-25', accountId: 1, narration: 'Unknown' }
      ];
      await db.transactions.bulkAdd(transactions as Transaction[]);

      // Act
      const result = await service.getAnalytics({});

      // Assert
      expect(result.monthlyTrend.length).toBe(2);
      
      const jan = result.monthlyTrend.find(m => m.month === '2024-01');
      expect(jan?.income).toBe(50000);
      expect(jan?.expenses).toBe(10000);
      expect(jan?.investments).toBe(5000);
      expect(jan?.net).toBe(40000); // income - expenses

      const feb = result.monthlyTrend.find(m => m.month === '2024-02');
      expect(feb?.income).toBe(60000);
      expect(feb?.expenses).toBe(15000);
      expect(feb?.uncategorized).toBe(3000);
      expect(feb?.net).toBe(45000);
    });

    it('should sort months chronologically', async () => {
      // Arrange
      const transactions: Partial<Transaction>[] = [
        { id: 1, amount: -5000, category: 'food', date: '2024-03-01', accountId: 1, narration: 'March' },
        { id: 2, amount: -3000, category: 'food', date: '2024-01-01', accountId: 1, narration: 'Jan' },
        { id: 3, amount: -4000, category: 'food', date: '2024-02-01', accountId: 1, narration: 'Feb' }
      ];
      await db.transactions.bulkAdd(transactions as Transaction[]);

      // Act
      const result = await service.getAnalytics({});

      // Assert
      expect(result.monthlyTrend[0].month).toBe('2024-01');
      expect(result.monthlyTrend[1].month).toBe('2024-02');
      expect(result.monthlyTrend[2].month).toBe('2024-03');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty transactions', async () => {
      // Act
      const result = await service.getAnalytics({});

      // Assert
      expect(result.kpis.totalIncome).toBe(0);
      expect(result.kpis.totalExpenses).toBe(0);
      expect(result.kpis.totalInvestments).toBe(0);
      expect(result.kpis.transactionCount).toBe(0);
      expect(result.categoryBreakdown.length).toBe(0);
      expect(result.monthlyTrend.length).toBe(0);
    });

    it('should handle all uncategorized transactions', async () => {
      // Arrange
      const transactions: Partial<Transaction>[] = [
        { id: 1, amount: -5000, date: '2024-01-01', accountId: 1, narration: 'Unknown1' },
        { id: 2, amount: 3000, category: undefined, date: '2024-01-02', accountId: 1, narration: 'Unknown2' }
      ];
      await db.transactions.bulkAdd(transactions as Transaction[]);

      // Act
      const result = await service.getAnalytics({});

      // Assert
      expect(result.kpis.totalIncome).toBe(0);
      expect(result.kpis.totalExpenses).toBe(0);
      expect(result.kpis.uncategorizedCount).toBe(2);
      expect(result.categoryBreakdown.length).toBe(1); // Only uncategorized
      expect(result.categoryBreakdown[0].categoryId).toBe('uncategorized');
    });
  });
});