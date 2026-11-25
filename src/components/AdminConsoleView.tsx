import React, { useCallback, useEffect, useState } from 'react';
import {
  Users,
  ServerCog,
  FileText,
  History,
  UserPlus,
  Ban,
  CheckCircle2,
  Trash2,
  Plus,
  Save,
  Lock,
  Unlock,
  Copy,
  AlertCircle,
  Settings,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import {
  AuditLogEntry,
  AuthSession,
  ManagedAccount,
  OfficialEmailEntry,
  TechSettings,
  TemplateSettings,
  UserRole,
  formatArabicDate,
} from '../types/evaluation';

interface AdminConsoleViewProps {
  session: AuthSession;
  onOpenMeHeadModal: () => void;
  onAuthError: (message: string, forceLogout?: boolean) => void;
  onToast: (type: 'success' | 'error', text: string) => void;
}

type AdminTab = 'accounts' | 'tech' | 'template' | 'audit';

const APPS_SCRIPT_SNIPPET = `function doPost(e) {
  var data = JSON.parse(e.postData.contents || "{}");
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheets()[0]; // Columns: Name | Email/Username | PIN | Role

  if (data.action === "verifyUser") {
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      var name = String(rows[i][0] || "").trim();
      var id = String(rows[i][1] || "").trim().toLowerCase();
      var pin = String(rows[i][2] || "").trim();
      var role = String(rows[i][3] || "").trim();
      if ((id === String(data.identifier).toLowerCase() || name.toLowerCase() === String(data.identifier).toLowerCase()) && pin === String(data.pin)) {
        if (role.toLowerCase() === "blocked") {
          return ContentService.createTextOutput(JSON.stringify({ ok: false, status: "Blocked", error: "Account blocked" })).setMimeType(ContentService.MimeType.JSON);
        }
        return ContentService.createTextOutput(JSON.stringify({ ok: true, name: name, identifier: id, role: role })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Invalid credentials" })).setMimeType(ContentService.MimeType.JSON);
  }

  if (data.action === "sendWorkshopInvites") {
    var recipients = data.recipients || [];
    var sent = 0;
    recipients.forEach(function(r) {
      if (!r.email) return;
      var subject = (data.template.subject || "").replace("{workshop}", data.workshopTitle);
      var body = (data.template.body || "")
        .replace(/\\{name\\}/g, r.name || "Participant")
        .replace(/\\{workshop\\}/g, data.workshopTitle || "")
        .replace(/\\{whatsapp_link\\}/g, data.whatsappLink || "");
      GmailApp.sendEmail(r.email, subject, (data.template.header || "") + "\\n\\n" + body);
      sent++;
    });
    return ContentService.createTextOutput(JSON.stringify({ ok: true, sent: sent })).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: false })).setMimeType(ContentService.MimeType.JSON);
}`;

export const AdminConsoleView: React.FC<AdminConsoleViewProps> = ({
  session,
  onOpenMeHeadModal,
  onAuthError,
  onToast,
}) => {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';

  const roleLabels: Record<UserRole, string> = {
    Admin: isAr ? 'أدمن' : 'Admin',
    Limited: isAr ? 'نشاط محدود (دعم فني)' : 'Limited Operator',
    'M&E': isAr ? 'عضو تقييم ومتابعة (M&E)' : 'M&E Evaluator',
  };

  const [activeTab, setActiveTab] = useState<AdminTab>('accounts');
  const [loading, setLoading] = useState(true);

  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [tech, setTech] = useState<TechSettings>({
    appsScriptUrl: '',
    googleSheetUrl: '',
    enableRemoteAuth: false,
    emails: [],
  });
  const [template, setTemplate] = useState<TemplateSettings>({
    header: '',
    subject: '',
    body: '',
    isLocked: true,
  });
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  const [newName, setNewName] = useState('');
  const [newIdentifier, setNewIdentifier] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('Limited');
  const [creatingAccount, setCreatingAccount] = useState(false);

  const [newEmailAddr, setNewEmailAddr] = useState('');
  const [newEmailLabel, setNewEmailLabel] = useState('');
  const [newEmailType, setNewEmailType] = useState<'official' | 'backup'>('official');

  const [savingTech, setSavingTech] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [auditFilter, setAuditFilter] = useState<'all' | 'dispatch' | 'auth' | 'rbac' | 'report'>('all');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [rbacRes, auditRes] = await Promise.all([
        fetch('/api/admin/rbac', { headers: { 'x-auth-token': session.token } }),
        fetch('/api/admin/audit-logs', { headers: { 'x-auth-token': session.token } }),
      ]);

      if (rbacRes.status === 401 || rbacRes.status === 403) {
        const err = (await rbacRes.json().catch(() => ({}))) as { error?: string };
        onAuthError(err.error || (isAr ? 'صلاحية الإدارة غير متوفرة.' : 'Admin access denied.'), true);
        return;
      }

      if (rbacRes.ok) {
        const data = (await rbacRes.json()) as {
          accounts: ManagedAccount[];
          tech: TechSettings;
          template: TemplateSettings;
        };
        setAccounts(data.accounts);
        setTech(data.tech);
        setTemplate(data.template);
      }

      if (auditRes.ok) {
        const logs = (await auditRes.json()) as AuditLogEntry[];
        setAuditLogs(logs);
      }
    } catch {
      onToast('error', isAr ? 'تعذر تحميل بيانات لوحة الإدارة.' : 'Failed to load Admin Console.');
    } finally {
      setLoading(false);
    }
  }, [session.token, onAuthError, onToast, isAr]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingAccount(true);
    try {
      const res = await fetch('/api/admin/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': session.token,
        },
        body: JSON.stringify({
          name: newName,
          identifier: newIdentifier,
          pin: newPin,
          role: newRole,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as ManagedAccount & { error?: string };
      if (!res.ok) throw new Error(body.error || (isAr ? 'تعذر إنشاء الحساب.' : 'Failed to create account.'));

      setAccounts((prev) => [...prev, body]);
      setNewName('');
      setNewIdentifier('');
      setNewPin('');
      onToast(
        'success',
        isAr ? `تم إنشاء حساب «${body.name}» بنجاح.` : `Account "${body.name}" created.`
      );
      void loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : isAr ? 'حدث خطأ.' : 'Error occurred.');
    } finally {
      setCreatingAccount(false);
    }
  };

  const handleUpdateAccount = async (
    account: ManagedAccount,
    patch: Partial<Pick<ManagedAccount, 'role' | 'status' | 'pin'>>
  ) => {
    try {
      const res = await fetch(`/api/admin/accounts/${account.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': session.token,
        },
        body: JSON.stringify(patch),
      });
      const body = (await res.json().catch(() => ({}))) as ManagedAccount & { error?: string };
      if (!res.ok) throw new Error(body.error || (isAr ? 'تعذر تحديث الحساب.' : 'Failed to update account.'));

      setAccounts((prev) => prev.map((a) => (a.id === body.id ? body : a)));
      onToast(
        'success',
        isAr ? `تم تحديث صلاحية/حالة «${body.name}».` : `Updated "${body.name}" successfully.`
      );
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : isAr ? 'حدث خطأ.' : 'Error occurred.');
    }
  };

  const handleDeleteAccount = async (account: ManagedAccount) => {
    try {
      const res = await fetch(`/api/admin/accounts/${account.id}`, {
        method: 'DELETE',
        headers: { 'x-auth-token': session.token },
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || (isAr ? 'تعذر حذف الحساب.' : 'Failed to delete account.'));

      setAccounts((prev) => prev.filter((a) => a.id !== account.id));
      onToast('success', isAr ? `تم حذف حساب «${account.name}».` : `Deleted "${account.name}".`);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : isAr ? 'حدث خطأ.' : 'Error occurred.');
    }
  };

  const handleAddEmail = () => {
    const email = newEmailAddr.trim();
    if (!email.includes('@')) {
      onToast('error', isAr ? 'يرجى إدخال بريد إلكتروني صحيح.' : 'Please enter a valid email.');
      return;
    }
    const nextEntry: OfficialEmailEntry = {
      id: `${Date.now()}`,
      email,
      label:
        newEmailLabel.trim() ||
        (newEmailType === 'official'
          ? isAr
            ? 'بريد رسمي'
            : 'Official Email'
          : isAr
          ? 'بريد احتياطي'
          : 'Backup Email'),
      type: newEmailType,
      active: true,
    };
    setTech((prev) => ({ ...prev, emails: [...prev.emails, nextEntry] }));
    setNewEmailAddr('');
    setNewEmailLabel('');
  };

  const handleSaveTech = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTech(true);
    try {
      const res = await fetch('/api/admin/tech', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': session.token,
        },
        body: JSON.stringify(tech),
      });
      const body = (await res.json().catch(() => ({}))) as TechSettings & { error?: string };
      if (!res.ok) throw new Error(body.error || (isAr ? 'تعذر حفظ البنية التقنية.' : 'Failed to save settings.'));
      setTech(body);
      onToast(
        'success',
        isAr ? 'تم حفظ إعدادات البنية التقنية وروابط الربط بنجاح.' : 'Technical settings saved.'
      );
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : isAr ? 'حدث خطأ.' : 'Error occurred.');
    } finally {
      setSavingTech(false);
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTemplate(true);
    try {
      const res = await fetch('/api/admin/template', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': session.token,
        },
        body: JSON.stringify(template),
      });
      const body = (await res.json().catch(() => ({}))) as TemplateSettings & { error?: string };
      if (!res.ok) throw new Error(body.error || (isAr ? 'تعذر حفظ القالب الرسمي.' : 'Failed to save template.'));
      setTemplate(body);
      onToast(
        'success',
        isAr ? 'تم حفظ القالب الرسمي وتطبيق حالة القفل.' : 'Official template saved.'
      );
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : isAr ? 'حدث خطأ.' : 'Error occurred.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_SNIPPET);
      setCopiedScript(true);
      window.setTimeout(() => setCopiedScript(false), 2500);
    } catch {
      onToast('error', isAr ? 'تعذر النسخ التلقائي.' : 'Could not copy.');
    }
  };

  const filteredLogs = auditLogs.filter((l) =>
    auditFilter === 'all' ? true : l.actionType === auditFilter
  );

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="bg-white dark:bg-[#170D2B] rounded-xl border border-slate-200 dark:border-purple-900/60 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-[#2E1065] dark:text-purple-100">
            {isAr
              ? 'لوحة الإدارة والتحكم بالصلاحيات (RBAC)'
              : 'Admin Console & Role-Based Access Control'}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            {isAr
              ? 'إدارة حسابات الأعضاء، البنية التقنية، القوالب المعتمدة، وسجل المراقبة الكامل'
              : 'Manage member accounts, technical links, official templates, and audit logs'}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenMeHeadModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#2E1065] dark:text-purple-100 bg-purple-50/70 dark:bg-purple-900/40 border border-purple-200 dark:border-purple-700/60 hover:bg-purple-100/80 dark:hover:bg-purple-900/60 rounded-lg cursor-pointer shrink-0 transition-colors"
        >
          <Settings size={16} />
          <span>{isAr ? 'توقيع مسؤول قسم M&E' : 'M&E Head Signature'}</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-[#170D2B] rounded-xl border border-slate-200 dark:border-purple-900/60 p-1.5 flex flex-wrap gap-1 shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab('accounts')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
            activeTab === 'accounts'
              ? 'bg-[#2E1065] dark:bg-purple-700 text-white'
              : 'text-slate-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-900/40 hover:text-[#2E1065] dark:hover:text-white'
          }`}
        >
          <Users size={16} />
          <span>
            {isAr ? `الحسابات والصلاحيات (${accounts.length})` : `Accounts & RBAC (${accounts.length})`}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('tech')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
            activeTab === 'tech'
              ? 'bg-[#2E1065] dark:bg-purple-700 text-white'
              : 'text-slate-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-900/40 hover:text-[#2E1065] dark:hover:text-white'
          }`}
        >
          <ServerCog size={16} />
          <span>{isAr ? 'البنية التقنية و Google Sheets' : 'Tech & Google Sheets'}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('template')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
            activeTab === 'template'
              ? 'bg-[#2E1065] dark:bg-purple-700 text-white'
              : 'text-slate-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-900/40 hover:text-[#2E1065] dark:hover:text-white'
          }`}
        >
          <FileText size={16} />
          <span>{isAr ? 'القوالب المعتمدة' : 'Approved Templates'}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
            activeTab === 'audit'
              ? 'bg-[#2E1065] dark:bg-purple-700 text-white'
              : 'text-slate-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-900/40 hover:text-[#2E1065] dark:hover:text-white'
          }`}
        >
          <History size={16} />
          <span>
            {isAr ? `سجل المراقبة (${auditLogs.length})` : `Audit Log (${auditLogs.length})`}
          </span>
        </button>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-[#170D2B] rounded-xl border border-slate-200 dark:border-purple-900/60 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          {isAr ? 'جاري تحميل بيانات الإدارة...' : 'Loading Admin Console...'}
        </div>
      ) : activeTab === 'accounts' ? (
        <div className="space-y-6">
          {/* Create Account */}
          <form
            onSubmit={handleCreateAccount}
            className="bg-white dark:bg-[#170D2B] rounded-xl border border-slate-200 dark:border-purple-900/60 p-6 space-y-4 shadow-xs"
          >
            <div className="flex items-center gap-2 text-base font-bold text-[#2E1065] dark:text-purple-100">
              <UserPlus size={18} className="text-[#D97706] dark:text-amber-400" />
              <h3>{isAr ? 'إنشاء حساب عضو جديد' : 'Create Member Account'}</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {isAr ? 'الاسم الكامل' : 'Full Name'}
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={isAr ? 'مثال: أحمد محمد' : 'e.g., Ahmad Ali'}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 focus:outline-none focus:ring-2 focus:ring-[#D97706]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {isAr ? 'البريد / اسم المستخدم' : 'Email / Username'}
                </label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={newIdentifier}
                  onChange={(e) => setNewIdentifier(e.target.value)}
                  placeholder="member@paramind.org"
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 text-left focus:outline-none focus:ring-2 focus:ring-[#D97706]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {isAr ? 'رمز الدخول (PIN)' : 'Access PIN'}
                </label>
                <input
                  type="text"
                  required
                  minLength={4}
                  dir="ltr"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder={isAr ? '4 أحرف/أرقام فأكثر' : 'Min 4 chars'}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 text-left focus:outline-none focus:ring-2 focus:ring-[#D97706]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {isAr ? 'مستوى الصلاحية' : 'Role'}
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#D97706]"
                >
                  <option value="Limited">
                    {isAr ? 'نشاط محدود (تشغيل الورشة فقط)' : 'Limited (Workshop Runner Only)'}
                  </option>
                  <option value="M&E">
                    {isAr ? 'عضو تقييم ومتابعة (M&E)' : 'M&E Evaluator'}
                  </option>
                  <option value="Admin">{isAr ? 'أدمن' : 'Admin'}</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={creatingAccount}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg disabled:opacity-60 cursor-pointer shadow-xs"
              >
                <Plus size={16} />
                <span>
                  {creatingAccount
                    ? isAr
                      ? 'جاري الإنشاء...'
                      : 'Creating...'
                    : isAr
                    ? 'إضافة الحساب'
                    : 'Add Account'}
                </span>
              </button>
            </div>
          </form>

          {/* Accounts Table */}
          <div className="bg-white dark:bg-[#170D2B] rounded-xl border border-slate-200 dark:border-purple-900/60 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-start border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-purple-900/60 bg-purple-50/50 dark:bg-[#22123E] text-xs font-semibold text-[#2E1065] dark:text-purple-200">
                    <th className="py-3 px-5 text-start">{isAr ? 'العضو' : 'Member'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'البريد / اسم المستخدم' : 'Identifier'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'رمز الدخول PIN' : 'PIN'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'الدور' : 'Role'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className="py-3 px-5 text-end">{isAr ? 'التحكم الفوري' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-purple-900/60">
                  {accounts.map((acc) => {
                    const isSelf = acc.id === session.accountId;
                    const isBlocked = acc.status === 'Blocked';
                    return (
                      <tr
                        key={acc.id}
                        className={
                          isBlocked
                            ? 'bg-rose-50/40 dark:bg-rose-950/25'
                            : 'hover:bg-purple-50/20 dark:hover:bg-purple-900/20'
                        }
                      >
                        <td className="py-3.5 px-5 font-semibold text-[#2E1065] dark:text-purple-100">
                          {acc.name}
                          {isSelf && (
                            <span className="text-xs font-normal text-amber-700 dark:text-amber-400 ms-2">
                              {isAr ? '(حسابك الحالي)' : '(You)'}
                            </span>
                          )}
                        </td>
                        <td dir="ltr" className="py-3.5 px-4 text-left font-mono text-xs text-slate-600 dark:text-slate-300">
                          {acc.identifier}
                        </td>
                        <td dir="ltr" className="py-3.5 px-4 text-left font-mono text-xs text-slate-800 dark:text-slate-200">
                          {acc.pin}
                        </td>
                        <td className="py-3.5 px-4">
                          <select
                            disabled={isSelf}
                            value={acc.role}
                            onChange={(e) =>
                              void handleUpdateAccount(acc, { role: e.target.value as UserRole })
                            }
                            aria-label={acc.name}
                            className="px-2.5 py-1.5 text-xs font-semibold border border-slate-300 dark:border-purple-800/70 rounded-md bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#D97706] disabled:opacity-60"
                          >
                            <option value="Admin">{roleLabels.Admin}</option>
                            <option value="Limited">{roleLabels.Limited}</option>
                            <option value="M&E">{roleLabels['M&E']}</option>
                          </select>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`text-xs font-bold ${
                              isBlocked
                                ? 'text-rose-700 dark:text-rose-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {isBlocked
                              ? isAr
                                ? 'مجمد (Blocked)'
                                : 'Blocked'
                              : isAr
                              ? 'نشط (Active)'
                              : 'Active'}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 text-end whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            {!isSelf && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleUpdateAccount(acc, {
                                      status: isBlocked ? 'Active' : 'Blocked',
                                    })
                                  }
                                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md border cursor-pointer transition-colors ${
                                    isBlocked
                                      ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                                      : 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/50'
                                  }`}
                                >
                                  {isBlocked ? <CheckCircle2 size={13} /> : <Ban size={13} />}
                                  <span>
                                    {isBlocked
                                      ? isAr
                                        ? 'إلغاء التجميد'
                                        : 'Activate'
                                      : isAr
                                      ? 'تجميد فوري'
                                      : 'Block'}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteAccount(acc)}
                                  title={isAr ? 'حذف الحساب' : 'Delete Account'}
                                  className="p-1.5 text-slate-400 hover:text-rose-700 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-md cursor-pointer transition-colors"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'tech' ? (
        <form onSubmit={handleSaveTech} className="space-y-6">
          {/* Official & Backup Emails */}
          <section className="bg-white dark:bg-[#170D2B] rounded-xl border border-slate-200 dark:border-purple-900/60 p-6 space-y-4 shadow-xs">
            <h3 className="text-base font-bold text-[#2E1065] dark:text-purple-100">
              {isAr
                ? 'الإيميلات الرسمية والاحتياطية للمبادرة'
                : 'Official & Backup Initiative Emails'}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input
                type="email"
                dir="ltr"
                value={newEmailAddr}
                onChange={(e) => setNewEmailAddr(e.target.value)}
                placeholder="email@paramind.org"
                className="px-3 py-2 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 text-left focus:outline-none focus:ring-2 focus:ring-[#D97706]"
              />
              <input
                type="text"
                value={newEmailLabel}
                onChange={(e) => setNewEmailLabel(e.target.value)}
                placeholder={isAr ? 'الوصف (مثال: بريد الورش الرسمي)' : 'Label'}
                className="px-3 py-2 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 focus:outline-none focus:ring-2 focus:ring-[#D97706]"
              />
              <select
                value={newEmailType}
                onChange={(e) => setNewEmailType(e.target.value as 'official' | 'backup')}
                className="px-3 py-2 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#D97706]"
              >
                <option value="official">{isAr ? 'بريد رسمي' : 'Official'}</option>
                <option value="backup">{isAr ? 'بريد احتياطي' : 'Backup'}</option>
              </select>
              <button
                type="button"
                onClick={handleAddEmail}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#2E1065] hover:bg-purple-950 dark:bg-purple-700 dark:hover:bg-purple-600 rounded-lg cursor-pointer transition-colors"
              >
                <Plus size={15} />
                <span>{isAr ? 'إضافة بريد' : 'Add Email'}</span>
              </button>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-purple-900/60 border border-slate-200 dark:border-purple-900/60 rounded-lg">
              {tech.emails.length === 0 ? (
                <div className="p-4 text-xs text-slate-500 dark:text-slate-400 text-center">
                  {isAr ? 'لا توجد إيميلات مضافة' : 'No emails added'}
                </div>
              ) : (
                tech.emails.map((entry) => (
                  <div
                    key={entry.id}
                    className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm"
                  >
                    <div>
                      <span dir="ltr" className="font-mono font-semibold text-[#2E1065] dark:text-purple-200">
                        {entry.email}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 ms-2">
                        (
                        {entry.type === 'official'
                          ? isAr
                            ? 'رسمي'
                            : 'Official'
                          : isAr
                          ? 'احتياطي'
                          : 'Backup'}{' '}
                        — {entry.label})
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={entry.active}
                          onChange={(e) =>
                            setTech((prev) => ({
                              ...prev,
                              emails: prev.emails.map((item) =>
                                item.id === entry.id ? { ...item, active: e.target.checked } : item
                              ),
                            }))
                          }
                          className="accent-[#D97706]"
                        />
                        <span>{isAr ? 'مفعل' : 'Active'}</span>
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setTech((prev) => ({
                            ...prev,
                            emails: prev.emails.filter((item) => item.id !== entry.id),
                          }))
                        }
                        className="p-1 text-slate-400 hover:text-rose-700 dark:hover:text-rose-400 cursor-pointer"
                        aria-label="Remove"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Google Apps Script & Google Sheets Central Control */}
          <section className="bg-white dark:bg-[#170D2B] rounded-xl border border-slate-200 dark:border-purple-900/60 p-6 space-y-4 shadow-xs">
            <h3 className="text-base font-bold text-[#2E1065] dark:text-purple-100">
              {isAr
                ? 'الربط البرمجي والتحكم المركزي (Google Apps Script & Google Sheets)'
                : 'Remote Control Integration (Google Apps Script & Google Sheets)'}
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                {isAr ? 'رابط Google Apps Script (Web App URL)' : 'Google Apps Script Web App URL'}
              </label>
              <input
                type="url"
                dir="ltr"
                value={tech.appsScriptUrl}
                onChange={(e) => setTech((prev) => ({ ...prev, appsScriptUrl: e.target.value }))}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 text-left focus:outline-none focus:ring-2 focus:ring-[#D97706]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                {isAr
                  ? 'رابط جدول الإدارة المركزي (Google Sheet — 4 أعمدة: الاسم، البريد/المستخدم، رمز الدخول PIN، الصلاحية)'
                  : 'Admin Google Sheet URL (4 columns: Name, Email/Username, PIN, Role)'}
              </label>
              <input
                type="url"
                dir="ltr"
                value={tech.googleSheetUrl}
                onChange={(e) => setTech((prev) => ({ ...prev, googleSheetUrl: e.target.value }))}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 text-left focus:outline-none focus:ring-2 focus:ring-[#D97706]"
              />
            </div>

            <label className="flex items-start gap-2.5 p-3 bg-purple-50/40 dark:bg-[#1F1238] border border-purple-100 dark:border-purple-800/60 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={tech.enableRemoteAuth}
                onChange={(e) =>
                  setTech((prev) => ({ ...prev, enableRemoteAuth: e.target.checked }))
                }
                className="mt-1 accent-[#D97706]"
              />
              <span className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                <strong className="block text-[#2E1065] dark:text-purple-100">
                  {isAr
                    ? 'تفعيل التحقق المركزي عن بُعد من Google Sheets عند تسجيل الدخول'
                    : 'Enable remote authentication from Google Sheets on sign in'}
                </strong>
                {isAr
                  ? 'عند التفعيل، يتحقق التطبيق أولاً من جدول الإدارة (4 أعمدة: الاسم، البريد/اسم المستخدم، PIN، الصلاحية: Admin / Limited / Blocked). إذا تغيرت الحالة إلى Blocked يتوقف الحساب فوراً.'
                  : 'Checks the 4-column Google Sheet on login. Changing status to Blocked stops access immediately.'}
              </span>
            </label>

            {/* Apps Script Code Snippet */}
            <div className="border border-slate-200 dark:border-purple-900/60 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-purple-50/40 dark:bg-[#22123E] border-b border-slate-200 dark:border-purple-900/60 flex items-center justify-between">
                <span className="text-xs font-semibold text-[#2E1065] dark:text-purple-100">
                  {isAr
                    ? 'كود Google Apps Script الجاهز للربط بالجدول ذي الـ 4 أعمدة وإرسال الإيميلات'
                    : 'Google Apps Script snippet (4-column Sheet auth & email dispatch)'}
                </span>
                <button
                  type="button"
                  onClick={handleCopyScript}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#D97706] dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:underline cursor-pointer"
                >
                  <Copy size={13} />
                  <span>
                    {copiedScript
                      ? isAr
                        ? 'تم نسخ الكود'
                        : 'Copied'
                      : isAr
                      ? 'نسخ الكود'
                      : 'Copy Code'}
                  </span>
                </button>
              </div>
              <pre
                dir="ltr"
                className="p-4 text-xs font-mono bg-[#1B093B] dark:bg-[#0B0416] text-amber-100 overflow-x-auto max-h-56"
              >
                {APPS_SCRIPT_SNIPPET}
              </pre>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingTech}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg disabled:opacity-60 cursor-pointer shadow-xs"
              >
                <Save size={16} />
                <span>
                  {savingTech
                    ? isAr
                      ? 'جاري الحفظ...'
                      : 'Saving...'
                    : isAr
                    ? 'حفظ البنية التقنية'
                    : 'Save Technical Settings'}
                </span>
              </button>
            </div>
          </section>
        </form>
      ) : activeTab === 'template' ? (
        <form
          onSubmit={handleSaveTemplate}
          className="bg-white dark:bg-[#170D2B] rounded-xl border border-slate-200 dark:border-purple-900/60 p-6 space-y-5 shadow-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-[#2E1065] dark:text-purple-100">
                {isAr
                  ? 'ضبط القالب الرسمي وترويسة الرسالة المعتمدة'
                  : 'Official Message Template & Header'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isAr ? 'المتغيرات المتاحة:' : 'Placeholders:'} <code dir="ltr">{'{name}'}</code> ,{' '}
                <code dir="ltr">{'{workshop}'}</code> , <code dir="ltr">{'{whatsapp_link}'}</code>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTemplate((prev) => ({ ...prev, isLocked: !prev.isLocked }))}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border cursor-pointer transition-colors ${
                template.isLocked
                  ? 'bg-[#2E1065] dark:bg-purple-700 border-[#2E1065] dark:border-purple-600 text-white'
                  : 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300'
              }`}
            >
              {template.isLocked ? <Lock size={14} className="text-amber-300" /> : <Unlock size={14} />}
              <span>
                {template.isLocked
                  ? isAr
                    ? 'القالب مقفل (لا يمكن للأعضاء تغييره)'
                    : 'Template Locked (Read-only for operators)'
                  : isAr
                  ? 'القالب مفتوح (يسمح بالتعديل المؤقت)'
                  : 'Template Unlocked'}
              </span>
            </button>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              {isAr ? 'الترويسة الرسمية' : 'Official Header'}
            </label>
            <input
              type="text"
              required
              value={template.header}
              onChange={(e) => setTemplate((prev) => ({ ...prev, header: e.target.value }))}
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#D97706]"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              {isAr ? 'عنوان الرسالة (Subject)' : 'Email Subject'}
            </label>
            <input
              type="text"
              required
              value={template.subject}
              onChange={(e) => setTemplate((prev) => ({ ...prev, subject: e.target.value }))}
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#D97706]"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              {isAr ? 'نص الرسالة الرسمي' : 'Message Body'}
            </label>
            <textarea
              rows={7}
              required
              value={template.body}
              onChange={(e) => setTemplate((prev) => ({ ...prev, body: e.target.value }))}
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 resize-none focus:outline-none focus:ring-2 focus:ring-[#D97706]"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingTemplate}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg disabled:opacity-60 cursor-pointer shadow-xs"
            >
              <Save size={16} />
              <span>
                {savingTemplate
                  ? isAr
                    ? 'جاري الحفظ...'
                    : 'Saving...'
                  : isAr
                  ? 'حفظ القالب المعتمد'
                  : 'Save Official Template'}
              </span>
            </button>
          </div>
        </form>
      ) : (
        /* Audit Log Tab */
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-[#1E1136] rounded-lg">
              {(
                [
                  ['all', isAr ? 'الكل' : 'All'],
                  ['dispatch', isAr ? 'إرسال الورش' : 'Dispatches'],
                  ['rbac', isAr ? 'الحسابات والصلاحيات' : 'RBAC'],
                  ['report', isAr ? 'تقارير التقييم' : 'Reports'],
                  ['auth', isAr ? 'تسجيل الدخول' : 'Auth'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAuditFilter(key)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                    auditFilter === key
                      ? 'bg-[#2E1065] dark:bg-purple-700 text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:text-[#2E1065] dark:hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void loadAll()}
              className="text-xs font-semibold text-[#D97706] dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:underline cursor-pointer"
            >
              {isAr ? 'تحديث السجل' : 'Refresh Log'}
            </button>
          </div>

          <div className="bg-white dark:bg-[#170D2B] rounded-xl border border-slate-200 dark:border-purple-900/60 overflow-hidden shadow-xs">
            {filteredLogs.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400 flex flex-col items-center gap-2">
                <AlertCircle size={24} className="text-purple-300 dark:text-purple-500" />
                <span>
                  {isAr
                    ? 'لا توجد أحداث مسجلة في هذا التصنيف حتى الآن'
                    : 'No events logged in this category yet'}
                </span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-purple-900/60 bg-purple-50/50 dark:bg-[#22123E] text-xs font-semibold text-[#2E1065] dark:text-purple-200">
                      <th className="py-3 px-4 text-start">{isAr ? 'التاريخ والوقت' : 'Timestamp'}</th>
                      <th className="py-3 px-4 text-start">{isAr ? 'القائم بالعملية' : 'Actor'}</th>
                      <th className="py-3 px-4 text-start">{isAr ? 'الورشة' : 'Workshop'}</th>
                      <th className="py-3 px-4 text-center">{isAr ? 'الرسائل المرسلة' : 'Sent'}</th>
                      <th className="py-3 px-4 text-start">{isAr ? 'التفاصيل' : 'Details'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-purple-900/60">
                    {filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-purple-50/20 dark:hover:bg-purple-900/20">
                        <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap tabular-nums">
                          {formatArabicDate(log.createdAt, lang)}{' '}
                          <span className="text-slate-400 dark:text-slate-500">
                            {new Date(log.createdAt).toLocaleTimeString(
                              isAr ? 'ar-EG' : 'en-US',
                              { hour: '2-digit', minute: '2-digit' }
                            )}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#2E1065] dark:text-purple-100">{log.actorName}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{log.actorRole}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-700 dark:text-slate-200">
                          {log.workshopTitle || '—'}
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-[#D97706] dark:text-amber-400 tabular-nums">
                          {typeof log.messagesSent === 'number' ? log.messagesSent : '—'}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300">{log.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
