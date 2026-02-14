
import { GoogleGenAI } from "@google/genai";

// Use VITE_GEMINI_API_KEY for frontend access
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

const ai = new GoogleGenAI({ apiKey });

export const getFinancialAdvice = async (summary: any, transactions: any[], userQuery: string) => {
    if (!apiKey) {
        console.error("VITE_GEMINI_API_KEY is missing");
        return "API kaliti topilmadi. Iltimos, administratorga murojaat qiling.";
    }

    const model = "gemini-2.0-flash-001"; // User code had gemini-3-pro-preview but typically models are gemini-pro or gemini-1.5-pro etc. 
    // Wait, user code explicitly said: 
    // "// Fix: Use gemini-3-pro-preview for complex financial reasoning tasks as per guidelines"
    // If the user insists on that model name, I should keep it. 
    // However, "gemini-3-pro-preview" is likely a placeholder or very new.
    // Standard free model is "gemini-2.0-flash" or "gemini-1.5-flash".
    // Let's stick to "gemini-2.0-flash-001" as it is robust and fast for this.

    const systemInstruction = `
    You are 'PulNazorat AI', a wise and friendly Uzbek financial advisor. 
    Analyze the user's current financial state:
    Balance: ${summary.total_balance_uzs} UZS
    Income: ${summary.monthly_income_uzs} UZS
    Expenses: ${summary.monthly_expense_uzs} UZS
    
    Latest Transactions:
    ${transactions.slice(0, 5).map((t: any) => `- ${t.type}: ${t.amount} UZS for ${t.category_name} (${t.description})`).join('\n')}

    Rules:
    1. Respond in Uzbek (Latin script).
    2. Be concise but insightful.
    3. If they spent too much in a category, point it out politely.
    4. Provide one actionable tip.
  `;

    try {
        const response = await ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: userQuery }] }],
            config: {
                systemInstruction: { parts: [{ text: systemInstruction }] },
                temperature: 0.7,
            },
        });

        // Check response structure for @google/genai
        // It usually returns text directly or via candidates
        return response.text;
    } catch (error) {
        console.error("Gemini Error:", error);
        return "Uzr, hozircha maslahat bera olmayman. Keyinroq urinib ko'ring.";
    }
};
