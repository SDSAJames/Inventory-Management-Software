import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { APP_VERSION } from '../lib/constants';

export default function LockScreen() {
  const { login, authError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const usernameInputRef = useRef(null);

  useEffect(() => {
    usernameInputRef.current?.focus();
  }, []);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setLocalError('');

    if (!username.trim()) {
      setLocalError('Please enter your Knox ID or Username.');
      usernameInputRef.current?.focus();
      return;
    }
    if (!password) {
      setLocalError('Please enter your account password.');
      return;
    }

    try {
      setIsSubmitting(true);
      await login(username, password);
    } catch (err) {
      setLocalError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const effectiveError = localError || authError;

  return (
    <div className="lockscreen-root">
      <div className="lockscreen-card">
        {/* Header / Brand Mark */}
        <div className="lockscreen-brand-header">
          <div className="lockscreen-logo-badge" title="StarPlus Energy">
            <svg
              className="lockscreen-logo-svg"
              viewBox="0 0 29 48"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              role="img"
              aria-label="StarPlus Energy Logo"
            >
              <path
                d="M28.8537 6.30267L17.7469 0V12.9163L28.8537 19.2189V6.30267ZM12.7844 0L0 7.25467V23.0679L16.0691 32.1867V48L28.8537 40.7452V24.9319L12.7844 15.8133V0ZM0 41.6973L11.1066 48V35.0837L0 28.7811V41.6973Z"
                fill="#1449d6"
              />
            </svg>
          </div>

          <div className="lockscreen-title-group">
            <h1 className="lockscreen-title">STARPLUS ENERGY</h1>
            <p className="lockscreen-subtitle">Asset Management System (SPE-AMS)</p>
          </div>

          <div className="lockscreen-security-pill" title="Protected Internal IT System">
            <span className="lockscreen-lock-icon">🔒</span>
            <span>RESTRICTED ACCESS • AUTHORIZED PERSONNEL ONLY</span>
          </div>
        </div>

        {/* Error Alert Banner */}
        {effectiveError && (
          <div className="lockscreen-error-alert" role="alert">
            <span className="lockscreen-alert-icon">⚠️</span>
            <span className="lockscreen-alert-text">{effectiveError}</span>
          </div>
        )}

        {/* Login Form */}
        <form className="lockscreen-form" onSubmit={handleSubmit} noValidate>
          <div className="lockscreen-field">
            <label htmlFor="login-username" className="lockscreen-label">
              Username or Knox ID
            </label>
            <div className="lockscreen-input-wrap">
              <span className="lockscreen-input-icon">👤</span>
              <input
                id="login-username"
                ref={usernameInputRef}
                type="text"
                className="lockscreen-input"
                placeholder="Enter Username or Knox ID"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setLocalError('');
                }}
                disabled={isSubmitting}
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div className="lockscreen-field">
            <div className="lockscreen-label-row">
              <label htmlFor="login-password" className="lockscreen-label">
                Password
              </label>
            </div>
            <div className="lockscreen-input-wrap">
              <span className="lockscreen-input-icon">🔑</span>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className="lockscreen-input"
                placeholder="Enter account password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setLocalError('');
                }}
                disabled={isSubmitting}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="lockscreen-eye-btn"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Hide password' : 'Show password'}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="lockscreen-submit-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span className="lockscreen-spinner" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <span>Sign In to System</span>
                <span className="lockscreen-btn-arrow">→</span>
              </>
            )}
          </button>
        </form>

        {/* Card Footer */}
        <div className="lockscreen-footer">
          <span>StarPlus Energy AMS v{APP_VERSION}</span>
          <span className="lockscreen-footer-divider">•</span>
          <span>Corporate Intranet Secure Portal</span>
        </div>
      </div>
    </div>
  );
}
