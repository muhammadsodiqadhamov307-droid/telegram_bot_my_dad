import axios from 'axios';

const ENV_API_URL = import.meta.env.VITE_API_URL;

// Fix: Strip trailing '/api' if present to avoid double /api/api/ prefixes
// because our individual endpoints (e.g. '/api/transactions') already include it.
const API_BASE_URL = ENV_API_URL && ENV_API_URL.includes('http')
    ? (ENV_API_URL.endsWith('/api') ? ENV_API_URL.slice(0, -4) : ENV_API_URL)
    : ''; // Default to empty (relative) instead of '/api' to avoid /api/api/

const FINAL_URL = API_BASE_URL;

// Debug logging system
export const debugLogs: string[] = [];
const listeners: (() => void)[] = [];

export const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    debugLogs.unshift(`[${timestamp}] ${message}`);
    if (debugLogs.length > 50) debugLogs.pop();
    listeners.forEach(l => l());
};

export const subscribeLogs = (listener: () => void) => {
    listeners.push(listener);
    return () => {
        const index = listeners.indexOf(listener);
        if (index > -1) listeners.splice(index, 1);
    };
};

addLog(`Configured API URL: ${FINAL_URL}`);

// Get Telegram WebApp initData for authentication
// Get Telegram WebApp initData for authentication
// Get Telegram WebApp initData for authentication
function getAuthToken(): string {
    // Try multiple sources
    let token: string | undefined = window.Telegram?.WebApp?.initData;

    if (!token) {
        // Fallback: Check URL hash (sometimes initData is there)
        const hash = window.location.hash.slice(1);
        if (hash.includes('tgWebAppData=')) {
            token = new URLSearchParams(hash).get('tgWebAppData') || undefined;
        }
    }

    if (!token) {
        // DETAILED DEBUGGING
        const tgObj = !!window.Telegram;
        const webAppObj = !!window.Telegram?.WebApp;
        const initDataRaw = window.Telegram?.WebApp?.initData;
        const unsafe = JSON.stringify(window.Telegram?.WebApp?.initDataUnsafe || {});

        addLog(`WARNING: No initData! Win.Tg=${tgObj}, WebApp=${webAppObj}, Raw='${initDataRaw}'`);
        addLog(`Unsafe Data: ${unsafe}`);

        // Retry logic often needs to be in the component, but here we can return empty
        // The interceptor will log "Request sending without Token"
    }
    return token || '';
};

// Create axios instance
const api = axios.create({
    baseURL: FINAL_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add auth header to every request
api.interceptors.request.use((config) => {
    const token = getAuthToken();
    addLog(`Request: ${config.method?.toUpperCase()} ${config.url}`);
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    } else {
        addLog('Request sending without Token');
    }
    return config;
}, (error) => {
    addLog(`Req Error: ${error.message}`);
    return Promise.reject(error);
});

api.interceptors.response.use((response) => {
    addLog(`Response: ${response.status} ${response.config.url}`);
    return response;
}, (error) => {
    if (error.response) {
        addLog(`Error ${error.response.status}: ${JSON.stringify(error.response.data)}`);
    } else {
        addLog(`Network Error: ${error.message}`);
    }
    return Promise.reject(error);
});

// API methods
export const apiClient = {
    // User endpoints
    getProfile: () => api.get('/api/user/profile'),

    // Transaction endpoints
    getTransactions: (params?: {
        skip?: number;
        limit?: number;
        type?: string;
        category_id?: number;
        startDate?: string;
        endDate?: string;
        mode?: 'personal' | 'construction';
    }) => {
        // Map frontend camelCase to backend snake_case if needed, 
        // but backend seems to expect start_date/end_date based on previous file content.
        // Let's check the previous file content again... 
        // Backend params were: start_date, end_date. 
        // Frontend uses: startDate, endDate.
        const queryParams = {
            ...params,
            start_date: params?.startDate,
            end_date: params?.endDate,
        };
        // Remove mapped keys if double sending is an issue, but usually fine.
        return api.get('/api/transactions', { params: queryParams });
    },

    createTransaction: (data: {
        type: string;
        amount: number;
        category_id?: number;
        description?: string;
        transaction_date?: string;
    }) => api.post('/api/transactions', data),

    deleteTransaction: (id: number, type?: string) => api.delete(`/api/transactions/${id}`, { params: { type } }),

    // Analytics endpoints
    getSummary: (days: number = 30) => api.get('/api/analytics/summary', { params: { days } }),

    getCategoryBreakdown: (days: number = 30) => api.get('/api/analytics/by-category', { params: { days } }),

    // Category endpoints
    getCategories: (type?: string) => api.get('/api/categories', { params: { type } }),

    // Balances
    getBalances: () => api.get('/api/balances'),
    createBalance: (data: { title: string; currency: string; amount: number; color?: string; emoji?: string }) => api.post('/api/balances', data),

    // Debts
    getDebtContacts: (_tab?: 'I_OWE' | 'OWED_TO_ME', currency?: 'UZS' | 'USD') => api.get('/api/debts/contacts', { params: { currency } }), // Backend filters by currency, tab filtering is done on frontend or we can improve backend.
    // The reference implementation did filtering on frontend. Backend returns list with totals. 
    // We can just fetch all or filter by currency. 
    // Let's match backend: /api/debts/contacts?currency=...

    createDebtLedger: (data: {
        contact_id?: number;
        name?: string;
        type: 'BORROW' | 'LEND' | 'REPAY' | 'RECEIVE';
        amount: number;
        currency: string;
        date?: string;
        note?: string
    }) => api.post('/api/debts/ledger', data),

    // Transfers
    createTransfer: (data: {
        from_balance_id: number;
        to_balance_id: number;
        amount: number;
        fee?: number;
        date?: string;
    }) => api.post('/api/transfers', data),

    // Profile Mode
    updateProfileMode: (mode: 'personal' | 'construction') => api.post('/api/user/mode', { mode }),
};

export const { getProfile, updateProfileMode } = apiClient;

export default apiClient;
