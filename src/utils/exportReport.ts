import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { AppLanguage, getLocalizedQuestionText } from '../i18n/LanguageContext';
import {
  EvaluationFormData,
  QuestionEvaluation,
  SiteSettings,
  formatArabicDate,
  getReportAverage,
  getScoreLabel,
  getSectionAverage,
} from '../types/evaluation';

const LOGO_PATH = '/assets/aistudio/6032600769661440235_120_a7b142b4.jpg';
const SIGNATURE_ALAA_PATH = '/assets/signatures/alaa_marzouq.png';
const SIGNATURE_ASEEL_PATH = '/assets/signatures/aseel_rabie.png';

const SCORE_LABELS: Record<AppLanguage, Record<number, string>> = {
  ar: {
    0: 'لم يقيّم',
    1: 'ضعيف',
    2: 'مقبول',
    3: 'جيد',
    4: 'جيد جداً',
    5: 'ممتاز',
  },
  en: {
    0: 'Not Rated',
    1: 'Poor',
    2: 'Acceptable',
    3: 'Good',
    4: 'Very Good',
    5: 'Excellent',
  },
};

function escapeHtml(value: string | undefined | null): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatStars(score: number): string {
  const filled = '★'.repeat(Math.max(0, Math.min(5, score)));
  const empty = '☆'.repeat(Math.max(0, 5 - Math.min(5, score)));
  return `${filled}${empty}`;
}

async function fetchAsDataUrl(assetPath: string): Promise<string> {
  if (!assetPath) return '';
  if (assetPath.startsWith('data:image/')) return assetPath;
  try {
    const response = await fetch(assetPath);
    if (!response.ok) return '';
    const blob = await response.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(typeof reader.result === 'string' ? reader.result : '');
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

function renderQuestionsTable(
  title: string,
  avg: number,
  items: QuestionEvaluation[],
  lang: AppLanguage
): string {
  const isAr = lang === 'ar';
  const alignStart = isAr ? 'right' : 'left';
  const labels = SCORE_LABELS[lang];

  const rows = items
    .map((item, index) => {
      const qText = getLocalizedQuestionText(item.question, lang);
      return `
      <tr>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:center;color:#64748b;width:36px;">${index + 1}</td>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#0f172a;font-weight:600;">
          ${escapeHtml(qText)}
          ${
            item.reason.trim()
              ? `<div style="margin-top:6px;font-weight:400;font-size:12px;color:#475569;background:#f8fafc;padding:6px 10px;border-radius:4px;">${
                  isAr ? 'ملاحظة المقيّم:' : 'Evaluator Note:'
                } ${escapeHtml(item.reason)}</div>`
              : ''
          }
        </td>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:center;white-space:nowrap;width:140px;">
          <div style="color:#d97706;font-size:15px;letter-spacing:1px;">${formatStars(item.score)}</div>
          <div style="font-size:12px;color:#334155;margin-top:2px;">${item.score} / 5 · ${labels[item.score] ?? ''}</div>
        </td>
      </tr>`;
    })
    .join('');

  return `
    <div data-pdf-block="true" style="margin-top:20px;background:#ffffff;">
      <table style="width:100%;border-collapse:collapse;background:#ffffff;">
        <thead>
          <tr style="background:#f5f3ff;">
            <th colspan="2" style="padding:10px 14px;border:1px solid #cbd5e1;text-align:${alignStart};color:#2e1065;font-size:15px;">
              ${escapeHtml(title)}
            </th>
            <th style="padding:10px 14px;border:1px solid #cbd5e1;text-align:center;color:#2e1065;font-size:13px;white-space:nowrap;">
              ${isAr ? 'المتوسط:' : 'Average:'} ${avg > 0 ? `${avg.toFixed(1)} / 5.0` : '—'}
            </th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

interface EmbeddedAssets {
  logoDataUrl: string;
  meHeadSigDataUrl: string;
  sigAlaaDataUrl: string;
  sigAseelDataUrl: string;
}

interface DocumentRenderOptions {
  forWord?: boolean;
  forPdf?: boolean;
  lang?: AppLanguage;
}

function buildReportDocumentHtml(
  report: EvaluationFormData,
  siteSettings: SiteSettings,
  assets: EmbeddedAssets,
  options: DocumentRenderOptions = {}
): string {
  const { forWord = false, forPdf = false, lang = 'ar' } = options;
  const isAr = lang === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  const alignStart = isAr ? 'right' : 'left';
  const alignEnd = isAr ? 'left' : 'right';

  const overallAvg = getReportAverage(report);
  const successAvg = getSectionAverage(report.success);
  const trainerAvg = getSectionAverage(report.trainer);
  const facilitatorAvg = getSectionAverage(report.facilitator);
  const scoreMeta = getScoreLabel(overallAvg, lang);
  const titleText =
    report.workshop.title.trim() ||
    (isAr ? 'تقرير تقييم ورشة PARAMIND' : 'PARAMIND Workshop Evaluation Report');
  const createdLabel = formatArabicDate(report.createdAt || new Date().toISOString(), lang);

  const logoBlock = assets.logoDataUrl
    ? `<img src="${assets.logoDataUrl}" alt="PARAMIND Logo" width="76" height="76" style="width:76px;height:76px;border-radius:50%;object-fit:cover;border:2px solid #d97706;background:#1b093b;" />`
    : `<div style="width:72px;height:72px;border-radius:50%;background:#d97706;color:#1b093b;font-weight:700;font-size:28px;line-height:72px;text-align:center;">P</div>`;

  const meHeadSigImg = assets.meHeadSigDataUrl
    ? `<img src="${assets.meHeadSigDataUrl}" alt="M&E Head Signature" width="130" height="65" style="max-width:140px;max-height:68px;object-fit:contain;display:inline-block;vertical-align:middle;" />`
    : '';

  const sigAlaaImg = assets.sigAlaaDataUrl
    ? `<img src="${assets.sigAlaaDataUrl}" alt="Alaa Marzouq Signature" width="160" height="80" style="max-width:170px;max-height:85px;object-fit:contain;display:block;margin:0 auto;" />`
    : `<div style="height:60px;"></div>`;

  const sigAseelImg = assets.sigAseelDataUrl
    ? `<img src="${assets.sigAseelDataUrl}" alt="Aseel Rabie Signature" width="160" height="80" style="max-width:170px;max-height:85px;object-fit:contain;display:block;margin:0 auto;" />`
    : `<div style="height:60px;"></div>`;

  const wordNamespaces = forWord
    ? `xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"`
    : '';

  const fontLink = !forWord
    ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" />`
    : '';

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}" ${wordNamespaces}>
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(titleText)} — PARAMIND M&amp;E</title>
  ${fontLink}
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: "IBM Plex Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif;
      background: ${forPdf ? '#ffffff' : '#f8fafc'};
      color: #0f172a;
      margin: 0;
      padding: ${forPdf ? '0' : '24px'};
      direction: ${dir};
      line-height: 1.6;
    }
    .page {
      max-width: ${forPdf ? '800px' : '860px'};
      width: 100%;
      margin: 0 auto;
      background: #ffffff;
      border: ${forPdf ? 'none' : '1px solid #e2e8f0'};
      padding: ${forPdf ? '8px' : '28px'};
    }
    @media print {
      body { background: #ffffff; padding: 0; }
      .page { border: none; padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Block 1: Header with Initiative Logo + Executive KPI Summary -->
    <div data-pdf-block="true" style="background:#ffffff;">
      <table style="width:100%;border-collapse:collapse;background:#1b093b;color:#ffffff;border-bottom:4px solid #d97706;">
        <tr>
          <td style="padding:18px 20px;width:96px;vertical-align:middle;text-align:center;">
            ${logoBlock}
          </td>
          <td style="padding:18px 16px;vertical-align:middle;text-align:${alignStart};">
            <div style="font-size:12px;color:#fcd34d;font-weight:700;letter-spacing:0.5px;">PARAMIND INITIATIVE · M&amp;E UNIT</div>
            <h1 style="margin:4px 0 4px 0;font-size:22px;color:#ffffff;">${
              isAr ? 'تقرير التقييم والمتابعة الشامل للورشة' : 'Comprehensive Workshop M&E Report'
            }</h1>
            <div style="font-size:13px;color:#e9d5ff;">${escapeHtml(titleText)} · ${
              isAr ? 'تاريخ التقرير:' : 'Report Date:'
            } ${escapeHtml(createdLabel)}</div>
          </td>
        </tr>
      </table>

      <table style="width:100%;border-collapse:collapse;margin-top:16px;background:#ffffff;">
        <tr>
          <td style="padding:12px;border:1px solid #cbd5e1;text-align:center;width:25%;">
            <div style="font-size:12px;color:#64748b;">${isAr ? 'التقييم العام' : 'Overall Rating'}</div>
            <div style="font-size:20px;font-weight:700;color:#2e1065;margin-top:4px;">${overallAvg > 0 ? `${overallAvg.toFixed(1)} / 5.0` : '—'}</div>
            <div style="font-size:12px;color:#d97706;font-weight:600;">${escapeHtml(scoreMeta.label)}</div>
          </td>
          <td style="padding:12px;border:1px solid #cbd5e1;text-align:center;width:25%;">
            <div style="font-size:12px;color:#64748b;">${isAr ? 'نجاح الورشة' : 'Workshop Success'}</div>
            <div style="font-size:18px;font-weight:700;color:#0f172a;margin-top:4px;">${successAvg > 0 ? `${successAvg.toFixed(1)} / 5` : '—'}</div>
          </td>
          <td style="padding:12px;border:1px solid #cbd5e1;text-align:center;width:25%;">
            <div style="font-size:12px;color:#64748b;">${isAr ? 'أداء المدرب' : 'Trainer Performance'}</div>
            <div style="font-size:18px;font-weight:700;color:#0f172a;margin-top:4px;">${trainerAvg > 0 ? `${trainerAvg.toFixed(1)} / 5` : '—'}</div>
          </td>
          <td style="padding:12px;border:1px solid #cbd5e1;text-align:center;width:25%;">
            <div style="font-size:12px;color:#64748b;">${isAr ? 'الميسر والتنظيم' : 'Facilitator & Organization'}</div>
            <div style="font-size:18px;font-weight:700;color:#0f172a;margin-top:4px;">${facilitatorAvg > 0 ? `${facilitatorAvg.toFixed(1)} / 5` : '—'}</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Block 2: Section 1 Workshop Details -->
    <div data-pdf-block="true" style="margin-top:20px;background:#ffffff;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f5f3ff;">
            <th colspan="2" style="padding:10px 14px;border:1px solid #cbd5e1;text-align:${alignStart};color:#2e1065;font-size:15px;">
              ${isAr ? 'القسم الأول: معلومات الورشة' : 'Section 1: Workshop Information'}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:9px 12px;border:1px solid #e2e8f0;font-weight:600;color:#334155;width:190px;background:#f8fafc;">${
              isAr ? 'عنوان الورشة' : 'Workshop Title'
            }</td>
            <td style="padding:9px 12px;border:1px solid #e2e8f0;">${escapeHtml(report.workshop.title || '—')}</td>
          </tr>
          <tr>
            <td style="padding:9px 12px;border:1px solid #e2e8f0;font-weight:600;color:#334155;background:#f8fafc;">${
              isAr ? 'تاريخ الانعقاد' : 'Workshop Date'
            }</td>
            <td style="padding:9px 12px;border:1px solid #e2e8f0;">${escapeHtml(formatArabicDate(report.workshop.date, lang))}</td>
          </tr>
          <tr>
            <td style="padding:9px 12px;border:1px solid #e2e8f0;font-weight:600;color:#334155;background:#f8fafc;">${
              isAr ? 'مكان الانعقاد / المنصة' : 'Location / Platform'
            }</td>
            <td style="padding:9px 12px;border:1px solid #e2e8f0;">${escapeHtml(report.workshop.location || (isAr ? 'غير محدد' : 'Not specified'))}</td>
          </tr>
          <tr>
            <td style="padding:9px 12px;border:1px solid #e2e8f0;font-weight:600;color:#334155;background:#f8fafc;">${
              isAr ? 'اسم المدرب' : 'Trainer Name'
            }</td>
            <td style="padding:9px 12px;border:1px solid #e2e8f0;">${escapeHtml(report.workshop.trainer || '—')}</td>
          </tr>
          <tr>
            <td style="padding:9px 12px;border:1px solid #e2e8f0;font-weight:600;color:#334155;background:#f8fafc;">${
              isAr ? 'اسم الميسر' : 'Facilitator Name'
            }</td>
            <td style="padding:9px 12px;border:1px solid #e2e8f0;">${escapeHtml(report.workshop.facilitator || '—')}</td>
          </tr>
          <tr>
            <td style="padding:9px 12px;border:1px solid #e2e8f0;font-weight:600;color:#334155;background:#f8fafc;">${
              isAr ? 'عدد المسجلين' : 'Registered Count'
            }</td>
            <td style="padding:9px 12px;border:1px solid #e2e8f0;">${
              typeof report.workshop.registeredCount === 'number'
                ? report.workshop.registeredCount
                : isAr
                ? 'غير محدد'
                : 'Not specified'
            }</td>
          </tr>
          <tr>
            <td style="padding:9px 12px;border:1px solid #e2e8f0;font-weight:600;color:#334155;background:#f8fafc;">${
              isAr ? 'عدد الحضور' : 'Attendees Count'
            }</td>
            <td style="padding:9px 12px;border:1px solid #e2e8f0;">${
              typeof report.workshop.attendeesCount === 'number'
                ? report.workshop.attendeesCount
                : isAr
                ? 'غير محدد'
                : 'Not specified'
            }</td>
          </tr>
          <tr>
            <td style="padding:9px 12px;border:1px solid #e2e8f0;font-weight:600;color:#334155;background:#f8fafc;">${
              isAr ? 'محاور الورشة والأنشطة' : 'Topics & Activities'
            }</td>
            <td style="padding:9px 12px;border:1px solid #e2e8f0;white-space:pre-line;">${escapeHtml(report.workshop.topics || '—')}</td>
          </tr>
        </tbody>
      </table>
    </div>

    ${renderQuestionsTable(
      isAr ? 'القسم الثاني: تقييم نجاح الورشة' : 'Section 2: Workshop Success Evaluation',
      successAvg,
      report.success,
      lang
    )}
    ${renderQuestionsTable(
      isAr ? 'القسم الثالث: تقييم المدرب' : 'Section 3: Trainer Evaluation',
      trainerAvg,
      report.trainer,
      lang
    )}
    ${renderQuestionsTable(
      isAr ? 'القسم الرابع: تقييم الميسر والتنظيم' : 'Section 4: Facilitator & Organization Evaluation',
      facilitatorAvg,
      report.facilitator,
      lang
    )}

    <!-- Block 6: Section 5 Recommendations & Sign-off -->
    <div data-pdf-block="true" style="margin-top:20px;background:#ffffff;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f5f3ff;">
            <th colspan="2" style="padding:10px 14px;border:1px solid #cbd5e1;text-align:${alignStart};color:#2e1065;font-size:15px;">
              ${isAr ? 'القسم الخامس: التوصيات والاعتماد' : 'Section 5: Recommendations & Sign-off'}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:10px 12px;border:1px solid #e2e8f0;font-weight:600;color:#334155;width:190px;background:#f8fafc;">${
              isAr ? 'التوصيات والملاحظات' : 'Recommendations & Notes'
            }</td>
            <td style="padding:10px 12px;border:1px solid #e2e8f0;white-space:pre-line;">${escapeHtml(
              report.recommendations.trim() ||
                (isAr ? 'لا توجد توصيات إضافية.' : 'No additional recommendations.')
            )}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;border:1px solid #e2e8f0;font-weight:600;color:#334155;background:#f8fafc;">${
              isAr ? 'اسم العضو القائم على التقييم والمتابعة' : 'M&E Evaluator Name'
            }</td>
            <td style="padding:10px 12px;border:1px solid #e2e8f0;font-weight:700;color:#2e1065;">${escapeHtml(report.evaluator || '—')}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;border:1px solid #e2e8f0;font-weight:600;color:#334155;background:#f8fafc;">${
              isAr ? 'مسؤول قسم التقييم والمتابعة' : 'M&E Department Head'
            }</td>
            <td style="padding:10px 12px;border:1px solid #e2e8f0;">
              <div style="font-weight:700;color:#2e1065;margin-bottom:6px;">${escapeHtml(siteSettings.meHeadName)}</div>
              ${meHeadSigImg}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Block 7: Official Initiative Leadership Signatures -->
    <div data-pdf-block="true" style="margin-top:20px;background:#ffffff;">
      <table style="width:100%;border-collapse:collapse;background:#ffffff;">
        <thead>
          <tr style="background:#f5f3ff;">
            <th colspan="2" style="padding:10px 14px;border:1px solid #cbd5e1;text-align:${alignStart};color:#2e1065;font-size:15px;">
              ${isAr ? 'اعتماد وتوقيع مسؤولي المبادرة' : 'Initiative Leadership Approval & Signatures'}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:18px 16px;border:1px solid #e2e8f0;text-align:center;width:50%;vertical-align:bottom;">
              <div style="min-height:85px;">${sigAlaaImg}</div>
              <div style="margin-top:10px;padding-top:8px;border-top:1px solid #cbd5e1;font-size:13px;font-weight:700;color:#2e1065;">
                ${isAr ? 'مسؤول المبادرة: علاء مرزوق' : 'Initiative Lead: Alaa Marzouq'}
              </div>
              <div style="font-size:11px;color:#64748b;margin-top:2px;">${
                isAr ? 'مبادرة PARAMIND' : 'PARAMIND Initiative'
              }</div>
            </td>
            <td style="padding:18px 16px;border:1px solid #e2e8f0;text-align:center;width:50%;vertical-align:bottom;">
              <div style="min-height:85px;">${sigAseelImg}</div>
              <div style="margin-top:10px;padding-top:8px;border-top:1px solid #cbd5e1;font-size:13px;font-weight:700;color:#2e1065;">
                ${isAr ? 'مسؤول المبادرة: أسيل ربيع' : 'Initiative Lead: Aseel Rabie'}
              </div>
              <div style="font-size:11px;color:#64748b;margin-top:2px;">${
                isAr ? 'مبادرة PARAMIND' : 'PARAMIND Initiative'
              }</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    ${
      !forWord && !forPdf
        ? `<div class="no-print" style="margin-top:24px;text-align:${alignEnd};">
             <button onclick="window.print()" style="background:#2e1065;color:#ffffff;border:none;padding:10px 18px;border-radius:6px;font-weight:600;cursor:pointer;">
               ${isAr ? 'طباعة / حفظ كـ PDF' : 'Print / Save as PDF'}
             </button>
           </div>`
        : ''
    }
  </div>
</body>
</html>`;
}

function triggerFileDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob(['\uFEFF', content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getSafeFilenameBase(report: EvaluationFormData, lang: AppLanguage): string {
  const raw = (report.workshop.title || 'paramind-report').trim();
  const sanitized = raw.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '_');
  return lang === 'ar' ? `PARAMIND_تقرير_${sanitized}` : `PARAMIND_Report_${sanitized}`;
}

async function loadEmbeddedAssets(siteSettings: SiteSettings): Promise<EmbeddedAssets> {
  const [logoDataUrl, meHeadSigDataUrl, sigAlaaDataUrl, sigAseelDataUrl] = await Promise.all([
    fetchAsDataUrl(LOGO_PATH),
    fetchAsDataUrl(siteSettings.meHeadSignature),
    fetchAsDataUrl(SIGNATURE_ALAA_PATH),
    fetchAsDataUrl(SIGNATURE_ASEEL_PATH),
  ]);
  return { logoDataUrl, meHeadSigDataUrl, sigAlaaDataUrl, sigAseelDataUrl };
}

export async function downloadReportAsWord(
  report: EvaluationFormData,
  siteSettings: SiteSettings,
  lang: AppLanguage = 'ar'
): Promise<void> {
  const assets = await loadEmbeddedAssets(siteSettings);
  const html = buildReportDocumentHtml(report, siteSettings, assets, { forWord: true, lang });
  triggerFileDownload(
    html,
    `${getSafeFilenameBase(report, lang)}.doc`,
    'application/msword;charset=utf-8'
  );
}

export async function downloadReportAsHtml(
  report: EvaluationFormData,
  siteSettings: SiteSettings,
  lang: AppLanguage = 'ar'
): Promise<void> {
  const assets = await loadEmbeddedAssets(siteSettings);
  const html = buildReportDocumentHtml(report, siteSettings, assets, { forWord: false, lang });
  triggerFileDownload(
    html,
    `${getSafeFilenameBase(report, lang)}.html`,
    'text/html;charset=utf-8'
  );
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function downloadReportAsPdf(
  report: EvaluationFormData,
  siteSettings: SiteSettings,
  lang: AppLanguage = 'ar'
): Promise<void> {
  const assets = await loadEmbeddedAssets(siteSettings);
  const html = buildReportDocumentHtml(report, siteSettings, assets, { forPdf: true, lang });

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '820px';
  iframe.style.height = '1200px';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  try {
    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc) {
      throw new Error(lang === 'ar' ? 'تعذر تهيئة مستند PDF.' : 'Could not initialize PDF document.');
    }

    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    const images = Array.from(iframeDoc.images);
    await Promise.all(
      images.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            })
      )
    );

    if (iframeDoc.fonts?.ready) {
      await Promise.race([iframeDoc.fonts.ready, waitMs(1500)]);
    }
    await waitMs(80);

    const blocks = Array.from(iframeDoc.querySelectorAll<HTMLElement>('[data-pdf-block="true"]'));
    if (blocks.length === 0) {
      throw new Error(
        lang === 'ar' ? 'تعذر تجهيز محتوى التقرير للتصدير.' : 'Failed to prepare report content.'
      );
    }

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const marginMm = 12;
    const contentWidthMm = 210 - marginMm * 2;
    const maxPageHeightMm = 297 - marginMm * 2;
    const blockGapMm = 4;

    let currentY = marginMm;
    let isFirstPage = true;

    for (const block of blocks) {
      const canvas = await html2canvas(block, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      });

      const blockHeightMm = (canvas.height * contentWidthMm) / canvas.width;

      if (blockHeightMm <= maxPageHeightMm) {
        if (!isFirstPage && currentY + blockHeightMm > marginMm + maxPageHeightMm) {
          pdf.addPage();
          currentY = marginMm;
        } else if (isFirstPage && currentY + blockHeightMm > marginMm + maxPageHeightMm) {
          pdf.addPage();
          currentY = marginMm;
        }

        const imgData = canvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', marginMm, currentY, contentWidthMm, blockHeightMm, undefined, 'FAST');
        currentY += blockHeightMm + blockGapMm;
        isFirstPage = false;
      } else {
        if (currentY > marginMm) {
          pdf.addPage();
          currentY = marginMm;
        }
        const pxPerMm = canvas.width / contentWidthMm;
        const maxSlicePx = Math.floor(maxPageHeightMm * pxPerMm);
        let offsetY = 0;

        while (offsetY < canvas.height) {
          const slicePx = Math.min(maxSlicePx, canvas.height - offsetY);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = slicePx;
          const ctx = sliceCanvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
            ctx.drawImage(
              canvas,
              0,
              offsetY,
              canvas.width,
              slicePx,
              0,
              0,
              canvas.width,
              slicePx
            );
          }

          const sliceHeightMm = slicePx / pxPerMm;
          const sliceData = sliceCanvas.toDataURL('image/png');
          pdf.addImage(
            sliceData,
            'PNG',
            marginMm,
            marginMm,
            contentWidthMm,
            sliceHeightMm,
            undefined,
            'FAST'
          );

          offsetY += slicePx;
          if (offsetY < canvas.height) {
            pdf.addPage();
          } else {
            currentY = marginMm + sliceHeightMm + blockGapMm;
          }
        }
        isFirstPage = false;
      }
    }

    pdf.save(`${getSafeFilenameBase(report, lang)}.pdf`);
  } finally {
    document.body.removeChild(iframe);
  }
}
