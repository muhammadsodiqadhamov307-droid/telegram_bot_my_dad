
const API_URL = import.meta.env.VITE_API_URL || '/api';

export async function getUserData(telegramId: number) {
    const response = await fetch(`${API_URL}/user/${telegramId}`);
    if (!response.ok) throw new Error('Failed to fetch user data');
    return response.json();
}

export async function addIncome(telegramId: number, amount: number, description: string) {
    const response = await fetch(`${API_URL}/income`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId, amount, description }),
    });
    if (!response.ok) throw new Error('Failed to add income');
    return response.json();
}

export async function getHistory(telegramId: number) {
    const response = await fetch(`${API_URL}/history/${telegramId}`);
    if (!response.ok) throw new Error('Failed to fetch history');
    return response.json();
}

export async function generateReport(telegramId: number) {
    window.location.href = `${API_URL}/report/${telegramId}`;
}
