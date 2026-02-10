
import React from 'react';
import { Transaction, TransactionType } from '../types';
import { formatCurrency, deleteTransaction } from '../services/storageService';

interface TransactionListProps {
  transactions: Transaction[];
  onRefresh: () => void;
}

const TransactionList: React.FC<TransactionListProps> = ({ transactions, onRefresh }) => {
  const handleDelete = (id: string) => {
    if (confirm("O'chirishni tasdiqlaysizmi?")) {
      deleteTransaction(id);
      onRefresh();
    }
  };

  if (transactions.length === 0) {
    return (
      <div className="py-10 text-center">
        <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
        </div>
        <p className="text-slate-400 font-medium">Hali tranzaksiyalar mavjud emas</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-800">Oxirgi amallar</h3>
        <button onClick={onRefresh} className="text-indigo-600 text-xs font-semibold">Barchasi</button>
      </div>
      <div className="space-y-3">
        {transactions.map((t) => (
          // Fixed: Removed onLongPress as it is not a standard React DOM event for div elements
          <div 
            key={t.id} 
            className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-50 transition-active"
          >
            <div className="flex items-center space-x-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                t.type === TransactionType.INCOME ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'
              }`}>
                {t.type === TransactionType.INCOME ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 11l5-5m0 0l5 5m-5-5v12" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 13l-5 5m0 0l-5-5m5 5V6" /></svg>
                )}
              </div>
              <div>
                <p className="font-semibold text-slate-800 text-sm leading-tight">{t.description}</p>
                <p className="text-slate-400 text-[10px] mt-0.5">{new Date(t.createdAt).toLocaleDateString('uz-UZ', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
            <div className="text-right">
              <p className={`font-bold text-sm ${t.type === TransactionType.INCOME ? 'text-emerald-600' : 'text-rose-600'}`}>
                {t.type === TransactionType.INCOME ? '+' : '-'}{formatCurrency(t.amount)}
              </p>
              <button onClick={() => handleDelete(t.id)} className="text-[10px] text-slate-300 hover:text-rose-400 transition-colors">o'chirish</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TransactionList;
