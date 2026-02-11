import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL && import.meta.env.VITE_API_URL.includes('http')
    ? import.meta.env.VITE_API_URL
    : 'https://finance-bot-fast.duckdns.org/api';

// FORCE OVERRIDE for debugging if env var is wrong (e.g. IP address)
const FINAL_URL = API_BASE_URL.includes('35.170') ? 'https://finance-bot-fast.duckdns.org/api' : API_BASE_URL;

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
function getAuthToken(): string {
    const token = window.Telegram?.WebApp?.initData || '';
    if (!token) addLog('WARNING: No initData found!');
    return token;
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
