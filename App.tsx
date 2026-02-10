
import React, { useEffect, useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { IncomeForm } from './components/IncomeForm';
import { getUserData, addIncome, getHistory, generateReport } from './api';

// Telegram User Interface
interface TelegramUser {
  id: number;
  first_name: string;
  username?: string;
}

function App() {
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [balance, setBalance] = useState(0);
  const [income, setIncome] = useState(0);
  const [expense, setExpense] = useState(0);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initialize Telegram Web App
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      // Use Telegram user data or fallback for testing if user is undefined (e.g. browser)
      const telegramUser = tg.initDataUnsafe?.user || { id: 123456789, first_name: 'TestUser' };
      setUser(telegramUser);
      fetchData(telegramUser.id);
    }
  }, []);

  const fetchData = async (userId: number) => {
    setLoading(true);
    try {
      const data = await getUserData(userId);
      setBalance(data.balance);
      setIncome(data.totalIncome);
      setExpense(data.totalExpense);

      const hist = await getHistory(userId);
      setHistory(hist);
    } catch (error) {
      console.error("Failed to load data", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddIncome = async (amount: number, description: string) => {
    if (!user) return;
    try {
      await addIncome(user.id, amount, description);
      // Refresh data
      await fetchData(user.id);
      // Show success via HapticFeedback (optional)
      (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
    } catch (e) {
      console.error(e);
      (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error');
    }
  };

  const handleDownloadReport = () => {
    if (user) generateReport(user.id);
  };

  if (loading && !user) return <div className="flex h-screen items-center justify-center text-slate-500">Yuklanmoqda...</div>;

  return (
    <div className="container mx-auto max-w-md p-4 space-y-6 pb-20">
      {/* Header */}
      <header className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <img src="https://cdn-icons-png.flaticon.com/512/2382/2382461.png" className="w-10 h-10" alt="Logo" />
          <div>
            <h1 className="text-xl font-bold text-slate-800">PulNazorat</h1>
            <p className="text-sm text-slate-500">Salom, {user?.first_name}!</p>
          </div>
        </div>
      </header>

      <Dashboard
        balance={balance}
        income={income}
        expense={expense}
        onRefresh={() => user && fetchData(user.id)}
      />

      <IncomeForm onSubmit={handleAddIncome} />

      {/* Actions for Report */}
      <button
        onClick={handleDownloadReport}
        className="w-full bg-indigo-50 text-indigo-600 font-semibold py-3 rounded-xl hover:bg-indigo-100 transition flex items-center justify-center gap-2"
      >
        📄 PDF Hisobot yuklab olish
      </button>

      {/* Recent History */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
        <h3 className="font-semibold mb-4 text-slate-800">Oxirgi amaliyotlar</h3>
        <div className="space-y-4">
          {history.length === 0 ? (
            <p className="text-center text-slate-400 py-4">Hozircha ma'lumot yo'q</p>
          ) : (
            history.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                <div>
                  <p className="font-medium text-slate-800">{item.description}</p>
                  <p className="text-xs text-slate-400">{new Date(item.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`font-bold ${item.type === 'income' ? 'text-emerald-500' : 'text-red-500'}`}>
                  {item.type === 'income' ? '+' : '-'}{item.amount.toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
