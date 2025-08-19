// features/import-detail/import-detail.component.ts
import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { db, ImportRecord, Transaction, Account } from '../../core/models/db';
import { ROOT_CATEGORIES, SubCategory } from '../../core/models/category.model';
import { CategorizationService } from '../../core/services/categorization.service';
import { TransferMatchingService } from '../../core/services/transfer-matching';

interface TransactionWithCategory extends Transaction {
  rootCategoryLabel?: string;
  rootCategoryIcon?: string;
  rootCategoryColor?: string;
}

interface CategorizedTransaction {
  transaction: TransactionWithCategory;
  oldCategory?: string;
  newCategory: string;
  merchantKey: string;
}

@Component({
  selector: 'app-import-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './import-detail.component.html',
  styleUrls: ['./import-detail.component.scss']
})
export class ImportDetailComponent implements OnInit {
  // Data
  import = signal<ImportRecord | null>(null);
  account = signal<Account | null>(null);
  transactions = signal<TransactionWithCategory[]>([]);
  rootCategories = ROOT_CATEGORIES;
  subCategories = signal<SubCategory[]>([]);
  allAccounts = signal<Account[]>([]);

  // UI State
  isLoading = signal(true);
  isCategorizing = signal(false);
  isClearing = signal(false);
  showCategorizationModal = signal(false);
  showClearWarningModal = signal(false);
  showReviewModal = signal(false);

  // Categorization Review Data
  categorizedTransactions = signal<CategorizedTransaction[]>([]);
  categorizationSummary = computed(() => {
    const grouped: Record<string, CategorizedTransaction[]> = {};
    for (const item of this.categorizedTransactions()) {
      if (!grouped[item.newCategory]) {
        grouped[item.newCategory] = [];
      }
      grouped[item.newCategory].push(item);
    }
    return grouped;
  });

  // Filters
  searchQuery = signal('');
  filterCategory = signal<string>('all');

  // Stats
  totalAmount = computed(() => {
    return this.transactions().reduce((sum, t) => sum + t.amount, 0);
  });

  creditAmount = computed(() => {
    return this.transactions()
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
  });

  debitAmount = computed(() => {
    return this.transactions()
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  });

  categorizedCount = computed(() => {
    return this.transactions().filter(t => t.category).length;
  });

  uncategorizedCount = computed(() => {
    return this.transactions().filter(t => !t.category).length;
  });

  categorizedPercent = computed(() => {
    const total = this.transactions().length;
    if (total === 0) return 0;
    return Math.round((this.categorizedCount() / total) * 100);
  });

  categoryBreakdown = computed(() => {
    const breakdown: Record<string, { count: number; amount: number; label: string; icon: string; color: string }> = {};

    for (const txn of this.transactions()) {
      if (txn.category) {
        if (!breakdown[txn.category]) {
          const root = this.rootCategories.find(r => r.id === txn.category);
          breakdown[txn.category] = {
            count: 0,
            amount: 0,
            label: root?.label || txn.category,
            icon: root?.icon || '📁',
            color: root?.color || '#666'
          };
        }
        breakdown[txn.category].count++;
        breakdown[txn.category].amount += txn.amount;
      }
    }

    return Object.values(breakdown).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  });

  // Filtered transactions
  filteredTransactions = computed(() => {
    let filtered = this.transactions();

    // Search filter
    const query = this.searchQuery().toLowerCase();
    if (query) {
      filtered = filtered.filter(t =>
        t.narration.toLowerCase().includes(query) ||
        t.amount.toString().includes(query)
      );
    }

    // Category filter
    const category = this.filterCategory();
    if (category === 'uncategorized') {
      filtered = filtered.filter(t => !t.category);
    } else if (category !== 'all') {
      filtered = filtered.filter(t => t.category === category);
    }

    return filtered;
  });

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private categorizationService: CategorizationService,
    private transferMatchingService: TransferMatchingService
  ) {}

  async ngOnInit() {
    const importId = Number(this.route.snapshot.paramMap.get('id'));
    if (!importId) {
      this.router.navigate(['/imports']);
      return;
    }

    await this.loadImportDetails(importId);
    await this.loadSubCategories();
    await this.loadAccounts();
  }

  async loadImportDetails(importId: number) {
    this.isLoading.set(true);

    try {
      // Load import record
      const importRecord = await db.imports.get(importId);
      if (!importRecord) {
        this.router.navigate(['/imports']);
        return;
      }
      this.import.set(importRecord);

      // Load account
      const account = await db.accounts.get(importRecord.accountId);
      this.account.set(account || null);

      // Load transactions
      const transactions = await db.transactions
        .where('importId')
        .equals(importId)
        .toArray();

      // Enrich with category info
      const enriched: TransactionWithCategory[] = transactions.map(txn => {
        // IMPORTANT: Always include the category from DB
        const enrichedTxn: TransactionWithCategory = {
          ...txn,
          category: txn.category || undefined  // Ensure category is included
        };

        // If there's a category, add the display info
        if (txn.category) {
          const root = this.rootCategories.find(r => r.id === txn.category);
          if (root) {
            enrichedTxn.rootCategoryLabel = root.label;
            enrichedTxn.rootCategoryIcon = root.icon;
            enrichedTxn.rootCategoryColor = root.color;
          }
        }

        return enrichedTxn;
      });

      // Sort by date descending
      enriched.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA;
      });

      this.transactions.set(enriched);
    } catch (error) {
      console.error('Error loading import details:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadSubCategories() {
    try {
      const subs = await db.subCategories.toArray();
      this.subCategories.set(subs);
    } catch (error) {
      console.error('Error loading subcategories:', error);
    }
  }

  async loadAccounts() {
    try {
      const accounts = await db.accounts.toArray();
      // Filter out the current account from the list (can't transfer to same account)
      const filteredAccounts = accounts.filter(a => a.id !== this.account()?.id);
      this.allAccounts.set(filteredAccounts);
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  }

  // Auto-categorization with review
  async autoCategorize() {
    this.isCategorizing.set(true);

    try {
      // Get uncategorized transactions before categorization
      const uncategorizedBefore = this.transactions().filter(t => !t.category);

      // Store original state
      const transactionStates = new Map<number, string | undefined>();
      uncategorizedBefore.forEach(t => {
        transactionStates.set(t.id!, t.category);
      });

      // Perform auto-categorization for each uncategorized transaction
      let categorizedCount = 0;
      for (const txn of uncategorizedBefore) {
        const category = await this.categorizationService.detectCategory(txn);
        if (category) {
          await db.transactions.update(txn.id!, { category });
          categorizedCount++;
        }
      }

      // Reload transactions to get new categories
      await this.loadImportDetails(this.import()!.id!);

      // Find which transactions were categorized
      const categorizedList: CategorizedTransaction[] = [];

      for (const txn of this.transactions()) {
        // Check if this transaction was previously uncategorized and now has a category
        if (transactionStates.has(txn.id!) && !transactionStates.get(txn.id!) && txn.category) {
          // FIXED: Added bankName parameter
          const merchantKey = this.categorizationService.extractMerchantKey(txn.narration, txn.bankName);
          const root = this.rootCategories.find(r => r.id === txn.category);

          categorizedList.push({
            transaction: {
              ...txn,
              rootCategoryLabel: root?.label,
              rootCategoryIcon: root?.icon,
              rootCategoryColor: root?.color
            },
            oldCategory: undefined,
            newCategory: txn.category,
            merchantKey
          });
        }
      }

      if (categorizedList.length > 0) {
        // Show review modal
        this.categorizedTransactions.set(categorizedList);
        this.showReviewModal.set(true);
      } else {
        alert('No transactions could be auto-categorized. Please categorize manually.');
      }
    } catch (error) {
      console.error('Error during auto-categorization:', error);
      alert('An error occurred during categorization.');
    } finally {
      this.isCategorizing.set(false);
    }
  }

  // Update category in review modal
  async updateReviewCategory(item: CategorizedTransaction, newCategory: string) {
    item.newCategory = newCategory;

    // Update the transaction in the database
    await db.transactions.update(item.transaction.id!, { category: newCategory });

    // Update the rule
    await this.categorizationService.createRule(item.merchantKey, newCategory, 'user');

    // Update the transaction in the list
    const root = this.rootCategories.find(r => r.id === newCategory);
    if (root) {
      item.transaction.category = newCategory;
      item.transaction.rootCategoryLabel = root.label;
      item.transaction.rootCategoryIcon = root.icon;
      item.transaction.rootCategoryColor = root.color;
    }

    // Force update of signal
    this.categorizedTransactions.set([...this.categorizedTransactions()]);
  }

  // Apply all categorizations from review
  async applyCategorizationReview() {
    this.showReviewModal.set(false);

    // Reload to show updated data
    await this.loadImportDetails(this.import()!.id!);

    const count = this.categorizedTransactions().length;
    this.categorizedTransactions.set([]);

    alert(`Successfully applied categorization to ${count} transactions!`);
  }

  // Cancel categorization review and revert
  async cancelCategorizationReview() {
    // Revert all categorizations
    for (const item of this.categorizedTransactions()) {
      await db.transactions.update(item.transaction.id!, { category: undefined });
    }

    this.showReviewModal.set(false);
    this.categorizedTransactions.set([]);

    // Reload transactions
    await this.loadImportDetails(this.import()!.id!);

    alert('Auto-categorization cancelled. All changes reverted.');
  }

  async updateTransactionCategory(txnId: number, category: string | undefined) {
    // Update in database
    await db.transactions.update(txnId, { category });

    // Update local state
    const transactions = this.transactions();
    const index = transactions.findIndex(t => t.id === txnId);
    if (index !== -1) {
      if (category) {
        const root = this.rootCategories.find(r => r.id === category);
        transactions[index] = {
          ...transactions[index],
          category,
          rootCategoryLabel: root?.label,
          rootCategoryIcon: root?.icon,
          rootCategoryColor: root?.color
        };
      } else {
        // Clear category
        transactions[index] = {
          ...transactions[index],
          category: undefined,
          rootCategoryLabel: undefined,
          rootCategoryIcon: undefined,
          rootCategoryColor: undefined
        };
      }
      this.transactions.set([...transactions]);
    }
  }

  async quickCategorize(txn: Transaction, category: string | null, linkedAccountId?: number) {
    // Handle null/empty category (uncategorizing)
    if (!category || category === '' || category === 'null') {
      await this.updateTransactionCategory(txn.id!, undefined);
      // If it was a transfer, unlink it
      if (txn.isInternalTransfer) {
        await this.transferMatchingService.unlinkTransfer(txn.id!);
      }
      return;
    }

    // Handle transfers category
    if (category === 'transfers' && linkedAccountId) {
      // Link as internal transfer
      await this.transferMatchingService.linkTransfer({
        sourceTransactionId: txn.id!,
        linkedAccountId: linkedAccountId
      });
      
      // Try to find and link matching transaction
      const matches = await this.transferMatchingService.findPotentialMatches(txn, linkedAccountId, 3);
      if (matches.length > 0 && (matches[0].confidence === 'exact' || matches[0].confidence === 'high')) {
        await this.transferMatchingService.linkTransfer({
          sourceTransactionId: txn.id!,
          linkedAccountId: linkedAccountId,
          linkedTransactionId: matches[0].transaction.id
        });
      }
    } else {
      // Update transaction with new category
      await this.updateTransactionCategory(txn.id!, category);

      // Save as rule for future using the service
      // FIXED: Added bankName parameter
      const merchantKey = this.categorizationService.extractMerchantKey(txn.narration, txn.bankName);
      await this.categorizationService.createRule(merchantKey, category, 'user');
    }
    
    // Reload to show updated state
    await this.loadImportDetails(this.import()!.id!);
  }

  // Clear all categories with warning
  openClearWarningModal() {
    if (this.categorizedCount() === 0) {
      alert('No categories to clear.');
      return;
    }
    this.showClearWarningModal.set(true);
  }

  closeClearWarningModal() {
    this.showClearWarningModal.set(false);
  }

  async confirmClearCategories() {
    this.isClearing.set(true);
    this.closeClearWarningModal();

    try {
      // Get all transactions for this import
      const transactions = await db.transactions
        .where('importId')
        .equals(this.import()!.id!)
        .toArray();

      // Clear categories for all transactions
      for (const txn of transactions) {
        if (txn.category) {
          await db.transactions.update(txn.id!, { category: undefined });
        }
      }

      // Reload transactions
      await this.loadImportDetails(this.import()!.id!);

      alert(`Cleared categories from ${transactions.filter(t => t.category).length} transactions.`);
    } catch (error) {
      console.error('Error clearing categories:', error);
      alert('An error occurred while clearing categories.');
    } finally {
      this.isClearing.set(false);
    }
  }

  openCategorizationModal() {
    this.showCategorizationModal.set(true);
  }

  closeCategorizationModal() {
    this.showCategorizationModal.set(false);
  }

  closeReviewModal() {
    this.showReviewModal.set(false);
  }

  async exportTransactions() {
    try {
      const transactions = this.filteredTransactions();

      // Create CSV content
      const headers = ['Date', 'Description', 'Reference', 'Amount', 'Category'];
      const rows = transactions.map(txn => [
        this.formatDate(txn.date),
        txn.narration,
        txn.referenceNo || '',
        txn.amount.toString(),
        txn.rootCategoryLabel || 'Uncategorized'
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      // Download the file
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${this.import()?.displayName || 'transactions'}_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting transactions:', error);
      alert('An error occurred while exporting transactions.');
    }
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  formatAmount(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Math.abs(amount));
  }

  getAccountName(accountId: number): string {
    const account = this.allAccounts().find(a => a.id === accountId);
    return account?.name || 'Unknown Account';
  }

  // Helper methods for template
  categorizationSummaryKeys(): string[] {
    return Object.keys(this.categorizationSummary());
  }

  getCategoryLabel(categoryId: string): string {
    const category = this.rootCategories.find(r => r.id === categoryId);
    return category?.label || categoryId;
  }

  getCategoryIcon(categoryId: string): string {
    const category = this.rootCategories.find(r => r.id === categoryId);
    return category?.icon || '📁';
  }

  getCategoryColor(categoryId: string): string {
    const category = this.rootCategories.find(r => r.id === categoryId);
    return category?.color || '#666';
  }

  navigateBack() {
    this.router.navigate(['/imports']);
  }
}
