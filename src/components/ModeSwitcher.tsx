
import React from 'react';

interface ModeSwitcherProps {
    currentMode: 'personal' | 'construction';
    onSwitch: (mode: 'personal' | 'construction') => void;
}

const ModeSwitcher: React.FC<ModeSwitcherProps> = ({ currentMode, onSwitch }) => {
    return (
        <div className="fixed top-4 left-4 z-50 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm p-1 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 flex gap-1">
            <button
                onClick={() => onSwitch('personal')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${currentMode === 'personal'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
            >
                👤 Personal
            </button>
            <button
                onClick={() => onSwitch('construction')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${currentMode === 'construction'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
            >
                🏗️ Construction
            </button>
        </div>
    );
};

export default ModeSwitcher;
