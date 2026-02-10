
import React from 'react';
import { GeminiExtraction, TransactionType } from '../types';
import { saveTransaction, formatCurrency } from '../services/storageService';

interface ConfirmationModalProps {
  data: GeminiExtraction;
  onClose: () => void;
  onSuccess: () => void;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ data, onClose, onSuccess }) => {
  const handleConfirm = () => {
    saveTransaction({
      amount: data.amount,
      description: data.description,
      type: TransactionType.EXPENSE,
      category: 'Voice'
    });
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[60] flex items-center justify-center p-6">
      <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl scale-in text-center">
        <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Tasdiqlaysizmi?</h2>
        <p className="text-slate-500 text-sm mb-6">Sun'iy intellekt quyidagi ma'lumotni aniqladi:</p>
        
        <div className="bg-slate-50 rounded-2xl p-4 mb-8 text-left space-y-2 border border-slate-100">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400 font-bold uppercase">Xarajat:</span>
            <span className="font-bold text-slate-700">{data.description}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400 font-bold uppercase">Summa:</span>
            <span className="font-extrabold text-rose-600 text-lg">{formatCurrency(data.amount)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={onClose}
            className="py-3.5 rounded-2xl font-bold text-slate-400 bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            Yo'q
          </button>
          <button 
            onClick={handleConfirm}
            className="py-3.5 rounded-2xl font-bold text-white bg-indigo-600 shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all"
          >
            Ha, to'g'ri
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
