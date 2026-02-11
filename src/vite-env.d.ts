/// <reference types="vite/client" />

interface Window {
    Telegram: {
        WebApp: {
            initData: string;
            initDataUnsafe: any;
            colorScheme: 'light' | 'dark';
            themeParams: any;
            ready: () => void;
            expand: () => void;
            close: () => void;
            HapticFeedback: {
                impactOccurred: (style: 'light' | 'medium' | 'heavy') => void;
                notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
                selectionChanged: () => void;
            };
        };
    };
}

interface ImportMetaEnv {
    readonly VITE_API_URL: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
