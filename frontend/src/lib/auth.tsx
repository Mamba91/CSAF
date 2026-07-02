import { createContext, useContext, useState, type ReactNode } from 'react';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  isAdmin: boolean;
}

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  login: (user: AuthUser, token: string) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue>({
  user: null, token: null,
  login: () => {}, logout: () => {},
});

function loadStored(): { user: AuthUser | null; token: string | null } {
  try {
    const token = localStorage.getItem('auth_token');
    const raw = localStorage.getItem('auth_user');
    if (token && raw) return { token, user: JSON.parse(raw) };
  } catch { /* ignore */ }
  return { user: null, token: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const stored = loadStored();
  const [user, setUser] = useState<AuthUser | null>(stored.user);
  const [token, setToken] = useState<string | null>(stored.token);

  function login(u: AuthUser, t: string) {
    localStorage.setItem('auth_token', t);
    localStorage.setItem('auth_user', JSON.stringify(u));
    setUser(u);
    setToken(t);
  }

  function logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setUser(null);
    setToken(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
