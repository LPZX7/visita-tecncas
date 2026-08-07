import axios from 'axios';
import { getToken, clearAuth } from './utils/auth';

const api = axios.create({
  baseURL: '/api'
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/signup', '/auth/forgot-password', '/auth/reset-password'];

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const isPublicAuthRequest = PUBLIC_AUTH_PATHS.some((path) => url.includes(path));
    if (error.response?.status === 401 && !isPublicAuthRequest) {
      clearAuth();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login?expired=1';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
