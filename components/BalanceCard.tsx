
import React from 'react';
import { UserStats } from '../types';
import { formatCurrency } from '../services/storageService';

interface BalanceCardProps {
  stats: UserStats;
}

const BalanceCard: React.FC<BalanceCardProps> = ({ stats }) => {
  return (
    <div className="w-full space-y-4">
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-6 shadow-xl text-white">
        <p className="text-indigo-100 text-sm font-medium opacity-80 mb-1">Jami Balans</p>
        <h1 className="text-3xl font-bold tracking-tight">
          {formatCurrency(stats.balance)}
        </h1>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 11l5-5m0 0l5 5m-5-5v12" />
              </svg>
            </div>
            <span className="text-slate-500 text-xs font-semibold">Daromad</span>
          </div>
          <p className="text-lg font-bold text-emerald-600">{formatCurrency(stats.totalIncome)}</p>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 13l-5 5m0 0l-5-5m5 5V6" />
              </svg>
            </div>
            <span className="text-slate-500 text-xs font-semibold">Xarajat</span>
          </div>
          <p className="text-lg font-bold text-rose-600">{formatCurrency(stats.totalExpense)}</p>
        </div>
      </div>
    </div>
  );
};

export default BalanceCard;
