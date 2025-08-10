// core/parsers/bank-parser.abstract.ts
export interface BankStatementMetadata {
  accountNumber?: string;
  accountHolder?: string;
  statementPeriod?: string;
  bankBranch?: string;
  extractedAt?: Date;
}

export interface UnifiedTransaction {
  // Essential fields - every bank must provide
  date: string;         // ISO format YYYY-MM-DD
  description: string;  // Transaction narration/description
  narration?: string;   // Alternative field name for compatibility
  amount: number;       // Negative for debit, positive for credit
  balance?: number;     // Running balance if available

  // Additional common fields
  referenceNo?: string; // Cheque/Reference number
  valueDate?: string;   // Value date if different from transaction date
  transactionType?: 'debit' | 'credit';

  // Metadata
  source: string;       // 'HDFC-CSV', 'SBI-EXCEL'
  bankName: string;     // 'HDFC', 'SBI'

  // For deduplication - store all original fields
  originalData: Record<string, any>;
}

export interface ParseResult {
  transactions: UnifiedTransaction[];
  metadata: BankStatementMetadata;
  errors: number;
  skippedRows: number;
}

export interface ParseProgress {
  stage: 'detecting' | 'reading' | 'parsing' | 'validating' | 'complete';
  rowsProcessed: number;
  transactionsFound: number;
  skippedRows: number;
  message: string;
}

export abstract class BankParser {
  abstract bankId: string;
  abstract bankName: string;
  abstract supportedFormats: string[];

  // Progress callback for UI updates
  protected onProgress?: (progress: ParseProgress) => void;

  // Check if file can be parsed by this parser
  abstract canParse(file: File): Promise<boolean>;

  // Main parse method
  abstract parse(file: File, onProgress?: (progress: ParseProgress) => void): Promise<ParseResult>;

  // Generate unique fingerprint for deduplication
  abstract generateFingerprint(txn: UnifiedTransaction, accountId: number): string;

  // Common validation methods
  protected isValidDate(dateStr: string | number): boolean {
    if (!dateStr && dateStr !== 0) return false;

    // Check if it's an Excel serial number
    const numValue = typeof dateStr === 'number' ? dateStr : parseFloat(dateStr.toString());
    if (!isNaN(numValue) && numValue > 0 && numValue < 100000) {
      // Excel dates are typically between 1 (Jan 1, 1900) and ~100000 (year 2173)
      return true;
    }

    // Try common date string formats
    const patterns = [
      /^\d{2}\/\d{2}\/\d{4}$/,  // DD/MM/YYYY
      /^\d{2}-\d{2}-\d{4}$/,     // DD-MM-YYYY
      /^\d{4}-\d{2}-\d{2}$/,     // YYYY-MM-DD
      /^\d{2}\/\d{2}\/\d{2}$/,   // DD/MM/YY
      /^\d{1,2}[\s\-][A-Za-z]{3}[\s\-]\d{2,4}$/,  // DD-MMM-YY or DD MMM YYYY (SBI format)
    ];

    return patterns.some(pattern => pattern.test(dateStr.toString().trim()));
  }

  // Convert Excel serial date to JS Date
  protected excelSerialToDate(serial: number): Date {
    // Excel dates start from January 1, 1900 (serial = 1)
    // But there's a bug in Excel that treats 1900 as a leap year
    // Excel's epoch is December 30, 1899
    const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
    const msPerDay = 24 * 60 * 60 * 1000;

    // Excel incorrectly considers 1900 a leap year
    // For dates after Feb 28, 1900, we don't need to adjust
    // Just add the days directly
    const date = new Date(excelEpoch.getTime() + serial * msPerDay);

    // Set to noon to avoid timezone issues
    date.setHours(12, 0, 0, 0);

    return date;
  }

  // Convert various date formats to ISO
  protected parseDate(dateStr: string | number): string | null {
    if (!dateStr && dateStr !== 0) return null;

    // Check if it's an Excel serial number (number or string that converts to number)
    const numValue = typeof dateStr === 'number' ? dateStr : parseFloat(dateStr.toString());
    if (!isNaN(numValue) && numValue > 0 && numValue < 100000) {
      // Likely an Excel serial date
      const date = this.excelSerialToDate(numValue);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();

      // Validate the converted date
      if (year >= 1900 && year <= 2100) {
        return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      }
    }

    // Handle string date formats
    const cleaned = dateStr.toString().trim();

    // DD/MM/YYYY or DD/MM/YY
    let match = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      let year = parseInt(match[3], 10);

      // Handle 2-digit year
      if (year < 100) {
        year = year < 50 ? 2000 + year : 1900 + year;
      }

      // Validate
      if (month < 1 || month > 12 || day < 1 || day > 31) {
        return null;
      }

      return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }

    // DD-MMM-YY or DD-MMM-YYYY format (e.g., "01-Apr-24" or "21 Apr 2024")
    match = cleaned.match(/^(\d{1,2})[\s\-]([A-Za-z]{3})[\s\-](\d{2,4})$/);
    if (match) {
      const day = parseInt(match[1], 10);
      const monthStr = match[2];
      let year = parseInt(match[3], 10);

      // Handle 2-digit year
      if (year < 100) {
        year = year < 50 ? 2000 + year : 1900 + year;
      }

      // Convert month name to number
      const months: Record<string, number> = {
        'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
        'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
      };

      const month = months[monthStr.toLowerCase()];
      if (!month) return null;

      // Validate
      if (month < 1 || month > 12 || day < 1 || day > 31) {
        return null;
      }

      return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }

    // YYYY-MM-DD (already ISO)
    match = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return cleaned;
    }

    return null;
  }

  // Parse numeric value from string
  protected parseAmount(value: any): number {
    if (!value || value === '0.00') return 0;

    const str = value.toString()
      .trim()
      .replace(/,/g, '') // Remove thousand separators
      .replace(/\s/g, '') // Remove spaces
      .replace(/[₹$]/, ''); // Remove currency symbols

    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
  }

  // Check if row looks like a footer/summary
  protected isFooterRow(row: any[]): boolean {
    if (!row || row.length === 0) return false;

    const firstCell = row[0]?.toString().toLowerCase() || '';
    const footerIndicators = [
      'total', 'closing', 'opening', 'summary',
      'end of statement', 'page', 'disclaimer',
      'terms', 'conditions', 'thank you'
    ];

    return footerIndicators.some(indicator => firstCell.includes(indicator));
  }

  // Clean and normalize description
  protected cleanDescription(desc: string): string {
    return desc.toString()
      .trim()
      .replace(/\s+/g, ' ')  // Collapse multiple spaces
      .replace(/\n/g, ' ');  // Replace newlines with space
  }
}
