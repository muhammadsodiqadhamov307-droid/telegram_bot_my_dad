
import React, { useState } from 'react';
import { Sparkles, Send, X, Bot } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getFinancialAdvice } from '../../../services/geminiService';
import { Summary, Transaction } from '../../../types';

interface FinancialAssistantProps {
    summary: Summary;
    transactions: Transaction[];
}

const FinancialAssistant: React.FC<FinancialAssistantProps> = ({ summary, transactions }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [chat, setChat] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
    const [loading, setLoading] = useState(false);

    const handleSend = async () => {
        if (!query.trim()) return;

        const userMsg = query;
        setChat(prev => [...prev, { role: 'user', content: userMsg }]);
        setQuery('');
        setLoading(true);

        const advice = await getFinancialAdvice(summary, transactions, userMsg);
        setChat(prev => [...prev, { role: 'assistant', content: advice || 'Uzr, xatolik yuz berdi.' }]);
        setLoading(false);
    };

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-tr from-indigo-600 to-violet-600 rounded-full flex items-center justify-center text-white shadow-xl hover:scale-110 active:scale-95 transition-all z-40"
            >
                <Sparkles size={24} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 100 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 100 }}
                        className="fixed inset-0 z-50 p-4 md:p-10 flex flex-col"
                    >
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsOpen(false)} />

                        <div className="relative flex-1 bg-white dark:bg-gray-900 rounded-3xl overflow-hidden flex flex-col shadow-2xl max-w-lg mx-auto w-full border border-gray-100 dark:border-gray-800">
                            {/* Header */}
                            <div className="p-6 bg-indigo-600 text-white flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Bot size={28} />
                                    <div>
                                        <h3 className="font-bold">Moliya Assistant</h3>
                                        <p className="text-xs opacity-80">Gemini 3 Flash tomonidan boshqariladi</p>
                                    </div>
                                </div>
                                <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/10 rounded-full">
                                    <X size={24} />
                                </button>
                            </div>

                            {/* Chat Body */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar bg-gray-50 dark:bg-gray-900/50">
                                {chat.length === 0 && (
                                    <div className="text-center py-10">
                                        <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600">
                                            <Sparkles size={32} />
                                        </div>
                                        <p className="text-gray-500 text-sm">Moliyaviy holatingiz bo'yicha savol bering...</p>
                                        <div className="mt-4 flex flex-wrap gap-2 justify-center">
                                            {['Mening xarajatlarim qanday?', 'Qanday qilib tejash mumkin?', 'Budget tahlili'].map(t => (
                                                <button
                                                    key={t}
                                                    onClick={() => setQuery(t)}
                                                    className="px-3 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs hover:border-indigo-400 transition-colors"
                                                >
                                                    {t}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {chat.map((msg, i) => (
                                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[85%] p-4 rounded-2xl ${msg.role === 'user'
                                                ? 'bg-indigo-600 text-white rounded-br-none'
                                                : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-bl-none shadow-sm'
                                            }`}>
                                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                        </div>
                                    </div>
                                ))}
                                {loading && (
                                    <div className="flex justify-start">
                                        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 rounded-2xl rounded-bl-none shadow-sm flex gap-1">
                                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Input Area */}
                            <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
                                <div className="flex gap-2">
                                    <input
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                                        placeholder="Savol bering..."
                                        className="flex-1 bg-gray-100 dark:bg-gray-800 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all dark:text-white"
                                    />
                                    <button
                                        onClick={handleSend}
                                        disabled={loading || !query.trim()}
                                        className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 active:scale-90 transition-all disabled:opacity-50"
                                    >
                                        <Send size={20} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default FinancialAssistant;
