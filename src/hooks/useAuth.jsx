import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

const AUTH_USER_KEY = 'starplusenergy-auth-user';
const AUTH_TOKEN_KEY = 'starplusenergy-token';

// Built-in baseline credentials for offline / local workstation resiliency
const OFFLINE_CREDENTIALS = {
  admin: {
    id: 'usr-admin-01',
    username: 'admin',
    password: 'admin123',
    fullName: 'IT Administrator',
    role: 'ADMIN',
    knoxId: 'KNOX-IT-001',
  },
  operator: {
    id: 'usr-op-01',
    username: 'operator',
    password: 'operator123',
    fullName: 'Field IT Operator',
    role: 'OPERATOR',
    knoxId: 'KNOX-IT-002',
  },
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem(AUTH_USER_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  // Initial session verification with server
  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token && !user) {
        if (mounted) setIsLoading(false);
        return;
      }

      try {
        const res = await api.auth.getMe();
        if (mounted && res?.success && res.user) {
          const verifiedUser = {
            id: res.user.id,
            username: res.user.username,
            fullName: res.user.full_name || res.user.fullName || res.user.username,
            role: res.user.role || 'OPERATOR',
            knoxId: res.user.knox_id || res.user.knoxId || '',
          };
          setUser(verifiedUser);
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(verifiedUser));
        }
      } catch (err) {
        // If unauthorized by server, invalidate session
        if (err.status === 401) {
          if (mounted) {
            setUser(null);
            localStorage.removeItem(AUTH_USER_KEY);
            localStorage.removeItem(AUTH_TOKEN_KEY);
          }
        }
        // If network error (offline or server not started), retain cached session
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    checkSession();

    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (username, password) => {
    setAuthError('');
    const cleanUser = String(username || '').trim().toLowerCase();
    const cleanPass = String(password || '');

    if (!cleanUser || !cleanPass) {
      const msg = 'Please enter both username and password.';
      setAuthError(msg);
      throw new Error(msg);
    }

    try {
      // 1. Try server-side authentication
      const res = await api.auth.login({ username: cleanUser, password: cleanPass });
      if (res?.success && res.user) {
        const authenticatedUser = {
          id: res.user.id,
          username: res.user.username,
          fullName: res.user.fullName || res.user.full_name || res.user.username,
          role: res.user.role || 'OPERATOR',
          knoxId: res.user.knoxId || res.user.knox_id || '',
        };

        setUser(authenticatedUser);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(authenticatedUser));
        if (res.token) {
          localStorage.setItem(AUTH_TOKEN_KEY, res.token);
        }
        return authenticatedUser;
      }
      throw new Error(res?.error || 'Authentication failed');
    } catch (err) {
      // If server explicitly denied credentials (401 / 400), do not allow login
      if (err.status === 401 || err.status === 400) {
        const message = err.message || 'Invalid username or password.';
        setAuthError(message);
        throw new Error(message);
      }

      // If backend server is unreachable (offline / dev mode without backend started),
      // fallback to offline credential validation
      const offlineUser = OFFLINE_CREDENTIALS[cleanUser];
      if (offlineUser && offlineUser.password === cleanPass) {
        const authenticatedUser = {
          id: offlineUser.id,
          username: offlineUser.username,
          fullName: offlineUser.fullName,
          role: offlineUser.role,
          knoxId: offlineUser.knoxId,
          offlineSession: true,
        };

        setUser(authenticatedUser);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(authenticatedUser));
        return authenticatedUser;
      }

      const failMsg = 'Invalid username or password.';
      setAuthError(failMsg);
      throw new Error(failMsg);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // Ignore network errors on logout
    } finally {
      setUser(null);
      setAuthError('');
      localStorage.removeItem(AUTH_USER_KEY);
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  }, []);

  const value = {
    user,
    isAuthenticated: Boolean(user),
    isLoading,
    authError,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return context;
}
