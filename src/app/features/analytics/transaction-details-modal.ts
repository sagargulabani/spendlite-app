import { Component, Input, Output, EventEmitter, signal, computed, OnInit, ViewChild, ElementRef, AfterViewInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { db, Transaction, Account } from '../../core/models/db';
import { ROOT_CATEGORIES, isExpenseCategory } from '../../core/models/category.model';
import { Chart, ChartConfiguration, ChartType, registerables } from 'chart.js';

// Register Chart.js components
Chart.register(...registerables);

export type TransactionFilter = 'income' | 'investments' | 'expenses' | 'transfers' | 'category';

export interface TransactionDetailsData {
  filter: TransactionFilter;
  categoryId?: string;
  accountIds?: number[];
  startDate?: Date;
  endDate?: Date;
  title: string;
}

interface TransactionWithAccount extends Transaction {
  accountName?: string;
  categoryLabel?: string;
  categoryIcon?: string;
}

interface CategoryBreakdown {
  categoryId: string;
  label: string;
  icon: string;
  color: string;
  amount: number;
  count: number;
  percentage: number;
}

type ViewMode = 'chart' | 'transactions';

@Component({
  selector: 'app-transaction-details-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './transaction-details-modal.html',
  styleUrl: './transaction-details-modal.scss'
})
export class TransactionDetailsModal implements OnInit, AfterViewInit {
  @Input() data!: TransactionDetailsData;
  @Output() close = new EventEmitter<void>();
  
  @ViewChild('chartCanvas') chartCanvas?: ElementRef<HTMLCanvasElement>;
  
  constructor() {
    // Redraw chart when category breakdown changes and we're in chart view
    effect(() => {
      const breakdown = this.categoryBreakdown();
      const viewMode = this.viewMode();
      const isLoading = this.isLoading();
      
      console.log('Effect triggered - viewMode:', viewMode, 'isLoading:', isLoading, 'breakdown length:', breakdown.length, 'canvas exists:', !!this.chartCanvas?.nativeElement);
      
      if (viewMode === 'chart' && !isLoading && breakdown.length > 0) {
        // Wait for canvas to be available
        const checkAndDraw = () => {
          if (this.chartCanvas?.nativeElement) {
            console.log('Drawing chart - canvas now available');
            this.drawChart();
          } else {
            // Try again in next tick if canvas not ready
            setTimeout(checkAndDraw, 50);
          }
        };
        setTimeout(checkAndDraw, 50);
      }
    });
  }
  
  // View state
  viewMode = signal<ViewMode>('chart');
  selectedCategory = signal<string | null>(null);
  
  // State
  transactions = signal<TransactionWithAccount[]>([]);
  categoryBreakdown = signal<CategoryBreakdown[]>([]);
  isLoading = signal(false);
  
  // Chart instance
  private chart?: Chart;
  
  // Search and sort (for transaction view)
  searchQuery = signal('');
  sortBy = signal<'date' | 'amount'>('date');
  sortOrder = signal<'asc' | 'desc'>('desc');
  
  // Computed
  isExpensesView = computed(() => this.data?.filter === 'expenses');
  
  currentTitle = computed(() => {
    if (this.selectedCategory()) {
      const category = this.categoryBreakdown().find(c => c.categoryId === this.selectedCategory());
      return category ? `${category.label} Transactions` : this.data.title;
    }
    return this.data.title;
  });
  
  filteredTransactions = computed(() => {
    const query = this.searchQuery().toLowerCase();
    let txns = this.transactions();
    
    // If category is selected, filter by that category
    if (this.selectedCategory()) {
      txns = txns.filter(t => {
        const categoryToMatch = t.category || 'Uncategorized';
        return categoryToMatch === this.selectedCategory();
      });
    }
    
    if (!query) return txns;
    
    return txns.filter(t => 
      t.narration.toLowerCase().includes(query) ||
      t.accountName?.toLowerCase().includes(query) ||
      t.categoryLabel?.toLowerCase().includes(query) ||
      Math.abs(t.amount).toString().includes(query)
    );
  });
  
  sortedTransactions = computed(() => {
    const txns = [...this.filteredTransactions()];
    const sortBy = this.sortBy();
    const sortOrder = this.sortOrder();
    
    txns.sort((a, b) => {
      let compareValue = 0;
      
      if (sortBy === 'date') {
        compareValue = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (sortBy === 'amount') {
        compareValue = Math.abs(a.amount) - Math.abs(b.amount);
      }
      
      return sortOrder === 'asc' ? compareValue : -compareValue;
    });
    
    return txns;
  });
  
  totalAmount = computed(() => {
    const transactions = this.selectedCategory() ? this.filteredTransactions() : this.transactions();
    
    // For investments, show NET (investments minus redemptions)
    if (this.data?.filter === 'investments') {
      const investmentTotal = transactions
        .filter(t => t.amount < 0)  // Money going out
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const returnTotal = transactions
        .filter(t => t.amount > 0)  // Money coming back
        .reduce((sum, t) => sum + t.amount, 0);
      const netInvestment = investmentTotal - returnTotal;
      console.log(`Modal investments: ${investmentTotal}, Returns: ${returnTotal}, Net: ${netInvestment}`);
      console.log(`Transaction count: ${transactions.length}`);
      return netInvestment;  // Show NET investment
    }
    
    // For income, use absolute values
    if (this.data?.filter === 'income') {
      const total = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
      console.log(`Modal total for income: ${total}`);
      console.log(`Transaction count: ${transactions.length}`);
      return total;
    }
    
    // For expenses, transfers, and categories, use actual amounts
    return transactions.reduce((sum, t) => sum + t.amount, 0);
  });
  
  transactionCount = computed(() => {
    if (this.selectedCategory()) {
      return this.filteredTransactions().length;
    }
    return this.transactions().length;
  });

  async ngOnInit() {
    await this.loadData();
  }
  
  ngAfterViewInit() {
    console.log('ngAfterViewInit - canvas exists:', !!this.chartCanvas?.nativeElement);
    // Draw chart after view is initialized if we're in chart mode
    if (this.isExpensesView() && this.viewMode() === 'chart' && this.categoryBreakdown().length > 0) {
      console.log('Drawing chart from ngAfterViewInit');
      setTimeout(() => this.drawChart(), 100);
    }
  }

  async loadData() {
    this.isLoading.set(true);
    
    try {
      // Build query
      let query = db.transactions.orderBy('date');
      
      // Apply filters
      if (this.data.accountIds && this.data.accountIds.length > 0) {
        query = query.filter(t => this.data.accountIds!.includes(t.accountId));
      }
      
      const allTransactions = await query.toArray();
      
      // Filter by date
      let filtered = allTransactions;
      if (this.data.startDate || this.data.endDate) {
        filtered = allTransactions.filter(t => {
          const txnDate = new Date(t.date);
          if (this.data.startDate && txnDate < this.data.startDate) return false;
          if (this.data.endDate && txnDate > this.data.endDate) return false;
          return true;
        });
      }
      
      // Apply type filter
      switch (this.data.filter) {
        case 'income':
          filtered = filtered.filter(t => 
            t.category === 'income' && !t.isInternalTransfer
          );
          break;
          
        case 'investments':
          filtered = filtered.filter(t => 
            t.category === 'investments' && !t.isInternalTransfer
          );
          console.log('Investment transactions in modal:', filtered.length);
          let manualTotal = 0;
          filtered.forEach(t => {
            const absAmount = Math.abs(t.amount);
            manualTotal += absAmount;
            console.log(`  Amount: ${t.amount}, Absolute: ${absAmount}, Running: ${manualTotal}`);
          });
          console.log(`Manual calculation total: ${manualTotal}`);
          break;
          
        case 'expenses':
          filtered = filtered.filter(t => 
            isExpenseCategory(t.category) && // Use shared logic
            !t.isInternalTransfer
            // Include both expenses (negative) and refunds (positive) in expense categories
          );
          break;
          
        case 'transfers':
          filtered = filtered.filter(t => 
            t.category === 'transfers' || t.isInternalTransfer
          );
          break;
          
        case 'category':
          if (this.data.categoryId) {
            filtered = filtered.filter(t => t.category === this.data.categoryId);
          }
          break;
      }
      
      // Load accounts for names
      const accounts = await db.accounts.toArray();
      const accountMap = new Map(accounts.map(a => [a.id, a.name]));
      
      // Enrich transactions
      const enriched: TransactionWithAccount[] = filtered.map(t => {
        const category = ROOT_CATEGORIES.find(c => c.id === t.category);
        
        return {
          ...t,
          accountName: accountMap.get(t.accountId),
          categoryLabel: category?.label || t.category || 'Uncategorized',
          categoryIcon: category?.icon || '📝'
        };
      });
      
      this.transactions.set(enriched);
      
      // If expenses view, calculate category breakdown
      if (this.isExpensesView()) {
        this.calculateCategoryBreakdown(enriched);
        this.viewMode.set('chart');
      } else {
        this.viewMode.set('transactions');
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      this.isLoading.set(false);
    }
  }
  
  private calculateCategoryBreakdown(transactions: TransactionWithAccount[]) {
    const categoryMap = new Map<string, CategoryBreakdown>();
    
    // Filter out uncategorized transactions for the pie chart
    const categorizedTransactions = transactions.filter(t => t.category);
    
    // Group by category (only categorized transactions)
    categorizedTransactions.forEach(t => {
      const categoryId = t.category!; // We know it exists due to filter
      const existing = categoryMap.get(categoryId);
      
      // For expenses, handle refunds properly
      let amountToAdd: number;
      if (t.amount < 0) {
        // Normal expense - use absolute value
        amountToAdd = Math.abs(t.amount);
      } else {
        // Refund - subtract from total (negative value reduces the expense)
        amountToAdd = -t.amount;
      }
      
      if (existing) {
        existing.amount += amountToAdd;
        existing.count++;
      } else {
        const category = ROOT_CATEGORIES.find(c => c.id === categoryId);
        if (category) {
          categoryMap.set(categoryId, {
            categoryId,
            label: category.label,
            icon: category.icon || '📝',
            color: category.color || '#9CA3AF',
            amount: amountToAdd,
            count: 1,
            percentage: 0
          });
        }
      }
    });
    
    // Filter out categories with zero or negative amounts (where refunds exceed expenses)
    const validCategories = Array.from(categoryMap.values()).filter(cat => cat.amount > 0);
    
    // Calculate total amount for percentages (only positive amounts)
    const totalAmount = validCategories.reduce((sum, cat) => sum + cat.amount, 0);
    
    // Calculate percentages and sort
    const breakdown = validCategories
      .map(cat => ({
        ...cat,
        percentage: totalAmount > 0 ? (cat.amount / totalAmount) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount);
    
    this.categoryBreakdown.set(breakdown);
  }
  
  private drawChart() {
    console.log('drawChart called - canvas exists:', !!this.chartCanvas?.nativeElement, 'categories:', this.categoryBreakdown().length);
    if (!this.chartCanvas?.nativeElement || this.categoryBreakdown().length === 0) {
      console.log('Chart not drawn - returning early');
      return;
    }
    
    // Destroy existing chart
    if (this.chart) {
      this.chart.destroy();
    }
    
    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx) return;
    
    const data = this.categoryBreakdown();
    
    const config: ChartConfiguration = {
      type: 'pie' as ChartType,
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          data: data.map(d => d.amount),
          backgroundColor: data.map(d => d.color),
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              padding: 15,
              font: {
                size: 12
              },
              generateLabels: (chart) => {
                const original = Chart.defaults.plugins.legend.labels.generateLabels;
                const labels = original.call(this, chart);
                
                labels.forEach((label, index) => {
                  const category = data[index];
                  if (category && category.icon && category.label) {
                    label.text = `${category.icon} ${category.label}`;
                  }
                });
                
                return labels;
              }
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const category = data[context.dataIndex];
                const value = this.formatAmount(category.amount);
                const percentage = category.percentage.toFixed(1);
                return `${category.label}: ${value} (${percentage}%)`;
              }
            }
          }
        },
        onClick: (_event, elements) => {
          if (elements.length > 0) {
            const index = elements[0].index;
            const category = data[index];
            this.drillDownToCategory(category.categoryId);
          }
        }
      }
    };
    
    this.chart = new Chart(ctx, config);
    console.log('Chart created successfully');
  }
  
  drillDownToCategory(categoryId: string) {
    this.selectedCategory.set(categoryId);
    this.viewMode.set('transactions');
  }
  
  backToChart() {
    this.selectedCategory.set(null);
    this.viewMode.set('chart');
    // Redraw chart after switching back
    setTimeout(() => this.drawChart(), 100);
  }

  toggleSort(field: 'date' | 'amount') {
    if (this.sortBy() === field) {
      this.sortOrder.set(this.sortOrder() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(field);
      this.sortOrder.set('desc');
    }
  }

  formatAmount(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(Math.abs(amount));
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  exportCategoryBreakdown() {
    const breakdown = this.categoryBreakdown();
    
    if (breakdown.length === 0) {
      alert('No category data to export');
      return;
    }

    // CSV headers
    const headers = ['Category', 'Amount', 'Transaction Count', 'Percentage', 'Average Transaction'];
    
    // CSV rows
    const rows = breakdown.map(cat => [
      cat.label,
      cat.amount.toFixed(2),
      cat.count.toString(),
      `${cat.percentage.toFixed(2)}%`,
      (cat.amount / cat.count).toFixed(2)
    ]);

    // Add totals row
    const totalAmount = breakdown.reduce((sum, cat) => sum + cat.amount, 0);
    const totalCount = breakdown.reduce((sum, cat) => sum + cat.count, 0);
    rows.push([
      'TOTAL',
      totalAmount.toFixed(2),
      totalCount.toString(),
      '100.00%',
      (totalAmount / totalCount).toFixed(2)
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expense_categories_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  exportToCSV() {
    const transactions = this.sortedTransactions();
    
    if (transactions.length === 0) {
      alert('No transactions to export');
      return;
    }

    // CSV headers
    const headers = ['Date', 'Account', 'Description', 'Category', 'Amount', 'Type'];
    
    // CSV rows
    const rows = transactions.map(t => [
      this.formatDate(t.date),
      t.accountName || '',
      `"${t.narration.replace(/"/g, '""')}"`, // Escape quotes
      t.categoryLabel || '',
      Math.abs(t.amount).toFixed(2),
      t.amount > 0 ? 'Credit' : 'Debit'
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.currentTitle().replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  closeModal() {
    this.close.emit();
  }
  
  ngOnDestroy() {
    if (this.chart) {
      this.chart.destroy();
    }
  }
}