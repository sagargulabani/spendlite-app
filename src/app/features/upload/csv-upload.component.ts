import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CsvParserService, CsvParseError } from '../../core/services/csv-parser.service';
import { ParsedTransaction } from '../../core/models/transaction.model';

@Component({
  selector: 'app-csv-upload',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './csv-upload.component.html',
  styleUrls: ['./csv-upload.component.scss']
})
export class CsvUploadComponent {
  isDragging = false;
  isParsing = false;
  parseProgress = 0;
  error: string | null = null;

  // Results
  rows: ParsedTransaction[] = [];
  previewRows: ParsedTransaction[] = [];
  totalRows = 0;
  errorCount = 0;
  debitCount = 0;
  creditCount = 0;

  constructor(private csvParser: CsvParserService) {}

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFile(files[0]);
    }
  }

  onFileSelect(event: Event): void {
    console.log("file selected")
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
    }
  }

  private async handleFile(file: File): Promise<void> {
    // Reset state
    this.error = null;
    this.rows = [];
    this.previewRows = [];
    this.totalRows = 0;
    this.errorCount = 0;
    this.debitCount = 0;
    this.creditCount = 0;

    // Validate file type - support both .csv and .txt
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.csv') && !fileName.endsWith('.txt')) {
      this.error = 'Please upload a CSV or TXT file. Other formats are not supported.';
      return;
    }

    this.isParsing = true;
    this.parseProgress = 0;

    try {
      // Start progress animation
      this.animateProgress();

      console.log('Starting to parse file:', file.name, 'Size:', file.size);

      const result = await this.csvParser.parseFile(file);

      console.log('Parse complete. Rows:', result.rows.length, 'Errors:', result.errors);

      this.rows = result.rows;
      this.errorCount = result.errors;
      this.totalRows = this.rows.length;

      // Calculate stats
      this.debitCount = this.rows.filter(r => r.amount < 0).length;
      this.creditCount = this.rows.filter(r => r.amount > 0).length;

      // Get preview (first 10 rows)
      this.previewRows = this.rows.slice(0, 10);

      console.log('Stats - Total:', this.totalRows, 'Debits:', this.debitCount, 'Credits:', this.creditCount);

    } catch (error) {
      console.error('Parse error:', error);
      if (error instanceof CsvParseError) {
        this.error = error.message;
      } else {
        this.error = 'An unexpected error occurred while parsing the file.';
      }
    } finally {
      this.isParsing = false;
      this.parseProgress = 100;
    }
  }

  private animateProgress(): void {
    // Simple progress animation
    const interval = setInterval(() => {
      if (this.parseProgress < 90 && this.isParsing) {
        this.parseProgress += 10;
      } else {
        clearInterval(interval);
      }
    }, 100);
  }

  formatAmount(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(Math.abs(amount));
  }

  reset(): void {
    this.error = null;
    this.rows = [];
    this.previewRows = [];
    this.totalRows = 0;
    this.errorCount = 0;
    this.debitCount = 0;
    this.creditCount = 0;
    this.parseProgress = 0;
  }
}
