
import React from 'react';

interface DashboardProps {
    balance: number;
    income: number;
    expense: number;
    onRefresh: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ balance, income, expense, onRefresh }) => {
    return (
        <div className="space-y-4">
            {/* Balance Card */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg transform transition-all hover:scale-[1.02]">
                <p className="text-sm opacity-80 mb-1">Umumiy Balans</p>
                <h1 className="text-4xl font-bold tracking-tight">{balance.toLocaleString()} so'm</h1>
                <div className="mt-4 flex justify-between items-center text-sm">
                    <button onClick={onRefresh} className="bg-white/20 p-2 rounded-full hover:bg-white/30 transition">
                        🔄 Yangilash
                    </button>
                    <span className="opacity-70 text-xs">Oxirgi yangilanish: {new Date().toLocaleTimeString()}</span>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <p className="text-xs text-slate-500 font-medium uppercase">Kirim</p>
                    </div>
                    <p className="text-lg font-bold text-emerald-600">+{income.toLocaleString()}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                        <p className="text-xs text-slate-500 font-medium uppercase">Chiqim</p>
                    </div>
                    <p className="text-lg font-bold text-red-600">-{expense.toLocaleString()}</p>
                </div>
            </div>
        </div>
    );
};
