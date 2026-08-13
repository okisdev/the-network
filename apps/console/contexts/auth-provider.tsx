"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { ApiError, api } from "@/lib/api";

const AUTH_STATUS_QUERY_KEY = ["auth-status"] as const;
const FALLBACK_AUTH_STATUS = { enabled: false, authenticated: true };

interface AuthState {
  enabled: boolean;
  authenticated: boolean;
  ready: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, error, isFetched, refetch } = useQuery({
    queryKey: AUTH_STATUS_QUERY_KEY,
    queryFn: api.authStatus,
    refetchInterval: 60_000,
    retry: 1,
  });
  const status = error ? FALLBACK_AUTH_STATUS : (data ?? FALLBACK_AUTH_STATUS);

  useEffect(() => {
    return queryClient.getQueryCache().subscribe((event) => {
      const error = event.query.state.error;
      if (error instanceof ApiError && error.status === 401) {
        void queryClient.invalidateQueries({ queryKey: AUTH_STATUS_QUERY_KEY });
      }
    });
  }, [queryClient]);

  const login = useCallback(
    async (token: string) => {
      await api.login(token);
      await refetch({ throwOnError: true });
    },
    [refetch],
  );

  const logout = useCallback(async () => {
    await api.logout();
    await refetch({ throwOnError: true });
  }, [refetch]);

  const value = useMemo<AuthState>(
    () => ({
      enabled: status.enabled,
      authenticated: status.authenticated,
      ready: isFetched,
      login,
      logout,
    }),
    [isFetched, login, logout, status.authenticated, status.enabled],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthGate({ children, loginScreen }: { children: ReactNode; loginScreen: ReactNode }) {
  const { enabled, authenticated, ready } = useAuth();

  if (!ready) return <div className="min-h-dvh bg-background" />;
  if (enabled && !authenticated) return loginScreen;
  return children;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider.");
  return context;
}
