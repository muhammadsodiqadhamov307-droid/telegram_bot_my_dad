
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRightLeft } from 'lucide-react';
import { Balance } from '../../../types';

interface TransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    balances: Balance[];
    onTransfer: (data: any) => void;
}

const TransferModal: React.FC<TransferModalProps> = ({ isOpen, onClose, balances, onTransfer }) => {
    const [fromId, setFromId] = useState(balances[0]?.id.toString() || '');
    const [toId, setToId] = useState(balances[1]?.id.toString() || '');
    const [amount, setAmount] = useState('');
    const [fee] = useState('0');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!fromId || !toId || !amount || fromId === toId) return;

        onTransfer({
            from_balance_id: Number(fromId),
            to_balance_id: Number(toId),
            amount: Number(amount),
            fee: Number(fee),
            date: new Date().toISOString(),
            note: 'Balanslararo o’tkazma'
        });
        setAmount('');
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
                    <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="relative w-full max-w-md bg-white rounded-t-[40px] p-8 shadow-2xl">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-xl font-black flex items-center gap-3">
                                <ArrowRightLeft className="text-blue-600" />
                                O’tkazma
                            </h3>
                            <button onClick={onClose} className="p-2 bg-gray-50 rounded-full"><X size={20} /></button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="flex-1">
                                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Qayerdan</label>
                                    <select value={fromId} onChange={(e) => setFromId(e.target.value)} className="w-full bg-gray-50 p-4 rounded-2xl font-bold outline-none border-none ring-0">
                                        {balances.map(b => <option key={b.id} value={b.id.toString()}>{b.emoji} {b.title}</option>)}
                                    </select>
                                </div>
                                <ArrowRightLeft className="text-gray-200 mt-6" size={20} />
                                <div className="flex-1">
                                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Qayerga</label>
                                    <select value={toId} onChange={(e) => setToId(e.target.value)} className="w-full bg-gray-50 p-4 rounded-2xl font-bold outline-none border-none ring-0">
                                        {balances.map(b => <option key={b.id} value={b.id.toString()}>{b.emoji} {b.title}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black uppercase text-gray-400 mb-2">Miqdor</label>
                                <input type="number" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full text-3xl font-black bg-transparent outline-none" />
                            </div>

                            <button type="submit" disabled={fromId === toId} className="w-full py-5 bg-blue-600 text-white rounded-[28px] font-black shadow-xl shadow-blue-100 disabled:opacity-50">
                                O’tkazish
                            </button>
                        </form>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default TransferModal;
