import axios, {
  type AxiosError,
  AxiosHeaders,
  type AxiosInstance,
  type AxiosRequestHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig
} from "axios";
import type { AuthTokens } from "@/entities/auth/model";
import { withBasePath } from "@/shared/lib/utils";
import { resolveCsrfToken } from "../lib/csrf";
const DEFAULT_API_PATH = "/api/v1";
const ENV_API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;
const BASE_URL = import.meta.env.DEV ? DEFAULT_API_PATH : withBasePath(ENV_API_BASE_URL, DEFAULT_API_PATH);

export const apiPublic: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json"
  },
  withCredentials: true
});

let accessToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;
let csrfMissingHandler: (() => void) | null = null;

export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};

export const getAccessToken = (): string | null => accessToken;

export const setUnauthorizedHandler = (handler: (() => void) | null): void => {
  unauthorizedHandler = typeof handler === "function" ? handler : null;
};

export const setCsrfMissingHandler = (handler: (() => void) | null): void => {
  csrfMissingHandler = typeof handler === "function" ? handler : null;
};

const notifyUnauthorized = (): void => {
  setAccessToken(null);
  if (unauthorizedHandler) {
    try {
      unauthorizedHandler();
    } catch (handlerError) {
      console.error("[Interceptor] Ошибка обработчика выхода из системы.", handlerError);
    }
  }
};

const notifyCsrfMissing = (): void => {
  if (csrfMissingHandler) {
    try {
      csrfMissingHandler();
    } catch (handlerError) {
      console.error("[Interceptor] Ошибка обработчика отсутствующего CSRF-токена.", handlerError);
    }
  }
};

const toAxiosHeaders = (headers?: AxiosRequestHeaders): AxiosHeaders => {
  if (headers instanceof AxiosHeaders) {
    return headers;
  }
  return new AxiosHeaders(headers ?? {});
};

const apiProtected: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json"
  },
  withCredentials: true
});

apiProtected.interceptors.request.use(
  (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    const token = getAccessToken();
    if (token) {
      const headers = toAxiosHeaders(config.headers);
      headers.set("Authorization", `Bearer ${token}`);
      config.headers = headers;
    }
    return config;
  },
  (error: AxiosError): Promise<never> => Promise.reject(error)
);

apiProtected.interceptors.response.use(
  (response: AxiosResponse): AxiosResponse => response,
  async (error: AxiosError): Promise<AxiosResponse | never> => {
    const originalRequest = (error.config as (InternalAxiosRequestConfig & { _retry?: boolean })) ?? null;

    if (
      error?.response?.status === 401 &&
      originalRequest &&
      originalRequest.url !== "/auth/refresh" &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;
      try {
        console.log("[Interceptor] Перехвачена ошибка 401. Пытаемся обновить токен...");

        const csrfToken = await resolveCsrfToken();

        if (!csrfToken) {
          console.error("[Interceptor] Не найден CSRF-токен для обновления. Выход из системы.");
          notifyCsrfMissing();
          notifyUnauthorized();
          return Promise.reject(error);
        }

        const { data } = await apiPublic.post<AuthTokens>(
          "/auth/refresh",
          {},
          {
            headers: { "X-CSRF-Token": csrfToken },
            withCredentials: true
          }
        );

        const newAccessToken = data?.access_token;
        if (newAccessToken) {
          console.log("[Interceptor] Токен успешно обновлен. Повторяем исходный запрос.");
          setAccessToken(newAccessToken);
          const headers = toAxiosHeaders(originalRequest.headers);
          headers.set("Authorization", `Bearer ${newAccessToken}`);
          originalRequest.headers = headers;
          return apiProtected(originalRequest);
        }

        notifyUnauthorized();
      } catch (refreshError) {
        console.error(
          "[Interceptor] КРИТИЧЕСКАЯ ОШИБКА: Не удалось обновить токен. Выход из системы.",
          refreshError
        );
        notifyUnauthorized();
      }
    }
    return Promise.reject(error);
  }
);

export default apiProtected;
