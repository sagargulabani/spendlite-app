// core/parsers/hdfc-csv.parser.ts
import * as Papa from 'papaparse';
import { BankParser, UnifiedTransaction, ParseResult, BankStatementMetadata, ParseProgress } from './bank-parser.abstract';

export class HdfcCsvParser extends BankParser {
  bankId = 'HDFC';
  bankName = 'HDFC Bank';
  supportedFormats = ['.csv', '.txt'];

  async canParse(file: File): Promise<boolean> {
    const fileName = file.name.toLowerCase();

    // Check file extension
    if (!this.supportedFormats.some(ext => fileName.endsWith(ext))) {
      return false;
    }

    try {
      // Read a portion of the file to check headers
      return new Promise((resolve) => {
        const reader = new FileReader();

        reader.onload = (e) => {
          const text = e.target?.result as string;
          if (!text) {
            resolve(false);
            return;
          }

          // Parse just the first few lines
          Papa.parse(text, {
            preview: 5,
            skipEmptyLines: true,
            complete: (results) => {
              if (!results.data || results.data.length === 0) {
                resolve(false);
                return;
              }

              // Get the first row (headers)
              const firstRow = results.data[0] as string[];
              const isValid = this.validateHdfcHeaders(firstRow);
              console.log('HDFC validation result:', isValid, 'Headers:', firstRow);
              resolve(isValid);
            },
            error: (error: any) => {
              console.error('Error parsing file for validation:', error);
              resolve(false);
            }
          });
        };

        reader.onerror = () => resolve(false);

        // Read first 5KB of the file
        const blob = file.slice(0, 5000);
        reader.readAsText(blob);
      });
    } catch (error) {
      console.error('Error in canParse:', error);
      return false;
    }
  }

  async parse(file: File, onProgress?: (progress: ParseProgress) => void): Promise<ParseResult> {
    this.onProgress = onProgress;

    return new Promise((resolve, reject) => {
      const transactions: UnifiedTransaction[] = [];
      let errors = 0;
      let skippedRows = 0;
      let headerValidated = false;
      let totalRows = 0;
      let headers: string[] = [];
      const metadata: BankStatementMetadata = {
        extractedAt: new Date()
      };

      // Stage 1: Reading
      this.reportProgress('reading', 0, 0, 0, 'Reading CSV file...');

      Papa.parse(file, {
        skipEmptyLines: true,
        dynamicTyping: false, // Keep everything as strings initially
        step: (result: Papa.ParseStepResult<any>, parser) => {
          totalRows++;

          // First row should be headers
          if (totalRows === 1) {
            // Stage 2: Detecting
            this.reportProgress('detecting', totalRows, 0, 0, 'Validating HDFC format...');

            // Handle both array and object formats
            if (Array.isArray(result.data)) {
              headers = result.data as string[];
            } else {
              headers = Object.keys(result.data as Record<string, any>);
            }

            if (!this.validateHdfcHeaders(headers)) {
              parser.abort();
              reject(new Error('Invalid CSV format. Expected HDFC bank statement headers.'));
              return;
            }
            headerValidated = true;
            return; // Skip header row
          }

          // Stage 3: Parsing
          this.reportProgress(
            'parsing',
            totalRows,
            transactions.length,
            skippedRows,
            `Processing row ${totalRows}...`
          );

          // Parse the row data
          const rowData = Array.isArray(result.data) ? result.data : Object.values(result.data);
          const parsed = this.parseHdfcRowFromArray(rowData as string[], headers);

          if (parsed) {
            transactions.push(parsed);
          } else {
            skippedRows++;
          }
        },
        complete: () => {
          // Stage 4: Validation
          this.reportProgress(
            'validating',
            totalRows,
            transactions.length,
            skippedRows,
            'Validating transactions...'
          );

          if (transactions.length === 0) {
            reject(new Error('No valid transactions found in the CSV file.'));
          } else {
            // Stage 5: Complete
            this.reportProgress(
              'complete',
              totalRows,
              transactions.length,
              skippedRows,
              'Parsing complete!'
            );

            resolve({
              transactions,
              metadata,
              errors,
              skippedRows
            });
          }
        },
        error: (error) => {
          reject(new Error(`CSV parsing failed: ${error.message}`));
        }
      });
    });
  }

  private validateHdfcHeaders(headers: string[]): boolean {
    if (!headers || headers.length === 0) return false;

    // Clean and normalize headers for comparison
    const normalizedHeaders = headers.map(h => {
      if (!h) return '';
      return h.toString()
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')  // Normalize spaces
        .replace(/[^\w\s]/g, ''); // Remove special characters
    });

    console.log('Normalized headers for validation:', normalizedHeaders);

    // Look for HDFC-specific header patterns
    const requiredPatterns = [
      { pattern: /date/, found: false },
      { pattern: /narration/, found: false },
      { pattern: /(debit|withdrawal)/, found: false },
      { pattern: /(credit|deposit)/, found: false },
      { pattern: /balance/, found: false }
    ];

    // Check each header against patterns
    for (const header of normalizedHeaders) {
      for (const req of requiredPatterns) {
        if (req.pattern.test(header)) {
          req.found = true;
        }
      }
    }

    // Count how many required patterns were found
    const matchCount = requiredPatterns.filter(r => r.found).length;

    console.log('HDFC header validation - matched patterns:', matchCount, 'out of', requiredPatterns.length);

    // Need at least 4 out of 5 key headers for HDFC
    return matchCount >= 4;
  }

  private parseHdfcRowFromArray(row: string[], headers: string[]): UnifiedTransaction | null {
    if (!row || row.length === 0) return null;

    // Skip empty rows or rows with all empty values
    const hasContent = row.some(cell => cell && cell.toString().trim() !== '');
    if (!hasContent) return null;

    // Create a map of normalized header to value
    const dataMap: Record<string, string> = {};
    headers.forEach((header, index) => {
      const normalizedKey = header.toString()
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
      dataMap[normalizedKey] = row[index] || '';
    });

    // Extract fields based on normalized headers
    const date = dataMap['date'];
    const narration = dataMap['narration'];
    const valueDate = dataMap['value dat'] || dataMap['value date'] || dataMap['valuedate'];
    const debitAmount = dataMap['debit amount'] || dataMap['withdrawal amt'];
    const creditAmount = dataMap['credit amount'] || dataMap['deposit amt'];
    const balance = dataMap['closing balance'] || dataMap['balance'];
    const refNumber = dataMap['chq/ref number'] || dataMap['ref number'];

    // Validate required fields
    if (!date || !narration) return null;

    // Parse the date - HDFC uses DD/MM/YY format
    const parsedDate = this.parseHdfcDate(date.trim());
    if (!parsedDate) return null;

    // Parse amounts
    const debit = this.parseAmount(debitAmount);
    const credit = this.parseAmount(creditAmount);

    // Determine transaction type and amount
    let amount = 0;
    let transactionType: 'debit' | 'credit' | undefined;

    if (debit > 0) {
      amount = -debit;
      transactionType = 'debit';
    } else if (credit > 0) {
      amount = credit;
      transactionType = 'credit';
    } else {
      // Skip rows with no transaction amount
      return null;
    }

    // Parse value date if available
    const parsedValueDate = valueDate ? this.parseHdfcDate(valueDate.trim()) : undefined;

    return {
      date: parsedDate,
      description: this.cleanDescription(narration),
      amount,
      balance: this.parseAmount(balance) || undefined,
      valueDate: parsedValueDate || undefined,
      transactionType,
      referenceNo: refNumber?.trim(),
      source: 'HDFC-CSV',
      bankName: this.bankName,
      originalData: {
        date,
        narration,
        valueDate,
        debitAmount,
        creditAmount,
        closingBalance: balance,
        refNumber
      }
    };
  }

  // Special date parser for HDFC format (DD/MM/YY)
  private parseHdfcDate(dateStr: string): string | null {
    if (!dateStr) return null;

    const cleaned = dateStr.trim();

    // HDFC uses DD/MM/YY format
    const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      let year = parseInt(match[3], 10);

      // Convert 2-digit year to 4-digit
      // Assume 00-30 is 2000-2030, 31-99 is 1931-1999
      if (year <= 30) {
        year = 2000 + year;
      } else if (year < 100) {
        year = 1900 + year;
      }

      // Validate date components
      if (month < 1 || month > 12 || day < 1 || day > 31) {
        return null;
      }

      // Return ISO format
      return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }

    // If not in expected format, try the general parser as fallback
    return this.parseDate(dateStr);
  }

  private parseHdfcRow(row: Record<string, any>): UnifiedTransaction | null {
    // Normalize the headers
    const norm: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) {
      const cleanKey = k
        .replace(/\./g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      norm[cleanKey] = v;
    }

    // Extract fields
    const rawDate = norm['date'];
    const rawNarration = norm['narration'];
    const rawValueDate = norm['value date'] || norm['value dat'] || norm['valuedate'];
    const rawDebit = norm['withdrawal amt'] || norm['debit amount'];
    const rawCredit = norm['deposit amt'] || norm['credit amount'];
    const rawBalance = norm['closing balance'] || norm['balance'];

    if (!rawDate || !rawNarration) return null;

    const date = this.parseDate(rawDate);
    if (!date) return null;

    const debitAmount = this.parseAmount(rawDebit);
    const creditAmount = this.parseAmount(rawCredit);

    let amount = 0;
    let transactionType: 'debit' | 'credit' | undefined;

    if (debitAmount > 0) {
      amount = -debitAmount;
      transactionType = 'debit';
    } else if (creditAmount > 0) {
      amount = creditAmount;
      transactionType = 'credit';
    } else {
      return null;
    }

    const valueDate = rawValueDate ? this.parseDate(rawValueDate) : undefined;

    return {
      date,
      description: this.cleanDescription(rawNarration),
      amount,
      balance: this.parseAmount(rawBalance) || undefined,
      valueDate: valueDate || undefined,
      transactionType,
      source: 'HDFC-CSV',
      bankName: this.bankName,
      originalData: {
        date: rawDate,
        narration: rawNarration,
        valueDate: rawValueDate,
        withdrawalAmt: rawDebit,
        depositAmt: rawCredit,
        closingBalance: rawBalance
      }
    };
  }

  generateFingerprint(txn: UnifiedTransaction, accountId: number): string {
    // HDFC-specific fingerprint using original data
    const original = txn.originalData;
    const parts = [
      accountId,
      this.bankId,
      txn.date,
      txn.description.toLowerCase().replace(/\s+/g, ''),
      original['valueDate'] || '',
      original['debitAmount'] || 0,
      original['creditAmount'] || 0,
      original['closingBalance'] || 0
    ];

    return parts.join('_');
  }

  private reportProgress(
    stage: ParseProgress['stage'],
    rowsProcessed: number,
    transactionsFound: number,
    skippedRows: number,
    message: string
  ): void {
    if (this.onProgress) {
      this.onProgress({
        stage,
        rowsProcessed,
        transactionsFound,
        skippedRows,
        message
      });
    }
  }
}
