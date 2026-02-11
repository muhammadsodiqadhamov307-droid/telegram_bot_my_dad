// Transaction types
export interface Transaction {
    id: number;
    type: 'income' | 'expense';
    amount: number;
    category_id?: number;
    category_name?: string;
    description?: string;
    transaction_date: string;
    created_at: string;
}

export interface Category {
    id: number;
    name: string;
    type: 'income' | 'expense';
    icon: string;
    color: string;
    is_default: boolean;
}

export interface Summary {
    total_income: number;
    total_expense: number;
    balance: number;
    transaction_count: number;
}

export interface UserProfile {
    telegram_id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    currency: string;
    theme: string;
    language: string;
}
