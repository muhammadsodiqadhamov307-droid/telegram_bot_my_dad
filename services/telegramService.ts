
import { Transaction, TransactionType, UserStats } from "../types";
import { formatCurrency } from "./storageService";

export const sendReportToTelegram = async (userId: number, stats: UserStats, transactions: Transaction[]): Promise<boolean> => {
  const date = new Date().toLocaleDateString('uz-UZ');

  let message = `📊 *Moliya Hisoboti (${date})*\n\n`;
  message += `💰 *Jami Balans:* ${formatCurrency(stats.balance)}\n`;
  message += `📈 *Daromad:* ${formatCurrency(stats.totalIncome)}\n`;
  message += `📉 *Xarajat:* ${formatCurrency(stats.totalExpense)}\n\n`;

  if (transactions.length > 0) {
    message += `📝 *Oxirgi amallar:*\n`;
    transactions.slice(0, 10).forEach(t => {
      const icon = t.type === TransactionType.INCOME ? '✅' : '❌';
      message += `${icon} ${t.description}: ${formatCurrency(t.amount)}\n`;
    });
  } else {
    message += `📭 Hozircha amallar mavjud emas.`;
  }

  try {
    const response = await fetch('/api/send-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        message
      })
    });
    return response.ok;
  } catch (error) {
    console.error('Report sending error:', error);
    return false;
  }
};
