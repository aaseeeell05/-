import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, AlertCircle, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { AuthSession } from '../types/evaluation';

interface LoginViewProps {
  onLogin: (session: AuthSession) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const { lang, isRtl } = useLanguage();
  const isAr = lang === 'ar';

  const [identifier, setIdentifier] = useState('alaa@paramind.org');
  const [pin, setPin] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedId = identifier.trim();
    const trimmedPin = pin.trim();

    if (!trimmedId) {
      setError(
        isAr
          ? 'يرجى إدخال البريد الإلكتروني أو اسم المستخدم.'
          : 'Please enter your email or username.'
      );
      return;
    }
    if (trimmedPin.length < 4) {
      setError(
        isAr
          ? 'يرجى إدخال رمز الدخول (PIN) المكوّن من 4 أحرف على الأقل.'
          : 'Please enter a PIN of at least 4 characters.'
      );
      return;
    }

    setError('');
    setIsVerifying(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: trimmedId, pin: trimmedPin }),
      });

      const data = (await response.json().catch(() => ({}))) as Partial<AuthSession> & {
        error?: string;
      };

      if (!response.ok || !data.token) {
        throw new Error(
          data.error ||
            (isAr
              ? 'تعذر تسجيل الدخول. تأكد من صحة البيانات.'
              : 'Sign in failed. Please check your credentials.')
        );
      }

      onLogin(data as AuthSession);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isAr
          ? 'حدث خطأ أثناء الاتصال بالخادم.'
          : 'Network error while connecting to server.'
      );
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white dark:bg-[#170D2B] rounded-xl border border-slate-200 dark:border-purple-900/60 overflow-hidden shadow-sm">
        <div className="bg-[#1B093B] dark:bg-[#13062B] px-8 py-8 text-center border-b border-amber-400/30">
          <img
            src="/assets/aistudio/6032600769661440235_120_a7b142b4.jpg"
            alt={isAr ? 'شعار مبادرة PARAMIND' : 'PARAMIND Initiative Logo'}
            referrerPolicy="no-referrer"
            className="w-24 h-24 mx-auto rounded-full object-cover border-2 border-amber-400/70 shadow-md mb-4 bg-[#1B093B]"
          />
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {isAr ? 'منصة PARAMIND الموحدة' : 'PARAMIND Portal'}
          </h2>
          <p className="text-purple-200 text-sm mt-1.5">
            {isAr
              ? 'تسجيل الدخول بنظام الصلاحيات حسب الدور (RBAC)'
              : 'Role-Based Access Control (RBAC) Sign In'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          {error && (
            <div
              role="alert"
              className="bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 px-4 py-3 rounded-lg text-sm flex items-center gap-2.5"
            >
              <AlertCircle size={18} className="shrink-0 text-rose-600 dark:text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="login-identifier" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              {isAr ? 'البريد الإلكتروني أو اسم المستخدم' : 'Email or Username'}
            </label>
            <input
              id="login-identifier"
              type="text"
              required
              dir="ltr"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="name@paramind.org"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 text-left focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="login-pin" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              {isAr ? 'رمز الدخول (PIN) / كلمة المرور' : 'Access PIN / Password'}
            </label>
            <input
              id="login-pin"
              type="password"
              required
              dir="ltr"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder={isAr ? 'أدخل رمز الدخول الخاص بحسابك' : 'Enter your account PIN'}
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 text-left focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={isVerifying}
            className="w-full bg-[#D97706] hover:bg-amber-600 text-white font-semibold py-2.5 px-5 rounded-lg transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#D97706] disabled:opacity-60 cursor-pointer shadow-xs"
          >
            <span>
              {isVerifying
                ? isAr
                  ? 'جاري التحقق من الصلاحية...'
                  : 'Verifying...'
                : isAr
                ? 'دخول للنظام'
                : 'Sign In'}
            </span>
            {isRtl ? <ArrowLeft size={18} /> : <ArrowRight size={18} />}
          </button>

          <div className="pt-3 border-t border-slate-200 dark:border-purple-900/60 space-y-2">
            <div className="flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <ShieldCheck size={15} className="text-[#2E1065] dark:text-amber-400 shrink-0" />
              <span>
                {isAr
                  ? 'يتم التحقق من الحساب والصلاحية تلقائياً عند كل جلسة'
                  : 'Account & permissions are verified on every session'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setIdentifier('alaa@paramind.org');
                  setPin('');
                  setError('');
                }}
                className="px-3 py-1.5 text-xs font-semibold text-[#2E1065] dark:text-purple-100 bg-purple-50/70 dark:bg-purple-900/40 hover:bg-purple-100/80 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-700/60 rounded-md cursor-pointer transition-colors"
              >
                {isAr ? 'أدمن' : 'Admin'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIdentifier('evaluator@paramind.org');
                  setPin('');
                  setError('');
                }}
                className="px-3 py-1.5 text-xs font-semibold text-[#2E1065] dark:text-purple-100 bg-purple-50/70 dark:bg-purple-900/40 hover:bg-purple-100/80 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-700/60 rounded-md cursor-pointer transition-colors"
              >
                {isAr ? 'عضو تقييم M&E' : 'M&E Evaluator'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
