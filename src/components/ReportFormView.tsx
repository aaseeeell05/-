import React, { useState } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Star,
  Printer,
  Download,
  Pencil,
  CheckCircle2,
  AlertCircle,
  Save,
} from 'lucide-react';
import { getLocalizedQuestionText, useLanguage } from '../i18n/LanguageContext';
import {
  EvaluationFormData,
  EvaluationSectionKey,
  QuestionEvaluation,
  SiteSettings,
  formatArabicDate,
  getRatedCount,
  getReportAverage,
  getScoreLabel,
  getSectionAverage,
  getTotalQuestionsCount,
} from '../types/evaluation';
import {
  downloadReportAsHtml,
  downloadReportAsPdf,
  downloadReportAsWord,
} from '../utils/exportReport';

interface ReportFormViewProps {
  mode: 'form' | 'view-report';
  data: EvaluationFormData;
  siteSettings: SiteSettings;
  isSubmitting: boolean;
  isAdmin: boolean;
  onChange: (next: EvaluationFormData) => void;
  onSubmit: () => Promise<void>;
  onCancel: () => void;
  onSwitchToEdit: () => void;
  onOpenAdminSettings?: () => void;
}

const SCORE_TEXT: Record<'ar' | 'en', Record<number, string>> = {
  ar: {
    1: 'ضعيف',
    2: 'مقبول',
    3: 'جيد',
    4: 'جيد جداً',
    5: 'ممتاز',
  },
  en: {
    1: 'Poor',
    2: 'Acceptable',
    3: 'Good',
    4: 'Very Good',
    5: 'Excellent',
  },
};

export const ReportFormView: React.FC<ReportFormViewProps> = ({
  mode,
  data,
  siteSettings,
  isSubmitting,
  isAdmin,
  onChange,
  onSubmit,
  onCancel,
  onSwitchToEdit,
  onOpenAdminSettings,
}) => {
  const { lang, isRtl } = useLanguage();
  const isAr = lang === 'ar';

  const [validationError, setValidationError] = useState('');
  const [showMissingHighlights, setShowMissingHighlights] = useState(false);

  const isReadOnly = mode === 'view-report';
  const isEditing = Boolean(data.id);

  const overallAvg = getReportAverage(data);
  const successAvg = getSectionAverage(data.success);
  const trainerAvg = getSectionAverage(data.trainer);
  const facilitatorAvg = getSectionAverage(data.facilitator);
  const ratedCount = getRatedCount(data);
  const totalCount = getTotalQuestionsCount(data);
  const overallMeta = getScoreLabel(overallAvg, lang);

  const updateWorkshopField = <K extends keyof EvaluationFormData['workshop']>(
    field: K,
    value: EvaluationFormData['workshop'][K]
  ) => {
    onChange({
      ...data,
      workshop: { ...data.workshop, [field]: value },
    });
  };

  const handleScoreChange = (section: EvaluationSectionKey, index: number, score: number) => {
    const updated = data[section].map((item, i) =>
      i === index ? { ...item, score } : item
    );
    onChange({ ...data, [section]: updated });
    if (validationError) setValidationError('');
  };

  const handleReasonChange = (section: EvaluationSectionKey, index: number, reason: string) => {
    const updated = data[section].map((item, i) =>
      i === index ? { ...item, reason } : item
    );
    onChange({ ...data, [section]: updated });
    if (validationError) setValidationError('');
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;

    if (
      !data.workshop.title.trim() ||
      !data.workshop.date.trim() ||
      !data.workshop.trainer.trim() ||
      !data.workshop.facilitator.trim()
    ) {
      setValidationError(
        isAr
          ? 'يرجى استكمال الحقول الأساسية في القسم الأول (عنوان الورشة، التاريخ، المدرب، والميسر).'
          : 'Please complete the required fields in Section 1 (Workshop title, date, trainer, and facilitator).'
      );
      return;
    }

    if (ratedCount < totalCount) {
      setShowMissingHighlights(true);
      setValidationError(
        isAr
          ? `يرجى تقييم جميع المعايير بالنجوم قبل حفظ التقرير (تم تقييم ${ratedCount} من أصل ${totalCount} معياراً).`
          : `Please rate all criteria before saving (${ratedCount} of ${totalCount} rated).`
      );
      return;
    }

    const missingReasonsCount = [
      ...data.success,
      ...data.trainer,
      ...data.facilitator,
    ].filter((item) => item.score > 0 && item.score < 5 && !item.reason.trim()).length;

    if (missingReasonsCount > 0) {
      setShowMissingHighlights(true);
      setValidationError(
        isAr
          ? `يرجى كتابة سبب التقييم في جميع المعايير الحاصلة على أقل من 5 نجوم (يوجد ${missingReasonsCount} معياراً بحاجة لكتابة التقييم).`
          : `Please write an evaluation reason for all criteria rated below 5 stars (${missingReasonsCount} item(s) missing).`
      );
      return;
    }

    if (!data.evaluator.trim()) {
      setValidationError(
        isAr
          ? 'يرجى إدخال اسم العضو القائم على التقييم والمتابعة في القسم الخامس.'
          : 'Please enter the M&E evaluator name in Section 5.'
      );
      return;
    }

    setValidationError('');
    setShowMissingHighlights(false);
    await onSubmit();
  };

  const [exportingFormat, setExportingFormat] = useState<'pdf' | 'word' | 'html' | null>(null);

  const handleDownloadPdf = async () => {
    setExportingFormat('pdf');
    try {
      await downloadReportAsPdf(data, siteSettings, lang);
    } finally {
      setExportingFormat(null);
    }
  };

  const handleDownloadWord = async () => {
    setExportingFormat('word');
    try {
      await downloadReportAsWord(data, siteSettings, lang);
    } finally {
      setExportingFormat(null);
    }
  };

  const handleDownloadHtml = async () => {
    setExportingFormat('html');
    try {
      await downloadReportAsHtml(data, siteSettings, lang);
    } finally {
      setExportingFormat(null);
    }
  };

  const renderSectionQuestions = (
    sectionKey: EvaluationSectionKey,
    sectionNumber: string,
    title: string,
    sectionAverage: number,
    questions: QuestionEvaluation[]
  ) => (
    <section className="bg-white dark:bg-[#170D2B] rounded-xl border border-slate-200 dark:border-purple-900/60 overflow-hidden shadow-xs print-break-inside-avoid">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-[#22123E] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-mono font-bold text-[#D97706] dark:text-amber-400 tabular-nums">
            {sectionNumber}
          </span>
          <h3 className="text-lg font-bold text-[#2E1065] dark:text-purple-100">{title}</h3>
        </div>
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
          {isAr ? 'متوسط القسم:' : 'Section Average:'}{' '}
          <span className="text-[#2E1065] dark:text-purple-200">
            {sectionAverage > 0 ? `${sectionAverage.toFixed(1)} / 5.0` : '—'}
          </span>
        </div>
      </div>

      <div className="divide-y divide-slate-200 dark:divide-purple-900/60">
        {questions.map((qObj, idx) => {
          const needsReason = qObj.score > 0 && qObj.score < 5;
          const isMissingScore = showMissingHighlights && qObj.score === 0 && !isReadOnly;
          const isMissingReason =
            showMissingHighlights && needsReason && !qObj.reason.trim() && !isReadOnly;
          const isMissing = isMissingScore || isMissingReason;
          const displayQuestion = getLocalizedQuestionText(qObj.question, lang);

          return (
            <div
              key={idx}
              className={`px-6 py-5 transition-colors ${isMissing ? 'bg-rose-50/50 dark:bg-rose-950/30' : ''}`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
                <p className="text-sm md:text-base font-medium text-slate-900 dark:text-slate-100 leading-relaxed flex-1">
                  <span className="text-slate-400 dark:text-purple-400/70 font-mono text-xs me-2 tabular-nums">
                    {idx + 1}.
                  </span>
                  {displayQuestion}
                </p>

                <div className="flex items-center gap-3 shrink-0">
                  <div
                    className="inline-flex items-center gap-1"
                    role="group"
                    aria-label={displayQuestion}
                  >
                    {[1, 2, 3, 4, 5].map((star) => {
                      const active = star <= qObj.score;
                      return (
                        <button
                          key={star}
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => handleScoreChange(sectionKey, idx, star)}
                          aria-label={`${star} / 5`}
                          aria-pressed={qObj.score === star}
                          className={`p-1.5 rounded-md transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] ${
                            isReadOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110'
                          }`}
                        >
                          <Star
                            size={20}
                            className={
                              active
                                ? 'fill-[#D97706] text-[#D97706] dark:fill-amber-400 dark:text-amber-400'
                                : 'text-slate-300 dark:text-purple-800/70'
                            }
                          />
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 min-w-[70px] text-end tabular-nums">
                    {qObj.score > 0
                      ? `${qObj.score}/5 · ${SCORE_TEXT[lang][qObj.score]}`
                      : isAr
                      ? 'لم يقيّم'
                      : 'Not rated'}
                  </span>
                </div>
              </div>

              {isReadOnly ? (
                qObj.reason.trim() ? (
                  <p className="text-sm text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-[#1E1136] px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-purple-900/60">
                    <span className="font-semibold text-[#2E1065] dark:text-amber-300">
                      {isAr ? 'ملاحظة المقيّم: ' : 'Evaluator Note: '}
                    </span>
                    {qObj.reason}
                  </p>
                ) : null
              ) : (
                <div className="space-y-1.5">
                  {needsReason && (
                    <p
                      className={`text-xs font-semibold ${
                        isMissingReason
                          ? 'text-rose-700 dark:text-rose-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {isAr
                        ? 'كتابة التقييم / السبب إلزامية لأن التقييم أقل من 5 نجوم *'
                        : 'Written evaluation reason is required for ratings under 5 stars *'}
                    </p>
                  )}
                  <textarea
                    placeholder={
                      needsReason
                        ? isAr
                          ? 'يرجى كتابة سبب التقييم والملاحظات (إلزامي لأن النجوم أقل من 5)...'
                          : 'Please write the evaluation reason (required for < 5 stars)...'
                        : isAr
                        ? 'سبب التقييم أو الملاحظات الداعمة (اختياري)...'
                        : 'Evaluation notes or supporting details (optional)...'
                    }
                    aria-required={needsReason}
                    value={qObj.reason}
                    onChange={(e) => handleReasonChange(sectionKey, idx, e.target.value)}
                    rows={2}
                    className={`w-full px-3.5 py-2 text-sm border rounded-lg bg-slate-50 dark:bg-[#110822] focus:bg-white dark:focus:bg-[#140A26] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:border-transparent resize-none ${
                      isMissingReason
                        ? 'border-rose-400 bg-white dark:bg-rose-950/20'
                        : needsReason
                        ? 'border-amber-300 dark:border-amber-600/70'
                        : 'border-slate-300 dark:border-purple-800/70'
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="max-w-4xl mx-auto pb-12 space-y-6">
      {/* Contextual Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:text-[#2E1065] dark:hover:text-white px-3 py-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/40 transition-colors cursor-pointer"
          >
            {isRtl ? <ArrowRight size={17} /> : <ArrowLeft size={17} />}
            <span>{isAr ? 'العودة للوحة التحكم' : 'Back to Dashboard'}</span>
          </button>
          <span className="text-slate-300 dark:text-purple-800" aria-hidden="true">/</span>
          <h2 className="text-xl font-bold text-[#2E1065] dark:text-purple-100">
            {isReadOnly
              ? isAr
                ? 'استعراض تقرير التقييم'
                : 'View Evaluation Report'
              : isEditing
              ? isAr
                ? 'تعديل تقرير التقييم'
                : 'Edit Evaluation Report'
              : isAr
              ? 'تقرير تقييم ورشة جديدة'
              : 'New Workshop Evaluation Report'}
          </h2>
        </div>

        {isReadOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={exportingFormat !== null}
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 cursor-pointer shadow-xs"
            >
              <Download size={15} />
              <span>
                {exportingFormat === 'pdf'
                  ? isAr
                    ? 'جاري إنشاء PDF...'
                    : 'Generating PDF...'
                  : isAr
                  ? 'تحميل ملف PDF'
                  : 'Download PDF'}
              </span>
            </button>
            <button
              type="button"
              disabled={exportingFormat !== null}
              onClick={handleDownloadWord}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#2E1065] dark:text-purple-100 bg-white dark:bg-[#1E1136] border border-purple-200 dark:border-purple-700/60 hover:bg-purple-50 dark:hover:bg-[#2A184A] rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 cursor-pointer"
            >
              <Download size={15} />
              <span>{isAr ? 'تحميل ملف Word' : 'Download Word'}</span>
            </button>
            <button
              type="button"
              disabled={exportingFormat !== null}
              onClick={handleDownloadHtml}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#2E1065] dark:text-purple-100 bg-white dark:bg-[#1E1136] border border-purple-200 dark:border-purple-700/60 hover:bg-purple-50 dark:hover:bg-[#2A184A] rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 cursor-pointer"
            >
              <Download size={15} />
              <span>{isAr ? 'تحميل ملف HTML' : 'Download HTML'}</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-[#1E1136] border border-slate-300 dark:border-purple-800/70 hover:bg-slate-50 dark:hover:bg-[#2A184A] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer size={15} />
              <span>{isAr ? 'طباعة' : 'Print'}</span>
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={onSwitchToEdit}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#2E1065] hover:bg-purple-950 dark:bg-purple-700 dark:hover:bg-purple-600 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Pencil size={15} />
                <span>{isAr ? 'تعديل' : 'Edit'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Print Header */}
      <div className="hidden print:flex items-center gap-4 border-b border-[#2E1065] pb-4 mb-6">
        <img
          src="/assets/aistudio/6032600769661440235_120_a7b142b4.jpg"
          alt="PARAMIND Logo"
          referrerPolicy="no-referrer"
          className="w-14 h-14 rounded-full object-cover border border-amber-400 shrink-0"
        />
        <div>
          <h1 className="text-2xl font-bold text-[#2E1065]">
            {isAr
              ? 'PARAMIND — تقرير التقييم والمتابعة (M&E)'
              : 'PARAMIND — M&E Evaluation Report'}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {data.workshop.title} · {isAr ? 'تاريخ الإنشاء:' : 'Created:'}{' '}
            {formatArabicDate(data.createdAt, lang)}
          </p>
        </div>
      </div>

      {/* Executive Score Summary Strip */}
      <div className="bg-white dark:bg-[#170D2B] rounded-xl border border-slate-200 dark:border-purple-900/60 grid grid-cols-2 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x rtl:md:divide-x-reverse divide-slate-200 dark:divide-purple-900/60 shadow-xs">
        <div className="px-5 py-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {isAr ? 'التقييم العام' : 'Overall Rating'}
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-bold text-[#2E1065] dark:text-purple-200 tabular-nums">
              {overallAvg > 0 ? `${overallAvg.toFixed(1)} / 5` : '—'}
            </span>
            <span className={`text-xs font-semibold ${overallMeta.colorClass}`}>
              {overallMeta.label}
            </span>
          </div>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {isAr ? 'نجاح الورشة' : 'Workshop Success'}
          </p>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
            {successAvg > 0 ? `${successAvg.toFixed(1)} / 5` : '—'}
          </p>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {isAr ? 'أداء المدرب' : 'Trainer'}
          </p>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
            {trainerAvg > 0 ? `${trainerAvg.toFixed(1)} / 5` : '—'}
          </p>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {isAr ? 'الميسر والتنظيم' : 'Facilitator'}
          </p>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
            {facilitatorAvg > 0 ? `${facilitatorAvg.toFixed(1)} / 5` : '—'}
          </p>
        </div>
        <div className="px-5 py-4 col-span-2 md:col-span-1">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {isAr ? 'اكتمال المعايير' : 'Criteria Rated'}
          </p>
          <p className="text-lg font-bold text-[#D97706] dark:text-amber-400 mt-1 tabular-nums">
            {ratedCount} / {totalCount}
          </p>
        </div>
      </div>

      {validationError && (
        <div
          role="alert"
          className="bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 px-4 py-3 rounded-xl text-sm flex items-center gap-2.5 no-print"
        >
          <AlertCircle size={18} className="shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{validationError}</span>
        </div>
      )}

      <form onSubmit={handleFormSubmit} className="space-y-6">
        {/* Section 1: Workshop Information */}
        <section className="bg-white dark:bg-[#170D2B] rounded-xl border border-slate-200 dark:border-purple-900/60 overflow-hidden shadow-xs print-break-inside-avoid">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-[#22123E] flex items-center gap-2.5">
            <span className="text-xs font-mono font-bold text-[#D97706] dark:text-amber-400">01</span>
            <h3 className="text-lg font-bold text-[#2E1065] dark:text-purple-100">
              {isAr ? 'القسم الأول: معلومات الورشة' : 'Section 1: Workshop Information'}
            </h3>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label htmlFor="ws-title" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                {isAr ? 'عنوان الورشة' : 'Workshop Title'} <span className="text-rose-500">*</span>
              </label>
              <input
                id="ws-title"
                type="text"
                required
                disabled={isReadOnly}
                value={data.workshop.title}
                onChange={(e) => updateWorkshopField('title', e.target.value)}
                placeholder={
                  isAr ? 'مثال: أساسيات الدعم النفسي الأولي' : 'e.g., Psychological First Aid Basics'
                }
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:border-transparent disabled:bg-slate-50 dark:disabled:bg-[#140A26] disabled:text-slate-700 dark:disabled:text-slate-300"
              />
            </div>

            <div>
              <label htmlFor="ws-date" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                {isAr ? 'تاريخ الورشة' : 'Workshop Date'} <span className="text-rose-500">*</span>
              </label>
              <input
                id="ws-date"
                type="date"
                required
                disabled={isReadOnly}
                value={data.workshop.date}
                onChange={(e) => updateWorkshopField('date', e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:border-transparent disabled:bg-slate-50 dark:disabled:bg-[#140A26] disabled:text-slate-700 dark:disabled:text-slate-300"
              />
            </div>

            <div>
              <label htmlFor="ws-location" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                {isAr ? 'مكان الانعقاد / المنصة' : 'Location / Platform'}
              </label>
              <input
                id="ws-location"
                type="text"
                disabled={isReadOnly}
                value={data.workshop.location}
                onChange={(e) => updateWorkshopField('location', e.target.value)}
                placeholder={isAr ? 'مثال: Zoom / Google Meet' : 'e.g., Zoom / Google Meet'}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:border-transparent disabled:bg-slate-50 dark:disabled:bg-[#140A26] disabled:text-slate-700 dark:disabled:text-slate-300"
              />
            </div>

            <div>
              <label htmlFor="ws-trainer" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                {isAr ? 'اسم المدرب' : 'Trainer Name'} <span className="text-rose-500">*</span>
              </label>
              <input
                id="ws-trainer"
                type="text"
                required
                disabled={isReadOnly}
                value={data.workshop.trainer}
                onChange={(e) => updateWorkshopField('trainer', e.target.value)}
                placeholder={isAr ? 'الاسم الكامل للمدرب' : 'Trainer full name'}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:border-transparent disabled:bg-slate-50 dark:disabled:bg-[#140A26] disabled:text-slate-700 dark:disabled:text-slate-300"
              />
            </div>

            <div>
              <label htmlFor="ws-facilitator" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                {isAr ? 'اسم الميسر' : 'Facilitator Name'} <span className="text-rose-500">*</span>
              </label>
              <input
                id="ws-facilitator"
                type="text"
                required
                disabled={isReadOnly}
                value={data.workshop.facilitator}
                onChange={(e) => updateWorkshopField('facilitator', e.target.value)}
                placeholder={isAr ? 'الاسم الكامل للميسر' : 'Facilitator full name'}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:border-transparent disabled:bg-slate-50 dark:disabled:bg-[#140A26] disabled:text-slate-700 dark:disabled:text-slate-300"
              />
            </div>

            <div>
              <label htmlFor="ws-registered-count" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                {isAr ? 'عدد المسجلين' : 'Registered Count'}
              </label>
              <input
                id="ws-registered-count"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                disabled={isReadOnly}
                value={data.workshop.registeredCount ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  updateWorkshopField(
                    'registeredCount',
                    raw === '' ? '' : Math.max(0, Math.floor(Number(raw)))
                  );
                }}
                placeholder={isReadOnly ? (isAr ? 'غير محدد' : 'N/A') : isAr ? 'مثال: 45' : 'e.g., 45'}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 tabular-nums focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:border-transparent disabled:bg-slate-50 dark:disabled:bg-[#140A26] disabled:text-slate-700 dark:disabled:text-slate-300"
              />
            </div>

            <div>
              <label htmlFor="ws-attendees-count" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                {isAr ? 'عدد الحضور' : 'Attendees Count'}
              </label>
              <input
                id="ws-attendees-count"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                disabled={isReadOnly}
                value={data.workshop.attendeesCount ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  updateWorkshopField(
                    'attendeesCount',
                    raw === '' ? '' : Math.max(0, Math.floor(Number(raw)))
                  );
                }}
                placeholder={isReadOnly ? (isAr ? 'غير محدد' : 'N/A') : isAr ? 'مثال: 38' : 'e.g., 38'}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 tabular-nums focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:border-transparent disabled:bg-slate-50 dark:disabled:bg-[#140A26] disabled:text-slate-700 dark:disabled:text-slate-300"
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="ws-topics" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                {isAr ? 'محاور الورشة / الأنشطة المقامة' : 'Workshop Topics & Activities'}
              </label>
              <textarea
                id="ws-topics"
                rows={3}
                disabled={isReadOnly}
                value={data.workshop.topics}
                onChange={(e) => updateWorkshopField('topics', e.target.value)}
                placeholder={
                  isAr
                    ? 'اذكر أبرز المحاور العلمية والأنشطة التفاعلية التي تمت تغطيتها...'
                    : 'List the key scientific topics and interactive activities covered...'
                }
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:border-transparent resize-none disabled:bg-slate-50 dark:disabled:bg-[#140A26] disabled:text-slate-700 dark:disabled:text-slate-300"
              />
            </div>
          </div>
        </section>

        {/* Section 2: Success Evaluation */}
        {renderSectionQuestions(
          'success',
          '02',
          isAr ? 'القسم الثاني: تقييم نجاح الورشة' : 'Section 2: Workshop Success Evaluation',
          successAvg,
          data.success
        )}

        {/* Section 3: Trainer Evaluation */}
        {renderSectionQuestions(
          'trainer',
          '03',
          isAr ? 'القسم الثالث: تقييم المدرب' : 'Section 3: Trainer Evaluation',
          trainerAvg,
          data.trainer
        )}

        {/* Section 4: Facilitator & Organization Evaluation */}
        {renderSectionQuestions(
          'facilitator',
          '04',
          isAr
            ? 'القسم الرابع: تقييم الميسر والتنظيم'
            : 'Section 4: Facilitator & Organization Evaluation',
          facilitatorAvg,
          data.facilitator
        )}

        {/* Section 5: Recommendations & Sign-off */}
        <section className="bg-white dark:bg-[#170D2B] rounded-xl border border-slate-200 dark:border-purple-900/60 overflow-hidden shadow-xs print-break-inside-avoid">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-[#22123E] flex items-center gap-2.5">
            <span className="text-xs font-mono font-bold text-[#D97706] dark:text-amber-400">05</span>
            <h3 className="text-lg font-bold text-[#2E1065] dark:text-purple-100">
              {isAr ? 'القسم الخامس: التوصيات والاعتماد' : 'Section 5: Recommendations & Sign-off'}
            </h3>
          </div>

          <div className="p-6 space-y-5">
            <div>
              <label htmlFor="ws-recommendations" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                {isAr
                  ? 'التوصيات والملاحظات الختامية للورشات القادمة'
                  : 'Recommendations & Notes for Upcoming Workshops'}
              </label>
              <textarea
                id="ws-recommendations"
                rows={3}
                disabled={isReadOnly}
                value={data.recommendations}
                onChange={(e) => onChange({ ...data, recommendations: e.target.value })}
                placeholder={
                  isAr
                    ? 'أبرز نقاط القوة ومجالات التحسين المقترحة...'
                    : 'Key strengths and suggested areas for improvement...'
                }
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:border-transparent resize-none disabled:bg-slate-50 dark:disabled:bg-[#140A26] disabled:text-slate-700 dark:disabled:text-slate-300"
              />
            </div>

            <div>
              <label htmlFor="ws-evaluator" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                {isAr ? 'اسم العضو القائم على التقييم والمتابعة' : 'M&E Evaluator Name'}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <input
                id="ws-evaluator"
                type="text"
                required
                disabled={isReadOnly}
                value={data.evaluator}
                onChange={(e) => onChange({ ...data, evaluator: e.target.value })}
                placeholder={
                  isAr
                    ? 'الاسم الكامل للعضو القائم على التقييم والمتابعة'
                    : 'Full name of the M&E evaluator'
                }
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:border-transparent disabled:bg-slate-50 dark:disabled:bg-[#140A26] disabled:text-slate-700 dark:disabled:text-slate-300"
              />
            </div>

            {/* Fixed M&E Department Head Name & Signature */}
            <div className="pt-4 border-t border-slate-200 dark:border-purple-900/60">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {isAr ? 'مسؤول قسم التقييم والمتابعة' : 'M&E Department Head'}
                  <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ms-2">
                    {isAr ? '(اعتماد ثابت)' : '(Fixed Approval)'}
                  </span>
                </span>
                {onOpenAdminSettings && (
                  <button
                    type="button"
                    onClick={onOpenAdminSettings}
                    className="text-xs font-semibold text-[#D97706] dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:underline no-print cursor-pointer"
                  >
                    {isAr ? 'تعديل عبر صلاحية الأدمن' : 'Edit via Admin Permission'}
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border border-purple-100 dark:border-purple-800/60 bg-purple-50/30 dark:bg-[#1F1238]">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isAr ? 'الاسم المعتمد' : 'Approved Name'}
                  </p>
                  <p className="text-base font-bold text-[#2E1065] dark:text-purple-100 mt-0.5">{siteSettings.meHeadName}</p>
                </div>
                <div className="flex items-center justify-center bg-white border border-slate-200 dark:border-purple-700/60 rounded-lg px-4 py-2 min-w-[180px] h-20">
                  <img
                    src={siteSettings.meHeadSignature}
                    alt={siteSettings.meHeadName}
                    referrerPolicy="no-referrer"
                    className="max-h-16 max-w-[160px] object-contain"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 no-print">
                {isAr
                  ? 'هذا الاسم والتوقيع ثابت في جميع التقارير ولا يمكن تعديله إلا من قِبل أدمن المبادرة.'
                  : 'This name and signature remain fixed across all reports and can only be edited by an Admin.'}
              </p>
            </div>
          </div>
        </section>

        {/* Official Initiative Leadership Signatures */}
        <section className="bg-white dark:bg-[#170D2B] rounded-xl border border-slate-200 dark:border-purple-900/60 overflow-hidden shadow-xs print-break-inside-avoid">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-[#22123E] flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-mono font-bold text-[#D97706] dark:text-amber-400">06</span>
              <h3 className="text-lg font-bold text-[#2E1065] dark:text-purple-100">
                {isAr ? 'اعتماد وتوقيع مسؤولي المبادرة' : 'Initiative Leadership Approval & Signatures'}
              </h3>
            </div>
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
              {isAr ? 'توقيع معتمد رسمياً' : 'Officially Approved'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x rtl:sm:divide-x-reverse divide-slate-200 dark:divide-purple-900/60">
            <div className="p-6 flex flex-col items-center justify-center text-center bg-white dark:bg-[#170D2B]">
              <div className="h-24 w-full max-w-[230px] rounded-lg bg-white border border-slate-100 dark:border-purple-800/40 px-4 flex items-center justify-center">
                <img
                  src="/assets/signatures/alaa_marzouq.png"
                  alt="Alaa Marzouq Signature"
                  referrerPolicy="no-referrer"
                  className="max-h-20 max-w-[180px] object-contain"
                />
              </div>
              <div className="w-52 border-t border-amber-300 dark:border-amber-600/60 pt-2.5 mt-3">
                <p className="text-sm font-bold text-[#2E1065] dark:text-purple-100">
                  {isAr ? 'مسؤول المبادرة: علاء مرزوق' : 'Initiative Lead: Alaa Marzouq'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {isAr ? 'مبادرة PARAMIND' : 'PARAMIND Initiative'}
                </p>
              </div>
            </div>

            <div className="p-6 flex flex-col items-center justify-center text-center bg-white dark:bg-[#170D2B]">
              <div className="h-24 w-full max-w-[230px] rounded-lg bg-white border border-slate-100 dark:border-purple-800/40 px-4 flex items-center justify-center">
                <img
                  src="/assets/signatures/aseel_rabie.png"
                  alt="Aseel Rabie Signature"
                  referrerPolicy="no-referrer"
                  className="max-h-20 max-w-[180px] object-contain"
                />
              </div>
              <div className="w-52 border-t border-amber-300 dark:border-amber-600/60 pt-2.5 mt-3">
                <p className="text-sm font-bold text-[#2E1065] dark:text-purple-100">
                  {isAr ? 'مسؤول المبادرة: أسيل ربيع' : 'Initiative Lead: Aseel Rabie'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {isAr ? 'مبادرة PARAMIND' : 'PARAMIND Initiative'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Submit Actions */}
        {!isReadOnly && (
          <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-4 pt-2 no-print">
            <button
              type="button"
              onClick={onCancel}
              className="w-full sm:w-auto px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-[#1E1136] border border-slate-300 dark:border-purple-800/70 hover:bg-slate-50 dark:hover:bg-[#2A184A] rounded-lg transition-colors cursor-pointer"
            >
              {isAr ? 'إلغاء والعودة' : 'Cancel & Back'}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#D97706] hover:bg-amber-600 text-white font-semibold text-sm px-6 py-2.5 rounded-lg transition-colors disabled:opacity-60 cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#D97706]"
            >
              {isEditing ? <Save size={18} /> : <CheckCircle2 size={18} />}
              <span>
                {isSubmitting
                  ? isAr
                    ? 'جاري حفظ التقرير...'
                    : 'Saving...'
                  : isEditing
                  ? isAr
                    ? 'حفظ التعديلات'
                    : 'Save Changes'
                  : isAr
                  ? 'اعتماد وحفظ التقرير'
                  : 'Submit & Save Report'}
              </span>
            </button>
          </div>
        )}
      </form>
    </div>
  );
};
