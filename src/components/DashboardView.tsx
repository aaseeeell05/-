import React, { useMemo, useState } from 'react';
import {
  FileText,
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  AlertTriangle,
  Download,
  Settings,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import {
  EvaluationReport,
  SiteSettings,
  formatArabicDate,
  getReportAverage,
  getScoreLabel,
  getSectionAverage,
} from '../types/evaluation';
import { downloadReportAsPdf, downloadReportAsWord } from '../utils/exportReport';

interface DashboardViewProps {
  reports: EvaluationReport[];
  siteSettings: SiteSettings;
  isLoading: boolean;
  isAdmin: boolean;
  onCreateNew: () => void;
  onViewReport: (report: EvaluationReport) => void;
  onEditReport: (report: EvaluationReport) => void;
  onDeleteReport: (id: string) => Promise<void>;
  onOpenAdminSettings: () => void;
}

type FilterMode = 'all' | 'high' | 'attention';

export const DashboardView: React.FC<DashboardViewProps> = ({
  reports,
  siteSettings,
  isLoading,
  isAdmin,
  onCreateNew,
  onViewReport,
  onEditReport,
  onDeleteReport,
  onOpenAdminSettings,
}) => {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [pendingDelete, setPendingDelete] = useState<EvaluationReport | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [exportingPdfId, setExportingPdfId] = useState<string | null>(null);

  const handleDownloadPdf = async (report: EvaluationReport) => {
    setExportingPdfId(report.id);
    try {
      await downloadReportAsPdf(report, siteSettings, lang);
    } finally {
      setExportingPdfId(null);
    }
  };

  const metrics = useMemo(() => {
    if (reports.length === 0) {
      return {
        total: 0,
        overallAvg: 0,
        trainerAvg: 0,
        facilitatorAvg: 0,
      };
    }

    const overallSum = reports.reduce((acc, r) => acc + getReportAverage(r), 0);
    const trainerSum = reports.reduce((acc, r) => acc + getSectionAverage(r.trainer), 0);
    const facilitatorSum = reports.reduce((acc, r) => acc + getSectionAverage(r.facilitator), 0);

    return {
      total: reports.length,
      overallAvg: Number((overallSum / reports.length).toFixed(2)),
      trainerAvg: Number((trainerSum / reports.length).toFixed(2)),
      facilitatorAvg: Number((facilitatorSum / reports.length).toFixed(2)),
    };
  }, [reports]);

  const filteredReports = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return reports.filter((report) => {
      const avg = getReportAverage(report);
      if (filterMode === 'high' && avg < 4.0) return false;
      if (filterMode === 'attention' && avg >= 3.5) return false;

      if (!q) return true;
      const haystack = [
        report.workshop.title,
        report.workshop.trainer,
        report.workshop.facilitator,
        report.workshop.location,
        report.evaluator,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [reports, searchQuery, filterMode]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await onDeleteReport(pendingDelete.id);
      setPendingDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#170D2B] px-6 py-5 rounded-xl border border-slate-200 dark:border-purple-900/60 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-[#2E1065] dark:text-purple-100">
            {isAr ? 'التقارير المنجزة' : 'Completed Reports'}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            {isAr
              ? 'سجل التقييمات الشاملة لورشات المبادرة ومؤشرات أداء المدربين والميسرين'
              : 'Comprehensive workshop evaluation archive and trainer & facilitator performance metrics'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={onOpenAdminSettings}
            className="px-4 py-2.5 rounded-lg font-semibold text-sm text-[#2E1065] dark:text-purple-100 bg-purple-50/70 dark:bg-purple-900/40 border border-purple-200 dark:border-purple-700/60 hover:bg-purple-100/80 dark:hover:bg-purple-900/60 transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Settings size={16} />
            <span>
              {isAdmin
                ? isAr
                  ? 'لوحة الإدارة'
                  : 'Admin Console'
                : isAr
                ? 'دخول الأدمن'
                : 'Admin Login'}
            </span>
          </button>
          <button
            type="button"
            onClick={onCreateNew}
            className="flex-1 sm:flex-initial bg-[#2E1065] hover:bg-purple-950 dark:bg-purple-700 dark:hover:bg-purple-600 text-white px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#D97706]"
          >
            <Plus size={18} />
            <span>{isAr ? 'إنشاء تقرير تقييم جديد' : 'New Evaluation Report'}</span>
          </button>
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="bg-white dark:bg-[#170D2B] rounded-xl border border-slate-200 dark:border-purple-900/60 grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x rtl:lg:divide-x-reverse divide-slate-200 dark:divide-purple-900/60">
        <div className="px-6 py-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {isAr ? 'إجمالي التقارير' : 'Total Reports'}
          </p>
          <p className="text-2xl font-bold text-[#2E1065] dark:text-purple-200 mt-1 tabular-nums">{metrics.total}</p>
        </div>
        <div className="px-6 py-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {isAr ? 'متوسط التقييم العام' : 'Overall Average'}
          </p>
          <p className="text-2xl font-bold text-[#D97706] dark:text-amber-400 mt-1 tabular-nums">
            {metrics.overallAvg > 0 ? `${metrics.overallAvg.toFixed(1)} / 5` : '—'}
          </p>
        </div>
        <div className="px-6 py-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {isAr ? 'متوسط أداء المدربين' : 'Trainer Average'}
          </p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
            {metrics.trainerAvg > 0 ? `${metrics.trainerAvg.toFixed(1)} / 5` : '—'}
          </p>
        </div>
        <div className="px-6 py-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {isAr ? 'متوسط التيسير والتنظيم' : 'Facilitator Average'}
          </p>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
            {metrics.facilitatorAvg > 0 ? `${metrics.facilitatorAvg.toFixed(1)} / 5` : '—'}
          </p>
        </div>
      </div>

      {/* Search & Segmented Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search
            size={16}
            className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isAr
                ? 'ابحث بعنوان الورشة، اسم المدرب، الميسر أو المقيّم...'
                : 'Search by workshop title, trainer, facilitator, or evaluator...'
            }
            className="w-full ps-10 pe-4 py-2 text-sm bg-white dark:bg-[#110822] border border-slate-300 dark:border-purple-800/70 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:border-transparent"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-[#1E1136] rounded-lg self-start md:self-auto">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filterMode === 'all'
                ? 'bg-[#2E1065] dark:bg-purple-700 text-white'
                : 'text-slate-700 dark:text-slate-300 hover:text-[#2E1065] dark:hover:text-white'
            }`}
          >
            {isAr ? `الكل (${reports.length})` : `All (${reports.length})`}
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('high')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filterMode === 'high'
                ? 'bg-[#2E1065] dark:bg-purple-700 text-white'
                : 'text-slate-700 dark:text-slate-300 hover:text-[#2E1065] dark:hover:text-white'
            }`}
          >
            {isAr ? 'أداء متميز (4.0+)' : 'High (4.0+)'}
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('attention')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filterMode === 'attention'
                ? 'bg-[#2E1065] dark:bg-purple-700 text-white'
                : 'text-slate-700 dark:text-slate-300 hover:text-[#2E1065] dark:hover:text-white'
            }`}
          >
            {isAr ? 'يحتاج متابعة (< 3.5)' : 'Needs Follow-up (< 3.5)'}
          </button>
        </div>
      </div>

      {/* Reports List / Table */}
      {isLoading ? (
        <div className="bg-white dark:bg-[#170D2B] rounded-xl border border-slate-200 dark:border-purple-900/60 divide-y divide-slate-200 dark:divide-purple-900/60">
          {[1, 2, 3].map((row) => (
            <div key={row} className="px-6 py-4 flex items-center justify-between animate-pulse">
              <div className="space-y-2 w-1/2">
                <div className="h-4 bg-slate-200 dark:bg-purple-900/50 rounded w-3/4" />
                <div className="h-3 bg-slate-100 dark:bg-purple-900/30 rounded w-1/2" />
              </div>
              <div className="h-4 bg-slate-200 dark:bg-purple-900/50 rounded w-20" />
            </div>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="py-16 px-6 text-center bg-white dark:bg-[#170D2B] rounded-xl border border-dashed border-purple-200 dark:border-purple-800/70">
          <FileText size={40} className="mx-auto text-purple-300 dark:text-purple-500 mb-3" />
          <h3 className="text-lg font-bold text-[#2E1065] dark:text-purple-100">
            {isAr ? 'لا توجد تقارير تقييم حتى الآن' : 'No evaluation reports yet'}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-6 max-w-md mx-auto">
            {isAr
              ? 'ابدأ بتوثيق أول تقرير تقييم شامل للورشات، بما يشمل معايير نجاح الورشة وأداء المدرب والميسر.'
              : 'Start documenting your first comprehensive workshop evaluation report.'}
          </p>
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex items-center gap-2 bg-[#D97706] hover:bg-amber-600 text-white font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors cursor-pointer"
          >
            <Plus size={18} />
            <span>{isAr ? 'إنشاء التقرير الأول' : 'Create First Report'}</span>
          </button>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="py-12 px-6 text-center bg-white dark:bg-[#170D2B] rounded-xl border border-slate-200 dark:border-purple-900/60">
          <p className="text-base font-semibold text-slate-800 dark:text-slate-200">
            {isAr ? 'لا توجد تقارير تطابق معايير البحث الحالية' : 'No reports match current filters'}
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setFilterMode('all');
            }}
            className="mt-3 text-sm font-semibold text-[#D97706] dark:text-amber-400 hover:underline cursor-pointer"
          >
            {isAr ? 'إعادة تعيين الفلاتر' : 'Reset Filters'}
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#170D2B] rounded-xl border border-slate-200 dark:border-purple-900/60 overflow-hidden shadow-xs">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-purple-900/60 bg-purple-50/50 dark:bg-[#22123E] text-xs font-semibold text-[#2E1065] dark:text-purple-200">
                  <th className="py-3 px-5 text-start">{isAr ? 'الورشة' : 'Workshop'}</th>
                  <th className="py-3 px-4 text-start">{isAr ? 'المدرب والميسر' : 'Trainer & Facilitator'}</th>
                  <th className="py-3 px-4 text-start">{isAr ? 'تاريخ الانعقاد' : 'Date'}</th>
                  <th className="py-3 px-4 text-start">{isAr ? 'المقيّم' : 'Evaluator'}</th>
                  <th className="py-3 px-4 text-end">{isAr ? 'التقييم العام' : 'Overall'}</th>
                  <th className="py-3 px-5 text-end">{isAr ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-purple-900/60 text-sm">
                {filteredReports.map((report) => {
                  const avg = getReportAverage(report);
                  const scoreMeta = getScoreLabel(avg, lang);
                  return (
                    <tr
                      key={report.id}
                      className="hover:bg-purple-50/25 dark:hover:bg-purple-900/20 transition-colors"
                    >
                      <td className="py-3.5 px-5 max-w-xs">
                        <button
                          type="button"
                          onClick={() => onViewReport(report)}
                          className="font-semibold text-[#2E1065] dark:text-purple-100 hover:text-[#D97706] dark:hover:text-amber-300 text-start truncate block w-full cursor-pointer transition-colors"
                          title={report.workshop.title}
                        >
                          {report.workshop.title || (isAr ? 'ورشة بدون عنوان' : 'Untitled Workshop')}
                        </button>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {report.workshop.location || (isAr ? 'عن بُعد / غير محدد' : 'Online / Unspecified')}
                          {(typeof report.workshop.attendeesCount === 'number' ||
                            typeof report.workshop.registeredCount === 'number') && (
                            <span className="tabular-nums">
                              {' '}
                              · {isAr ? 'الحضور:' : 'Att:'}{' '}
                              {typeof report.workshop.attendeesCount === 'number'
                                ? report.workshop.attendeesCount
                                : '—'}{' '}
                              / {isAr ? 'المسجلون:' : 'Reg:'}{' '}
                              {typeof report.workshop.registeredCount === 'number'
                                ? report.workshop.registeredCount
                                : '—'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-800 dark:text-slate-200">
                        <div className="truncate max-w-[200px]">{report.workshop.trainer || '—'}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                          {isAr ? 'الميسر:' : 'Facilitator:'} {report.workshop.facilitator || '—'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">
                        {formatArabicDate(report.workshop.date || report.createdAt, lang)}
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 dark:text-slate-200 truncate max-w-[140px]">
                        {report.evaluator || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-end whitespace-nowrap">
                        <div className="font-bold text-[#2E1065] dark:text-purple-200 tabular-nums">
                          {avg > 0 ? `${avg.toFixed(1)} / 5.0` : '—'}
                        </div>
                        <div className={`text-xs font-medium ${scoreMeta.colorClass}`}>
                          {scoreMeta.label}
                        </div>
                      </td>
                      <td className="py-3.5 px-5 text-end whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onViewReport(report)}
                            title={isAr ? 'عرض التقرير' : 'View Report'}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#2E1065] dark:text-purple-200 hover:bg-purple-50 dark:hover:bg-purple-900/40 rounded-md transition-colors cursor-pointer"
                          >
                            <Eye size={14} />
                            <span>{isAr ? 'عرض' : 'View'}</span>
                          </button>
                          <button
                            type="button"
                            disabled={exportingPdfId === report.id}
                            onClick={() => void handleDownloadPdf(report)}
                            title={isAr ? 'تحميل التقرير كملف PDF' : 'Download PDF'}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-md transition-colors disabled:opacity-60 cursor-pointer"
                            aria-label="PDF"
                          >
                            <Download size={14} />
                            <span>
                              {exportingPdfId === report.id
                                ? isAr
                                  ? 'جاري...'
                                  : '...'
                                : 'PDF'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void downloadReportAsWord(report, siteSettings, lang)}
                            title={isAr ? 'تحميل التقرير كملف Word' : 'Download Word'}
                            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-purple-800/70 hover:bg-slate-50 dark:hover:bg-[#2A184A] rounded-md transition-colors cursor-pointer"
                            aria-label="Word"
                          >
                            <span>Word</span>
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => onEditReport(report)}
                                title={isAr ? 'تعديل التقرير' : 'Edit Report'}
                                className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-[#2E1065] dark:hover:text-white hover:bg-purple-50 dark:hover:bg-purple-900/40 rounded-md transition-colors cursor-pointer"
                                aria-label={isAr ? 'تعديل التقرير' : 'Edit Report'}
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingDelete(report)}
                                title={isAr ? 'حذف التقرير' : 'Delete Report'}
                                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-rose-700 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-md transition-colors cursor-pointer"
                                aria-label={isAr ? 'حذف التقرير' : 'Delete Report'}
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

          {/* Mobile List */}
          <div className="md:hidden divide-y divide-slate-200 dark:divide-purple-900/60">
            {filteredReports.map((report) => {
              const avg = getReportAverage(report);
              const scoreMeta = getScoreLabel(avg, lang);
              return (
                <div key={report.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-bold text-[#2E1065] dark:text-purple-100 truncate">
                        {report.workshop.title || (isAr ? 'ورشة بدون عنوان' : 'Untitled Workshop')}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                        <span>{formatArabicDate(report.workshop.date || report.createdAt, lang)}</span>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span>
                          {isAr ? 'المدرب:' : 'Trainer:'} {report.workshop.trainer || '—'}
                        </span>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span>
                          {isAr ? 'الميسر:' : 'Facilitator:'} {report.workshop.facilitator || '—'}
                        </span>
                        {(typeof report.workshop.attendeesCount === 'number' ||
                          typeof report.workshop.registeredCount === 'number') && (
                          <>
                            <span className="mx-1.5" aria-hidden="true">·</span>
                            <span className="tabular-nums">
                              {isAr ? 'الحضور:' : 'Att:'}{' '}
                              {typeof report.workshop.attendeesCount === 'number'
                                ? report.workshop.attendeesCount
                                : '—'}{' '}
                              / {isAr ? 'المسجلون:' : 'Reg:'}{' '}
                              {typeof report.workshop.registeredCount === 'number'
                                ? report.workshop.registeredCount
                                : '—'}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="text-end shrink-0">
                      <div className="font-bold text-sm text-[#2E1065] dark:text-purple-200 tabular-nums">
                        {avg > 0 ? `${avg.toFixed(1)} / 5` : '—'}
                      </div>
                      <div className={`text-xs font-medium ${scoreMeta.colorClass}`}>
                        {scoreMeta.label}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onViewReport(report)}
                      className="flex-1 bg-purple-50 dark:bg-purple-900/40 hover:bg-purple-100 dark:hover:bg-purple-900/60 text-[#2E1065] dark:text-purple-100 text-xs font-semibold py-2 px-3 rounded-lg transition-colors cursor-pointer"
                    >
                      {isAr ? 'عرض التقرير' : 'View'}
                    </button>
                    <button
                      type="button"
                      disabled={exportingPdfId === report.id}
                      onClick={() => void handleDownloadPdf(report)}
                      className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg disabled:opacity-60 cursor-pointer"
                    >
                      <Download size={13} />
                      <span>{exportingPdfId === report.id ? '...' : 'PDF'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void downloadReportAsWord(report, siteSettings, lang)}
                      className="px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#2A184A] rounded-lg border border-slate-300 dark:border-purple-800/70 cursor-pointer"
                    >
                      Word
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => onEditReport(report)}
                          className="px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-purple-50 dark:hover:bg-purple-900/40 hover:text-[#2E1065] dark:hover:text-white rounded-lg border border-slate-300 dark:border-purple-800/70 cursor-pointer"
                        >
                          {isAr ? 'تعديل' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(report)}
                          className="px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg border border-rose-200 dark:border-rose-800/70 cursor-pointer"
                        >
                          {isAr ? 'حذف' : 'Delete'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 bg-[#1B093B]/60 dark:bg-black/70 backdrop-blur-[1px] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
        >
          <div className="bg-white dark:bg-[#170D2B] rounded-xl border border-slate-200 dark:border-purple-900/60 max-w-md w-full p-6 space-y-4 shadow-lg">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-lg shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 id="delete-dialog-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {isAr ? 'تأكيد حذف التقرير' : 'Confirm Report Deletion'}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  {isAr
                    ? `هل أنت متأكد من حذف تقرير ورشة «${pendingDelete.workshop.title}»؟ لا يمكن التراجع عن هذا الإجراء.`
                    : `Are you sure you want to delete the report for "${pendingDelete.workshop.title}"? This action cannot be undone.`}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setPendingDelete(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2A184A] rounded-lg transition-colors cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
              >
                {isDeleting
                  ? isAr
                    ? 'جاري الحذف...'
                    : 'Deleting...'
                  : isAr
                  ? 'تأكيد الحذف'
                  : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
