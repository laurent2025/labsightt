import React from 'react';
import { LoginPanel } from './LoginPanel';

interface LoginScreenProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  onSignup: (email: string, password: string, displayName: string) => Promise<{ message: string }>;
}

export const LoginScreen: React.FC<LoginScreenProps> = props => (
  <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-4 sm:p-8">
    <LoginPanel {...props} />
  </div>
);
