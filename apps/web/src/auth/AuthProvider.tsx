import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthClient, SessionUser } from './client';

type AuthState = {
  client: AuthClient;
  /** `undefined` until the persisted session has been restored. */
  user: SessionUser | null | undefined;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ client, children }: { client: AuthClient; children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);

  useEffect(() => client.subscribe(setUser), [client]);

  const value = useMemo(() => ({ client, user }), [client, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
