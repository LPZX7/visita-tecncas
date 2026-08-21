export function getToken() {
  return sessionStorage.getItem('token') || localStorage.getItem('token');
}

export function getUser() {
  const raw = sessionStorage.getItem('user') || localStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

export function setAuth(token, user, remember = false) {
  clearAuth();
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem('token', token);
  storage.setItem('user', JSON.stringify(user));
}

export function setUser(user) {
  const storage = localStorage.getItem('token') ? localStorage : sessionStorage;
  storage.setItem('user', JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('user');
}
