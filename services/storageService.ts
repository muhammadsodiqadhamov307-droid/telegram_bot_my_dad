
import { Transaction, TransactionType, UserStats } from "../types";

const STORAGE_KEY = 'pulnazorat_data';

export const getTransactions = (): Transaction[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

export const saveTransaction = (transaction: Omit<Transaction, 'id' | 'createdAt'>): Transaction => {
  const newTransaction: Transaction = {
    ...transaction,
    id: Math.random().toString(36).substr(2, 9),
    createdAt: Date.now()
  };
  
  const transactions = getTransactions();
  localStorage.setItem(STORAGE_KEY, JSON.stringify([newTransaction, ...transactions]));
  return newTransaction;
};

export const deleteTransaction = (id: string): void => {
  const transactions = getTransactions();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions.filter(t => t.id !== id)));
};

export const getStats = (): UserStats => {
  const transactions = getTransactions();
  const totalIncome = transactions
    .filter(t => t.type === TransactionType.INCOME)
    .reduce((sum, t) => sum + t.amount, 0);
    
  const totalExpense = transactions
    .filter(t => t.type === TransactionType.EXPENSE)
    .reduce((sum, t) => sum + t.amount, 0);
    
  return {
    balance: totalIncome - totalExpense,
    totalIncome,
    totalExpense
  };
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('uz-UZ').format(amount) + " so'm";
};
