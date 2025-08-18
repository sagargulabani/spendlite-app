// core/adapters/hdfc.adapter.ts
import { BankAdapter } from './bank-adapter.interface';

export class HDFCAdapter implements BankAdapter {
  bankId = 'HDFC';
  bankName = 'HDFC Bank';

  canHandle(narration: string): boolean {
    const upper = narration.toUpperCase();
    // HDFC patterns
    return upper.startsWith('UPI-') ||
           upper.startsWith('NEFT CR-') ||
           upper.startsWith('IMPS-') ||
           upper.startsWith('IB BILLPAY') ||
           upper.startsWith('ATW-') ||
           upper.match(/^IMPS-\d{12}-/) !== null ||
           upper.match(/^\d{16}\//) !== null; // Card transaction pattern
  }

  extractMerchantKey(narration: string): string {
    const narrationUpper = narration.toUpperCase();

    // Remove HDFC-specific prefixes
    let cleaned = narrationUpper
      .replace(/^UPI-/, '')
      .replace(/^IMPS-/, '')
      .replace(/^NEFT CR-/, '')
      .replace(/^RTGS-/, '')
      .replace(/^ACH\s*D?-/, '')
      .replace(/^IB\s+/, '')
      .replace(/^ATW-/, '')
      .replace(/^\d+-/, '');

    // Handle UPI format
    if (narrationUpper.startsWith('UPI-')) {
      const parts = cleaned.split('-');
      for (const part of parts) {
        const cleanPart = part.replace(/[^A-Z0-9]/g, '');
        if (cleanPart.length >= 3 && !/^\d+$/.test(cleanPart)) {
          const merchantName = part
            .split('@')[0]
            .split('.')[0]
            .replace(/[^A-Z0-9]/g, '');

          const finalName = merchantName
            .replace(/RAZORPAY|PAYTM|PHONEPE|GOOGLEPAY|BHARATPE|PAYMENT|PAY$/g, '');

          if (finalName.length >= 3) {
            return finalName.substring(0, 20);
          }
        }
      }
    }

    // Default extraction
    const words = cleaned.split(/[\s\-\.@\/]/);
    for (const word of words) {
      const cleanWord = word.replace(/[^A-Z0-9]/g, '');
      if (cleanWord.length < 3) continue;
      if (/^\d+$/.test(cleanWord)) continue;
      if (['THE', 'AND', 'FOR', 'PAY', 'VIA', 'REF', 'TXN', 'TO', 'FROM'].includes(cleanWord)) continue;

      const merchantKey = cleanWord
        .replace(/PRIVATE|LIMITED|LTD|PVT|INDIA|PAYMENT|PAYMENTS|SERVICES|RAZORPAY|PAYTM/g, '')
        .trim();

      if (merchantKey.length >= 3) {
        return merchantKey.substring(0, 20);
      }
    }

    const fallback = cleaned
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 20);

    return fallback || 'UNKNOWN';
  }

  extractHints(narration: string): {
    possibleCategory?: string;
    transactionType?: string;
    isTransfer?: boolean;
  } {
    const upper = narration.toUpperCase();
    const hints: any = {};

    // HDFC-specific transfer patterns
    if (upper.includes('SELF TRANSFER') || upper.includes('OWN ACCOUNT')) {
      hints.isTransfer = true;
      hints.possibleCategory = 'transfers';
    }

    // Bill payment patterns
    if (upper.startsWith('IB BILLPAY')) {
      hints.transactionType = 'billpay';
      // Could be credit card, utilities, etc.
    }

    // ATM withdrawal
    if (upper.startsWith('ATW-')) {
      hints.transactionType = 'atm';
      hints.possibleCategory = 'cash';
    }

    // Credit patterns
    if (upper.startsWith('NEFT CR-') || upper.includes('CREDIT')) {
      hints.transactionType = 'credit';
    }

    return hints;
  }
}
