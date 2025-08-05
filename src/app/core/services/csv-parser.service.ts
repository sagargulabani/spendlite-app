import { Injectable } from '@angular/core';
import * as Papa from 'papaparse';
import { ParsedTransaction } from '../models/transaction.model';

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvParseError';
  }
}

@Injectable({
  providedIn: 'root'
})
export class CsvParserService {
  private readonly HDFC_HEADERS = [
    'Date',
    'Narration',
    'Value Date',
    'Withdrawal Amt.',
    'Deposit Amt.',
    'Closing Balance'
  ];

  async parseFile(file: File): Promise<{ rows: ParsedTransaction[]; errors: number }> {
    return new Promise((resolve, reject) => {
      const rows: ParsedTransaction[] = [];
      let errors = 0;
      let headerValidated = false;

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        worker: true,
        step: (result: Papa.ParseStepResult<any>) => {
          if (!headerValidated) {
            const headers = Object.keys(result.data as Record<string, any>);
            if (!this.validateHdfcHeaders(headers)) {
              reject(new CsvParseError('Invalid CSV format. Expected HDFC bank statement headers.'));
              return;
            }
            headerValidated = true;
          }
          const parsed = this.parseHdfcRow(result.data);
          console.log(parsed)
          if (parsed) {
            rows.push(parsed);
          } else {
            errors++;
          }
        },
        complete: () => {
          // console.log(rows)
          if (rows.length === 0) {
            reject(new CsvParseError('No valid transactions found in the CSV file.'));
          } else {
            resolve({ rows, errors });
          }
        },
        error: (error) => {
          reject(new CsvParseError(`CSV parsing failed: ${error.message}`));
        }
      });
    });
  }

  private validateHdfcHeaders(headers: string[]): boolean {
    // Normalize headers by trimming whitespace
    const normalizedHeaders = headers.map(h => h?.toString().trim());

    // Check if essential headers are present (more flexible matching)
    const requiredPatterns = [
      /date/i,
      /narration/i,
      /withdrawal|debit/i,
      /deposit|credit/i
    ];

    let matchCount = 0;
    for (const pattern of requiredPatterns) {
      if (normalizedHeaders.some(header => pattern.test(header))) {
        matchCount++;
      }
    }

    // Need at least 3 out of 4 key headers
    return matchCount >= 3;
  }

  private parseHdfcRow(row: Record<string, any>): ParsedTransaction | null {
    // 1. Normalise the headers coming from Papa Parse
    const norm: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) {
      const cleanKey = k
        .replace(/\./g, '')        // drop periods
        .replace(/\s+/g, ' ')      // collapse interior runs of spaces
        .trim()                    // trim ends
        .toLowerCase();            // make comparisons case-insensitive
      norm[cleanKey] = v;
    }

    // 2. Grab the fields you care about
    const rawDate = norm['date'];
    const rawNarration = norm['narration'];
    const rawDebit = norm['withdrawal amt'] ?? norm['debit amount'];
    const rawCredit = norm['deposit amt'] ?? norm['credit amount'];

    if (!rawDate || !rawNarration) return null;

    const isoDate = this.toIso(rawDate);
    if (!isoDate) return null;

    const debitAmount = this.num(rawDebit);
    const creditAmount = this.num(rawCredit);

    let amount = 0;
    if (debitAmount > 0) amount = -debitAmount;
    else if (creditAmount > 0) amount = creditAmount;
    else return null;

    return {
      date: isoDate,
      narration: rawNarration.toString().trim().replace(/\s+/g, ' '),
      amount,
      source: 'HDFC-CSV'
    };
  }


  private toIso(dateStr: string): string | null {
    if (!dateStr) return null;

    // Clean the date string
    const cleaned = dateStr.toString().trim();

    // Match DD/MM/YY or DD/MM/YYYY
    const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!match) return null;

    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    let year = parseInt(match[3], 10);

    // Handle 2-digit year
    if (year < 100) {
      year = year < 50 ? 2000 + year : 1900 + year;
    }

    // Validate date components
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }

    // Create ISO date string
    const isoDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

    // Validate it's a real date
    const parsed = new Date(isoDate);
    if (isNaN(parsed.getTime())) {
      return null;
    }

    return isoDate;
  }

  private num(value: any): number {
    if (!value || value === '0.00') return 0;

    // Convert to string and clean
    const str = value.toString()
      .trim()
      .replace(/,/g, '') // Remove thousand separators
      .replace(/\s/g, ''); // Remove spaces

    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
  }
}
