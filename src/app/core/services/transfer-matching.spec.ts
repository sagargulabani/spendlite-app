import { TransferMatchingService } from './transfer-matching';
import { db, Transaction } from '../models/db';

describe('TransferMatchingService', () => {
  let service: TransferMatchingService;

  // Mock transactions for testing
  const mockTransaction1: Transaction = {
    id: 1,
    accountId: 1,
    importId: 1,
    date: '2024-03-15',
    narration: 'TO TRANSFER-INB IMPS/P2A/HDFC-xx991-self',
    amount: -50000,
    fingerprint: 'fp1',
    isReconciled: false,
    createdAt: new Date()
  };

  const mockTransaction2: Transaction = {
    id: 2,
    accountId: 2,
    importId: 2,
    date: '2024-03-15',
    narration: 'BY TRANSFER-NEFT FROM HDFC',
    amount: 50000,
    fingerprint: 'fp2',
    isReconciled: false,
    createdAt: new Date()
  };

  const mockTransaction3: Transaction = {
    id: 3,
    accountId: 2,
    importId: 2,
    date: '2024-03-16',
    narration: 'BY TRANSFER-NEFT FROM HDFC',
    amount: 50000,
    fingerprint: 'fp3',
    isReconciled: false,
    createdAt: new Date()
  };

  beforeEach(() => {
    service = new TransferMatchingService();
  });

  afterEach(async () => {
    // Clean up test data
    await db.transactions.clear();
    await db.accounts.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('isLikelyTransfer', () => {
    it('should identify SELF transfers', () => {
      expect(service.isLikelyTransfer('TO TRANSFER-INB IMPS/P2A/HDFC-xx991-self')).toBe(true);
      expect(service.isLikelyTransfer('NEFT TO SELF ACCOUNT')).toBe(true);
      expect(service.isLikelyTransfer('OWN ACCOUNT TRANSFER')).toBe(true);
    });

    it('should identify transfer keywords', () => {
      expect(service.isLikelyTransfer('BY TRANSFER-NEFT')).toBe(true);
      expect(service.isLikelyTransfer('TO TRANSFER-INB')).toBe(true);
      expect(service.isLikelyTransfer('IMPS/P2A/123456')).toBe(true);
    });

    it('should not identify regular transactions as transfers', () => {
      expect(service.isLikelyTransfer('SWIGGY PAYMENT')).toBe(false);
      expect(service.isLikelyTransfer('AMAZON PURCHASE')).toBe(false);
      expect(service.isLikelyTransfer('ELECTRICITY BILL')).toBe(false);
    });
  });

  describe('extractAccountHints', () => {
    it('should extract HDFC account hints', () => {
      const hints = service.extractAccountHints('HDFC-XX991-sagar hd');
      expect(hints.bankName).toBe('HDFC');
      expect(hints.accountLast4).toBe('991');
    });

    it('should extract SBI account hints', () => {
      const hints = service.extractAccountHints('SBI-XX4795-self transfer');
      expect(hints.bankName).toBe('SBI');
      expect(hints.accountLast4).toBe('4795');
    });

    it('should return empty hints for non-matching patterns', () => {
      const hints = service.extractAccountHints('REGULAR TRANSACTION');
      expect(hints.bankName).toBeUndefined();
      expect(hints.accountLast4).toBeUndefined();
    });
  });

  describe('findPotentialMatches', () => {
    beforeEach(async () => {
      // Setup test data in database
      await db.transactions.bulkAdd([mockTransaction2, mockTransaction3]);
    });

    it('should find exact amount match on same date', async () => {
      const matches = await service.findPotentialMatches(mockTransaction1, 2, 3);
      
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].confidence).toBe('exact');
      expect(matches[0].transaction.amount).toBe(-mockTransaction1.amount);
      expect(matches[0].matchReason).toContain('Same date');
    });

    it('should find high confidence match within 1 day', async () => {
      const txn = { ...mockTransaction1, date: '2024-03-14' };
      const matches = await service.findPotentialMatches(txn, 2, 3);
      
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].confidence).toBe('high');
      expect(matches[0].matchReason).toContain('1 day');
    });

    it('should find medium confidence match within 2-3 days', async () => {
      const txn = { ...mockTransaction1, date: '2024-03-13' };
      const matches = await service.findPotentialMatches(txn, 2, 3);
      
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].confidence).toBe('medium');
    });

    it('should not find matches outside date range', async () => {
      const txn = { ...mockTransaction1, date: '2024-03-01' };
      const matches = await service.findPotentialMatches(txn, 2, 3);
      
      expect(matches.length).toBe(0);
    });

    it('should not find matches with wrong amount', async () => {
      const txn = { ...mockTransaction1, amount: -25000 };
      const matches = await service.findPotentialMatches(txn, 2, 3);
      
      expect(matches.length).toBe(0);
    });
  });

  describe('linkTransfer', () => {
    beforeEach(async () => {
      await db.transactions.add(mockTransaction1);
      await db.transactions.add(mockTransaction2);
    });

    it('should link two transactions as transfers', async () => {
      await service.linkTransfer({
        sourceTransactionId: 1,
        linkedAccountId: 2,
        linkedTransactionId: 2
      });

      const txn1 = await db.transactions.get(1);
      const txn2 = await db.transactions.get(2);

      expect(txn1?.category).toBe('transfers');
      expect(txn1?.isInternalTransfer).toBe(true);
      expect(txn1?.linkedAccountId).toBe(2);
      expect(txn1?.linkedTransactionId).toBe(2);
      expect(txn1?.transferGroupId).toBeDefined();

      expect(txn2?.category).toBe('transfers');
      expect(txn2?.isInternalTransfer).toBe(true);
      expect(txn2?.linkedAccountId).toBe(1);
      expect(txn2?.linkedTransactionId).toBe(1);
      expect(txn2?.transferGroupId).toBe(txn1?.transferGroupId);
    });

    it('should create transfer group ID if not exists', async () => {
      await service.linkTransfer({
        sourceTransactionId: 1,
        linkedAccountId: 2
      });

      const txn = await db.transactions.get(1);
      expect(txn?.transferGroupId).toBeDefined();
      expect(txn?.transferGroupId).toMatch(/^tg_\d+_[a-z0-9]+$/);
    });
  });

  describe('unlinkTransfer', () => {
    beforeEach(async () => {
      // Setup linked transactions
      await db.transactions.bulkAdd([
        { ...mockTransaction1, 
          isInternalTransfer: true, 
          linkedAccountId: 2, 
          linkedTransactionId: 2,
          transferGroupId: 'tg_test_123',
          category: 'transfers'
        },
        { ...mockTransaction2, 
          isInternalTransfer: true, 
          linkedAccountId: 1, 
          linkedTransactionId: 1,
          transferGroupId: 'tg_test_123',
          category: 'transfers'
        }
      ]);
    });

    it('should unlink both transactions', async () => {
      await service.unlinkTransfer(1);

      const txn1 = await db.transactions.get(1);
      const txn2 = await db.transactions.get(2);

      expect(txn1?.isInternalTransfer).toBeUndefined();
      expect(txn1?.linkedAccountId).toBeUndefined();
      expect(txn1?.linkedTransactionId).toBeUndefined();
      expect(txn1?.transferGroupId).toBeUndefined();

      expect(txn2?.isInternalTransfer).toBeUndefined();
      expect(txn2?.linkedAccountId).toBeUndefined();
      expect(txn2?.linkedTransactionId).toBeUndefined();
      expect(txn2?.transferGroupId).toBeUndefined();
    });
  });

  describe('getTransferGroup', () => {
    beforeEach(async () => {
      await db.transactions.bulkAdd([
        { ...mockTransaction1, transferGroupId: 'tg_test_group' },
        { ...mockTransaction2, transferGroupId: 'tg_test_group' },
        { ...mockTransaction3, transferGroupId: 'tg_other_group' }
      ]);
    });

    it('should return all transactions in a transfer group', async () => {
      const group = await service.getTransferGroup('tg_test_group');
      
      expect(group.length).toBe(2);
      expect(group[0].transferGroupId).toBe('tg_test_group');
      expect(group[1].transferGroupId).toBe('tg_test_group');
    });

    it('should return empty array for non-existent group', async () => {
      const group = await service.getTransferGroup('non_existent');
      expect(group.length).toBe(0);
    });
  });
});