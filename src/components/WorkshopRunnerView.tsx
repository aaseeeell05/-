import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  Send,
  Copy,
  Download,
  Lock,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Phone,
  Mail,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { AuthSession, TemplateSettings } from '../types/evaluation';

interface WorkshopRunnerViewProps {
  session: AuthSession;
  onAuthError: (message: string, forceLogout?: boolean) => void;
}

interface ParsedRow {
  [key: string]: string;
}

interface ParticipantRecord {
  name: string;
  email: string;
  phone: string;
}

interface RunnerConfigResponse {
  template: TemplateSettings;
  appsScriptConfigured: boolean;
  activeSenderLabel: string;
}

function guessColumn(headers: string[], candidates: string[]): string {
  const lowerHeaders = headers.map((h) => ({ raw: h, norm: h.trim().toLowerCase() }));
  for (const cand of candidates) {
    const found = lowerHeaders.find((h) => h.norm.includes(cand));
    if (found) return found.raw;
  }
  return '';
}

export const WorkshopRunnerView: React.FC<WorkshopRunnerViewProps> = ({
  session,
  onAuthError,
}) => {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';

  const [workshopTitle, setWorkshopTitle] = useState('');
  const [whatsappLink, setWhatsappLink] = useState('');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<ParsedRow[]>([]);

  const [nameCol, setNameCol] = useState('');
  const [emailCol, setEmailCol] = useState('');
  const [phoneCol, setPhoneCol] = useState('');

  const [template, setTemplate] = useState<TemplateSettings>({
    header: 'مبادرة PARAMIND — دعوة حضور رسمية',
    subject: 'تأكيد تسجيلك ورابط مجموعة الواتساب لورشة: {workshop}',
    body: '',
    isLocked: true,
  });
  const [appsScriptConfigured, setAppsScriptConfigured] = useState(false);
  const [activeSenderLabel, setActiveSenderLabel] = useState('');

  const [customHeader, setCustomHeader] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [customBody, setCustomBody] = useState('');

  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [copiedPhones, setCopiedPhones] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    const loadConfig = async () => {
      try {
        const res = await fetch('/api/workshop-runner/config', {
          headers: { 'x-auth-token': session.token },
        });
        if (res.status === 401 || res.status === 403) {
          const errData = (await res.json().catch(() => ({}))) as { error?: string };
          onAuthError(
            errData.error || (isAr ? 'تم إيقاف صلاحية الوصول.' : 'Access revoked.'),
            true
          );
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as RunnerConfigResponse;
        if (!active) return;
        setTemplate(data.template);
        setCustomHeader(data.template.header);
        setCustomSubject(data.template.subject);
        setCustomBody(data.template.body);
        setAppsScriptConfigured(data.appsScriptConfigured);
        setActiveSenderLabel(data.activeSenderLabel);
      } catch {
        // Keep fallback
      }
    };
    void loadConfig();
    return () => {
      active = false;
    };
  }, [session.token, onAuthError, isAr]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setSuccessMsg('');

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        throw new Error(
          isAr ? 'الملف لا يحتوي على أي ورقة بيانات.' : 'File contains no worksheet.'
        );
      }
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
        defval: '',
      });

      if (jsonRows.length === 0) {
        throw new Error(isAr ? 'جدول المشاركين فارغ.' : 'Participants sheet is empty.');
      }

      const detectedHeaders = Object.keys(jsonRows[0]).filter((k) => k.trim() !== '');
      const normalizedRows: ParsedRow[] = jsonRows.map((row) => {
        const out: ParsedRow = {};
        for (const h of detectedHeaders) {
          out[h] = String(row[h] ?? '').trim();
        }
        return out;
      });

      setFileName(file.name);
      setHeaders(detectedHeaders);
      setRawRows(normalizedRows);

      setNameCol(
        guessColumn(detectedHeaders, ['الاسم', 'اسم', 'name', 'full name', 'participant']) ||
          detectedHeaders[0] ||
          ''
      );
      setEmailCol(
        guessColumn(detectedHeaders, ['البريد', 'ايميل', 'إيميل', 'email', 'e-mail', 'mail'])
      );
      setPhoneCol(
        guessColumn(detectedHeaders, [
          'هاتف',
          'جوال',
          'موبايل',
          'رقم',
          'واتساب',
          'phone',
          'mobile',
          'whatsapp',
          'tel',
        ])
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isAr
          ? 'تعذر قراءة ملف Excel/CSV.'
          : 'Could not read Excel/CSV file.'
      );
    }
    e.target.value = '';
  };

  const participants: ParticipantRecord[] = useMemo(() => {
    return rawRows
      .map((row) => ({
        name: (nameCol ? row[nameCol] : '') || (isAr ? 'مشارك' : 'Participant'),
        email: (emailCol ? row[emailCol] : '').trim(),
        phone: (phoneCol ? row[phoneCol] : '').trim(),
      }))
      .filter((p) => p.name || p.email || p.phone);
  }, [rawRows, nameCol, emailCol, phoneCol, isAr]);

  const withEmailList = useMemo(
    () => participants.filter((p) => p.email.includes('@')),
    [participants]
  );

  const phoneOnlyList = useMemo(
    () => participants.filter((p) => !p.email.includes('@') && p.phone.length > 0),
    [participants]
  );

  const canEditTemplate = !template.isLocked || session.role === 'Admin';

  const handleCopyPhones = async () => {
    if (phoneOnlyList.length === 0) return;
    const text = phoneOnlyList.map((p) => `${p.name}: ${p.phone}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPhones(true);
      window.setTimeout(() => setCopiedPhones(false), 2500);
    } catch {
      setError(
        isAr
          ? 'تعذر النسخ التلقائي. يمكنك تصدير ملف CSV للأرقام.'
          : 'Could not copy automatically. Please export the CSV instead.'
      );
    }
  };

  const handleExportPhonesCsv = () => {
    if (phoneOnlyList.length === 0) return;
    const lines = [isAr ? 'الاسم,رقم الهاتف (بدون بريد إلكتروني)' : 'Name,Phone (No Email)'];
    for (const p of phoneOnlyList) {
      const safeName = `"${p.name.replace(/"/g, '""')}"`;
      const safePhone = `"${p.phone.replace(/"/g, '""')}"`;
      lines.push(`${safeName},${safePhone}`);
    }
    const blob = new Blob(['\uFEFF', lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PARAMIND_phones_${(workshopTitle || 'workshop').replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!workshopTitle.trim()) {
      setError(isAr ? 'يرجى إدخال عنوان الورشة الحالية.' : 'Please enter the workshop title.');
      return;
    }
    if (!whatsappLink.trim()) {
      setError(
        isAr ? 'يرجى لصق رابط مجموعة الواتساب الخاص بالورشة.' : 'Please paste the WhatsApp group link.'
      );
      return;
    }
    if (participants.length === 0) {
      setError(
        isAr
          ? 'يرجى رفع ملف المشاركين (Excel أو CSV) أولاً.'
          : 'Please upload the participants file (Excel/CSV) first.'
      );
      return;
    }
    if (withEmailList.length === 0) {
      setError(
        isAr
          ? 'لا يوجد مشاركون يملكون بريداً إلكترونياً صالحاً في الملف المرفوع.'
          : 'No participants with a valid email address were found in the file.'
      );
      return;
    }

    setIsSending(true);
    try {
      const res = await fetch('/api/workshop-runner/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': session.token,
        },
        body: JSON.stringify({
          workshopTitle: workshopTitle.trim(),
          whatsappLink: whatsappLink.trim(),
          recipients: participants,
          ...(canEditTemplate
            ? {
                customHeader,
                customSubject,
                customBody,
              }
            : {}),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (res.status === 401 || res.status === 403) {
        onAuthError(
          data.error || (isAr ? 'تم إيقاف صلاحية هذا الحساب.' : 'Account access revoked.'),
          true
        );
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || (isAr ? 'تعذر إتمام عملية الإرسال.' : 'Dispatch failed.'));
      }

      setSuccessMsg(
        data.message ||
          (isAr
            ? 'تم إرسال الدعوات بنجاح وتوثيق العملية في سجل المراقبة.'
            : 'Invitations dispatched and logged in the Audit Log.')
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isAr
          ? 'حدث خطأ أثناء الإرسال.'
          : 'Error while sending.'
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      {/* Header */}
      <div className="bg-white dark:bg-[#170D2B] rounded-xl border border-slate-200 dark:border-purple-900/60 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-[#2E1065] dark:text-purple-100">
            {isAr ? 'تشغيل الورشة وإرسال الدعوات' : 'Workshop Runner & Invitations'}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            {isAr
              ? 'رفع كشف المشاركين، ربط مجموعة الواتساب، وإرسال الدعوات الرسمية للورشة الحالية فقط'
              : 'Upload participant sheet, attach WhatsApp link, and dispatch invitations for this workshop'}
          </p>
        </div>
        <div className="text-xs text-slate-600 dark:text-slate-300 shrink-0">
          <div className="font-semibold text-[#2E1065] dark:text-purple-100">{session.name}</div>
          <div>
            {isAr ? 'الصلاحية:' : 'Role:'}{' '}
            <span className="font-medium text-amber-700 dark:text-amber-400">
              {session.role === 'Admin'
                ? isAr
                  ? 'أدمن'
                  : 'Admin'
                : isAr
                ? 'تشغيل الورشة فقط (نشاط محدود)'
                : 'Workshop Runner Only (Limited)'}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 px-4 py-3 rounded-xl text-sm flex items-center gap-2.5"
        >
          <AlertCircle size={18} className="shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div
          role="status"
          className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 px-4 py-3 rounded-xl text-sm flex items-center gap-2.5"
        >
          <CheckCircle2 size={18} className="shrink-0 text-emerald-700 dark:text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleDispatch} className="space-y-6">
        {/* Step 1: Workshop & WhatsApp Link */}
        <section className="bg-white dark:bg-[#170D2B] rounded-xl border border-slate-200 dark:border-purple-900/60 overflow-hidden shadow-xs">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-[#22123E] flex items-center gap-2.5">
            <span className="text-xs font-mono font-bold text-[#D97706] dark:text-amber-400">01</span>
            <h3 className="text-lg font-bold text-[#2E1065] dark:text-purple-100">
              {isAr ? 'بيانات الورشة ورابط الواتساب' : 'Workshop & WhatsApp Group Link'}
            </h3>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label htmlFor="run-title" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                {isAr ? 'عنوان الورشة الموكلة إليك' : 'Assigned Workshop Title'}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <input
                id="run-title"
                type="text"
                required
                value={workshopTitle}
                onChange={(e) => setWorkshopTitle(e.target.value)}
                placeholder={
                  isAr ? 'مثال: مهارات الإسعاف النفسي الأولي' : 'e.g., Psychological First Aid'
                }
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="run-wa" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                {isAr ? 'رابط مجموعة الواتساب' : 'WhatsApp Group Link'}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <input
                id="run-wa"
                type="url"
                dir="ltr"
                required
                value={whatsappLink}
                onChange={(e) => setWhatsappLink(e.target.value)}
                placeholder="https://chat.whatsapp.com/..."
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 text-left focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:border-transparent"
              />
            </div>
          </div>
        </section>

        {/* Step 2: Upload Excel/CSV Participants */}
        <section className="bg-white dark:bg-[#170D2B] rounded-xl border border-slate-200 dark:border-purple-900/60 overflow-hidden shadow-xs">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-[#22123E] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-mono font-bold text-[#D97706] dark:text-amber-400">02</span>
              <h3 className="text-lg font-bold text-[#2E1065] dark:text-purple-100">
                {isAr ? 'ملف المشاركين (Excel / CSV)' : 'Participants File (Excel / CSV)'}
              </h3>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#2E1065] hover:bg-purple-950 dark:bg-purple-700 dark:hover:bg-purple-600 rounded-lg cursor-pointer transition-colors"
            >
              <Upload size={15} />
              <span>
                {fileName
                  ? isAr
                    ? 'تغيير الملف'
                    : 'Change File'
                  : isAr
                  ? 'رفع ملف Excel / CSV'
                  : 'Upload Excel / CSV'}
              </span>
            </button>
          </div>

          <div className="p-6 space-y-5">
            {!fileName ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border border-dashed border-purple-200 dark:border-purple-700/70 rounded-xl py-10 px-6 text-center hover:bg-purple-50/30 dark:hover:bg-purple-900/20 transition-colors cursor-pointer"
              >
                <FileSpreadsheet size={34} className="mx-auto text-purple-400 dark:text-purple-300 mb-2.5" />
                <p className="text-sm font-semibold text-[#2E1065] dark:text-purple-100">
                  {isAr
                    ? 'اضغط لاختيار ملف المشاركين (.xlsx أو .xls أو .csv)'
                    : 'Click to upload participants sheet (.xlsx, .xls, or .csv)'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {isAr
                    ? 'يُستخرج البريد الإلكتروني وأرقام الهواتف للورشة الحالية فقط وفق سياسة حماية البيانات'
                    : 'Emails and phone numbers are extracted for the current workshop only'}
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[#2E1065] dark:text-purple-100 bg-purple-50/40 dark:bg-[#1F1238] px-4 py-2.5 rounded-lg border border-purple-100 dark:border-purple-800/60">
                  <span className="font-semibold">
                    {isAr ? 'الملف المحمّل:' : 'Loaded file:'} {fileName}
                  </span>
                  <span className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                    {isAr ? 'إجمالي الصفوف:' : 'Total rows:'} {rawRows.length}
                  </span>
                </div>

                {/* Column mapping */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      {isAr ? 'عمود الاسم' : 'Name Column'}
                    </label>
                    <select
                      value={nameCol}
                      onChange={(e) => setNameCol(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#D97706]"
                    >
                      <option value="">{isAr ? '— غير محدد —' : '— Unmapped —'}</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      {isAr ? 'عمود البريد الإلكتروني' : 'Email Column'}
                    </label>
                    <select
                      value={emailCol}
                      onChange={(e) => setEmailCol(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#D97706]"
                    >
                      <option value="">{isAr ? '— لا يوجد —' : '— None —'}</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      {isAr ? 'عمود رقم الهاتف / الواتساب' : 'Phone / WhatsApp Column'}
                    </label>
                    <select
                      value={phoneCol}
                      onChange={(e) => setPhoneCol(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#D97706]"
                    >
                      <option value="">{isAr ? '— لا يوجد —' : '— None —'}</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 3-Column Metrics */}
                <div className="bg-slate-50 dark:bg-[#1E1136] rounded-xl border border-slate-200 dark:border-purple-900/60 grid grid-cols-3 divide-x rtl:divide-x-reverse divide-slate-200 dark:divide-purple-900/60">
                  <div className="px-4 py-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {isAr ? 'إجمالي المشاركين' : 'Total Participants'}
                    </p>
                    <p className="text-xl font-bold text-[#2E1065] dark:text-purple-100 tabular-nums mt-0.5">
                      {participants.length}
                    </p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Mail size={13} className="text-emerald-700 dark:text-emerald-400" />
                      <span>{isAr ? 'لديهم بريد (للإرسال)' : 'With Email (Ready)'}</span>
                    </p>
                    <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
                      {withEmailList.length}
                    </p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Phone size={13} className="text-[#D97706] dark:text-amber-400" />
                      <span>{isAr ? 'أرقام بدون بريد' : 'Phone Only (No Email)'}</span>
                    </p>
                    <p className="text-xl font-bold text-[#D97706] dark:text-amber-400 tabular-nums mt-0.5">
                      {phoneOnlyList.length}
                    </p>
                  </div>
                </div>

                {/* Privacy-Scoped Phone-only List */}
                {phoneOnlyList.length > 0 && (
                  <div className="border border-amber-200 dark:border-amber-700/50 bg-amber-50/40 dark:bg-amber-950/30 rounded-xl p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-bold text-[#2E1065] dark:text-amber-200">
                          {isAr
                            ? 'أرقام بدون بريد إلكتروني (للورشة الحالية فقط)'
                            : 'Phone Numbers Without Email (Current Workshop Only)'}
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          {isAr
                            ? 'يمكنك نسخ أو تصدير هذه الأرقام لإضافتهم يدوياً لمجموعة الواتساب'
                            : 'Copy or export these numbers to add them manually to the WhatsApp group'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleCopyPhones}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#2E1065] dark:text-purple-100 bg-white dark:bg-[#1E1136] border border-purple-200 dark:border-purple-700/60 hover:bg-purple-50 dark:hover:bg-[#2A184A] rounded-lg cursor-pointer"
                        >
                          <Copy size={13} />
                          <span>
                            {copiedPhones
                              ? isAr
                                ? 'تم النسخ'
                                : 'Copied'
                              : isAr
                              ? 'نسخ الأرقام'
                              : 'Copy Numbers'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={handleExportPhonesCsv}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg cursor-pointer"
                        >
                          <Download size={13} />
                          <span>{isAr ? 'تصدير CSV' : 'Export CSV'}</span>
                        </button>
                      </div>
                    </div>

                    <div className="max-h-40 overflow-y-auto bg-white dark:bg-[#170D2B] border border-amber-200 dark:border-amber-700/40 rounded-lg divide-y divide-slate-200 dark:divide-purple-900/60 text-xs">
                      {phoneOnlyList.map((p, idx) => (
                        <div key={idx} className="px-3.5 py-2 flex items-center justify-between gap-3">
                          <span className="font-medium text-slate-900 dark:text-slate-100">{p.name}</span>
                          <span dir="ltr" className="font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                            {p.phone}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* Step 3: Approved Message Template */}
        <section className="bg-white dark:bg-[#170D2B] rounded-xl border border-slate-200 dark:border-purple-900/60 overflow-hidden shadow-xs">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-[#22123E] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-mono font-bold text-[#D97706] dark:text-amber-400">03</span>
              <h3 className="text-lg font-bold text-[#2E1065] dark:text-purple-100">
                {isAr ? 'القالب الرسمي للرسالة' : 'Official Message Template'}
              </h3>
            </div>
            {template.isLocked && session.role !== 'Admin' && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                <Lock size={13} className="text-[#D97706] dark:text-amber-400" />
                <span>
                  {isAr
                    ? 'القالب مقفل من الإدارة ولا يمكن تعديله'
                    : 'Template is locked by Admin'}
                </span>
              </span>
            )}
          </div>

          <div className="p-6 space-y-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {isAr ? 'جهة الإرسال المعتمدة:' : 'Sender:'}{' '}
              <span className="font-semibold text-[#2E1065] dark:text-purple-200">
                {activeSenderLabel || (isAr ? 'البريد الرسمي للمبادرة' : 'Official Initiative Email')}
              </span>
              {' · '}
              {isAr ? 'حالة الربط:' : 'Integration:'}{' '}
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {appsScriptConfigured
                  ? isAr
                    ? 'مرتبط بـ Google Apps Script'
                    : 'Connected to Google Apps Script'
                  : isAr
                  ? 'تسجيل مركزي (اربط Apps Script من لوحة الإدارة للإرسال التلقائي)'
                  : 'Logged locally (Connect Apps Script in Admin Console for auto-send)'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                {isAr ? 'الترويسة الرسمية' : 'Official Header'}
              </label>
              <input
                type="text"
                disabled={!canEditTemplate}
                value={customHeader}
                onChange={(e) => setCustomHeader(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#D97706] disabled:bg-slate-50 dark:disabled:bg-[#140A26] disabled:text-slate-600 dark:disabled:text-slate-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                {isAr ? 'عنوان الرسالة (Subject)' : 'Email Subject'}
              </label>
              <input
                type="text"
                disabled={!canEditTemplate}
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#D97706] disabled:bg-slate-50 dark:disabled:bg-[#140A26] disabled:text-slate-600 dark:disabled:text-slate-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                {isAr ? 'نص الرسالة الرسمي' : 'Message Body'}
              </label>
              <textarea
                rows={6}
                disabled={!canEditTemplate}
                value={customBody}
                onChange={(e) => setCustomBody(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#D97706] disabled:bg-slate-50 dark:disabled:bg-[#140A26] disabled:text-slate-600 dark:disabled:text-slate-400 resize-none"
              />
            </div>
          </div>
        </section>

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSending || withEmailList.length === 0}
            className="inline-flex items-center justify-center gap-2 bg-[#D97706] hover:bg-amber-600 text-white font-semibold text-sm px-6 py-3 rounded-lg transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
          >
            <Send size={17} />
            <span>
              {isSending
                ? isAr
                  ? 'جاري الإرسال والتوثيق...'
                  : 'Dispatching...'
                : isAr
                ? `إرسال الدعوات (${withEmailList.length} مشارك)`
                : `Send Invitations (${withEmailList.length})`}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
};
