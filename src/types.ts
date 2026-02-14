export type TransactionType = 'income' | 'expense' | 'debt_in' | 'debt_out';
export type Currency = 'UZS' | 'USD';
export type ThemePreference = 'auto' | 'light' | 'dark';

export interface Balance {
    id: number;
    title: string;
    emoji: string;
    color: string;
    currency: Currency;
    amount: number;
    limit_enabled: boolean; // Optional in DB, enforced in UI?
    limit_amount?: number;
    created_at?: string;
}

export interface Transaction {
    id: number;
    type: TransactionType;
    amount: number;
    currency: Currency;
    balance_id?: number;
    project_id?: number;
    category_id?: number;
    category_name?: string;
    description?: string;
    transaction_date: string;
    created_at: string;
    contact_id?: number;
    color?: string; // For UI
    icon?: string; // For UI
}

export interface Category {
    id: number;
    name: string;
    type: TransactionType;
    icon: string;
    color: string;
    is_default?: boolean;
}

export interface DebtContact {
    id: number;
    name: string;
    currency: Currency;
    total_i_owe: number;
    total_owed_to_me: number;
    created_at?: string;
}

export interface DebtEntry {
    id: number;
    contact_id: number;
    type: 'BORROW' | 'LEND' | 'REPAY' | 'RECEIVE';
    amount: number;
    currency: Currency;
    date: string;
    note?: string;
}

export interface Transfer {
    id: number;
    from_balance_id: number;
    to_balance_id: number;
    amount: number;
    fee: number;
    date: string;
    note?: string;
}

export interface Summary {
    total_balance_uzs: number;
    total_balance_usd: number;
    total_debt_to_receive_uzs: number;
    total_debt_to_give_uzs: number;
    monthly_income_uzs: number;
    monthly_expense_uzs: number;
    category_breakdown: { category: string; amount: number; color: string; percentage: number }[];
}

export interface UserProfile {
    telegram_id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    active_mode?: 'personal' | 'construction';
    subscription_end_date?: string;
}

export interface TransactionFilter {
    skip?: number;
    limit?: number;
    type?: string;
    category_id?: number;
    startDate?: string;
    endDate?: string;
    mode?: 'personal' | 'construction';
}
