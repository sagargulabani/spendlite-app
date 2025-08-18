import { SBIAdapter } from './sbi.adapter';

describe('SBIAdapter', () => {
  let adapter: SBIAdapter;

  beforeEach(() => {
    adapter = new SBIAdapter();
  });

  describe('canHandle', () => {
    it('should recognize SBI transfer patterns', () => {
      expect(adapter.canHandle('BY TRANSFER-NEFT')).toBe(true);
      expect(adapter.canHandle('TO TRANSFER-IMPS')).toBe(true);
      expect(adapter.canHandle('ATM-CASH')).toBe(true);
      expect(adapter.canHandle('POS-PURCHASE')).toBe(true);
      expect(adapter.canHandle('DEBIT-IMPS')).toBe(true);
      expect(adapter.canHandle('CREDIT-IMPS')).toBe(true);
    });

    it('should reject non-SBI patterns', () => {
      expect(adapter.canHandle('UPI-SWIGGY')).toBe(false);
      expect(adapter.canHandle('RANDOM TEXT')).toBe(false);
    });
  });

  describe('extractMerchantKey', () => {
    it('should extract merchant from self-transfer with account info', () => {
      const narration = 'TO TRANSFER-IMPS/506815916615/HDFC-xx991-sagar hd/Self--';
      expect(adapter.extractMerchantKey(narration)).toBe('HDFC-XX991-SAGAR HD');
    });

    it('should extract merchant from NEFT format with asterisks', () => {
      const narration = 'BY TRANSFER-NEFT*INDB0000006*INDBN03101211261*Upwork Escrow In--';
      expect(adapter.extractMerchantKey(narration)).toBe('UPWORKESCROWIN');
    });

    it('should extract merchant from NEFT UTR format', () => {
      const narration = 'TO TRANSFER-NEFT UTR NO: SBIN424285653851--sagar hdfc';
      expect(adapter.extractMerchantKey(narration)).toBe('SAGAR HDFC');
    });

    it('should handle IMPS format without self indicator', () => {
      const narration = 'TO TRANSFER-INB IMPS/430613652333/HDFC-xx991-/null--';
      expect(adapter.extractMerchantKey(narration)).toBe('HDFC-XX991-');
    });

    it('should return SELF for self-transfers without extractable name', () => {
      const narration = 'TO TRANSFER-IMPS/123456789/Self--';
      expect(adapter.extractMerchantKey(narration)).toBe('SELF');
    });

    it('should handle ATM transactions', () => {
      const narration = 'ATM-CASH WDL-MUMBAI CENTRAL';
      expect(adapter.extractMerchantKey(narration)).toBe('CASH');
    });

    it('should handle POS transactions', () => {
      const narration = 'POS-PURCHASE AT STORE';
      expect(adapter.extractMerchantKey(narration)).toBe('PURCHASE');
    });
  });

  describe('extractHints', () => {
    it('should identify self-transfers and suggest transfers category', () => {
      const hints = adapter.extractHints('TO TRANSFER-IMPS/506815916615/HDFC-xx991-sagar hd/Self--');
      expect(hints.transactionType).toBe('transfer');
      expect(hints.isTransfer).toBe(true);
      expect(hints.isSelfTransfer).toBe(true);
      expect(hints.possibleCategory).toBe('transfers');
    });

    it('should identify regular transfers', () => {
      const hints = adapter.extractHints('BY TRANSFER-NEFT*INDB0000006*Company Name--');
      expect(hints.transactionType).toBe('transfer');
      expect(hints.isTransfer).toBe(true);
    });

    it('should identify ATM transactions and suggest cash category', () => {
      const hints = adapter.extractHints('ATM-CASH WITHDRAWAL');
      expect(hints.transactionType).toBe('atm');
      expect(hints.possibleCategory).toBe('cash');
    });

    it('should identify POS transactions and suggest shopping category', () => {
      const hints = adapter.extractHints('POS-PURCHASE AT MALL');
      expect(hints.transactionType).toBe('pos');
      expect(hints.possibleCategory).toBe('shopping');
    });

    it('should extract transfer account info', () => {
      const hints = adapter.extractHints('TO TRANSFER-IMPS/123/HDFC-XX991-JOHN DOE/Payment');
      expect(hints.transferAccount).toBe('HDFC-XX991-JOHN DOE');
    });
  });
});