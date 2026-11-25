export interface WorkshopInfo {
  title: string;
  date: string;
  location: string;
  trainer: string;
  facilitator: string;
  registeredCount?: number | null | '';
  attendeesCount?: number | null | '';
  topics: string;
}

export interface QuestionEvaluation {
  question: string;
  score: number;
  reason: string;
}

export type EvaluationSectionKey = 'success' | 'trainer' | 'facilitator';

export interface EvaluationFormData {
  id?: string;
  workshop: WorkshopInfo;
  success: QuestionEvaluation[];
  trainer: QuestionEvaluation[];
  facilitator: QuestionEvaluation[];
  recommendations: string;
  evaluator: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface EvaluationReport extends EvaluationFormData {
  id: string;
  createdAt: string;
}

export interface SiteSettings {
  meHeadName: string;
  meHeadSignature: string;
  updatedAt?: string;
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  meHeadName: 'مروى ابو ربيع',
  meHeadSignature: '/assets/signatures/marwa_aburabie.png',
};

export type ViewMode =
  | 'login'
  | 'dashboard'
  | 'form'
  | 'view-report'
  | 'workshop-runner'
  | 'admin-console';

export type UserRole = 'Admin' | 'Limited' | 'M&E';
export type AccountStatus = 'Active' | 'Blocked';

export interface ManagedAccount {
  id: string;
  name: string;
  identifier: string;
  pin: string;
  role: UserRole;
  status: AccountStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface OfficialEmailEntry {
  id: string;
  email: string;
  label: string;
  type: 'official' | 'backup';
  active: boolean;
}

export interface TechSettings {
  appsScriptUrl: string;
  googleSheetUrl: string;
  enableRemoteAuth: boolean;
  emails: OfficialEmailEntry[];
  updatedAt?: string;
}

export interface TemplateSettings {
  header: string;
  subject: string;
  body: string;
  isLocked: boolean;
  updatedAt?: string;
}

export interface AuditLogEntry {
  id: string;
  actorName: string;
  actorIdentifier: string;
  actorRole: UserRole;
  actionType: 'dispatch' | 'auth' | 'rbac' | 'settings' | 'report';
  workshopTitle?: string;
  messagesSent?: number;
  phoneOnlyCount?: number;
  details: string;
  createdAt: string;
}

export interface AuthSession {
  token: string;
  accountId: string;
  name: string;
  identifier: string;
  role: UserRole;
  source?: 'local' | 'remote';
}

export const SUCCESS_QUESTIONS: string[] = [
  'كانت أهداف الورشة واضحة منذ البداية وتم تحقيقها بنهاية الجلسة.',
  'المحتوى العلمي كان دقيقاً، موثوقاً، وخالياً من الآراء الشخصية غير المثبتة.',
  'تم تبسيط المعلومات المعقدة بطريقة سلسة ومفهومة لغير المختصين.',
  'تسلسل الأفكار والمحاور كان منطقياً ومترابطاً.',
  'تفاعل الجمهور مع المدرب وكانت الورشة مليئة بالحيوية.',
];

export const TRAINER_QUESTIONS: string[] = [
  'أظهر المدرب تمكناً عالياً ومعرفة عميقة بموضوع الورشة.',
  'استخدم المدرب نبرة صوت ولغة مهنية ومحفزة تحافظ على انتباه الحضور.',
  'نجح المدرب في إشراك الحضور وطرح أسئلة تفاعلية بدلاً من التلقين المستمر.',
  'التزم المدرب بحدود التوعية ولم يطرح أحكاماً مسبقة أو مصطلحات تعزز وصمة العار أو أي اختراق للمهنية.',
  'تعامل المدرب مع أسئلة الجمهور ومداخلاتهم باحترافية واحترام تام.',
];

export const FACILITATOR_QUESTIONS: string[] = [
  'كانت عملية التسجيل والانضمام لمجموعة الواتساب واضحة ومنظمة.',
  'نجح الميسر في كسر الجليد وخلق بيئة آمنة ومرحبة قبل وأثناء الورشة.',
  'التزم الميسر بالوقت المحدد للبدء والإنهاء بدقة.',
  'تمت إدارة النقاشات، الشات، والمداخلات الصوتية بطريقة عادلة ومنظمة.',
  'تمت السيطرة على أي إزعاج أو تداخلات أو فوضى في إطار الورشة.',
];

export function createInitialEvalState(defaultEvaluator = ''): EvaluationFormData {
  return {
    workshop: {
      title: '',
      date: '',
      location: '',
      trainer: '',
      facilitator: '',
      registeredCount: '',
      attendeesCount: '',
      topics: '',
    },
    success: SUCCESS_QUESTIONS.map((q) => ({ question: q, score: 0, reason: '' })),
    trainer: TRAINER_QUESTIONS.map((q) => ({ question: q, score: 0, reason: '' })),
    facilitator: FACILITATOR_QUESTIONS.map((q) => ({ question: q, score: 0, reason: '' })),
    recommendations: '',
    evaluator: defaultEvaluator,
  };
}

export function getSectionAverage(items: QuestionEvaluation[]): number {
  const rated = items.filter((item) => item.score > 0);
  if (rated.length === 0) return 0;
  const total = rated.reduce((sum, item) => sum + item.score, 0);
  return Number((total / rated.length).toFixed(2));
}

export function getReportAverage(data: Pick<EvaluationFormData, 'success' | 'trainer' | 'facilitator'>): number {
  const all = [...data.success, ...data.trainer, ...data.facilitator];
  return getSectionAverage(all);
}

export function getRatedCount(data: Pick<EvaluationFormData, 'success' | 'trainer' | 'facilitator'>): number {
  return [...data.success, ...data.trainer, ...data.facilitator].filter((item) => item.score > 0).length;
}

export function getTotalQuestionsCount(data: Pick<EvaluationFormData, 'success' | 'trainer' | 'facilitator'>): number {
  return data.success.length + data.trainer.length + data.facilitator.length;
}

export function getScoreLabel(
  score: number,
  lang: 'ar' | 'en' = 'ar'
): { label: string; colorClass: string } {
  if (score === 0) {
    return {
      label: lang === 'ar' ? 'غير مقيم' : 'Not Rated',
      colorClass: 'text-slate-500 dark:text-slate-400',
    };
  }
  if (score >= 4.2) {
    return {
      label: lang === 'ar' ? 'ممتاز' : 'Excellent',
      colorClass: 'text-emerald-700 dark:text-emerald-400',
    };
  }
  if (score >= 3.5) {
    return {
      label: lang === 'ar' ? 'جيد جداً' : 'Very Good',
      colorClass: 'text-[#2E1065] dark:text-purple-300',
    };
  }
  if (score >= 2.5) {
    return {
      label: lang === 'ar' ? 'مقبول' : 'Acceptable',
      colorClass: 'text-[#D97706] dark:text-amber-400',
    };
  }
  return {
    label: lang === 'ar' ? 'يحتاج متابعة' : 'Needs Follow-up',
    colorClass: 'text-rose-700 dark:text-rose-400',
  };
}

export function formatArabicDate(dateStr?: string, lang: 'ar' | 'en' = 'ar'): string {
  if (!dateStr) return '—';
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
