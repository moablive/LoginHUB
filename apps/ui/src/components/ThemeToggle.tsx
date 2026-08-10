import { useEffect, useState } from 'react';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' ||
        (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  return (
    <button
      onClick={() => setIsDark(!isDark)}
      className="fixed bottom-6 right-6 p-3 rounded-full shadow-lg transition-colors duration-200 z-50
                 bg-card text-foreground hover:bg-muted border border-border"
      title="Toggle Dark Mode"
    >
      {isDark ? (
        <SunIcon className="h-6 w-6 text-amber-400" />
      ) : (
        <MoonIcon className="h-6 w-6" />
      )}
    </button>
  );
}
