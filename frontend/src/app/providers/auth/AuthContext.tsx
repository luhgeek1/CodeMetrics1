import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/shared/api";
import {
  apiPublic,
  setAccessToken as setAxiosAccessToken,
  setUnauthorizedHandler as setAxiosUnauthorizedHandler,
  setCsrfMissingHandler as setAxiosCsrfMissingHandler
} from "@/shared/api/axiosInstance";
import { resolveCsrfToken } from "@/shared/lib/csrf";
import { AuthContext } from "./AuthContextObject";
import type { AuthContextValue, AuthCredentials, AuthTokens, AuthUser } from "@/entities/auth/model";

const SKIP_SESSION_RESTORE_STORAGE_KEY = "auth:skip-session-restore";

const readSkipSessionRestoreFlag = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.sessionStorage.getItem(SKIP_SESSION_RESTORE_STORAGE_KEY) === "1";
  } catch (error) {
    console.warn("[Auth] Не удалось прочитать флаг пропуска восстановления сессии.", error);
    return false;
  }
};

const writeSkipSessionRestoreFlag = (value: boolean): void => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (value) {
      window.sessionStorage.setItem(SKIP_SESSION_RESTORE_STORAGE_KEY, "1");
    } else {
      window.sessionStorage.removeItem(SKIP_SESSION_RESTORE_STORAGE_KEY);
    }
  } catch (error) {
    console.warn("[Auth] Не удалось записать флаг пропуска восстановления сессии.", error);
  }
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const queryClient = useQueryClient();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(true);
  const [csrfWarning, setCsrfWarning] = useState<string | null>(null);
  const hasAttemptedSessionRestore = useRef<boolean>(false);
  const skipSessionRestoreRef = useRef<boolean>(readSkipSessionRestoreFlag());

  const clearSession = useCallback((): void => {
    setAccessToken(null);
    setAxiosAccessToken(null);
    queryClient.removeQueries({ queryKey: ["me"] });
  }, [queryClient]);

  const dismissCsrfWarning = useCallback((): void => {
    setCsrfWarning(null);
  }, []);

  const reportCsrfMissing = useCallback((): void => {
    // Скрываем баннер, чтобы не мешал на экране логина при отсутствии cookies
    setCsrfWarning(null);
  }, []);

  const setSkipSessionRestore = useCallback((value: boolean): void => {
    skipSessionRestoreRef.current = value;
    writeSkipSessionRestoreFlag(value);
  }, []);

  useEffect(() => {
    setAxiosAccessToken(accessToken);
  }, [accessToken]);

  useEffect(() => {
    setAxiosUnauthorizedHandler(clearSession);
    return () => setAxiosUnauthorizedHandler(null);
  }, [clearSession]);

  useEffect(() => {
    setAxiosCsrfMissingHandler(reportCsrfMissing);
    return () => setAxiosCsrfMissingHandler(null);
  }, [reportCsrfMissing]);

  useEffect(() => {
    if (accessToken) {
      setCsrfWarning(null);
      if (skipSessionRestoreRef.current) {
        setSkipSessionRestore(false);
      }
    }
  }, [accessToken, setSkipSessionRestore]);

  const {
    data: user,
    isLoading: isUserLoading,
    isError,
    error: userError
  } = useQuery<AuthUser>({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api.getMyProfile();
      } catch (error) {
        console.log("API profile fetch failed:", error);
        throw error;
      }
    },
    enabled: Boolean(accessToken),
    retry: 1
  });

  const loginMutation = useMutation<AuthTokens, unknown, AuthCredentials>({
    mutationFn: api.loginUser,
    onSuccess: (data) => {
      if (data?.access_token) {
        setAccessToken(data.access_token);
        setSkipSessionRestore(false);
      }
      queryClient.invalidateQueries({ queryKey: ["me"] });
    }
  });

  const registerMutation = useMutation<AuthTokens, unknown, AuthCredentials>({
    mutationFn: api.registerUser,
    onSuccess: (data) => {
      if (data?.access_token) {
        setAccessToken(data.access_token);
        setSkipSessionRestore(false);
      }
      queryClient.invalidateQueries({ queryKey: ["me"] });
    }
  });

  const logoutMutation = useMutation<void, unknown, void>({
    mutationFn: api.logoutUser,
    onSuccess: () => {
      clearSession();
      queryClient.clear();
    },
    onError: () => {
      clearSession();
      queryClient.clear();
    }
  });

  const handleLogout = useCallback((): void => {
    setSkipSessionRestore(true);
    logoutMutation.mutate();
  }, [logoutMutation, setSkipSessionRestore]);

  useEffect(() => {
    if (isError) {
      console.error("Ошибка useQuery('me'): Не удалось загрузить профиль. Выход из системы.", userError);
      clearSession();
    }
  }, [isError, userError, clearSession]);

  useEffect(() => {
    if (hasAttemptedSessionRestore.current) {
      return;
    }
    hasAttemptedSessionRestore.current = true;

    if (skipSessionRestoreRef.current) {
      console.log("[Auth] Пропускаем восстановление сессии после явного выхода.");
      setIsRestoringSession(false);
      return;
    }

    (async () => {
      try {
        const csrfToken = await resolveCsrfToken();

        if (!csrfToken) {
          console.log("[Auth] CSRF-токен не найден, прекращаем попытку восстановления.");
          return;
        }

        const { data } = await apiPublic.post<AuthTokens>(
          "/auth/refresh",
          {},
          {
            headers: { "X-CSRF-Token": csrfToken },
            withCredentials: true
          }
        );

        if (data?.access_token) {
          setAccessToken(data.access_token);
          setSkipSessionRestore(false);
        }
      } catch (err) {
        console.error("[Auth] Ошибка при запросе на /auth/refresh:", err);
      } finally {
        setIsRestoringSession(false);
      }
    })();
  }, []);

  const value: AuthContextValue = {
    user: !isError && user ? user : null,
    isUserLoading,
    isRestoringSession,
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    logout: handleLogout,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,
    isRegistering: registerMutation.isPending,
    registerError: registerMutation.error,
    csrfWarning,
    dismissCsrfWarning
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
