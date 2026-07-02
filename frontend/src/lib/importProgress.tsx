import { createContext, useContext, useRef, useState, type ReactNode } from 'react';

type State = { active: boolean; done: number; total: number; label: string };

type Ctx = State & {
  startImport: (total: number, label?: string) => void;
  tick: () => void;
  endImport: () => void;
};

const ImportProgressContext = createContext<Ctx>({
  active: false, done: 0, total: 0, label: '',
  startImport: () => {}, tick: () => {}, endImport: () => {},
});

export function ImportProgressProvider({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<State>({ active: false, done: 0, total: 0, label: '' });
  const timer = useRef<ReturnType<typeof setTimeout>>();

  function startImport(total: number, label = '') {
    clearTimeout(timer.current);
    setSt({ active: true, done: 0, total, label });
  }

  function tick() {
    setSt((s) => ({ ...s, done: s.done + 1 }));
  }

  function endImport() {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSt({ active: false, done: 0, total: 0, label: '' });
    }, 2500);
  }

  return (
    <ImportProgressContext.Provider value={{ ...st, startImport, tick, endImport }}>
      {children}
    </ImportProgressContext.Provider>
  );
}

export function useImportProgress() {
  return useContext(ImportProgressContext);
}
