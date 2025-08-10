import { Component, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AccountService } from '../../core/services/account.service';
import { ParserFactoryService } from '../../core/services/parser-factory.service';
import { ParseProgress, UnifiedTransaction } from '../../core/parsers/bank-parser.abstract';
import { AccountPickerComponent } from '../account-picker-component/account-picker-component';
import { ImportReviewComponent, ImportReviewData } from '../import-review/import-review.component';

interface BankInfo {
  id: string;
  name: string;
  supportedFormats: string[];
}

@Component({
  selector: 'app-csv-upload',
  standalone: true,
  imports: [CommonModule, FormsModule, AccountPickerComponent, ImportReviewComponent],
  templateUrl: './csv-upload.component.html',
  styleUrls: ['./csv-upload.component.scss']
})
export class CsvUploadComponent implements OnInit {
  // UI state signals
  isDragging = signal(false);
  isParsing = signal(false);
  parseProgress = signal<ParseProgress | null>(null);
  error = signal<string | null>(null);
  currentFile = signal<File | null>(null);

  // Bank selection
  selectedBank = signal<string>('AUTO');
  supportedBanks = signal<BankInfo[]>([]);
  detectedBank = signal<string | null>(null);

  // Workflow states
  currentStep = signal<'upload' | 'review'>('upload');

  // Results signals
  rows = signal<UnifiedTransaction[]>([]);
  totalRows = computed(() => this.rows().length);
  errorCount = signal(0);
  skippedRows = signal(0);

  // Review data
  reviewData = signal<ImportReviewData | null>(null);

  // Computed stats
  debitCount = computed(() => this.rows().filter(r => r.amount < 0).length);
  creditCount = computed(() => this.rows().filter(r => r.amount > 0).length);
  previewRows = computed(() => this.rows().slice(0, 10));

  // Computed file accept string
  acceptedFileTypes = computed(() => {
    const bank = this.selectedBank();
    if (bank === 'AUTO') {
      return this.parserFactory.getAcceptedFileTypes();
    }
    return this.parserFactory.getAcceptedFileTypes(bank);
  });

  constructor(
    public accountService: AccountService,
    private parserFactory: ParserFactoryService,
    private router: Router
  ) {}

  ngOnInit() {
    // Load supported banks
    this.supportedBanks.set(this.parserFactory.getSupportedBanks());
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFile(files[0]);
    }
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
    }
  }

  private async handleFile(file: File): Promise<void> {
    // Check if account is selected
    if (!this.accountService.selectedAccountId()) {
      this.error.set('Please select an account before uploading a file.');
      return;
    }

    // Reset state
    this.error.set(null);
    this.rows.set([]);
    this.errorCount.set(0);
    this.skippedRows.set(0);
    this.currentFile.set(file);
    this.reviewData.set(null);
    this.currentStep.set('upload');
    this.detectedBank.set(null);
    this.parseProgress.set(null);

    this.isParsing.set(true);

    try {
      let parseResult;
      let bankId: string;

      // Progress callback
      const onProgress = (progress: ParseProgress) => {
        this.parseProgress.set(progress);
      };

      if (this.selectedBank() === 'AUTO') {
        // Auto-detect bank and parse
        const result = await this.parserFactory.parseWithAutoDetect(file, onProgress);
        parseResult = result.result;
        bankId = result.bankId;
        this.detectedBank.set(bankId);
      } else {
        // Parse with selected bank
        bankId = this.selectedBank();
        parseResult = await this.parserFactory.parseWithBank(file, bankId, onProgress);
      }

      console.log('Parse complete:', {
        bank: bankId,
        transactions: parseResult.transactions.length,
        errors: parseResult.errors,
        skipped: parseResult.skippedRows
      });

      this.rows.set(parseResult.transactions);
      this.errorCount.set(parseResult.errors);
      this.skippedRows.set(parseResult.skippedRows);

      // Prepare review data
      const selectedAccount = this.accountService.selectedAccount();
      if (!selectedAccount) {
        throw new Error('No account selected');
      }

      // Convert UnifiedTransaction to the format expected by ImportReviewData
      const reviewTransactions = parseResult.transactions.map(txn => ({
        ...txn,
        source: txn.source || `${bankId}-IMPORT`
      }));

      this.reviewData.set({
        transactions: reviewTransactions,
        accountId: this.accountService.selectedAccountId()!,
        accountName: selectedAccount.name,
        fileName: file.name,
        fileSize: file.size,
        errorCount: parseResult.errors,
        bankName: bankId
      } as any);

      // Move to review step
      this.currentStep.set('review');

    } catch (error: any) {
      console.error('Parse error:', error);
      this.error.set(error.message || 'An unexpected error occurred while parsing the file.');
      this.currentStep.set('upload');
    } finally {
      this.isParsing.set(false);
    }
  }

  onImportConfirmed(): void {
    // Navigate to imports page after successful import
    this.router.navigate(['/imports']);
  }

  onImportCancelled(): void {
    // Go back to upload step
    this.reset();
  }

  formatAmount(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(Math.abs(amount));
  }

  getBankDisplayName(bankId: string): string {
    if (bankId === 'AUTO') return 'Auto-Detect';
    const bank = this.supportedBanks().find(b => b.id === bankId);
    return bank?.name || bankId;
  }

  getBankFormats(bankId: string): string {
    const bank = this.supportedBanks().find(b => b.id === bankId);
    return bank?.supportedFormats.join(', ') || '';
  }

  reset(): void {
    this.error.set(null);
    this.rows.set([]);
    this.errorCount.set(0);
    this.skippedRows.set(0);
    this.parseProgress.set(null);
    this.currentFile.set(null);
    this.reviewData.set(null);
    this.currentStep.set('upload');
    this.detectedBank.set(null);
  }
}
