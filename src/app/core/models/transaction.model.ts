// src/app/core/models/transaction.model.ts
export interface ParsedTransaction {
  date: string;        // ISO yyyy-MM-dd
  narration: string;   // raw narration string
  amount: number;      // negative = debit, positive = credit
  source: 'HDFC-CSV';  // to support multiple sources later
}
