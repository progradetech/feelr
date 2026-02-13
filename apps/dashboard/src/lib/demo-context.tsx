'use client';

import { createContext, use, useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'feelr_demo_mode';

interface DemoContextValue {
  isDemo: boolean;
  enterDemo: () => void;
  exitDemo: () => void;
}

export const DemoContext = createContext<DemoContextValue>({
  isDemo: false,
  enterDemo: () => {},
  exitDemo: () => {},
});

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [isDemo, setIsDemo] = useState(() =>
    typeof window === 'undefined'
      ? false
      : sessionStorage.getItem(STORAGE_KEY) === 'true',
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isDemo) {
      sessionStorage.setItem(STORAGE_KEY, 'true');
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, [isDemo]);

  const enterDemo = useCallback(() => setIsDemo(true), []);
  const exitDemo = useCallback(() => setIsDemo(false), []);

  return (
    <DemoContext value={{ isDemo, enterDemo, exitDemo }}>
      {children}
    </DemoContext>
  );
}

export function useDemo(): DemoContextValue {
  return use(DemoContext);
}
