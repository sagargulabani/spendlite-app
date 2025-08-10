// core/parsers/sbi-excel.parser.ts
import * as XLSX from 'xlsx';
import { BankParser, UnifiedTransaction, ParseResult, BankStatementMetadata, ParseProgress } from './bank-parser.abstract';

export class SbiExcelParser extends BankParser {
  bankId = 'SBI';
  bankName = 'State Bank of India';
  supportedFormats = ['.xls', '.xlsx'];

  // SBI Excel column indices (0-based)
  // Based on actual SBI format: Txn Date | Value Date | Description | Ref No./Cheque No. | Debit | Credit | Balance
  private readonly COLUMNS = {
    TXN_DATE: 0,      // Transaction Date
    VALUE_DATE: 1,    // Value Date
    DESCRIPTION: 2,   // Description
    REF_NO: 3,        // Ref No./Cheque No.
    DEBIT: 4,         // Debit
    CREDIT: 5,        // Credit
    BALANCE: 6        // Balance
  };

  async canParse(file: File): Promise<boolean> {
    const fileName = file.name.toLowerCase();

    // Check file extension
    if (!this.supportedFormats.some(ext => fileName.endsWith(ext))) {
      return false;
    }

    try {
      // Read file and check for SBI-specific headers
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });

      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        return false;
      }

      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

      // Look for SBI-specific patterns in first 30 rows (SBI has many header rows)
      for (let i = 0; i < Math.min(rows.length, 30); i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        // Check if this row has the SBI headers
        // Based on your file: "Txn Date", "Value Date", "Description", "Ref No./Cheque No.", "Debit", "Credit", "Balance"
        const hasExpectedColumns = row.length >= 6;
        if (!hasExpectedColumns) continue;

        // Convert to string for checking
        const cellValues = row.map(cell => (cell || '').toString().toLowerCase());

        // Check for SBI-specific column headers
        const hasTxnDate = cellValues.some(v => v.includes('txn') || v.includes('transaction'));
        const hasValueDate = cellValues.some(v => v.includes('value') && v.includes('date'));
        const hasDescription = cellValues.some(v => v.includes('description'));
        const hasRef = cellValues.some(v => v.includes('ref') || v.includes('cheque'));
        const hasDebit = cellValues.some(v => v.includes('debit') || v.includes('dr'));
        const hasCredit = cellValues.some(v => v.includes('credit') || v.includes('cr'));

        if ((hasTxnDate || hasValueDate) && hasDescription && (hasDebit || hasCredit)) {
          console.log('SBI format detected at row', i, ':', row);
          return true;
        }
      }

      console.log('No SBI patterns found in file');
      return false;
    } catch (error) {
      console.error('Error checking SBI file:', error);
      return false;
    }
  }

  async parse(file: File, onProgress?: (progress: ParseProgress) => void): Promise<ParseResult> {
    this.onProgress = onProgress;

    // Stage 1: Reading file
    this.reportProgress('reading', 0, 0, 0, 'Reading Excel file...');

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    // Stage 2: Detecting format
    this.reportProgress('detecting', 0, 0, 0, 'Detecting SBI format...');

    const headerRowIndex = this.findHeaderRow(rows);
    if (headerRowIndex === -1) {
      throw new Error('Could not find SBI statement headers. Please ensure this is a valid SBI statement.');
    }

    // Extract metadata from header rows
    const metadata = this.extractMetadata(rows.slice(0, headerRowIndex));

    // Stage 3: Parsing transactions
    this.reportProgress('parsing', 0, 0, 0, 'Parsing transactions...');

    const transactions: UnifiedTransaction[] = [];
    let errors = 0;
    let skippedRows = headerRowIndex + 1; // Count header rows as skipped

    // Log first few rows after header for debugging
    console.log('First 3 rows after header:');
    for (let i = headerRowIndex + 1; i < Math.min(headerRowIndex + 4, rows.length); i++) {
      console.log(`Row ${i}:`, rows[i]);
    }

    // Start from row after headers
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];

      // Update progress
      this.reportProgress(
        'parsing',
        i,
        transactions.length,
        skippedRows,
        `Processing row ${i + 1} of ${rows.length}...`
      );

      // Skip empty rows
      if (!row || row.length === 0 || row.every(cell => !cell)) {
        skippedRows++;
        continue;
      }

      // Stop if we hit footer
      if (this.isFooterRow(row)) {
        skippedRows++;
        break;
      }

      // Validate and parse transaction
      if (!this.isValidTransactionRow(row)) {
        skippedRows++;
        continue;
      }

      try {
        const transaction = this.parseTransactionRow(row);
        if (transaction) {
          transactions.push(transaction);
        } else {
          errors++;
        }
      } catch {
        errors++;
      }
    }

    // Stage 4: Validation
    this.reportProgress('validating', rows.length, transactions.length, skippedRows, 'Validating data...');

    if (transactions.length === 0) {
      throw new Error('No valid transactions found in the file.');
    }

    // Stage 5: Complete
    this.reportProgress('complete', rows.length, transactions.length, skippedRows, 'Parsing complete!');

    return {
      transactions,
      metadata,
      errors,
      skippedRows
    };
  }

  private findHeaderRow(rows: any[][]): number {
    // Look for row containing SBI-specific headers
    // SBI files often have many metadata rows before the actual headers
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const row = rows[i];
      if (!row || row.length < 6) continue;

      // Check each cell in the row for header patterns
      const cellValues = row.map(cell => (cell || '').toString().toLowerCase());

      // Based on actual SBI format: "Txn Date", "Value Date", "Description", "Ref No./Cheque No.", "Debit", "Credit", "Balance"
      let headerMatches = 0;

      for (const cell of cellValues) {
        if (cell.includes('txn') || cell.includes('transaction')) headerMatches++;
        if (cell.includes('value') && cell.includes('date')) headerMatches++;
        if (cell.includes('description')) headerMatches++;
        if (cell.includes('ref') || cell.includes('cheque')) headerMatches++;
        if (cell.includes('debit')) headerMatches++;
        if (cell.includes('credit')) headerMatches++;
        if (cell.includes('balance')) headerMatches++;
      }

      // If we found at least 4 of the expected headers, this is likely the header row
      if (headerMatches >= 4) {
        console.log('Found SBI header row at index', i, ':', row);
        return i;
      }
    }

    console.warn('Could not find SBI header row in first 30 rows');
    return -1;
  }

  private validateSbiHeaders(headers: any[]): boolean {
    if (!headers || headers.length < 5) return false;

    const headerStr = headers.map(h => (h || '').toString().toLowerCase()).join(' ');

    // Must have these key fields for SBI
    // More flexible matching
    const hasDate = headerStr.includes('date');
    const hasDescription = headerStr.includes('description') || headerStr.includes('narration') || headerStr.includes('particulars');
    const hasDebit = headerStr.includes('debit') || headerStr.includes('withdrawal') || headerStr.includes('dr');
    const hasCredit = headerStr.includes('credit') || headerStr.includes('deposit') || headerStr.includes('cr');

    // Need at least date and description, plus either debit or credit
    const matchCount = [hasDate, hasDescription, hasDebit || hasCredit].filter(Boolean).length;

    console.log('SBI header validation:', { hasDate, hasDescription, hasDebit, hasCredit, matchCount });
    return matchCount >= 2; // At least 2 out of 3 key components
  }

  private extractMetadata(headerRows: any[][]): BankStatementMetadata {
    const metadata: BankStatementMetadata = {
      extractedAt: new Date()
    };

    // Look for account number, holder name, period in header rows
    for (const row of headerRows) {
      if (!row) continue;

      const rowStr = row.join(' ').toLowerCase();

      // Account number patterns
      if (rowStr.includes('account no') || rowStr.includes('account number')) {
        const match = rowStr.match(/\d{10,}/);
        if (match) {
          metadata.accountNumber = match[0];
        }
      }

      // Statement period
      if (rowStr.includes('from') && rowStr.includes('to')) {
        metadata.statementPeriod = row.join(' ');
      }
    }

    return metadata;
  }

  private isValidTransactionRow(row: any[]): boolean {
    // Must have minimum columns (7 for SBI format)
    if (!row || row.length < 7) {
      console.log('Row rejected: insufficient columns', row?.length);
      return false;
    }

    // Check if first column (Txn Date) or second column (Value Date) is a valid date
    const txnDateStr = row[this.COLUMNS.TXN_DATE];
    const valueDateStr = row[this.COLUMNS.VALUE_DATE];

    const hasTxnDate = txnDateStr && this.isValidDate(txnDateStr);
    const hasValueDate = valueDateStr && this.isValidDate(valueDateStr);

    if (!hasTxnDate && !hasValueDate) {
      console.log('Row rejected: no valid date found', { txnDateStr, valueDateStr });
      return false;
    }

    // Must have description
    const description = row[this.COLUMNS.DESCRIPTION];
    if (!description) {
      console.log('Row rejected: no description');
      return false;
    }

    // Must have either debit or credit
    const debit = row[this.COLUMNS.DEBIT];
    const credit = row[this.COLUMNS.CREDIT];
    if (!debit && !credit) {
      console.log('Row rejected: no amount', { debit, credit });
      return false;
    }

    console.log('Valid transaction row found:', {
      txnDate: txnDateStr,
      valueDate: valueDateStr,
      description: description?.toString().substring(0, 30),
      debit,
      credit
    });

    return true;
  }

  private parseTransactionRow(row: any[]): UnifiedTransaction | null {
    try {
      // Use Transaction Date as primary date, fall back to Value Date
      // Dates might be Excel serial numbers or strings
      let date = this.parseDate(row[this.COLUMNS.TXN_DATE]);
      if (!date) {
        date = this.parseDate(row[this.COLUMNS.VALUE_DATE]);
      }
      if (!date) return null;

      const valueDate = this.parseDate(row[this.COLUMNS.VALUE_DATE]);
      const description = this.cleanDescription(row[this.COLUMNS.DESCRIPTION] || '');
      const refNo = row[this.COLUMNS.REF_NO]?.toString() || '';
      const debitAmount = this.parseAmount(row[this.COLUMNS.DEBIT]);
      const creditAmount = this.parseAmount(row[this.COLUMNS.CREDIT]);
      const balance = this.parseAmount(row[this.COLUMNS.BALANCE]);

      // Calculate amount (negative for debit, positive for credit)
      let amount = 0;
      let transactionType: 'debit' | 'credit' | undefined;

      if (debitAmount > 0) {
        amount = -debitAmount;
        transactionType = 'debit';
      } else if (creditAmount > 0) {
        amount = creditAmount;
        transactionType = 'credit';
      } else {
        return null; // No amount found
      }

      return {
        date,
        description,
        amount,
        balance: balance || undefined,
        referenceNo: refNo || undefined,
        valueDate: valueDate || undefined,
        transactionType,
        source: 'SBI-EXCEL',
        bankName: this.bankName,
        originalData: {
          txnDate: row[this.COLUMNS.TXN_DATE],
          valueDate: row[this.COLUMNS.VALUE_DATE],
          description: row[this.COLUMNS.DESCRIPTION],
          refNo: row[this.COLUMNS.REF_NO],
          debit: row[this.COLUMNS.DEBIT],
          credit: row[this.COLUMNS.CREDIT],
          balance: row[this.COLUMNS.BALANCE]
        }
      };
    } catch (error) {
      console.error('Error parsing SBI transaction row:', error);
      return null;
    }
  }

  generateFingerprint(txn: UnifiedTransaction, accountId: number): string {
    // SBI-specific fingerprint using original data
    const original = txn.originalData;
    const parts = [
      accountId,
      this.bankId,
      txn.date,
      txn.description.toLowerCase().replace(/\s+/g, ''),
      original['refNo'] || '',
      original['debit'] || 0,
      original['credit'] || 0,
      original['balance'] || 0
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
