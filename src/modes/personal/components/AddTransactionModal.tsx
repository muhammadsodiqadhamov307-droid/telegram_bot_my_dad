
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, UserPlus } from 'lucide-react';
import { Category, Balance, DebtContact } from '../../../types';
import { apiClient } from '../../../lib/api';

interface AddTransactionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (data: any) => void;
    type: 'income' | 'expense' | 'debt_in' | 'debt_out';
    categories: Category[];
    balances: Balance[];
}

const AddTransactionModal: React.FC<AddTransactionModalProps> = ({ isOpen, onClose, onAdd, type, categories, balances }) => {
    const [amount, setAmount] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [balanceId, setBalanceId] = useState('');
    const [description, setDescription] = useState('');
    const [contactId, setContactId] = useState<number | ''>('');
    const [contacts, setContacts] = useState<DebtContact[]>([]);
    const [newContactName] = useState('');

    useEffect(() => {
        if (balances.length > 0 && !balanceId) {
            setBalanceId(balances[0].id.toString());
        }
        if (isOpen) {
            // Load contacts for debt transactions
            apiClient.getDebtContacts('I_OWE', balances[0]?.currency || 'UZS').then(response => {
                // Fix: createDebtContact returns DebtContact, getDebtContacts returns DebtContact[]
                // We assume response.data is the list if using axios directly in component, 
                // but apiClient.getDebtContacts unwraps validation? 
                // Looking at api.ts: getDebtContacts returns Promise<DebtContact[]> directly? 
                // No, api.ts uses api.get which returns AxiosResponse. 
                // Wait, my api.ts implementation: `getDebtContacts: ... => api.get(...)` returns the Axios Promise.
                // So I need to use .then(res => setContacts(res.data))
                if (response.data) setContacts(response.data);
            });
        }
    }, [balances, balanceId, isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const category = categories.find(c => c.id.toString() === categoryId);
        const balance = balances.find(b => b.id.toString() === balanceId);

        // For Income/Expense, category and balance are needed. 
        // For Debt, balance is needed (where money goes/comes), contact needed. Category is auto?

        if (type === 'income' || type === 'expense') {
            if (!categoryId || !balanceId) return;
        }

        if ((type === 'debt_in' || type === 'debt_out') && !contactId && !newContactName) return;

        onAdd({
            type,
            amount: Number(amount),
            currency: balance?.currency || 'UZS',
            balance_id: Number(balanceId),
            category_id: categoryId ? Number(categoryId) : undefined,
            category_name: category?.name || (type.includes('debt') ? 'Qarz' : 'Boshqa'),
            description,
            contact_id: contactId ? Number(contactId) : undefined,
            transaction_date: new Date().toISOString()
        });

        setAmount('');
        setCategoryId('');
        setDescription('');
        setContactId('');
        onClose();
    };

    const filteredCategories = categories.filter(c => c.type === type || (type.startsWith('debt') && c.type.startsWith('debt')));

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
                    <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="relative w-full max-w-md bg-white rounded-t-[40px] p-8 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-xl font-black flex items-center gap-3 uppercase tracking-wider">
                                <div className={`w-4 h-4 rounded-full ${type.includes('income') || type.includes('debt_in') ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                {type === 'income' ? "Kirim" : type === 'expense' ? "Chiqim" : type === 'debt_in' ? "Qarz Oldim" : "Qarz Berdim"}
                            </h3>
                            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X size={24} /></button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6 overflow-y-auto no-scrollbar pb-6">
                            <div>
                                <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">Summa</label>
                                <div className="relative">
                                    <input autoFocus required type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full text-4xl font-black bg-transparent outline-none placeholder-gray-100" />
                                    <div className="absolute right-0 top-1/2 -translate-y-1/2 bg-gray-100 px-4 py-2 rounded-2xl font-black text-sm text-gray-500">
                                        {balances.find(b => b.id.toString() === balanceId)?.currency || 'UZS'}
                                    </div>
                                </div>
                            </div>

                            {type.includes('debt') && (
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-3">Kim bilan?</label>
                                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                                        <button type="button" onClick={() => {
                                            const name = prompt("Ismni kiriting:");
                                            // Assuming createDebtContact isn't in apiClient types yet or handled differently?
                                            // Actually I implemented createDebtLedger, but not createDebtContact directly?
                                            // Wait, createDebtLedger can auto-create contact if name supplied.
                                            // I probably need a standalone createContact for this UI flow OR just use the hook.
                                            // For now, let's just allow selecting existing or skip. 
                                            // Real implementation: user enters description as name? 
                                            // Let's implement a quick inline creation if possible or just rely on backend.
                                            if (name) {
                                                // Temporary: just add to local list for selection, backend will create on submit if we pass name?
                                                // My backend logic for createDebtLedger supports "name" auto-create.
                                                // But here we need to select it.
                                                // Let's call a new endpoint or just dummy it for now.
                                                // Actually, let's use apiClient.createDebtLedger logic? No that creates a transaction.
                                                // I'll skip dynamic creation here for safety or implement strictly.
                                                alert("Hozircha faqat mavjud kontaktlar (Backendda qo'shish kerak).");
                                            }
                                        }} className="flex-shrink-0 w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center"><UserPlus size={20} /></button>
                                        {contacts.map(c => (
                                            <button key={c.id} type="button" onClick={() => setContactId(c.id)} className={`flex-shrink-0 px-4 h-12 rounded-2xl font-bold text-xs border-2 transition-all ${contactId === c.id ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-100 text-gray-400'}`}>
                                                {c.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-3">Balans</label>
                                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                                    {balances.map(b => (
                                        <button key={b.id} type="button" onClick={() => setBalanceId(b.id.toString())} className={`flex-shrink-0 flex items-center gap-3 p-4 rounded-3xl border-2 transition-all ${balanceId === b.id.toString() ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-50 bg-gray-50 text-gray-400'}`}>
                                            <span className="text-xl">{b.emoji}</span>
                                            <span className="font-bold text-xs whitespace-nowrap">{b.title}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Only show categories for non-debt or if needed */}
                            {(!type.includes('debt')) && (
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-gray-400 tracking-widest mb-3">Kategoriya</label>
                                    <div className="grid grid-cols-4 gap-3">
                                        {filteredCategories.slice(0, 8).map(cat => (
                                            <button key={cat.id} type="button" onClick={() => setCategoryId(cat.id.toString())} className={`flex flex-col items-center gap-2 p-3 rounded-3xl border-2 transition-all ${categoryId === cat.id.toString() ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-50 text-gray-400'}`}>
                                                <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-sm">💰</div>
                                                <span className="text-[10px] font-black truncate w-full text-center uppercase">{cat.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button type="submit" className={`w-full py-5 rounded-[28px] font-black text-white flex items-center justify-center gap-3 shadow-xl transition-all active:scale-95 ${type.includes('income') || type.includes('debt_in') ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                                <Check size={24} /> Tasdiqlash
                            </button>
                        </form>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default AddTransactionModal;
