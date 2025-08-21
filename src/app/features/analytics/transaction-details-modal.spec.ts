import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TransactionDetailsModal, TransactionDetailsData } from './transaction-details-modal';
import { db, Transaction } from '../../core/models/db';
import { ROOT_CATEGORIES } from '../../core/models/category.model';

describe('TransactionDetailsModal', () => {
  let component: TransactionDetailsModal;
  let fixture: ComponentFixture<TransactionDetailsModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TransactionDetailsModal],
      providers: [provideZonelessChangeDetection()]
    }).compileComponents();

    fixture = TestBed.createComponent(TransactionDetailsModal);
    component = fixture.componentInstance;
    
    // Set default data to prevent errors in ngOnInit
    component.data = {
      filter: 'expenses',
      title: 'Test Transactions'
    };
  });

  afterEach(async () => {
    // Clear database after each test
    await db.transactions.clear();
    await db.accounts.clear();
  });

  describe('Category Breakdown for Expenses', () => {
    it('should handle refunds correctly in expense category breakdown', async () => {
      // Set up component with expense filter
      component.data = {
        filter: 'expenses',
        title: 'Expense Transactions'
      };
      // Arrange - Testing the exact bug scenario
      const mockTransactions: Partial<Transaction>[] = [
        {
          id: 1,
          accountId: 1,
          date: '2024-01-01',
          narration: 'Digital purchase 1',
          amount: -1000,
          category: 'digital',
          isInternalTransfer: false
        },
        {
          id: 2,
          accountId: 1,
          date: '2024-01-02',
          narration: 'Digital purchase 2',
          amount: -1213,
          category: 'digital',
          isInternalTransfer: false
        },
        {
          id: 3,
          accountId: 1,
          date: '2024-01-03',
          narration: 'Digital refund 1',
          amount: 109, // Refund (positive amount)
          category: 'digital',
          isInternalTransfer: false
        }
      ];

      await db.transactions.bulkAdd(mockTransactions as Transaction[]);

      // Act
      await component.loadData();

      // Assert
      const breakdown = component.categoryBreakdown();
      const digitalCategory = breakdown.find(c => c.categoryId === 'digital');
      
      expect(digitalCategory).toBeDefined();
      expect(digitalCategory!.amount).toBe(2104); // (1000 + 1213) - 109 = 2104
      expect(digitalCategory!.count).toBe(3); // All 3 transactions
    });

    it('should exclude categories with negative net amounts after refunds', async () => {
      // Set up component with expense filter
      component.data = {
        filter: 'expenses',
        title: 'Expense Transactions'
      };
      // Arrange
      const mockTransactions: Partial<Transaction>[] = [
        {
          id: 1,
          accountId: 1,
          date: '2024-01-01',
          narration: 'Travel expense',
          amount: -636,
          category: 'travel',
          isInternalTransfer: false
        },
        {
          id: 2,
          accountId: 1,
          date: '2024-01-02',
          narration: 'Travel refund',
          amount: 1005.4, // Refund exceeds expense
          category: 'travel',
          isInternalTransfer: false
        },
        {
          id: 3,
          accountId: 1,
          date: '2024-01-03',
          narration: 'Food expense',
          amount: -500,
          category: 'food',
          isInternalTransfer: false
        }
      ];

      await db.transactions.bulkAdd(mockTransactions as Transaction[]);

      // Act
      await component.loadData();

      // Assert
      const breakdown = component.categoryBreakdown();
      
      // Travel should not appear (net amount is negative)
      const travelCategory = breakdown.find(c => c.categoryId === 'travel');
      expect(travelCategory).toBeUndefined();
      
      // Food should appear
      const foodCategory = breakdown.find(c => c.categoryId === 'food');
      expect(foodCategory).toBeDefined();
      expect(foodCategory!.amount).toBe(500);
    });

    it('should calculate correct total in export with refunds', async () => {
      // Set up component with expense filter
      component.data = {
        filter: 'expenses',
        title: 'Expense Transactions'
      };
      // Arrange
      const mockTransactions: Partial<Transaction>[] = [
        { id: 1, amount: -19342.44, category: 'transport', date: '2024-01-01', accountId: 1, narration: 'Transport' },
        { id: 2, amount: -16211.51, category: 'food', date: '2024-01-02', accountId: 1, narration: 'Food' },
        { id: 3, amount: -2104, category: 'digital', date: '2024-01-03', accountId: 1, narration: 'Digital' },
        { id: 4, amount: 109, category: 'digital', date: '2024-01-04', accountId: 1, narration: 'Digital refund' },
        { id: 5, amount: -636, category: 'travel', date: '2024-01-05', accountId: 1, narration: 'Travel' },
        { id: 6, amount: 1005.4, category: 'travel', date: '2024-01-06', accountId: 1, narration: 'Travel refund' }
      ];

      await db.transactions.bulkAdd(mockTransactions as Transaction[]);

      // Act
      await component.loadData();

      // Assert
      const breakdown = component.categoryBreakdown();
      const totalAmount = breakdown.reduce((sum, cat) => sum + cat.amount, 0);
      
      // Total should be: 19342.44 + 16211.51 + (2104 - 109) = 37548.95
      // Travel is excluded due to negative net
      expect(totalAmount).toBeCloseTo(37548.95, 2);
    });

    it('should calculate correct percentages with refunds', async () => {
      // Set up component with expense filter
      component.data = {
        filter: 'expenses',
        title: 'Expense Transactions'
      };
      // Arrange
      const mockTransactions: Partial<Transaction>[] = [
        { id: 1, amount: -1000, category: 'food', date: '2024-01-01', accountId: 1, narration: 'Food' },
        { id: 2, amount: 200, category: 'food', date: '2024-01-02', accountId: 1, narration: 'Food refund' },
        { id: 3, amount: -600, category: 'transport', date: '2024-01-03', accountId: 1, narration: 'Transport' },
        { id: 4, amount: -400, category: 'shopping', date: '2024-01-04', accountId: 1, narration: 'Shopping' }
      ];

      await db.transactions.bulkAdd(mockTransactions as Transaction[]);

      // Act
      await component.loadData();

      // Assert
      const breakdown = component.categoryBreakdown();
      
      // Net amounts: food=800, transport=600, shopping=400, total=1800
      const food = breakdown.find(c => c.categoryId === 'food');
      expect(food!.percentage).toBeCloseTo(44.44, 1); // 800/1800
      
      const transport = breakdown.find(c => c.categoryId === 'transport');
      expect(transport!.percentage).toBeCloseTo(33.33, 1); // 600/1800
      
      const shopping = breakdown.find(c => c.categoryId === 'shopping');
      expect(shopping!.percentage).toBeCloseTo(22.22, 1); // 400/1800
    });

    it('should include both positive and negative amounts in expense filter', async () => {
      // Set up component with expense filter
      component.data = {
        filter: 'expenses',
        title: 'Expense Transactions'
      };
      // Arrange
      const mockTransactions: Partial<Transaction>[] = [
        { id: 1, amount: -500, category: 'food', date: '2024-01-01', accountId: 1, narration: 'Restaurant' },
        { id: 2, amount: 100, category: 'food', date: '2024-01-02', accountId: 1, narration: 'Restaurant refund' },
        { id: 3, amount: -300, category: 'transport', date: '2024-01-03', accountId: 1, narration: 'Uber' },
        { id: 4, amount: -1000, category: 'income', date: '2024-01-04', accountId: 1, narration: 'Wrong category' }
      ];

      await db.transactions.bulkAdd(mockTransactions as Transaction[]);

      // Act
      await component.loadData();

      // Assert
      const transactions = component.transactions();
      
      // Should include food expense, food refund, and transport
      // Should exclude income category even if negative
      expect(transactions.length).toBe(3);
      
      const foodTransactions = transactions.filter(t => t.category === 'food');
      expect(foodTransactions.length).toBe(2); // Both expense and refund
    });

    it('should not include internal transfers in expense calculations', async () => {
      // Set up component with expense filter
      component.data = {
        filter: 'expenses',
        title: 'Expense Transactions'
      };
      // Arrange
      const mockTransactions: Partial<Transaction>[] = [
        { id: 1, amount: -1000, category: 'food', date: '2024-01-01', accountId: 1, narration: 'Groceries', isInternalTransfer: false },
        { id: 2, amount: -2000, category: 'food', date: '2024-01-02', accountId: 1, narration: 'Wrong internal', isInternalTransfer: true },
        { id: 3, amount: -500, category: 'transport', date: '2024-01-03', accountId: 1, narration: 'Cab', isInternalTransfer: false }
      ];

      await db.transactions.bulkAdd(mockTransactions as Transaction[]);

      // Act
      await component.loadData();

      // Assert
      const transactions = component.transactions();
      expect(transactions.length).toBe(2); // Excludes internal transfer
      
      const breakdown = component.categoryBreakdown();
      const food = breakdown.find(c => c.categoryId === 'food');
      expect(food!.amount).toBe(1000); // Only non-internal transaction
    });
  });

  describe('Transaction Filtering', () => {
    it('should filter income transactions correctly', async () => {
      // Arrange
      component.data = {
        filter: 'income',
        title: 'Income Transactions'
      };

      const mockTransactions: Partial<Transaction>[] = [
        { id: 1, amount: 50000, category: 'income', date: '2024-01-01', accountId: 1, narration: 'Salary' },
        { id: 2, amount: 5000, category: 'income', date: '2024-01-02', accountId: 1, narration: 'Bonus' },
        { id: 3, amount: -1000, category: 'food', date: '2024-01-03', accountId: 1, narration: 'Food' },
        { id: 4, amount: 10000, category: 'income', date: '2024-01-04', accountId: 1, narration: 'Transfer', isInternalTransfer: true }
      ];

      await db.transactions.bulkAdd(mockTransactions as Transaction[]);

      // Act
      await component.loadData();

      // Assert
      const transactions = component.transactions();
      expect(transactions.length).toBe(2); // Only non-internal income
      expect(transactions.every(t => t.category === 'income')).toBe(true);
      expect(transactions.every(t => !t.isInternalTransfer)).toBe(true);
    });

    it('should filter investment transactions correctly', async () => {
      // Arrange
      component.data = {
        filter: 'investments',
        title: 'Investment Transactions'
      };

      const mockTransactions: Partial<Transaction>[] = [
        { id: 1, amount: -10000, category: 'investments', date: '2024-01-01', accountId: 1, narration: 'MF' },
        { id: 2, amount: 2000, category: 'investments', date: '2024-01-02', accountId: 1, narration: 'Dividend' },
        { id: 3, amount: -5000, category: 'food', date: '2024-01-03', accountId: 1, narration: 'Food' }
      ];

      await db.transactions.bulkAdd(mockTransactions as Transaction[]);

      // Act
      await component.loadData();

      // Assert
      const transactions = component.transactions();
      expect(transactions.length).toBe(2);
      expect(transactions.every(t => t.category === 'investments')).toBe(true);
    });

    it('should filter by date range', async () => {
      // Arrange
      component.data = {
        filter: 'expenses',
        title: 'Expense Transactions',
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-28')
      };

      const mockTransactions: Partial<Transaction>[] = [
        { id: 1, amount: -1000, category: 'food', date: '2024-01-15', accountId: 1, narration: 'Jan' },
        { id: 2, amount: -2000, category: 'food', date: '2024-02-10', accountId: 1, narration: 'Feb' },
        { id: 3, amount: -3000, category: 'food', date: '2024-03-05', accountId: 1, narration: 'Mar' }
      ];

      await db.transactions.bulkAdd(mockTransactions as Transaction[]);

      // Act
      await component.loadData();

      // Assert
      const transactions = component.transactions();
      expect(transactions.length).toBe(1);
      expect(transactions[0].narration).toBe('Feb');
    });

    it('should filter by account IDs', async () => {
      // Arrange
      component.data = {
        filter: 'expenses',
        title: 'Expense Transactions',
        accountIds: [1, 3]
      };

      const mockTransactions: Partial<Transaction>[] = [
        { id: 1, amount: -1000, category: 'food', date: '2024-01-01', accountId: 1, narration: 'Acc1' },
        { id: 2, amount: -2000, category: 'food', date: '2024-01-02', accountId: 2, narration: 'Acc2' },
        { id: 3, amount: -3000, category: 'food', date: '2024-01-03', accountId: 3, narration: 'Acc3' }
      ];

      await db.transactions.bulkAdd(mockTransactions as Transaction[]);

      // Act
      await component.loadData();

      // Assert
      const transactions = component.transactions();
      expect(transactions.length).toBe(2);
      expect(transactions.map(t => t.accountId).sort()).toEqual([1, 3]);
    });
  });

  describe('Net Investment Calculation', () => {
    it('should calculate net investment (invested minus redeemed)', async () => {
      // Arrange
      component.data = {
        filter: 'investments',
        title: 'Investment Transactions'
      };

      const mockTransactions: Partial<Transaction>[] = [
        { id: 1, amount: -50000, category: 'investments', date: '2024-01-01', accountId: 1, narration: 'MF Investment 1' },
        { id: 2, amount: -30000, category: 'investments', date: '2024-01-02', accountId: 1, narration: 'MF Investment 2' },
        { id: 3, amount: 15000, category: 'investments', date: '2024-01-03', accountId: 1, narration: 'MF Redemption' },
        { id: 4, amount: -20000, category: 'investments', date: '2024-01-04', accountId: 1, narration: 'Stock Investment' }
      ];

      await db.transactions.bulkAdd(mockTransactions as Transaction[]);

      // Act
      await component.loadData();

      // Assert
      const totalAmount = component.totalAmount();
      // Net = (50000 + 30000 + 20000) - 15000 = 85000
      expect(totalAmount).toBe(85000);
    });

    it('should handle negative net investment when redemptions exceed investments', async () => {
      // Arrange
      component.data = {
        filter: 'investments',
        title: 'Investment Transactions'
      };

      const mockTransactions: Partial<Transaction>[] = [
        { id: 1, amount: -10000, category: 'investments', date: '2024-01-01', accountId: 1, narration: 'Investment' },
        { id: 2, amount: 25000, category: 'investments', date: '2024-01-02', accountId: 1, narration: 'Large Redemption' },
        { id: 3, amount: 5000, category: 'investments', date: '2024-01-03', accountId: 1, narration: 'Dividend' }
      ];

      await db.transactions.bulkAdd(mockTransactions as Transaction[]);

      // Act
      await component.loadData();

      // Assert
      const totalAmount = component.totalAmount();
      // Net = 10000 - (25000 + 5000) = -20000
      expect(totalAmount).toBe(-20000);
    });

    it('should exclude internal transfers from investment calculations', async () => {
      // Arrange
      component.data = {
        filter: 'investments',
        title: 'Investment Transactions'
      };

      const mockTransactions: Partial<Transaction>[] = [
        { id: 1, amount: -50000, category: 'investments', date: '2024-01-01', accountId: 1, narration: 'MF Purchase', isInternalTransfer: false },
        { id: 2, amount: -30000, category: 'investments', date: '2024-01-02', accountId: 1, narration: 'Internal Transfer', isInternalTransfer: true },
        { id: 3, amount: 10000, category: 'investments', date: '2024-01-03', accountId: 1, narration: 'Redemption', isInternalTransfer: false }
      ];

      await db.transactions.bulkAdd(mockTransactions as Transaction[]);

      // Act
      await component.loadData();

      // Assert
      const transactions = component.transactions();
      expect(transactions.length).toBe(2); // Excludes internal transfer
      
      const totalAmount = component.totalAmount();
      // Net = 50000 - 10000 = 40000 (excludes internal transfer)
      expect(totalAmount).toBe(40000);
    });

    it('should calculate investment totals differently from income and expenses', async () => {
      // Test that each filter type calculates totals correctly
      const mockTransactions: Partial<Transaction>[] = [
        // Income transactions
        { id: 1, amount: 50000, category: 'income', date: '2024-01-01', accountId: 1, narration: 'Salary' },
        { id: 2, amount: -5000, category: 'income', date: '2024-01-02', accountId: 1, narration: 'Income reversal' },
        
        // Investment transactions
        { id: 3, amount: -30000, category: 'investments', date: '2024-01-03', accountId: 1, narration: 'Investment' },
        { id: 4, amount: 10000, category: 'investments', date: '2024-01-04', accountId: 1, narration: 'Redemption' },
        
        // Expense transactions
        { id: 5, amount: -2000, category: 'food', date: '2024-01-05', accountId: 1, narration: 'Food' },
        { id: 6, amount: 500, category: 'food', date: '2024-01-06', accountId: 1, narration: 'Food refund' }
      ];

      await db.transactions.bulkAdd(mockTransactions as Transaction[]);

      // Test Income filter - uses absolute values
      component.data = {
        filter: 'income',
        title: 'Income'
      };
      await component.loadData();
      expect(component.totalAmount()).toBe(55000); // 50000 + 5000 (absolute values)

      // Test Investment filter - uses net (invested minus redeemed)
      component.data = {
        filter: 'investments',
        title: 'Investments'
      };
      await component.loadData();
      expect(component.totalAmount()).toBe(20000); // 30000 - 10000

      // Test Expense filter - uses actual amounts (negative for expenses, positive reduces)
      component.data = {
        filter: 'expenses',
        title: 'Expenses'
      };
      await component.loadData();
      expect(component.totalAmount()).toBe(-1500); // -2000 + 500
    });
  });

  describe('CSV Export', () => {
    it('should export category breakdown with correct totals', async () => {
      // Arrange
      component.data = {
        filter: 'expenses',
        title: 'Expense Transactions'
      };

      const mockTransactions: Partial<Transaction>[] = [
        { id: 1, amount: -1000, category: 'food', date: '2024-01-01', accountId: 1, narration: 'Food' },
        { id: 2, amount: 200, category: 'food', date: '2024-01-02', accountId: 1, narration: 'Refund' },
        { id: 3, amount: -500, category: 'transport', date: '2024-01-03', accountId: 1, narration: 'Uber' }
      ];

      await db.transactions.bulkAdd(mockTransactions as Transaction[]);

      // Act
      await component.loadData();
      
      // Spy on the download functionality
      const createElementSpy = spyOn(document, 'createElement').and.callThrough();
      const clickSpy = jasmine.createSpy('click');
      
      // Mock the anchor element
      const mockAnchor = document.createElement('a');
      Object.defineProperty(mockAnchor, 'click', { value: clickSpy });
      createElementSpy.and.returnValue(mockAnchor);

      component.exportCategoryBreakdown();

      // Assert
      expect(clickSpy).toHaveBeenCalled();
      expect(mockAnchor.download).toContain('expense_categories');
      
      // Check the CSV content
      const breakdown = component.categoryBreakdown();
      const totalAmount = breakdown.reduce((sum, cat) => sum + cat.amount, 0);
      expect(totalAmount).toBe(1300); // 800 (food) + 500 (transport)
    });
  });
});