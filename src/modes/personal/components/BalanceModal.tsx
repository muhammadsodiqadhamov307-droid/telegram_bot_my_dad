
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';

interface BalanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (data: any) => void;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
const EMOJIS = ['💰', '💵', '🏦', '💳', '👛', '🪙'];

const BalanceModal: React.FC<BalanceModalProps> = ({ isOpen, onClose, onAdd }) => {
    const [title, setTitle] = useState('');
    const [emoji, setEmoji] = useState(EMOJIS[0]);
    const [color, setColor] = useState(COLORS[0]);
    const [currency, setCurrency] = useState<'UZS' | 'USD'>('UZS');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        onAdd({ title, emoji, color, currency, amount: 0, limit_enabled: false });
        setTitle('');
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
                    <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="relative w-full max-w-md bg-white rounded-t-[40px] p-8 shadow-2xl">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-xl font-black">Yangi balans</h3>
                            <button onClick={onClose} className="p-2 bg-gray-50 rounded-full"><X size={20} /></button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Balans nomi" className="w-full bg-gray-50 p-5 rounded-3xl font-bold outline-none focus:ring-2 focus:ring-blue-500" />

                            <div>
                                <label className="block text-[10px] font-black uppercase text-gray-400 mb-3">Valyuta</label>
                                <div className="flex gap-2">
                                    {['UZS', 'USD'].map(c => (
                                        <button key={c} type="button" onClick={() => setCurrency(c as any)} className={`flex-1 py-3 rounded-xl font-black text-xs ${currency === c ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>{c}</button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black uppercase text-gray-400 mb-3">Emoji & Rang</label>
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {EMOJIS.map(e => (
                                        <button key={e} type="button" onClick={() => setEmoji(e)} className={`w-12 h-12 text-2xl rounded-xl transition-all ${emoji === e ? 'bg-blue-100 scale-110 shadow-sm' : 'bg-gray-50'}`}>{e}</button>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    {COLORS.map(c => (
                                        <button key={c} type="button" onClick={() => setColor(c)} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${color === c ? 'ring-4 ring-offset-2 ring-blue-100 scale-110' : ''}`} style={{ backgroundColor: c }}>
                                            {color === c && <Check size={16} className="text-white" />}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button type="submit" className="w-full py-5 bg-blue-600 text-white rounded-[28px] font-black shadow-xl shadow-blue-100">
                                Qo’shish
                            </button>
                        </form>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default BalanceModal;
