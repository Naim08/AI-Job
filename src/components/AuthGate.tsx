import React, { useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Session, User } from '@supabase/supabase-js';
import { debug } from '../../electron/utils/debug';

interface AuthGateProps {
  children: (user: User | null, logout: () => Promise<void>) => ReactNode;
}

export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    debug('auth', 'AuthGate mounted, checking initial session.');
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      debug('auth', 'Initial getSession complete. Session:', currentSession ? 'Exists' : 'None', currentSession?.user?.email);
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setIsLoading(false);
    });

    const { data: authListenerData } = supabase.auth.onAuthStateChange(
      (_event, newAuthStateSession) => {
        debug('auth', 'Auth state changed. Event:', _event, 'New auth state session:', newAuthStateSession ? 'Exists' : 'None', newAuthStateSession?.user?.email);
        
        const previousComponentSession = session;

        setSession(newAuthStateSession);
        setUser(newAuthStateSession?.user ?? null);
        setIsLoading(false); 

        if (_event === 'SIGNED_IN') {
          if (previousComponentSession === null && newAuthStateSession !== null) {
            debug('auth', 'User actively signed in OR session established for the first time in this component lifecycle.');
            showToast('Signed in successfully!', 'success');
          } else {
            debug('auth', 'User session refreshed/validated by listener, no new sign-in toast needed as component already had a session or new session is null.');
          }
        }
        
        if (_event === 'SIGNED_OUT') {
            debug('auth', 'User signed out.');
            showToast('Signed out successfully.', 'success');
        }
      }
    );

    return () => {
      debug('auth', 'AuthGate unmounted, unsubscribing from auth state changes.');
      authListenerData?.subscription?.unsubscribe(); 
    };
  }, [session]);

  const handleGoogleLogin = async () => {
    setAuthError(null);
    debug('auth', 'Attempting Google OAuth sign-in.');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'app://callback',
        },
      });
      if (error) {
        debug('auth', 'Google OAuth sign-in error:', error.message);
        setAuthError(`Sign-in failed: ${error.message}`);
        showToast(`Sign-in error: ${error.message}`, 'error');
      }
    } catch (err: any) {
        debug('auth', 'Unexpected error during Google OAuth sign-in:', err.message);
        setAuthError(`An unexpected error occurred: ${err.message}`);
        showToast(`Sign-in error: ${err.message}`, 'error');
    }
  };

  const handleLogout = async () => {
    debug('auth', 'Attempting sign-out.');
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        debug('auth', 'Sign-out error:', error.message);
        showToast(`Sign-out error: ${error.message}`, 'error');
      } else {
        debug('auth', 'Sign-out successful from handleLogout call.');
      }
    } catch (err: any) {
      debug('auth', 'Unexpected error during sign-out:', err.message);
      showToast(`Sign-out error: ${err.message}`, 'error');
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const toastId = `toast-auth-${Date.now()}`;
    const toastElement = document.createElement('div');
    toastElement.id = toastId;
    toastElement.className = `toast toast-top toast-center`;
    toastElement.innerHTML = `
      <div class="alert ${type === 'error' ? 'alert-error' : 'alert-success'}">
        <span>${message}</span>
      </div>
    `;
    document.body.appendChild(toastElement);
    setTimeout(() => {
      toastElement.remove();
    }, 3000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-base-200">
        <div className="card w-96 bg-base-100 shadow-xl items-center p-8">
            <span className="loading loading-lg loading-spinner text-primary"></span>
            <p className="mt-4 text-lg">Authenticating...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200 p-4">
        <div className="card w-full max-w-md bg-base-100 shadow-xl">
          <div className="card-body items-center text-center">
            <h1 className="text-3xl font-bold mb-6">Welcome!</h1>
            <p className="mb-6">Please sign in to continue.</p>
            <button 
                className="btn btn-primary btn-wide gap-2"
                onClick={handleGoogleLogin}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-google" viewBox="0 0 16 16">
                <path d="M15.545 6.558a9.42 9.42 0 0 1 .139 1.626c0 2.434-.87 4.492-2.384 5.885h.002C11.978 15.292 10.158 16 8 16A8 8 0 1 1 8 0a7.689 7.689 0 0 1 5.352 2.082l-2.284 2.284A4.347 4.347 0 0 0 8 3.166c-2.087 0-3.86 1.408-4.492 3.304a4.792 4.792 0 0 0 0 3.063h.003c.635 1.893 2.405 3.301 4.492 3.301 1.078 0 2.004-.276 2.722-.764h-.003a3.702 3.702 0 0 0 1.599-2.431H8v-3.08h7.545z"/>
              </svg>
              Sign in with Google
            </button>
            {authError && (
              <div className="alert alert-error mt-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2 2m2-2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>{authError}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  debug('auth', 'Session exists, rendering children. User:', user?.email);
  return <>{children(user, handleLogout)}</>;
}; 