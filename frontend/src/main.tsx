import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LangProvider } from './lib/i18n.tsx';
import { ThemeProvider } from './lib/theme.tsx';
import { AuthProvider } from './lib/auth.tsx';
import { ToastProvider } from './lib/toast.tsx';
import { ImportProgressProvider } from './lib/importProgress.tsx';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <LangProvider>
        <AuthProvider>
          <ToastProvider>
            <ImportProgressProvider>
              <App />
            </ImportProgressProvider>
          </ToastProvider>
        </AuthProvider>
      </LangProvider>
    </ThemeProvider>
  </React.StrictMode>
);
