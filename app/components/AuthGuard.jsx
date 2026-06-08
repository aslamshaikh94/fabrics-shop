'use client';
import { createContext, useContext, useState, useEffect } from 'react';
import { getSupabase } from '../lib/supabase';
import LoginForm from './LoginForm';

const AuthContext = createContext({ isAdmin: false, user: null });
export const useAuth = () => useContext(AuthContext);

export default function AuthGuard({ children }) {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    const sb = getSupabase();
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!session) return <LoginForm />;

  // app_metadata is set server-side only — cannot be tampered by the user
  const isAdmin = session.user.app_metadata?.role === 'admin';

  return (
    <AuthContext.Provider value={{ isAdmin, user: session.user }}>
      {children}
    </AuthContext.Provider>
  );
}
