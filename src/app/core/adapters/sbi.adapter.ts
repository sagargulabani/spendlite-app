// core/adapters/sbi.adapter.ts
import { BankAdapter } from './bank-adapter.interface';

export class SBIAdapter implements BankAdapter {
  bankId = 'SBI';
  bankName = 'State Bank of India';

  canHandle(narration: string): boolean {
    const upper = narration.toUpperCase();
    // SBI patterns
    return upper.startsWith('BY TRANSFER-') ||
           upper.startsWith('TO TRANSFER-') ||
           upper.startsWith('ATM-') ||
           upper.startsWith('POS-') ||
           upper.startsWith('CASH-') ||
           upper.startsWith('DEBIT-IMPS') ||
           upper.startsWith('CREDIT-IMPS');
  }

  extractMerchantKey(narration: string): string {
    const narrationUpper = narration.toUpperCase();

    // Remove common SBI prefixes first
    let processedNarration = narrationUpper;
    if (processedNarration.startsWith('BY TRANSFER-')) {
      processedNarration = processedNarration.substring('BY TRANSFER-'.length).trim();
    } else if (processedNarration.startsWith('TO TRANSFER-')) {
      processedNarration = processedNarration.substring('TO TRANSFER-'.length).trim();
    } else if (processedNarration.startsWith('ATM-')) {
      processedNarration = processedNarration.substring('ATM-'.length).trim();
    } else if (processedNarration.startsWith('POS-')) {
      processedNarration = processedNarration.substring('POS-'.length).trim();
    } else if (processedNarration.startsWith('CASH-')) {
      processedNarration = processedNarration.substring('CASH-'.length).trim();
    }

    // After removing transfer prefix, also remove common transfer type prefixes
    if (processedNarration.startsWith('IMPS/') || processedNarration.startsWith('INB IMPS/')) {
      // Remove IMPS or INB IMPS prefix to get to the actual data
      if (processedNarration.startsWith('INB IMPS/')) {
        processedNarration = processedNarration.substring('INB IMPS/'.length).trim();
      } else if (processedNarration.startsWith('IMPS/')) {
        processedNarration = processedNarration.substring('IMPS/'.length).trim();
      }
    }

    // Handle NEFT UTR format: "NEFT UTR NO: SBIN424285653851--sagar hdfc"
    if (processedNarration.startsWith('NEFT UTR NO:') || processedNarration.startsWith('NEFT UTR:')) {
      // Extract the part after "--" which contains the recipient name
      const dashIndex = processedNarration.indexOf('--');
      if (dashIndex !== -1) {
        const recipientPart = processedNarration.substring(dashIndex + 2).trim();
        if (recipientPart) {
          // Return the recipient name as-is (uppercase)
          return recipientPart.toUpperCase().substring(0, 30);
        }
      }
    }

    // Handle SBI NEFT/RTGS format with asterisks
    if (processedNarration.includes('*')) {
      const parts = processedNarration.split('*');
      if (parts.length >= 3) {
        const lastPart = parts[parts.length - 1].replace(/--.*$/, '').trim();
        const cleanedName = lastPart.replace(/[^A-Z0-9]/g, '');
        if (cleanedName.length >= 3 && !cleanedName.match(/^\d+$/)) {
          return cleanedName.substring(0, 20);
        }
      }
    }

    // Handle SBI IMPS format with slashes
    if (processedNarration.includes('/')) {
      const parts = processedNarration.split('/');
      
      // Check if this is a self transfer first
      const lastPart = parts[parts.length - 1].replace(/--.*$/, '').trim();
      if (lastPart === 'SELF') {
        // For self transfers, keep the full account identifier
        for (let i = 1; i < parts.length - 1; i++) {
          const part = parts[i].trim();
          if (!/^\d+$/.test(part)) {
            // Look for pattern like "HDFC-xx991-sagar hd"
            if (part.includes('-XX')) {
              // Return the full account identifier as-is (uppercase)
              return part.toUpperCase().substring(0, 30);
            }
            // Otherwise use the whole non-numeric part
            const cleanedName = part.replace(/[^A-Z0-9]/g, '');
            if (cleanedName.length >= 3) {
              return cleanedName.substring(0, 20);
            }
          }
        }
        // If we can't extract a name, return SELF
        return 'SELF';
      }
      
      // Not a self transfer, process normally
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i].trim();
        if (!/^\d+$/.test(part)) {
          // If it looks like an account identifier pattern, keep it as-is
          if (part.includes('-XX')) {
            return part.toUpperCase().substring(0, 30);
          }
          // Otherwise extract the entire meaningful part
          const cleanedName = part.replace(/[^A-Z0-9]/g, '');
          if (cleanedName.length >= 3) {
            return cleanedName.substring(0, 20);
          }
        }
      }
    }

    // Fallback to generic extraction on the processed narration
    return this.genericExtraction(processedNarration);
  }

  private genericExtraction(cleaned: string): string {
    const words = cleaned.split(/[\s\-\.@\/]/);
    for (const word of words) {
      const cleanWord = word.replace(/[^A-Z0-9]/g, '');
      if (cleanWord.length < 3) continue;
      if (/^\d+$/.test(cleanWord)) continue;
      // Removed 'TRANSFER' from exclusion list since we strip prefixes now
      if (['THE', 'AND', 'FOR', 'BY', 'TO', 'FROM', 'OF'].includes(cleanWord)) continue;

      return cleanWord.substring(0, 20);
    }
    return 'UNKNOWN';
  }

  extractHints(narration: string): {
    possibleCategory?: string;
    transactionType?: string;
    isTransfer?: boolean;
    isSelfTransfer?: boolean;
    transferAccount?: string;
  } {
    const upper = narration.toUpperCase();
    const hints: any = {};

    // SBI transfer patterns
    if (upper.startsWith('BY TRANSFER-') || upper.startsWith('TO TRANSFER-')) {
      hints.transactionType = 'transfer';
      hints.isTransfer = true;

      // Check for self transfer indicators
      if (upper.includes('/SELF') || upper.endsWith('SELF--') || upper.includes('-SELF')) {
        hints.possibleCategory = 'transfers';
        hints.isSelfTransfer = true;
      }

      // Extract account info if present
      const accountMatch = upper.match(/([A-Z]+)-XX\d+-[A-Z\s]+/);
      if (accountMatch) {
        hints.transferAccount = accountMatch[0];
        // If the account info matches common patterns for self, mark as self transfer
        if (accountMatch[0].includes('SAGAR') || upper.includes('SELF')) {
          hints.possibleCategory = 'transfers';
          hints.isSelfTransfer = true;
        }
      }
    }

    // ATM patterns
    if (upper.startsWith('ATM-')) {
      hints.transactionType = 'atm';
      hints.possibleCategory = 'cash';
    }

    // POS (Point of Sale) patterns
    if (upper.startsWith('POS-')) {
      hints.transactionType = 'pos';
      hints.possibleCategory = 'shopping';
    }

    return hints;
  }
}
