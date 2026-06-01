'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type UserRole = 'owner' | 'viewer';

export interface LocalUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
}

interface AuthContextType {
  user: LocalUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  isAllowedUser: boolean;
  userRole: UserRole;
  isOwner: boolean;
  isViewer: boolean;
  isUsingDefaultPassword: boolean;
  authConfigured: boolean;
}

const localUser: LocalUser = {
  uid: 'local-admin',
  email: 'local@trading-journal.app',
  displayName: 'Local Admin',
  photoURL: null,
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
  refresh: async () => {},
  isAllowedUser: false,
  userRole: 'owner',
  isOwner: false,
  isViewer: false,
  isUsingDefaultPassword: false,
  authConfigured: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUsingDefaultPassword, setIsUsingDefaultPassword] = useState(false);
  const [authConfigured, setAuthConfigured] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      const data = await res.json();
      setUser(data.authenticated ? localUser : null);
      setIsUsingDefaultPassword(Boolean(data.isUsingDefaultPassword));
      setAuthConfigured(data.authConfigured !== false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    window.location.href = '/login';
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signOut,
        refresh,
        isAllowedUser: Boolean(user),
        userRole: 'owner',
        isOwner: Boolean(user),
        isViewer: false,
        isUsingDefaultPassword,
        authConfigured,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
