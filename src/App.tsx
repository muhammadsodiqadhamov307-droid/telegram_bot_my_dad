import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from './pages/Dashboard';
import './index.css';
import { debugLogs, subscribeLogs, addLog } from './lib/api';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            retry: 1,
        },
    },
});

function DebugConsole() {
    const [isOpen, setIsOpen] = useState(false);
    const [logs, setLogs] = useState<string[]>(debugLogs);

    useEffect(() => {
        return subscribeLogs(() => setLogs([...debugLogs]));
    }, []);

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-4 right-4 z-50 bg-red-500 text-white p-2 rounded-full shadow-lg opacity-50 hover:opacity-100"
                style={{ width: '40px', height: '40px' }}
            >
                🐞
            </button>
        );
    }

    return (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-90 text-green-400 font-mono text-xs p-4 overflow-auto">
            <div className="flex justify-between items-center mb-4 border-b border-green-800 pb-2">
                <h3 className="font-bold text-white">Debug Console</h3>
                <button
                    onClick={() => setIsOpen(false)}
                    className="bg-gray-800 text-white px-3 py-1 rounded"
                >
                    Close
                </button>
            </div>
            <div className="space-y-1">
                {logs.map((log, i) => (
                    <div key={i} className="break-words border-b border-gray-800 pb-1">
                        {log}
                    </div>
                ))}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-700">
                <p className="text-white">API URL: {import.meta.env.VITE_API_URL}</p>
                <p className="text-white break-all">InitData: {window.Telegram?.WebApp?.initData?.substring(0, 50)}...</p>
                <button
                    onClick={() => window.location.reload()}
                    className="mt-4 bg-blue-600 text-white px-4 py-2 rounded w-full"
                >
                    Reload App
                </button>
            </div>
        </div>
    );
}

function App() {
    const [theme, setTheme] = useState<'light' | 'dark'>('light');

    useEffect(() => {
        const tgTheme = window.Telegram?.WebApp?.colorScheme || 'light';
        setTheme(tgTheme);
        window.Telegram?.WebApp?.ready();
        window.Telegram?.WebApp?.expand();

        // Log startup
        addLog('App Started');
        addLog(`UA: ${navigator.userAgent}`);

        // Global error handler
        window.onerror = (msg, _url, line) => {
            addLog(`JS Error: ${msg} (${line})`);
            return false;
        };
    }, []);

    return (
        <QueryClientProvider client={queryClient}>
            <div className={`min-h-screen ${theme === 'dark' ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
                <Dashboard />
                <DebugConsole />
            </div>
        </QueryClientProvider>
    );
}

export default App;
