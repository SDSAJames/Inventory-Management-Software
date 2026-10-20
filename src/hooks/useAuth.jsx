import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

const AUTH_USER_KEY = 'starplusenergy-auth-user';
const AUTH_TOKEN_KEY = 'starplusenergy-token';

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
      // Authenticate against centralized corporate intranet server
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
      if (err.status === 401 || err.status === 400) {
        const message = err.message || 'Invalid username or password.';
        setAuthError(message);
        throw new Error(message);
      }

      const networkMsg = 'Unable to connect to the corporate authentication server. Please check your intranet connection.';
      setAuthError(networkMsg);
      throw new Error(networkMsg);
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
