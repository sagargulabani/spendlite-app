// csv-upload.component.ts
import { Component, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AccountService } from '../../core/services/account.service';
import { ParserFactoryService } from '../../core/services/parser-factory.service';
import { ParseProgress, UnifiedTransaction } from '../../core/parsers/bank-parser.abstract';
import { AccountPickerComponent } from '../account-picker-component/account-picker-component';
import { ImportReviewComponent, ImportReviewData } from '../import-review/import-review.component';

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

  // Computed file accept string based on selected account's bank
  acceptedFileTypes = computed(() => {
    const selectedAccount = this.accountService.selectedAccount();
    if (!selectedAccount) {
      return '*'; // Accept all if no account selected
    }

    // Get accepted file types for the account's bank
    const bankId = this.mapBankNameToId(selectedAccount.bankName);
    return this.parserFactory.getAcceptedFileTypes(bankId);
  });

  // Get expected formats for display
  expectedFormats = computed(() => {
    const selectedAccount = this.accountService.selectedAccount();
    if (!selectedAccount) return '';

    const bankId = this.mapBankNameToId(selectedAccount.bankName);
    const parser = this.parserFactory.getParserForBank(bankId);
    return parser ? parser.supportedFormats.join(', ') : 'supported formats';
  });

  constructor(
    public accountService: AccountService,
    private parserFactory: ParserFactoryService,
    private router: Router
  ) {}

  ngOnInit() {
    // Nothing to load anymore since we removed bank selection
  }

  // Map the bank name from account to parser bank ID
  private mapBankNameToId(bankName: string): string {
    const mapping: Record<string, string> = {
      'HDFC': 'HDFC',
      'HDFC Bank': 'HDFC',
      'SBI': 'SBI',
      'State Bank of India': 'SBI',
      'ICICI': 'ICICI',
      'ICICI Bank': 'ICICI',
      'Axis': 'AXIS',
      'Axis Bank': 'AXIS',
      'Kotak': 'KOTAK',
      'Kotak Mahindra': 'KOTAK'
    };

    return mapping[bankName] || bankName.toUpperCase();
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
    const selectedAccount = this.accountService.selectedAccount();
    if (!selectedAccount) {
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
    this.parseProgress.set(null);

    this.isParsing.set(true);

    try {
      // Get the bank ID from the selected account
      const bankId = this.mapBankNameToId(selectedAccount.bankName);

      // Check if we have a parser for this bank
      const parser = this.parserFactory.getParserForBank(bankId);
      if (!parser) {
        throw new Error(
          `No parser available for ${selectedAccount.bankName}. ` +
          `Please contact support to add support for this bank.`
        );
      }

      console.log(`Using ${bankId} parser for account: ${selectedAccount.name}`);

      // Progress callback
      const onProgress = (progress: ParseProgress) => {
        this.parseProgress.set(progress);
      };

      // Parse with the specific bank parser
      const parseResult = await this.parserFactory.parseWithBank(file, bankId, onProgress);

      console.log('Parse complete:', {
        bank: bankId,
        account: selectedAccount.name,
        transactions: parseResult.transactions.length,
        errors: parseResult.errors,
        skipped: parseResult.skippedRows
      });

      this.rows.set(parseResult.transactions);
      this.errorCount.set(parseResult.errors);
      this.skippedRows.set(parseResult.skippedRows);

      // Prepare review data
      const reviewTransactions = parseResult.transactions.map(txn => ({
        ...txn,
        source: txn.source || `${bankId}-IMPORT`
      }));

      this.reviewData.set({
        transactions: reviewTransactions,
        accountId: selectedAccount.id!,
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

      // Provide more specific error messages
      let errorMessage = error.message || 'An unexpected error occurred while parsing the file.';

      // Check if it's a validation error
      if (errorMessage.includes('Invalid') || errorMessage.includes('not appear to be')) {
        errorMessage = `This file doesn't appear to be a valid ${selectedAccount.bankName} bank statement. ` +
                      `Please ensure you're uploading a ${selectedAccount.bankName} statement for this account.`;
      }

      this.error.set(errorMessage);
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

  reset(): void {
    this.error.set(null);
    this.rows.set([]);
    this.errorCount.set(0);
    this.skippedRows.set(0);
    this.parseProgress.set(null);
    this.currentFile.set(null);
    this.reviewData.set(null);
    this.currentStep.set('upload');
  }
}
