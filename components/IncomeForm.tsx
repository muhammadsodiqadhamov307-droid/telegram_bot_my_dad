
import React, { useState } from 'react';

interface IncomeFormProps {
    onSubmit: (amount: number, description: string) => Promise<void>;
}

export const IncomeForm: React.FC<IncomeFormProps> = ({ onSubmit }) => {
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!amount || !description) return;
        setLoading(true);
        await onSubmit(Number(amount), description);
        setLoading(false);
        setAmount('');
        setDescription('');
    };

    return (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
            <h3 className="text-lg font-semibold text-slate-800">Daromad qo'shish</h3>

            <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Summa</label>
                <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="Masalan: 5000000"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-lg"
                    required
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Izoh</label>
                <input
                    type="text"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Masalan: Oylik maosh"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    required
                />
            </div>

            <button
                type="submit"
                disabled={loading}
                className={`w-full py-4 rounded-xl font-bold text-white transition-all transform hover:scale-[1.02] active:scale-[0.98] ${loading ? 'bg-slate-400' : 'bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/30'}`}
            >
                {loading ? 'Saqlanmoqda...' : 'Qo\'shish'}
            </button>
        </form>
    )
}
