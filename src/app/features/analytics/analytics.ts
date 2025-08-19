import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AnalyticsDataService, AnalyticsFilters, AnalyticsKPI, CategoryAnalytics } from './analytics-data';
import { Account } from '../../core/models/db';
import { TransactionDetailsModal, TransactionDetailsData } from './transaction-details-modal';

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule, FormsModule, TransactionDetailsModal],
  templateUrl: './analytics.html',
  styleUrl: './analytics.scss'
})
export class AnalyticsComponent implements OnInit {
  // Filters
  accounts = signal<Account[]>([]);
  selectedAccountIds = signal<number[]>([]);
  startDate = signal<string>('');
  endDate = signal<string>('');
  minDate = signal<string>('');
  maxDate = signal<string>('');

  // Data
  kpis = signal<AnalyticsKPI>({
    totalIncome: 0,
    totalExpenses: 0,
    netAmount: 0,
    transactionCount: 0,
    categorizedCount: 0,
    uncategorizedCount: 0
  });
  
  categoryBreakdown = signal<CategoryAnalytics[]>([]);
  monthlyTrend = signal<any[]>([]);
  
  // UI State
  isLoading = signal(false);
  error = signal<string | null>(null);
  showTransactionModal = signal(false);
  transactionModalData = signal<TransactionDetailsData | null>(null);

  // Computed values for display
  formattedIncome = computed(() => this.formatCurrency(this.kpis().totalIncome));
  formattedExpenses = computed(() => this.formatCurrency(this.kpis().totalExpenses));
  formattedNet = computed(() => this.formatCurrency(this.kpis().netAmount));
  categorizedPercentage = computed(() => {
    const kpi = this.kpis();
    if (kpi.transactionCount === 0) return 0;
    return Math.round((kpi.categorizedCount / kpi.transactionCount) * 100);
  });

  constructor(private analyticsService: AnalyticsDataService) {}

  async ngOnInit() {
    await this.loadInitialData();
  }

  async loadInitialData() {
    try {
      this.isLoading.set(true);
      
      // Load accounts
      const accounts = await this.analyticsService.getAccounts();
      this.accounts.set(accounts);
      
      // Load date range
      const dateRange = await this.analyticsService.getDateRange();
      if (dateRange.minDate && dateRange.maxDate) {
        // Set default to last 30 days or available range
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const defaultStart = thirtyDaysAgo > dateRange.minDate ? thirtyDaysAgo : dateRange.minDate;
        
        this.minDate.set(this.formatDateForInput(dateRange.minDate));
        this.maxDate.set(this.formatDateForInput(dateRange.maxDate));
        this.startDate.set(this.formatDateForInput(defaultStart));
        this.endDate.set(this.formatDateForInput(dateRange.maxDate));
      }
      
      // Load analytics with default filters
      await this.loadAnalytics();
    } catch (error) {
      console.error('Error loading initial data:', error);
      this.error.set('Failed to load analytics data');
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadAnalytics() {
    try {
      this.isLoading.set(true);
      this.error.set(null);
      
      const filters: AnalyticsFilters = {};
      
      if (this.startDate()) {
        filters.startDate = new Date(this.startDate());
      }
      
      if (this.endDate()) {
        const endDate = new Date(this.endDate());
        endDate.setHours(23, 59, 59, 999);
        filters.endDate = endDate;
      }
      
      if (this.selectedAccountIds().length > 0) {
        filters.accountIds = this.selectedAccountIds();
      }
      
      const analytics = await this.analyticsService.getAnalytics(filters);
      
      this.kpis.set(analytics.kpis);
      this.categoryBreakdown.set(analytics.categoryBreakdown);
      this.monthlyTrend.set(analytics.monthlyTrend);
    } catch (error) {
      console.error('Error loading analytics:', error);
      this.error.set('Failed to load analytics');
    } finally {
      this.isLoading.set(false);
    }
  }

  onAccountSelectionChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const selectedOptions = Array.from(select.selectedOptions);
    const selectedIds = selectedOptions.map(option => parseInt(option.value)).filter(id => !isNaN(id));
    this.selectedAccountIds.set(selectedIds);
    this.loadAnalytics();
  }

  onDateChange() {
    this.loadAnalytics();
  }

  clearFilters() {
    this.selectedAccountIds.set([]);
    
    // Reset to default date range
    const dateRange = { minDate: new Date(this.minDate()), maxDate: new Date(this.maxDate()) };
    if (dateRange.minDate && dateRange.maxDate) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const defaultStart = thirtyDaysAgo > dateRange.minDate ? thirtyDaysAgo : dateRange.minDate;
      
      this.startDate.set(this.formatDateForInput(defaultStart));
      this.endDate.set(this.formatDateForInput(dateRange.maxDate));
    }
    
    this.loadAnalytics();
  }

  private formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }

  getCategoryExpenses(): CategoryAnalytics[] {
    return this.categoryBreakdown().filter(cat => cat.categoryId !== 'income');
  }

  showTransactionDetails(filter: 'income' | 'expenses' | 'net' | 'transfers') {
    let title = '';
    
    switch (filter) {
      case 'income':
        title = 'Income Transactions';
        break;
      case 'expenses':
        title = 'Expense Transactions';
        break;
      case 'net':
        title = 'All Transactions (excluding transfers)';
        break;
      case 'transfers':
        title = 'Transfer Transactions';
        break;
    }

    const data: TransactionDetailsData = {
      filter,
      title,
      accountIds: this.selectedAccountIds().length > 0 ? this.selectedAccountIds() : undefined,
      startDate: this.startDate() ? new Date(this.startDate()) : undefined,
      endDate: this.endDate() ? new Date(this.endDate()) : undefined
    };

    this.transactionModalData.set(data);
    this.showTransactionModal.set(true);
  }

  showCategoryDetails(category: CategoryAnalytics) {
    const data: TransactionDetailsData = {
      filter: 'category',
      categoryId: category.categoryId,
      title: `${category.label} Transactions`,
      accountIds: this.selectedAccountIds().length > 0 ? this.selectedAccountIds() : undefined,
      startDate: this.startDate() ? new Date(this.startDate()) : undefined,
      endDate: this.endDate() ? new Date(this.endDate()) : undefined
    };

    this.transactionModalData.set(data);
    this.showTransactionModal.set(true);
  }

  closeTransactionModal() {
    this.showTransactionModal.set(false);
    this.transactionModalData.set(null);
  }
}