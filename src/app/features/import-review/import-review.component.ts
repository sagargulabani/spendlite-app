// import-review.component.ts
import { Component, Input, Output, EventEmitter, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExtendedParsedTransaction } from '../../core/services/csv-parser.service';
import { TransactionService } from '../../core/services/transaction.service';
import { ImportService } from '../../core/services/import.service';
import { DuplicateCheckResult } from '../../core/models/db';

export interface ImportReviewData {
  transactions: any[]; // Can be ExtendedParsedTransaction or UnifiedTransaction
  accountId: number;
  accountName: string;
  fileName: string;
  fileSize: number;
  errorCount: number;
  bankName?: string; // Added bank name
}

@Component({
  selector: 'app-import-review',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './import-review.component.html',
  styleUrls: ['./import-review.component.scss']
})
export class ImportReviewComponent implements OnInit {
  @Input() reviewData!: ImportReviewData;
  @Output() onConfirm = new EventEmitter<void>();
  @Output() onCancel = new EventEmitter<void>();

  // Import naming
  importName = signal('');
  importNotes = signal('');

  // Duplicate detection
  isCheckingDuplicates = signal(false);
  duplicateResults = signal<DuplicateCheckResult[]>([]);

  // Computed values
  newTransactions = computed(() =>
    this.duplicateResults().filter(r => !r.isExactDuplicate).length
  );

  exactDuplicates = computed(() =>
    this.duplicateResults().filter(r => r.isExactDuplicate).length
  );

  possibleDuplicates = computed(() =>
    this.duplicateResults().filter(r => !r.isExactDuplicate && r.confidence === 'medium').length
  );

  // Date range
  dateRange = computed(() => {
    if (this.reviewData?.transactions.length === 0) return '';

    const dates = this.reviewData.transactions.map(t => new Date(t.date));
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

    return `${this.formatDate(minDate)} to ${this.formatDate(maxDate)}`;
  });

  // Stats
  totalAmount = computed(() =>
    this.reviewData?.transactions.reduce((sum, t) => sum + t.amount, 0) || 0
  );

  creditCount = computed(() =>
    this.reviewData?.transactions.filter(t => t.amount > 0).length || 0
  );

  debitCount = computed(() =>
    this.reviewData?.transactions.filter(t => t.amount < 0).length || 0
  );

  // UI state
  isConfirming = signal(false);
  currentTab = signal<'summary' | 'duplicates' | 'preview'>('summary');

  // Duplicate decisions (for possible duplicates)
  duplicateDecisions = new Map<number, boolean>(); // index -> import as new

  constructor(
    private transactionService: TransactionService,
    private importService: ImportService
  ) {}

  async ngOnInit() {
    // Check for duplicates
    await this.checkDuplicates();

    // Set default import name
    if (!this.importName()) {
      this.importName.set(this.getDefaultImportName());
    }
  }

  private async checkDuplicates() {
    this.isCheckingDuplicates.set(true);

    try {
      // Ensure all transactions have the narration field for compatibility
      const normalizedTransactions = this.reviewData.transactions.map(txn => ({
        ...txn,
        narration: txn.narration || txn.description
      }));

      const results = await this.transactionService.checkForDuplicates(
        normalizedTransactions,
        this.reviewData.accountId
      );

      this.duplicateResults.set(results);

      // Initialize decisions for possible duplicates (default to skip)
      results.forEach((result, index) => {
        if (!result.isExactDuplicate && result.confidence === 'medium') {
          this.duplicateDecisions.set(index, false);
        }
      });

      // Auto-switch to duplicates tab if duplicates found
      if (this.exactDuplicates() > 0 || this.possibleDuplicates() > 0) {
        this.currentTab.set('duplicates');
      }
    } catch (error) {
      console.error('Error checking duplicates:', error);
    } finally {
      this.isCheckingDuplicates.set(false);
    }
  }

  private getDefaultImportName(): string {
    const date = new Date();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[date.getMonth()]} ${date.getFullYear()} Import`;
  }

  async confirmImport() {
    this.isConfirming.set(true);

    try {
      // Filter transactions based on duplicate detection
      const transactionsToSave = this.reviewData.transactions.filter((txn, index) => {
        const result = this.duplicateResults()[index];

        // Skip exact duplicates
        if (result?.isExactDuplicate) return false;

        // For possible duplicates, check user decision
        if (result?.confidence === 'medium') {
          return this.duplicateDecisions.get(index) ?? false;
        }

        // Include all new transactions
        return true;
      });

      // Create import record with display name and bank info
      const importId = await this.importService.createImportRecord(
        this.reviewData.accountId,
        this.importName() || this.reviewData.fileName,
        this.reviewData.fileName,
        this.reviewData.fileSize,
        transactionsToSave,
        this.reviewData.errorCount,
        this.exactDuplicates(),
        this.reviewData.bankName
      );

      // Save transactions
      await this.transactionService.saveTransactions(
        transactionsToSave,
        this.reviewData.accountId,
        importId,
        false // Don't check duplicates again, we already filtered
      );

      this.onConfirm.emit();
    } catch (error) {
      console.error('Error confirming import:', error);
      // TODO: Show error message
    } finally {
      this.isConfirming.set(false);
    }
  }

  toggleDuplicateDecision(index: number) {
    const current = this.duplicateDecisions.get(index) ?? false;
    this.duplicateDecisions.set(index, !current);
  }

  formatAmount(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(Math.abs(amount));
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}
