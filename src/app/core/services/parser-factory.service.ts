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

  // Parse file with specific bank - NO AUTO-DETECTION
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
        `Expected: ${parser.supportedFormats.join(', ')}. ` +
        `Please upload a valid ${parser.bankName} statement.`
      );
    }

    // Verify parser can handle this specific file (validates headers)
    const canParse = await parser.canParse(file);
    if (!canParse) {
      // More specific error message
      throw new Error(
        `This file does not appear to be a valid ${parser.bankName} bank statement. ` +
        `Please ensure you are uploading a statement downloaded from ${parser.bankName} ` +
        `and that you have selected the correct account.`
      );
    }

    // Parse the file
    try {
      return await parser.parse(file, onProgress);
    } catch (error: any) {
      // Enhance error messages during parsing
      if (error.message.includes('Invalid CSV format') ||
          error.message.includes('Invalid Excel format')) {
        throw new Error(
          `The file structure doesn't match ${parser.bankName}'s expected format. ` +
          `Please ensure this is a genuine ${parser.bankName} statement file.`
        );
      }
      throw error;
    }
  }

  // Get accepted file types for HTML input
  getAcceptedFileTypes(bankId?: string): string {
    if (bankId) {
      const parser = this.getParserForBank(bankId);
      return parser ? parser.supportedFormats.join(',') : '*';
    }

    // Return all supported formats if no bank specified
    const allFormats = new Set<string>();
    this.parsers.forEach(p => p.supportedFormats.forEach(f => allFormats.add(f)));
    return Array.from(allFormats).join(',');
  }

  // Check if a bank is supported
  isBankSupported(bankId: string): boolean {
    return this.getParserForBank(bankId) !== null;
  }

  // Get supported formats for a specific bank
  getBankFormats(bankId: string): string[] {
    const parser = this.getParserForBank(bankId);
    return parser ? parser.supportedFormats : [];
  }
}
