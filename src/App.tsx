import { useState, useEffect, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ConstructionDashboard from './modes/construction/Dashboard';
import PersonalDashboard from './modes/personal/Dashboard';
import ModeSwitcher from './components/ModeSwitcher';
import './index.css';
import { debugLogs, subscribeLogs, addLog, getProfile, updateProfileMode } from './lib/api';
import { ThemePreference } from './types';

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
    const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
        return (localStorage.getItem('hisobchi_theme_pref') as ThemePreference) || 'auto';
    });

    const [tgColorScheme, setTgColorScheme] = useState<'light' | 'dark'>('light');
    const [activeMode, setActiveMode] = useState<'personal' | 'construction'>('construction');

    useEffect(() => {
        const tg = (window as any).Telegram?.WebApp;
        if (tg) {
            tg.ready();
            tg.expand();
            setTgColorScheme(tg.colorScheme || 'light');

            const handleThemeChange = () => {
                setTgColorScheme(tg.colorScheme || 'light');
            };

            tg.onEvent('themeChanged', handleThemeChange);
        } else {
            // Fallback for browser testing
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            setTgColorScheme(mediaQuery.matches ? 'dark' : 'light');
            const listener = (e: MediaQueryListEvent) => setTgColorScheme(e.matches ? 'dark' : 'light');
            mediaQuery.addEventListener('change', listener);
            return () => mediaQuery.removeEventListener('change', listener);
        }

        // Log startup
        addLog('App Started');
        addLog(`UA: ${navigator.userAgent}`);

        // Global error handler
        window.onerror = (msg, _url, line) => {
            addLog(`JS Error: ${msg} (${line})`);
            return false;
        };

        // Fetch User Profile to get Active Mode
        getProfile().then(response => {
            if (response.data && response.data.active_mode) {
                // Ensure valid mode
                const mode = response.data.active_mode;
                if (mode === 'personal' || mode === 'construction') {
                    setActiveMode(mode);
                    addLog(`Mode synced: ${mode}`);
                }
            }
        }).catch(err => {
            addLog(`Profile sync failed: ${err.message}`);
        });

    }, []);

    const effectiveTheme = useMemo(() => {
        if (themePreference === 'auto') return tgColorScheme;
        return themePreference;
    }, [themePreference, tgColorScheme]);

    useEffect(() => {
        localStorage.setItem('hisobchi_theme_pref', themePreference);
    }, [themePreference]);

    const handleModeSwitch = (mode: 'personal' | 'construction') => {
        setActiveMode(mode);
        updateProfileMode(mode).then(() => {
            addLog(`Mode persisted: ${mode}`);
        }).catch(err => {
            addLog(`Mode persist failed: ${err.message}`);
        });
    };

    return (
        <QueryClientProvider client={queryClient}>
            <div className={effectiveTheme === 'dark' ? 'dark' : ''}>
                <div className={`min-h-screen bg-[#FDFDFD] dark:bg-gray-950 text-gray-900 dark:text-gray-100 selection:bg-blue-100 dark:selection:bg-blue-900 transition-colors duration-300`}>
                    <ModeSwitcher currentMode={activeMode} onSwitch={handleModeSwitch} />
                    <div className="pt-16">
                        {activeMode === 'construction' ? (
                            <ConstructionDashboard />
                        ) : (
                            <PersonalDashboard
                                themePreference={themePreference}
                                setThemePreference={setThemePreference}
                            />
                        )}
                    </div>
                    <DebugConsole />
                </div>
            </div>
        </QueryClientProvider>
    );
}

export default App;
