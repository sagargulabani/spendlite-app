// core/services/parser-factory.service.ts
import { Injectable } from '@angular/core';
import { BankParser, ParseResult, ParseProgress } from '../parsers/bank-parser.abstract';
import { HdfcCsvParser } from '../parsers/hdfc-csv.parser';
import { SbiExcelParser } from '../parsers/sbi-excel.parser';

export interface BankInfo {
  id: string;
  name: string;
  supportedFormats: string[];
  icon?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ParserFactoryService {
  private parsers: BankParser[] = [
    new HdfcCsvParser(),
    new SbiExcelParser(),
    // Add more parsers here as needed
  ];

  // Get list of supported banks for UI
  getSupportedBanks(): BankInfo[] {
    return this.parsers.map(parser => ({
      id: parser.bankId,
      name: parser.bankName,
      supportedFormats: parser.supportedFormats
    }));
  }

  // Get parser for specific bank
  getParserForBank(bankId: string): BankParser | null {
    return this.parsers.find(p => p.bankId === bankId) || null;
  }

  // Auto-detect bank from file
  async detectBank(file: File): Promise<string | null> {
    console.log('Detecting bank for file:', file.name, 'Size:', file.size);

    // Try each parser to see which can handle the file
    for (const parser of this.parsers) {
      try {
        console.log(`Checking parser: ${parser.bankId}`);
        const canParse = await parser.canParse(file);

        if (canParse) {
          console.log(`✓ File can be parsed by ${parser.bankId}`);
          return parser.bankId;
        } else {
          console.log(`✗ File cannot be parsed by ${parser.bankId}`);
        }
      } catch (error) {
        console.error(`Error checking parser ${parser.bankId}:`, error);
      }
    }

    console.error('No parser found for file:', file.name);
    return null;
  }

  // Parse file with auto-detection
  async parseWithAutoDetect(
    file: File,
    onProgress?: (progress: ParseProgress) => void
  ): Promise<{ result: ParseResult; bankId: string }> {
    let bankId = await this.detectBank(file);

    // If detection failed but file is Excel, try SBI parser as fallback
    if (!bankId) {
      const fileName = file.name.toLowerCase();
      if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) {
        console.log('Auto-detection failed for Excel file, trying SBI parser as fallback');
        bankId = 'SBI';
      }
    }

    if (!bankId) {
      throw new Error(
        `Unable to detect bank format. Supported formats: ${this.getSupportedFormatsString()}`
      );
    }

    const parser = this.getParserForBank(bankId);
    if (!parser) {
      throw new Error(`No parser found for bank: ${bankId}`);
    }

    const result = await parser.parse(file, onProgress);
    return { result, bankId };
  }

  // Parse file with specific bank
  async parseWithBank(
    file: File,
    bankId: string,
    onProgress?: (progress: ParseProgress) => void
  ): Promise<ParseResult> {
    const parser = this.getParserForBank(bankId);

    if (!parser) {
      throw new Error(`Unsupported bank: ${bankId}`);
    }

    // Verify file format is supported
    const fileName = file.name.toLowerCase();
    const isSupported = parser.supportedFormats.some(ext => fileName.endsWith(ext));

    if (!isSupported) {
      throw new Error(
        `Invalid file format for ${parser.bankName}. ` +
        `Expected: ${parser.supportedFormats.join(', ')}`
      );
    }

    // Verify parser can handle this specific file
    const canParse = await parser.canParse(file);
    if (!canParse) {
      throw new Error(
        `File does not appear to be a valid ${parser.bankName} statement. ` +
        `Please ensure the file is downloaded directly from ${parser.bankName}.`
      );
    }

    return await parser.parse(file, onProgress);
  }

  // Get accepted file types for HTML input
  getAcceptedFileTypes(bankId?: string): string {
    if (bankId) {
      const parser = this.getParserForBank(bankId);
      return parser ? parser.supportedFormats.join(',') : '*';
    }

    // Return all supported formats
    const allFormats = new Set<string>();
    this.parsers.forEach(p => p.supportedFormats.forEach(f => allFormats.add(f)));
    return Array.from(allFormats).join(',');
  }

  // Get human-readable format string
  private getSupportedFormatsString(): string {
    const formats: string[] = [];
    this.parsers.forEach(parser => {
      formats.push(`${parser.bankName}: ${parser.supportedFormats.join(', ')}`);
    });
    return formats.join('; ');
  }
}
