
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Moon, Sun, Monitor, Check } from 'lucide-react';
import { ThemePreference } from '../../../types';

interface ThemeChoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentPreference: ThemePreference;
    onSelect: (pref: ThemePreference) => void;
}

const ThemeChoiceModal: React.FC<ThemeChoiceModalProps> = ({ isOpen, onClose, currentPreference, onSelect }) => {
    const options: { id: ThemePreference; label: string; icon: React.ReactNode }[] = [
        { id: 'auto', label: 'Avto (Tizim)', icon: <Monitor size={20} /> },
        { id: 'light', label: 'Yorug‘', icon: <Sun size={20} /> },
        { id: 'dark', label: 'Qorong‘i', icon: <Moon size={20} /> },
    ];

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-md"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-t-[40px] p-8 shadow-2xl"
                    >
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-xl font-black dark:text-white">Mavzu tanlash</h3>
                            <button onClick={onClose} className="p-2 bg-gray-50 dark:bg-gray-800 rounded-full dark:text-gray-400">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-3">
                            {options.map((opt) => (
                                <button
                                    key={opt.id}
                                    onClick={() => {
                                        onSelect(opt.id);
                                        onClose();
                                    }}
                                    className={`w-full flex items-center justify-between p-5 rounded-3xl border transition-all active:scale-[0.98] ${currentPreference === opt.id
                                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400'
                                            : 'bg-white dark:bg-gray-800 border-gray-50 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                                        }`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${currentPreference === opt.id ? 'bg-blue-100 dark:bg-blue-800/40 text-blue-600' : 'bg-gray-50 dark:bg-gray-700/50 text-gray-400'
                                            }`}>
                                            {opt.icon}
                                        </div>
                                        <span className="font-bold text-sm">{opt.label}</span>
                                    </div>
                                    {currentPreference === opt.id && <Check size={20} />}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default ThemeChoiceModal;
