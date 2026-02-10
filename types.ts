
export enum TransactionType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE'
}

export interface Transaction {
  id: string;
  amount: number;
  description: string;
  type: TransactionType;
  category: string;
  createdAt: number;
}

export interface UserStats {
  balance: number;
  totalIncome: number;
  totalExpense: number;
}

export interface GeminiExtraction {
  description: string;
  amount: number;
}
