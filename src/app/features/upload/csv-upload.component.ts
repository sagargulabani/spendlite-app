import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CsvParserService, CsvParseError } from '../../core/services/csv-parser.service';
import { AccountService } from '../../core/services/account.service';
import { ImportService } from '../../core/services/import.service';
import { ParsedTransaction } from '../../core/models/transaction.model';
import { AccountPickerComponent } from '../account-picker-component/account-picker-component';

@Component({
  selector: 'app-csv-upload',
  standalone: true,
  imports: [CommonModule, AccountPickerComponent],
  templateUrl: './csv-upload.component.html',
  styleUrls: ['./csv-upload.component.scss']
})
export class CsvUploadComponent {
  // UI state signals
  isDragging = signal(false);
  isParsing = signal(false);
  parseProgress = signal(0);
  error = signal<string | null>(null);
  currentFile = signal<File | null>(null);
  importSuccess = signal(false);

  // Results signals
  rows = signal<ParsedTransaction[]>([]);
  totalRows = computed(() => this.rows().length);
  errorCount = signal(0);

  // Computed stats
  debitCount = computed(() => this.rows().filter(r => r.amount < 0).length);
  creditCount = computed(() => this.rows().filter(r => r.amount > 0).length);
  previewRows = computed(() => this.rows().slice(0, 10));

  constructor(
    private csvParser: CsvParserService,
    public accountService: AccountService,
    private importService: ImportService
  ) {}

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

    // Reset state using signals
    this.error.set(null);
    this.rows.set([]);
    this.errorCount.set(0);
    this.importSuccess.set(false);
    this.currentFile.set(file);

    // Validate file type - support both .csv and .txt
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.csv') && !fileName.endsWith('.txt')) {
      this.error.set('Please upload a CSV or TXT file. Other formats are not supported.');
      return;
    }

    this.isParsing.set(true);
    this.parseProgress.set(0);

    try {
      // Add a small delay to ensure UI shows the progress bar
      await new Promise(resolve => setTimeout(resolve, 100));

      // Start progress animation
      this.animateProgress();

      console.log('Starting to parse file:', file.name, 'Size:', file.size);
      console.log('Selected account:', this.accountService.selectedAccount());

      const result = await this.csvParser.parseFile(file);

      console.log('Parse complete. Rows:', result.rows.length, 'Errors:', result.errors);

      this.rows.set(result.rows);
      this.errorCount.set(result.errors);

      // Save import record to IndexedDB
      const accountId = this.accountService.selectedAccountId()!;
      const importId = await this.importService.createImportRecord(
        accountId,
        file.name,
        file.size,
        result.rows,
        result.errors
      );

      console.log('Import record saved with ID:', importId);
      console.log('Stats - Total:', this.totalRows(), 'Debits:', this.debitCount(), 'Credits:', this.creditCount());

      // Complete the progress bar
      this.parseProgress.set(100);
      this.importSuccess.set(true);

      // Small delay before hiding progress to show completion
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error('Parse error:', error);
      if (error instanceof CsvParseError) {
        this.error.set(error.message);
      } else {
        this.error.set('An unexpected error occurred while parsing the file.');
      }
    } finally {
      this.isParsing.set(false);
    }
  }

  private animateProgress(): void {
    let progress = 0;
    const interval = setInterval(() => {
      if (progress < 90 && this.isParsing()) {
        progress += Math.random() * 20 + 5; // Random increment between 5-25
        this.parseProgress.set(Math.min(progress, 90));
      } else {
        clearInterval(interval);
      }
    }, 200);
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
    this.parseProgress.set(0);
    this.currentFile.set(null);
    this.importSuccess.set(false);
  }
}
