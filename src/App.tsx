/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { LogOut, CheckCircle2, AlertCircle, X, Globe, Sun, Moon } from 'lucide-react';
import { useLanguage } from './i18n/LanguageContext';
import { useTheme } from './theme/ThemeContext';
import {
  AuthSession,
  DEFAULT_SITE_SETTINGS,
  EvaluationFormData,
  EvaluationReport,
  SiteSettings,
  ViewMode,
  createInitialEvalState,
} from './types/evaluation';
import { LoginView } from './components/LoginView';
import { DashboardView } from './components/DashboardView';
import { ReportFormView } from './components/ReportFormView';
import { AdminSettingsModal } from './components/AdminSettingsModal';
import { WorkshopRunnerView } from './components/WorkshopRunnerView';
import { AdminConsoleView } from './components/AdminConsoleView';

interface ToastMessage {
  type: 'success' | 'error';
  text: string;
}

const SESSION_STORAGE_KEY = 'paramind_me_auth_session';
const CACHE_STORAGE_KEY = 'paramind_me_reports_cache';
const SETTINGS_CACHE_KEY = 'paramind_me_settings_cache';

export default function App() {
  const { lang, toggleLang } = useLanguage();
  const { isDark, toggleTheme } = useTheme();
  const isAr = lang === 'ar';

  const [session, setSession] = useState<AuthSession | null>(() => {
    try {
      const saved = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!saved) return null;
      const parsed = JSON.parse(saved) as Partial<AuthSession>;
      return parsed && parsed.token && parsed.role ? (parsed as AuthSession) : null;
    } catch {
      return null;
    }
  });

  const [view, setView] = useState<ViewMode>(() => {
    if (!session) return 'login';
    return session.role === 'Limited' ? 'workshop-runner' : 'dashboard';
  });

  const [reports, setReports] = useState<EvaluationReport[]>([]);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_CACHE_KEY);
      return saved ? (JSON.parse(saved) as SiteSettings) : DEFAULT_SITE_SETTINGS;
    } catch {
      return DEFAULT_SITE_SETTINGS;
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [evalData, setEvalData] = useState<EvaluationFormData>(() =>
    createInitialEvalState(session?.name ?? '')
  );
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState<string | null>(null);

  const isAdmin = session?.role === 'Admin' || Boolean(adminPassword);
  const isLimited = session?.role === 'Limited';

  const showToast = useCallback((type: 'success' | 'error', text: string) => {
    setToast({ type, text });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleLogout = useCallback(
    async (reasonMessage?: string) => {
      const tokenToRevoke = session?.token;
      setSession(null);
      setAdminPassword(null);
      setReports([]);
      try {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      } catch {
        // Ignore storage error
      }
      setView('login');
      if (reasonMessage) {
        showToast('error', reasonMessage);
      }
      if (tokenToRevoke) {
        fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'x-auth-token': tokenToRevoke },
        }).catch(() => {});
      }
    },
    [session?.token, showToast]
  );

  const handleAuthError = useCallback(
    (message: string, forceLogout = false) => {
      if (forceLogout) {
        void handleLogout(message);
      } else {
        showToast('error', message);
      }
    },
    [handleLogout, showToast]
  );

  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) return;
      const data = (await response.json()) as SiteSettings;
      setSiteSettings(data);
      try {
        localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(data));
      } catch {
        // Ignore storage quota issues
      }
    } catch {
      // Keep default or cached settings
    }
  }, []);

  const fetchReports = useCallback(async () => {
    if (!session || session.role === 'Limited') return;
    setIsLoading(true);
    try {
      const response = await fetch('/api/reports', {
        headers: { 'x-auth-token': session.token },
      });
      if (response.status === 403) {
        const err = (await response.json().catch(() => ({}))) as { error?: string };
        void handleLogout(err.error || (isAr ? 'تم تجميد هذا الحساب.' : 'Account blocked.'));
        return;
      }
      if (!response.ok) {
        throw new Error('Failed to load reports');
      }
      const data = (await response.json()) as EvaluationReport[];
      setReports(data);
      try {
        localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(data));
      } catch {
        // Ignore storage quota issues
      }
    } catch {
      try {
        const cached = localStorage.getItem(CACHE_STORAGE_KEY);
        if (cached) {
          setReports(JSON.parse(cached) as EvaluationReport[]);
        }
      } catch {
        // Ignore cache parse issues
      }
      showToast(
        'error',
        isAr
          ? 'تعذر الاتصال بالخادم، يتم عرض آخر نسخة محفوظة محلياً.'
          : 'Could not reach server; showing locally cached reports.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [session, handleLogout, showToast, isAr]);

  useEffect(() => {
    const token = session?.token;
    if (!token) return;
    let cancelled = false;
    const verifyLive = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'x-auth-token': token },
        });
        if (cancelled) return;
        if (res.status === 401 || res.status === 403) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          void handleLogout(
            body.error ||
              (isAr ? 'انتهت الجلسة، يرجى تسجيل الدخول مجدداً.' : 'Session expired. Please sign in again.')
          );
          return;
        }
        if (res.ok) {
          const liveSession = (await res.json()) as AuthSession;
          setSession((prev) => {
            if (!prev) return prev;
            if (prev.role === liveSession.role && prev.name === liveSession.name) {
              return prev;
            }
            try {
              localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(liveSession));
            } catch {
              // Ignore
            }
            if (liveSession.role === 'Limited') {
              setView('workshop-runner');
            }
            return liveSession;
          });
        }
      } catch {
        // Offline tolerance
      }
    };
    void verifyLive();
    return () => {
      cancelled = true;
    };
  }, [session?.token, handleLogout, isAr]);

  useEffect(() => {
    if (!session?.token) return;
    if (session.role === 'Limited') {
      setView('workshop-runner');
      return;
    }
    void fetchReports();
    void fetchSettings();
  }, [session?.token, session?.role, fetchReports, fetchSettings]);

  const handleLogin = (nextSession: AuthSession) => {
    setSession(nextSession);
    setAdminPassword(null);
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    } catch {
      // Ignore storage error
    }
    setView(nextSession.role === 'Limited' ? 'workshop-runner' : 'dashboard');
  };

  const handleCreateNew = () => {
    if (isLimited) return;
    setEvalData(createInitialEvalState(session?.name ?? ''));
    setView('form');
  };

  const handleViewReport = (report: EvaluationReport) => {
    if (isLimited) return;
    setEvalData(JSON.parse(JSON.stringify(report)) as EvaluationReport);
    setView('view-report');
  };

  const handleEditReport = (report: EvaluationReport) => {
    if (!isAdmin) {
      showToast(
        'error',
        isAr ? 'صلاحية تعديل التقارير مخصصة للأدمن فقط.' : 'Only Admins can edit reports.'
      );
      setIsAdminModalOpen(true);
      return;
    }
    setEvalData(JSON.parse(JSON.stringify(report)) as EvaluationReport);
    setView('form');
  };

  const handleSubmitReport = async () => {
    const isEdit = Boolean(evalData.id);
    if (isEdit && !isAdmin) {
      showToast(
        'error',
        isAr ? 'صلاحية تعديل التقارير مخصصة للأدمن فقط.' : 'Only Admins can edit reports.'
      );
      setIsAdminModalOpen(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const endpoint = isEdit ? `/api/reports/${evalData.id}` : '/api/reports';
      const method = isEdit ? 'PUT' : 'POST';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.token) {
        headers['x-auth-token'] = session.token;
      }
      if (isEdit && adminPassword) {
        headers['x-admin-password'] = adminPassword;
      }

      const response = await fetch(endpoint, {
        method,
        headers,
        body: JSON.stringify(evalData),
      });

      if (!response.ok) {
        const errBody = (await response.json().catch(() => ({}))) as { error?: string };
        if (response.status === 403 && session?.role !== 'Admin') {
          void handleLogout(errBody.error || (isAr ? 'تم إيقاف صلاحية هذا الحساب.' : 'Access revoked.'));
          return;
        }
        if (response.status === 401) {
          setAdminPassword(null);
          setIsAdminModalOpen(true);
        }
        throw new Error(errBody.error || (isAr ? 'تعذر حفظ التقرير.' : 'Failed to save report.'));
      }

      const saved = (await response.json()) as EvaluationReport;
      setReports((prev) => {
        const next = isEdit
          ? prev.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...prev];
        try {
          localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Ignore storage error
        }
        return next;
      });

      showToast(
        'success',
        isEdit
          ? isAr
            ? 'تم تحديث تقرير التقييم بنجاح.'
            : 'Report updated successfully.'
          : isAr
          ? 'تم اعتماد وحفظ تقرير التقييم بنجاح.'
          : 'Evaluation report saved successfully.'
      );
      setView('dashboard');
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : isAr
          ? 'حدث خطأ أثناء حفظ التقرير.'
          : 'Error saving report.';
      showToast('error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteReport = async (id: string) => {
    if (!isAdmin) {
      showToast(
        'error',
        isAr ? 'صلاحية حذف التقارير مخصصة للأدمن فقط.' : 'Only Admins can delete reports.'
      );
      setIsAdminModalOpen(true);
      return;
    }

    try {
      const headers: Record<string, string> = {};
      if (session?.token) headers['x-auth-token'] = session.token;
      if (adminPassword) headers['x-admin-password'] = adminPassword;

      const response = await fetch(`/api/reports/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (!response.ok) {
        const errBody = (await response.json().catch(() => ({}))) as { error?: string };
        if (response.status === 401) {
          setAdminPassword(null);
          setIsAdminModalOpen(true);
        }
        throw new Error(errBody.error || (isAr ? 'تعذر حذف التقرير.' : 'Failed to delete report.'));
      }
      setReports((prev) => {
        const next = prev.filter((item) => item.id !== id);
        try {
          localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Ignore storage error
        }
        return next;
      });
      showToast('success', isAr ? 'تم حذف التقرير من السجل.' : 'Report deleted.');
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : isAr
          ? 'حدث خطأ أثناء حذف التقرير.'
          : 'Error deleting report.';
      showToast('error', msg);
    }
  };

  const handleSettingsSaved = (nextSettings: SiteSettings) => {
    setSiteSettings(nextSettings);
    try {
      localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(nextSettings));
    } catch {
      // Ignore storage error
    }
    showToast(
      'success',
      isAr
        ? 'تم تحديث بيانات مسؤول قسم التقييم والمتابعة بنجاح.'
        : 'M&E Head details updated.'
    );
  };

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#0D061A] dark:text-slate-100 selection:bg-[#2E1065] selection:text-white transition-colors"
    >
      {/* Top Bar (3-zone contract, Royal Purple & Gold) */}
      <header className="bg-[#2E1065] dark:bg-[#160730] text-white border-b border-purple-900/70 dark:border-purple-800/70 shadow-sm sticky top-0 z-40 no-print">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-6">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => {
              if (!session) return;
              setView(isLimited ? 'workshop-runner' : 'dashboard');
            }}
            className="flex items-center gap-2.5 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-md"
          >
            <img
              src="/assets/aistudio/6032600769661440235_120_a7b142b4.jpg"
              alt={isAr ? 'شعار مبادرة PARAMIND' : 'PARAMIND Logo'}
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-full object-cover border border-amber-400/70 bg-[#1B093B] shrink-0"
            />
            <span className="text-lg font-bold tracking-wide text-white">PARAMIND</span>
          </button>

          {/* Zone 2: Navigation Links (strictly role-scoped) */}
          {session && view !== 'login' ? (
            <nav className="hidden sm:flex items-center gap-5 text-sm font-medium">
              {!isLimited && (
                <>
                  <button
                    type="button"
                    onClick={() => setView('dashboard')}
                    className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 ${
                      view === 'dashboard'
                        ? 'text-white border-amber-400'
                        : 'text-purple-200 border-transparent hover:text-white'
                    }`}
                  >
                    {isAr ? 'سجل التقارير' : 'Reports'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateNew}
                    className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 ${
                      view === 'form' && !evalData.id
                        ? 'text-white border-amber-400'
                        : 'text-purple-200 border-transparent hover:text-white'
                    }`}
                  >
                    {isAr ? 'تقرير جديد' : 'New Report'}
                  </button>
                </>
              )}

              {(isAdmin || isLimited) && (
                <button
                  type="button"
                  onClick={() => setView('workshop-runner')}
                  className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 ${
                    view === 'workshop-runner'
                      ? 'text-white border-amber-400'
                      : 'text-purple-200 border-transparent hover:text-white'
                  }`}
                >
                  {isAr ? 'تشغيل الورشة' : 'Workshop Runner'}
                </button>
              )}

              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => setView('admin-console')}
                  className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 ${
                    view === 'admin-console'
                      ? 'text-white border-amber-400'
                      : 'text-purple-200 border-transparent hover:text-white'
                  }`}
                >
                  {isAr ? 'لوحة الإدارة' : 'Admin Console'}
                </button>
              ) : !isLimited ? (
                <button
                  type="button"
                  onClick={() => setIsAdminModalOpen(true)}
                  className="py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer border-b-2 border-transparent text-purple-200 hover:text-amber-200"
                >
                  {isAr ? 'دخول الأدمن' : 'Admin Login'}
                </button>
              ) : null}
            </nav>
          ) : (
            <div />
          )}

          {/* Zone 3: Theme + Language Switcher + Primary Action */}
          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 text-xs font-semibold border border-amber-400/50 hover:border-amber-300 text-amber-200 hover:text-white bg-[#1B093B]/60 dark:bg-[#0F0521]/80 px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              aria-label={
                isDark
                  ? isAr
                    ? 'التبديل إلى الوضع النهاري'
                    : 'Switch to Light Mode'
                  : isAr
                  ? 'التبديل إلى الوضع الليلي'
                  : 'Switch to Dark Mode'
              }
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
              <span className="hidden sm:inline">
                {isDark ? (isAr ? 'نهاري' : 'Light') : isAr ? 'ليلي' : 'Dark'}
              </span>
            </button>

            <button
              type="button"
              onClick={toggleLang}
              className="inline-flex items-center gap-1.5 text-xs font-semibold border border-amber-400/50 hover:border-amber-300 text-amber-200 hover:text-white bg-[#1B093B]/60 dark:bg-[#0F0521]/80 px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              aria-label={isAr ? 'Switch to English' : 'التبديل للعربية'}
            >
              <Globe size={14} />
              <span>{isAr ? 'EN' : 'العربية'}</span>
            </button>

            {session && view !== 'login' ? (
              <>
                <span className="hidden md:inline text-xs text-purple-200 whitespace-nowrap">
                  {session.name}
                </span>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="inline-flex items-center gap-2 text-xs font-semibold bg-[#D97706] hover:bg-amber-600 text-white px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
                >
                  <LogOut size={15} />
                  <span>{isAr ? 'تسجيل الخروج' : 'Sign Out'}</span>
                </button>
              </>
            ) : (
              <span className="hidden sm:inline text-xs font-medium text-amber-200 whitespace-nowrap shrink-0">
                {isAr ? 'وحدة التقييم والتشغيل' : 'M&E & Operations'}
              </span>
            )}
          </div>
        </div>

        {session && view !== 'login' && (
          <nav className="sm:hidden border-t border-purple-900/70 dark:border-purple-800/70 bg-[#1B093B]/60 dark:bg-[#0F0521] px-4 py-2 flex items-center gap-4 overflow-x-auto text-xs font-medium">
            {!isLimited && (
              <>
                <button
                  type="button"
                  onClick={() => setView('dashboard')}
                  className={`whitespace-nowrap shrink-0 cursor-pointer ${
                    view === 'dashboard'
                      ? 'text-amber-300 font-bold underline'
                      : 'text-purple-200'
                  }`}
                >
                  {isAr ? 'سجل التقارير' : 'Reports'}
                </button>
                <button
                  type="button"
                  onClick={handleCreateNew}
                  className={`whitespace-nowrap shrink-0 cursor-pointer ${
                    view === 'form' && !evalData.id
                      ? 'text-amber-300 font-bold underline'
                      : 'text-purple-200'
                  }`}
                >
                  {isAr ? 'تقرير جديد' : 'New Report'}
                </button>
              </>
            )}
            {(isAdmin || isLimited) && (
              <button
                type="button"
                onClick={() => setView('workshop-runner')}
                className={`whitespace-nowrap shrink-0 cursor-pointer ${
                  view === 'workshop-runner'
                    ? 'text-amber-300 font-bold underline'
                    : 'text-purple-200'
                }`}
              >
                {isAr ? 'تشغيل الورشة' : 'Workshop Runner'}
              </button>
            )}
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setView('admin-console')}
                className={`whitespace-nowrap shrink-0 cursor-pointer ${
                  view === 'admin-console'
                    ? 'text-amber-300 font-bold underline'
                    : 'text-purple-200'
                }`}
              >
                {isAr ? 'لوحة الإدارة' : 'Admin Console'}
              </button>
            ) : !isLimited ? (
              <button
                type="button"
                onClick={() => setIsAdminModalOpen(true)}
                className="whitespace-nowrap shrink-0 text-purple-200 hover:text-amber-200 cursor-pointer"
              >
                {isAr ? 'دخول الأدمن' : 'Admin Login'}
              </button>
            ) : null}
          </nav>
        )}
      </header>

      {/* Toast Feedback */}
      {toast && (
        <div className="max-w-6xl mx-auto px-4 md:px-6 pt-4 no-print">
          <div
            role="status"
            className={`px-4 py-3 rounded-lg border text-sm font-medium flex items-center justify-between gap-3 ${
              toast.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'success' ? (
                <CheckCircle2 size={17} className="text-emerald-700 dark:text-emerald-400" />
              ) : (
                <AlertCircle size={17} className="text-rose-700 dark:text-rose-400" />
              )}
              <span>{toast.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="p-1 hover:opacity-75 cursor-pointer"
              aria-label={isAr ? 'إغلاق الإشعار' : 'Dismiss'}
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {view === 'login' || !session ? (
          <LoginView onLogin={handleLogin} />
        ) : view === 'workshop-runner' && (isLimited || isAdmin) ? (
          <WorkshopRunnerView session={session} onAuthError={handleAuthError} />
        ) : view === 'admin-console' && isAdmin ? (
          <AdminConsoleView
            session={session}
            onOpenMeHeadModal={() => setIsAdminModalOpen(true)}
            onAuthError={handleAuthError}
            onToast={showToast}
          />
        ) : view === 'dashboard' && !isLimited ? (
          <DashboardView
            reports={reports}
            siteSettings={siteSettings}
            isLoading={isLoading}
            isAdmin={isAdmin}
            onCreateNew={handleCreateNew}
            onViewReport={handleViewReport}
            onEditReport={handleEditReport}
            onDeleteReport={handleDeleteReport}
            onOpenAdminSettings={() =>
              isAdmin ? setView('admin-console') : setIsAdminModalOpen(true)
            }
          />
        ) : !isLimited ? (
          <ReportFormView
            mode={view === 'form' || view === 'view-report' ? view : 'view-report'}
            data={evalData}
            siteSettings={siteSettings}
            isSubmitting={isSubmitting}
            isAdmin={isAdmin}
            onChange={setEvalData}
            onSubmit={handleSubmitReport}
            onCancel={() => setView('dashboard')}
            onSwitchToEdit={() => {
              if (!isAdmin) {
                showToast(
                  'error',
                  isAr ? 'صلاحية تعديل التقارير مخصصة للأدمن فقط.' : 'Only Admins can edit reports.'
                );
                setIsAdminModalOpen(true);
                return;
              }
              setView('form');
            }}
            onOpenAdminSettings={() => setIsAdminModalOpen(true)}
          />
        ) : (
          <WorkshopRunnerView session={session} onAuthError={handleAuthError} />
        )}
      </main>

      <AdminSettingsModal
        isOpen={isAdminModalOpen}
        currentSettings={siteSettings}
        adminPassword={adminPassword}
        authToken={session?.token}
        isAdminSession={session?.role === 'Admin'}
        onAdminVerified={(pw) => {
          setAdminPassword(pw);
          showToast(
            'success',
            isAr
              ? 'تم تفعيل صلاحيات الأدمن لتعديل وحذف التقارير وإعدادات القسم.'
              : 'Admin permissions unlocked.'
          );
        }}
        onLockAdmin={() => {
          setAdminPassword(null);
          setIsAdminModalOpen(false);
          if (view === 'form' && evalData.id) {
            setView('view-report');
          }
          showToast(
            'success',
            isAr ? 'تم قفل صلاحيات الأدمن والعودة لوضع العضو.' : 'Admin mode locked.'
          );
        }}
        onSaved={handleSettingsSaved}
        onClose={() => setIsAdminModalOpen(false)}
      />
    </div>
  );
}
