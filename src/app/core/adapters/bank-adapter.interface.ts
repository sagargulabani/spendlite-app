// core/adapters/bank-adapter.interface.ts
export interface BankAdapter {
  bankId: string;
  bankName: string;

  // Check if this adapter can handle the narration format
  canHandle(narration: string): boolean;

  // Extract merchant identifier from narration
  extractMerchantKey(narration: string): string;

  // Extract additional hints for categorization
  extractHints?(narration: string): {
    possibleCategory?: string;
    transactionType?: string;
    isTransfer?: boolean;
    isSelfTransfer?: boolean;
    transferAccount?: string;
  };
}
