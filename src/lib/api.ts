import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL && import.meta.env.VITE_API_URL.includes('http')
    ? import.meta.env.VITE_API_URL
    : '/api'; // Default to relative path for same-domain deployment

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
        start_date?: string;
        end_date?: string;
    }) => api.get('/api/transactions', { params }),

    createTransaction: (data: {
        type: string;
        amount: number;
        category_id?: number;
        description?: string;
        transaction_date?: string;
    }) => api.post('/api/transactions', data),

    deleteTransaction: (id: number) => api.delete(`/api/transactions/${id}`),

    // Analytics endpoints
    getSummary: (days: number = 30) => api.get('/api/analytics/summary', { params: { days } }),

    getCategoryBreakdown: (days: number = 30) => api.get('/api/analytics/by-category', { params: { days } }),

    // Category endpoints
    getCategories: (type?: string) => api.get('/api/categories', { params: { type } }),
};

export default apiClient;
