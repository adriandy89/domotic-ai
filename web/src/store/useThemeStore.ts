import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'dark' | 'light' | 'system';

interface ThemeState {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set) => ({
            theme: 'system',
            setTheme: (theme) => {
                const root = window.document.documentElement;

                if (theme === 'system') {
                    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
                        .matches
                        ? 'dark'
                        : 'light';
                    root.setAttribute('data-theme', systemTheme);
                } else {
                    root.setAttribute('data-theme', theme);
                }
                set({ theme });
            },
        }),
        {
            name: 'theme-storage',
            onRehydrateStorage: () => (state) => {
                if (state) {
                    const root = window.document.documentElement;
                    if (state.theme === 'system') {
                        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                        root.setAttribute('data-theme', systemTheme);
                    } else {
                        root.setAttribute('data-theme', state.theme);
                    }
                }
            }
        }
    )
);
