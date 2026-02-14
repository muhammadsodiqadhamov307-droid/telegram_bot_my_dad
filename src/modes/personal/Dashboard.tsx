
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Wallet,
    ArrowUpCircle,
    ArrowDownCircle,
    Plus,
    Search,
    Filter,
    Trash2,
    Calendar,
    LayoutGrid,
    PieChart as PieIcon,
    Banknote,
    Settings as SettingsIcon,
    Eye,
    EyeOff,
    ChevronRight,
    Home as HomeIcon,
    BarChart2,
    FileText,
    User,
    ArrowRightLeft,
    ChevronLeft,
    RefreshCw,
    Clock,
    ExternalLink,
    ChevronDown,
    X,
    Users,
    MoreVertical,
    Download,
    Moon
} from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import apiClient from '../../lib/api'; // Fix import path
import BalanceChart from './components/BalanceChart';
import CategoryChart from './components/CategoryChart';
import AddTransactionModal from './components/AddTransactionModal';
import TransferModal from './components/TransferModal';
import BalanceModal from './components/BalanceModal';
import FinancialAssistant from './components/FinancialAssistant';
import ThemeChoiceModal from './components/ThemeChoiceModal';
import { ThemePreference } from '../../types'; // Fix import path

type View = 'home' | 'stats' | 'reports' | 'settings' | 'debts';

interface DashboardProps {
    themePreference: ThemePreference;
    setThemePreference: (pref: ThemePreference) => void;
}

const PersonalDashboard: React.FC<DashboardProps> = ({ themePreference, setThemePreference }) => {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<View>('home');
    const [debtTab, setDebtTab] = useState<'I_OWE' | 'OWED_TO_ME'>('I_OWE');
    const [showAddTxModal, setShowAddTxModal] = useState(false);
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [showBalanceModal, setShowBalanceModal] = useState(false);
    const [showThemeModal, setShowThemeModal] = useState(false);
    const [txModalType, setTxModalType] = useState<'income' | 'expense' | 'debt_in' | 'debt_out'>('expense');
    const [showAmounts, setShowAmounts] = useState(true);
    const [activeCurrency, setActiveCurrency] = useState<'UZS' | 'USD'>('UZS');
    const [reportFilter, setReportFilter] = useState({ query: '', type: 'all', balanceId: '' });

    const [dateRange, setDateRange] = useState({
        start: startOfMonth(new Date()),
        end: endOfMonth(new Date())
    });

    const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: apiClient.getProfile });
    const { data: balances = [] } = useQuery({ queryKey: ['balances'], queryFn: () => apiClient.getBalances().then(res => res.data) });
    const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: () => apiClient.getCategories().then(res => res.data) });

    // Note: Backend might need updates to support date range/currency in summary
    const { data: summary } = useQuery({
        queryKey: ['summary', dateRange, activeCurrency, balances],
        queryFn: () => apiClient.getSummary(30).then(res => res.data) // Temporary fallback until backend update
    });

    const { data: transactions = [] } = useQuery({
        queryKey: ['transactions', dateRange, reportFilter, balances],
        queryFn: () => apiClient.getTransactions({
            // @ts-ignore
            startDate: dateRange.start.toISOString(),
            endDate: dateRange.end.toISOString(),
            limit: 100,
            mode: 'personal' // ENFORCE PERSONAL MODE
        }).then(res => res.data)
    });

    const { data: debtContacts = [] } = useQuery({
        queryKey: ['debtContacts', debtTab, activeCurrency],
        queryFn: () => apiClient.getDebtContacts(debtTab, activeCurrency).then(res => res.data)
    });

    const addTxMutation = useMutation({
        mutationFn: apiClient.createTransaction,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['summary'] });
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['balances'] });
            queryClient.invalidateQueries({ queryKey: ['debtContacts'] });
        }
    });

    const deleteTxMutation = useMutation({
        mutationFn: (id: number) => apiClient.deleteTransaction(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['summary'] });
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['balances'] });
        }
    });

    const openAddModal = (type: any) => {
        setTxModalType(type);
        setShowAddTxModal(true);
    };

    const formatAmount = (val: number, cur: string) => {
        if (!showAmounts) return '••••••';
        return `${val.toLocaleString()} ${cur}`;
    };

    const debtProgressBar = useMemo(() => {
        if (!summary) return 0;
        // Adapt to potential API mismatches
        const give = summary.total_debt_to_give_uzs || 0;
        const receive = summary.total_debt_to_receive_uzs || 0;
        const total = give + receive;
        if (total === 0) return 0;
        return (give / total) * 100;
    }, [summary]);

    const renderHome = () => (
        <div className="space-y-6 animate-in fade-in duration-500">
            <header className="px-6 pt-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">
                        {profile?.data?.first_name?.[0] || 'F'}
                    </div>
                    <span className="font-bold text-lg dark:text-white">{profile?.data?.first_name || 'Foydalanuvchi'}</span>
                </div>
                <button onClick={() => setActiveTab('settings')} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                    <SettingsIcon size={24} />
                </button>
            </header>

            <div className="px-6">
                <div className="card bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 shadow-xl shadow-blue-50/50 dark:shadow-none p-6 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-400 dark:text-gray-500 text-sm font-medium">Umumiy balans</span>
                        <button onClick={() => setShowAmounts(!showAmounts)} className="text-gray-300 dark:text-gray-600">
                            {showAmounts ? <Eye size={20} /> : <EyeOff size={20} />}
                        </button>
                    </div>
                    <div className="space-y-1">
                        <h2 className="text-3xl font-black dark:text-white">{formatAmount(summary?.total_balance_uzs || 0, 'UZS')}</h2>
                        <h3 className="text-xl font-bold text-gray-400 dark:text-gray-500">{formatAmount(summary?.total_balance_usd || 0, 'USD')}</h3>
                    </div>
                </div>
            </div>

            <div className="px-6">
                <div className="card p-5 bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-black text-lg dark:text-white">Qarzlar</h3>
                        <button onClick={() => setActiveTab('debts')} className="text-blue-600 dark:text-blue-400 text-sm font-bold">Barchasini ko‘rish</button>
                    </div>
                    <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                        <div className="text-emerald-500">Olishim kerak<br />{formatAmount(summary?.total_debt_to_receive_uzs || 0, activeCurrency)}</div>
                        <div className="text-right text-rose-500">Berishim kerak<br />{formatAmount(summary?.total_debt_to_give_uzs || 0, activeCurrency)}</div>
                    </div>
                    <div className="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${debtProgressBar}%` }}
                            className="h-full bg-purple-500"
                        />
                    </div>
                </div>
            </div>

            <div className="px-6 space-y-3">
                <div className="flex items-center gap-3 overflow-x-auto no-scrollbar py-2">
                    <button onClick={() => setShowBalanceModal(true)} className="flex-shrink-0 w-32 h-32 rounded-[28px] bg-gray-100 dark:bg-gray-800 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 dark:border-gray-700">
                        <Plus size={28} className="text-gray-400 dark:text-gray-600" />
                        <span className="text-xs font-bold text-gray-400 dark:text-gray-600">Qo'shish</span>
                    </button>
                    {balances.map((b: any) => (
                        <div key={b.id} className="flex-shrink-0 w-44 h-32 rounded-[28px] bg-white dark:bg-gray-900 shadow-sm border border-gray-100 dark:border-gray-800 p-5 flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <span className="text-2xl">{b.emoji}</span>
                                <ChevronRight size={16} className="text-gray-300 dark:text-gray-700" />
                            </div>
                            <div>
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase">{b.title}</p>
                                <p className="font-black text-sm truncate dark:text-white">{formatAmount(b.amount, b.currency)}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="px-6 pb-32">
                <button onClick={() => setShowTransferModal(true)} className="w-full flex items-center justify-center gap-3 p-5 rounded-3xl bg-blue-50 dark:bg-blue-900/10 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 active:scale-95 transition-all">
                    <ArrowRightLeft size={20} />
                    <span className="font-black text-xs uppercase tracking-wider">O’tkazma</span>
                </button>
            </div>
        </div>
    );

    const renderStats = () => (
        <div className="space-y-6 animate-in slide-in-from-right duration-500 p-6 pb-32">
            <header className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-black dark:text-white">Statistika</h1>
                <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
                    {['UZS', 'USD'].map(cur => (
                        <button
                            key={cur}
                            onClick={() => setActiveCurrency(cur as any)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeCurrency === cur ? 'bg-white dark:bg-gray-700 shadow-sm dark:text-white' : 'text-gray-500'}`}
                        >{cur}</button>
                    ))}
                </div>
            </header>

            <div className="flex items-center justify-between bg-white dark:bg-gray-900 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
                <button className="p-2 text-gray-400"><ChevronLeft size={20} /></button>
                <div className="flex items-center gap-2">
                    <Calendar size={18} className="text-blue-600" />
                    <span className="font-bold text-sm dark:text-gray-300">{format(dateRange.start, 'MMM d')} - {format(dateRange.end, 'MMM d, yyyy')}</span>
                </div>
                <button className="p-2 text-gray-400"><ChevronRight size={20} /></button>
            </div>

            <div className="card bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 flex items-center justify-center min-h-[250px]">
                {(!summary?.category_breakdown || summary?.category_breakdown.length === 0) ? (
                    <div className="text-center space-y-3">
                        <div className="w-32 h-32 rounded-full border-8 border-gray-50 dark:border-gray-800 flex items-center justify-center mx-auto text-gray-200 dark:text-gray-700 font-black text-xl">0%</div>
                        <p className="text-sm font-bold text-gray-400 dark:text-gray-600 bg-gray-50 dark:bg-gray-800/50 px-4 py-2 rounded-2xl">Ma’lumotlar mavjud emas</p>
                    </div>
                ) : (
                    <CategoryChart data={summary?.category_breakdown || []} />
                )}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-50 dark:bg-emerald-900/10 p-5 rounded-3xl border border-emerald-100 dark:border-emerald-900/30">
                    <p className="text-[10px] font-black text-emerald-600 uppercase mb-1">Kirim</p>
                    <p className="font-black text-lg text-emerald-700 dark:text-emerald-400 truncate">{summary?.monthly_income_uzs?.toLocaleString() || 0}</p>
                </div>
                <div className="bg-rose-50 dark:bg-rose-900/10 p-5 rounded-3xl border border-rose-100 dark:border-rose-900/30">
                    <p className="text-[10px] font-black text-rose-600 uppercase mb-1">Chiqim</p>
                    <p className="font-black text-lg text-rose-700 dark:text-rose-400 truncate">{summary?.monthly_expense_uzs?.toLocaleString() || 0}</p>
                </div>
            </div>
        </div>
    );

    const renderReports = () => (
        <div className="space-y-6 animate-in slide-in-from-right duration-500 pb-32">
            <header className="p-6 pb-0 flex items-center justify-between">
                <h1 className="text-2xl font-black dark:text-white">Hisobotlar</h1>
                <div className="flex items-center gap-2">
                    <button className="p-2 text-gray-400 dark:text-gray-600"><Search size={24} /></button>
                    <button className="p-2 text-gray-400 dark:text-gray-600"><Filter size={24} /></button>
                </div>
            </header>

            <div className="px-6 flex items-center gap-3 overflow-x-auto no-scrollbar pb-2">
                <select
                    value={reportFilter.type}
                    onChange={e => setReportFilter({ ...reportFilter, type: e.target.value })}
                    className="flex-shrink-0 px-4 py-3 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl text-xs font-bold text-gray-500 outline-none"
                >
                    <option value="all">Barcha turlar</option>
                    <option value="income">Kirim</option>
                    <option value="expense">Chiqim</option>
                    <option value="debt_in">Qarz oldim</option>
                    <option value="debt_out">Qarz berdim</option>
                </select>

                <select
                    value={reportFilter.balanceId}
                    onChange={e => setReportFilter({ ...reportFilter, balanceId: e.target.value })}
                    className="flex-shrink-0 px-4 py-3 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl text-xs font-bold text-gray-500 outline-none"
                >
                    <option value="">Barcha hamyonlar</option>
                    {balances.map((b: any) => <option key={b.id} value={b.id}>{b.emoji} {b.title}</option>)}
                </select>
            </div>

            <div className="px-6 space-y-4">
                {transactions.length === 0 ? (
                    <div className="text-center py-20 text-gray-400 font-bold">Hech narsa topilmadi</div>
                ) : (
                    transactions.map((t: any) => (
                        <div key={t.id} className="card !p-4 bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 flex items-center gap-4 group">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 ${t.type === 'income' ? 'bg-emerald-50' : t.type === 'expense' ? 'bg-rose-50' : 'bg-orange-50'}`}>
                                {t.type === 'income' ? '💰' : t.type === 'expense' ? '💸' : '🤝'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-sm truncate dark:text-white">{t.description || t.category_name}</h4>
                                <p className="text-[10px] text-gray-400 dark:text-gray-600 font-bold uppercase truncate">
                                    {t.category_name} • {format(new Date(t.transaction_date), 'HH:mm')}
                                </p>
                            </div>
                            <div className="text-right flex flex-col items-end gap-1">
                                <p className={`font-black whitespace-nowrap ${t.type === 'income' || t.type === 'debt_in' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                    {t.type === 'income' || t.type === 'debt_in' ? '+' : '-'}{t.amount.toLocaleString()}
                                </p>
                                <button onClick={() => deleteTxMutation.mutate(t.id)} className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-rose-500 transition-all"><Trash2 size={14} /></button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );

    const renderDebts = () => (
        <div className="space-y-6 animate-in slide-in-from-right duration-500 p-6 pb-32">
            <header className="flex items-center gap-4">
                <button onClick={() => setActiveTab('home')} className="p-2 dark:text-white"><ChevronLeft size={24} /></button>
                <h1 className="text-2xl font-black dark:text-white">Qarzlar</h1>
            </header>

            <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-2xl">
                <button
                    onClick={() => setDebtTab('I_OWE')}
                    className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${debtTab === 'I_OWE' ? 'bg-white dark:bg-gray-700 shadow-sm dark:text-white' : 'text-gray-500'}`}
                >Berishim kerak</button>
                <button
                    onClick={() => setDebtTab('OWED_TO_ME')}
                    className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${debtTab === 'OWED_TO_ME' ? 'bg-white dark:bg-gray-700 shadow-sm dark:text-white' : 'text-gray-500'}`}
                >Olishim kerak</button>
            </div>

            <div className="card bg-white dark:bg-gray-900 border-none shadow-sm flex flex-col items-center py-8">
                <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">{activeCurrency}</span>
                <h2 className={`text-4xl font-black ${debtTab === 'I_OWE' ? 'text-rose-500' : 'text-emerald-500'}`}>
                    {debtTab === 'I_OWE'
                        ? (summary?.total_debt_to_give_uzs?.toLocaleString() || '0')
                        : (summary?.total_debt_to_receive_uzs?.toLocaleString() || '0')}
                </h2>
            </div>

            <div className="space-y-4">
                <h4 className="text-xs font-black uppercase text-gray-400 dark:text-gray-500 tracking-widest">
                    Qarzdorlar ro‘yxati ({debtContacts.length}ta)
                </h4>

                {debtContacts.length === 0 ? (
                    <div className="text-center py-10 text-gray-300 dark:text-gray-700 font-bold">Hozircha qarzlar yo'q</div>
                ) : debtContacts.map((c: any) => (
                    <div key={c.id} className="card !p-5 bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                <User size={24} />
                            </div>
                            <div>
                                <h4 className="font-bold text-sm dark:text-white">{c.name}</h4>
                                <p className={`font-black text-sm ${debtTab === 'I_OWE' ? 'text-rose-500' : 'text-emerald-500'}`}>
                                    {debtTab === 'I_OWE' ? `- ${c.total_i_owe.toLocaleString()}` : c.total_owed_to_me.toLocaleString()} {c.currency}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button className="p-2 text-gray-300 dark:text-gray-700"><MoreVertical size={20} /></button>
                            <button className="p-2 text-gray-300 dark:text-gray-700"><ChevronRight size={20} /></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderSettings = () => (
        <div className="space-y-6 animate-in slide-in-from-right duration-500 p-6 pb-32">
            <h1 className="text-2xl font-black mb-8 dark:text-white">Sozlamalar</h1>

            <div className="card !p-6 bg-white dark:bg-gray-900 border-none shadow-xl shadow-blue-50/30 dark:shadow-none flex items-center gap-4 mb-8">
                <div className="w-16 h-16 rounded-[24px] bg-blue-600 text-white flex items-center justify-center text-2xl font-bold">
                    {profile?.data?.first_name?.[0] || 'F'}
                </div>
                <div>
                    <h3 className="font-black text-lg dark:text-white">{profile?.data?.first_name || 'Foydalanuvchi'}</h3>
                    <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-1 rounded-full inline-block mt-1 uppercase">
                        Obuna: 7 kun qoldi
                    </p>
                </div>
            </div>

            <div className="space-y-2">
                <button
                    onClick={() => setShowThemeModal(true)}
                    className="w-full flex items-center justify-between p-5 bg-white dark:bg-gray-900 rounded-3xl border border-gray-50 dark:border-gray-800 shadow-sm active:scale-[0.98] transition-all"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                            <Moon size={20} />
                        </div>
                        <span className="font-bold text-sm dark:text-gray-200">Mavzu</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-400 uppercase">
                            {themePreference === 'auto' ? 'Avto' : themePreference === 'light' ? 'Yorug‘' : 'Qorong‘i'}
                        </span>
                        <ChevronRight size={18} className="text-gray-300 dark:text-gray-700" />
                    </div>
                </button>

                {/* <button 
          // onClick={() => apiClient.exportToExcel(dateRange.start, dateRange.end)}
          className="w-full flex items-center justify-between p-5 bg-emerald-50 dark:bg-emerald-900/10 rounded-3xl border border-emerald-100 dark:border-emerald-900/30 shadow-sm text-emerald-700 dark:text-emerald-400 active:scale-[0.98] transition-all"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center">
              <Download size={20} />
            </div>
            <span className="font-bold text-sm">Hisobotni excel formatda yuklash</span>
          </div>
          <ChevronRight size={18} />
        </button> */}

                {[
                    { label: 'Profilni tahrirlash', icon: <User size={20} /> },
                    { label: 'Balanslar', icon: <Wallet size={20} />, onClick: () => setActiveTab('home') },
                    { label: 'Kategoriyalar', icon: <LayoutGrid size={20} /> },
                    // { label: 'Barcha ma’lumotlarni tozalash', icon: <Trash2 size={20} />, danger: true, onClick: async () => {
                    //   if(confirm('Ishonchingiz komilmi?')) { await apiClient.clearAllData(); window.location.reload(); }
                    // } },
                ].map((item, i) => (
                    <button key={i} onClick={item.onClick} className={`w-full flex items-center justify-between p-5 bg-white dark:bg-gray-900 rounded-3xl border border-gray-50 dark:border-gray-800 shadow-sm active:scale-[0.98] transition-all ${item.danger ? 'text-rose-500' : 'dark:text-gray-200'}`}>
                        <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${item.danger ? 'bg-rose-50 dark:bg-rose-900/20' : 'bg-gray-50 dark:bg-gray-800 text-gray-400'}`}>
                                {item.icon}
                            </div>
                            <span className="font-bold text-sm">{item.label}</span>
                        </div>
                        <ChevronRight size={18} className="text-gray-300 dark:text-gray-700" />
                    </button>
                ))}
            </div>
        </div>
    );

    return (
        <div className="pb-28 max-w-xl mx-auto min-h-screen">
            {activeTab === 'home' && renderHome()}
            {activeTab === 'stats' && renderStats()}
            {activeTab === 'reports' && renderReports()}
            {activeTab === 'settings' && renderSettings()}
            {activeTab === 'debts' && renderDebts()}

            <nav className="fixed bottom-0 left-0 right-0 z-50 px-6 pb-6">
                <div className="max-w-xl mx-auto flex items-center justify-between bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-[32px] p-3 shadow-2xl dark:shadow-none border border-white dark:border-gray-800">
                    {[
                        { id: 'home', icon: <HomeIcon size={24} /> },
                        { id: 'stats', icon: <BarChart2 size={24} /> },
                        { id: 'add', icon: <div className="w-14 h-14 bg-blue-600 rounded-[22px] flex items-center justify-center text-white shadow-xl"><Plus size={32} /></div> },
                        { id: 'reports', icon: <FileText size={24} /> },
                        { id: 'settings', icon: <User size={24} /> },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => tab.id === 'add' ? openAddModal('expense') : setActiveTab(tab.id as any)}
                            className={`flex flex-col items-center justify-center transition-all ${tab.id === 'add' ? 'mb-8' : activeTab === tab.id ? 'text-blue-600 dark:text-blue-400 w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-2xl' : 'text-gray-300 dark:text-gray-600 w-12 h-12'
                                }`}
                        >
                            {tab.icon}
                        </button>
                    ))}
                </div>
            </nav>

            <AddTransactionModal
                isOpen={showAddTxModal}
                onClose={() => setShowAddTxModal(false)}
                type={txModalType as any}
                categories={categories}
                balances={balances}
                onAdd={(data) => addTxMutation.mutate(data)}
            />

            <TransferModal
                isOpen={showTransferModal}
                onClose={() => setShowTransferModal(false)}
                balances={balances}
                onTransfer={(data) => apiClient.createTransfer(data).then(() => {
                    queryClient.invalidateQueries({ queryKey: ['balances'] });
                    queryClient.invalidateQueries({ queryKey: ['transactions'] });
                    setShowTransferModal(false);
                })}
            />
            <BalanceModal
                isOpen={showBalanceModal}
                onClose={() => setShowBalanceModal(false)}
                onAdd={(data) => apiClient.createBalance(data).then(() => {
                    queryClient.invalidateQueries({ queryKey: ['balances'] });
                    setShowBalanceModal(false);
                })}
            />

            <ThemeChoiceModal
                isOpen={showThemeModal}
                onClose={() => setShowThemeModal(false)}
                currentPreference={themePreference}
                onSelect={setThemePreference}
            />

            {summary && transactions && (
                <FinancialAssistant summary={summary as any} transactions={transactions} />
            )}
        </div>
    );
};

export default PersonalDashboard;
