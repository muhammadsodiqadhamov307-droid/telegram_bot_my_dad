import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api';
import { TrendingUp, TrendingDown, Wallet, Plus, Calendar, Search, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import type { Transaction, Summary, Category } from '../types';
import BalanceChart from '../components/BalanceChart';
import CategoryChart from '../components/CategoryChart';

function Dashboard() {
    const [showAddModal, setShowAddModal] = useState(false);
    const [transactionType, setTransactionType] = useState<'income' | 'expense'>('expense');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
    const queryClient = useQueryClient();

    // Fetch data
    const { data: summary } = useQuery({
        queryKey: ['summary'],
        queryFn: () => apiClient.getSummary(30).then(res => res.data as Summary),
    });

    const { data: transactions = [] } = useQuery({
        queryKey: ['transactions'],
        queryFn: () => apiClient.getTransactions({ limit: 100 }).then(res => res.data as Transaction[]),
    });

    const { data: categories = [] } = useQuery({
        queryKey: ['categories'],
        queryFn: () => apiClient.getCategories().then(res => res.data),
    });

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: (id: number) => apiClient.deleteTransaction(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['summary'] });
            window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
        },
    });

    // Add transaction mutation
    const addMutation = useMutation({
        mutationFn: (data: any) => apiClient.createTransaction(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['summary'] });
            setShowAddModal(false);
            window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
        },
    });

    // Filter transactions
    const filteredTransactions = transactions.filter(t => {
        const matchesSearch = t.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.category_name?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = filterType === 'all' || t.type === filterType;
        return matchesSearch && matchesFilter;
    });

    const handleAddTransaction = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);

        addMutation.mutate({
            type: transactionType,
            amount: parseFloat(formData.get('amount') as string),
            description: formData.get('description') as string,
            category_id: formData.get('category_id') ? parseInt(formData.get('category_id') as string) : undefined,
        });
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('uz-UZ').format(amount) + ' UZS';
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-6 pb-24">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
            >
                <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    Moliya Tracker
                </h1>
                <p className="text-gray-600 dark:text-gray-400">Moliyaviy operatsiyalaringizni kuzatib boring</p>
            </motion.div>

            {/* Balance Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="stat-card from-blue-500 to-blue-600"
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-blue-100">Joriy balans</span>
                        <Wallet className="w-6 h-6 text-blue-100" />
                    </div>
                    <p className="text-3xl font-bold">{formatCurrency(summary?.balance || 0)}</p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 }}
                    className="stat-card from-green-500 to-green-600"
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-green-100">Daromad</span>
                        <TrendingUp className="w-6 h-6 text-green-100" />
                    </div>
                    <p className="text-3xl font-bold">{formatCurrency(summary?.total_income || 0)}</p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3 }}
                    className="stat-card from-red-500 to-red-600"
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-red-100">Xarajat</span>
                        <TrendingDown className="w-6 h-6 text-red-100" />
                    </div>
                    <p className="text-3xl font-bold">{formatCurrency(summary?.total_expense || 0)}</p>
                </motion.div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-4 mb-8">
                <button
                    onClick={() => {
                        setTransactionType('income');
                        setShowAddModal(true);
                        window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                    }}
                    className="btn-income flex items-center justify-center gap-2"
                >
                    <Plus className="w-5 h-5" />
                    Daromad qo'shish
                </button>
                <button
                    onClick={() => {
                        setTransactionType('expense');
                        setShowAddModal(true);
                        window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
                    }}
                    className="btn-expense flex items-center justify-center gap-2"
                >
                    <Plus className="w-5 h-5" />
                    Xarajat qo'shish
                </button>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                    className="card"
                >
                    <h3 className="text-lg font-semibold mb-4">Balans tendentsiyasi</h3>
                    <BalanceChart />
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 }}
                    className="card"
                >
                    <h3 className="text-lg font-semibold mb-4">Kategoriyalar bo'yicha</h3>
                    <CategoryChart />
                </motion.div>
            </div>

            {/* Transactions List */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="card"
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold">Tranzaksiyalar</h3>
                    <span className="text-sm text-gray-500">{transactions.length} ta</span>
                </div>

                {/* Search and Filter */}
                <div className="flex gap-4 mb-4">
                    <div className="flex-1 relative">
                        <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Qidirish..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="input-field pl-10"
                        />
                    </div>
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value as any)}
                        className="input-field"
                    >
                        <option value="all">Barchasi</option>
                        <option value="income">Daromad</option>
                        <option value="expense">Xarajat</option>
                    </select>
                </div>

                {/* Transaction Items */}
                <div className="space-y-3">
                    <AnimatePresence>
                        {filteredTransactions.map((transaction) => (
                            <motion.div
                                key={transaction.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl hover:shadow-md transition-all"
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${transaction.type === 'income' ? 'bg-green-100 dark:bg-green-900' : 'bg-red-100 dark:bg-red-900'
                                        }`}>
                                        {transaction.type === 'income' ? '💰' : '💸'}
                                    </div>
                                    <div>
                                        <p className="font-semibold">{transaction.description || 'Tavsif yo\'q'}</p>
                                        <p className="text-sm text-gray-500">
                                            {transaction.category_name || 'Kategoriya yo\'q'} • {format(new Date(transaction.transaction_date), 'dd.MM.yyyy')}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <p className={`text-lg font-bold ${transaction.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                        }`}>
                                        {transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.amount)}
                                    </p>
                                    <button
                                        onClick={() => {
                                            if (confirm('Tranzaksiyani o\'chirmoqchimisiz?')) {
                                                deleteMutation.mutate(transaction.id);
                                            }
                                        }}
                                        className="p-2 hover:bg-red-100 dark:hover:bg-red-900 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {filteredTransactions.length === 0 && (
                        <div className="text-center py-12 text-gray-500">
                            <Calendar className="w-16 h-16 mx-auto mb-4 opacity-50" />
                            <p>Tranzaksiyalar topilmadi</p>
                        </div>
                    )}
                </div>
            </motion.div>

            {/* Add Transaction Modal */}
            <AnimatePresence>
                {showAddModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
                        onClick={() => setShowAddModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                            className="card max-w-md w-full"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xl font-bold">
                                    {transactionType === 'income' ? 'Daromad qo\'shish' : 'Xarajat qo\'shish'}
                                </h3>
                                <button
                                    onClick={() => setShowAddModal(false)}
                                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <form onSubmit={handleAddTransaction} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-2">Summa (UZS)</label>
                                    <input
                                        type="number"
                                        name="amount"
                                        required
                                        min="0"
                                        step="0.01"
                                        placeholder="50000"
                                        className="input-field"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-2">Kategoriya</label>
                                    <select name="category_id" className="input-field">
                                        <option value="">Tanlang</option>
                                        {categories
                                            .filter((c: Category) => c.type === transactionType)
                                            .map((cat: Category) => (
                                                <option key={cat.id} value={cat.id}>
                                                    {cat.icon} {cat.name}
                                                </option>
                                            ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-2">Tavsif</label>
                                    <input
                                        type="text"
                                        name="description"
                                        placeholder="Masalan: Oziq-ovqat"
                                        className="input-field"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={addMutation.isPending}
                                    className={transactionType === 'income' ? 'btn-income w-full' : 'btn-expense w-full'}
                                >
                                    {addMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
                                </button>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default Dashboard;
