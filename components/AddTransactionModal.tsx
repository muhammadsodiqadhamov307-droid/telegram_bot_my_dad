
import React, { useState } from 'react';
import { TransactionType } from '../types';
import { saveTransaction } from '../services/storageService';

interface AddTransactionModalProps {
  type: TransactionType;
  onClose: () => void;
  onSuccess: () => void;
}

const AddTransactionModal: React.FC<AddTransactionModalProps> = ({ type, onClose, onSuccess }) => {
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description) return;

    saveTransaction({
      amount: parseFloat(amount),
      description,
      type,
      category: 'General'
    });

    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-slide-up">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-800">
            {type === TransactionType.INCOME ? 'Daromad qo\'shish' : 'Xarajat qo\'shish'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-tight">Summa (so'm)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Masalan: 50000"
              className="w-full bg-slate-50 border-none rounded-2xl p-4 text-lg font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-tight">Tavsif</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Masalan: Oylik maosh"
              className="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none"
              required
            />
          </div>

          <button
            type="submit"
            className={`w-full py-4 rounded-2xl font-bold text-white shadow-lg transition-all active:scale-95 ${
              type === TransactionType.INCOME ? 'bg-emerald-500 shadow-emerald-200' : 'bg-rose-500 shadow-rose-200'
            }`}
          >
            Saqlash
          </button>
        </form>
      </div>
    </div>
  );
};

export default AddTransactionModal;
