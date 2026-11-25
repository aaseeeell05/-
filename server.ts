import express, { NextFunction, Request, Response } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'reports.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const RBAC_FILE = path.join(DATA_DIR, 'rbac.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin2026';

type UserRole = 'Admin' | 'Limited' | 'M&E';
type AccountStatus = 'Active' | 'Blocked';

interface SiteSettingsData {
  meHeadName: string;
  meHeadSignature: string;
  updatedAt?: string;
}

interface ManagedAccount {
  id: string;
  name: string;
  identifier: string;
  pin: string;
  role: UserRole;
  status: AccountStatus;
  createdAt: string;
  updatedAt?: string;
}

interface OfficialEmailEntry {
  id: string;
  email: string;
  label: string;
  type: 'official' | 'backup';
  active: boolean;
}

interface TechSettings {
  appsScriptUrl: string;
  googleSheetUrl: string;
  enableRemoteAuth: boolean;
  emails: OfficialEmailEntry[];
  updatedAt?: string;
}

interface TemplateSettings {
  header: string;
  subject: string;
  body: string;
  isLocked: boolean;
  updatedAt?: string;
}

interface RbacStore {
  accounts: ManagedAccount[];
  tech: TechSettings;
  template: TemplateSettings;
}

interface AuditLogEntry {
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

interface SessionRecord {
  token: string;
  accountId: string;
  name: string;
  identifier: string;
  role: UserRole;
  source: 'local' | 'remote';
  createdAt: string;
}

const DEFAULT_SETTINGS: SiteSettingsData = {
  meHeadName: 'مروى ابو ربيع',
  meHeadSignature: '/assets/signatures/marwa_aburabie.png',
};

function createDefaultRbacStore(): RbacStore {
  const now = new Date().toISOString();
  return {
    accounts: [
      {
        id: 'admin-alaa',
        name: 'علاء مرزوق',
        identifier: 'alaa@paramind.org',
        pin: ADMIN_PASSWORD,
        role: 'Admin',
        status: 'Active',
        createdAt: now,
      },
      {
        id: 'admin-aseel',
        name: 'أسيل ربيع',
        identifier: 'aseel@paramind.org',
        pin: ADMIN_PASSWORD,
        role: 'Admin',
        status: 'Active',
        createdAt: now,
      },
      {
        id: 'me-evaluator-default',
        name: 'عضو التقييم والمتابعة',
        identifier: 'evaluator@paramind.org',
        pin: 'paramind-me',
        role: 'M&E',
        status: 'Active',
        createdAt: now,
      },
      {
        id: 'limited-operator-default',
        name: 'ميسر الورشة المناوب',
        identifier: 'operator@paramind.org',
        pin: '1234',
        role: 'Limited',
        status: 'Active',
        createdAt: now,
      },
    ],
    tech: {
      appsScriptUrl: '',
      googleSheetUrl: '',
      enableRemoteAuth: false,
      emails: [
        {
          id: 'email-official-1',
          email: 'events@paramind.org',
          label: 'البريد الرسمي الرئيسي للمبادرة',
          type: 'official',
          active: true,
        },
        {
          id: 'email-backup-1',
          email: 'backup@paramind.org',
          label: 'البريد الاحتياطي للطوارئ',
          type: 'backup',
          active: true,
        },
      ],
      updatedAt: now,
    },
    template: {
      header: 'مبادرة PARAMIND — دعوة حضور رسمية',
      subject: 'تأكيد تسجيلك ورابط مجموعة الواتساب لورشة: {workshop}',
      body:
        'مرحباً {name}،\n\n' +
        'يسعدنا انضمامك إلى ورشة «{workshop}» ضمن مبادرة PARAMIND.\n' +
        'يرجى الانضمام إلى مجموعة الواتساب الخاصة بالورشة عبر الرابط التالي لمتابعة التعليمات وموعد الجلسة:\n' +
        '{whatsapp_link}\n\n' +
        'مع أطيب التحيات،\nفريق مبادرة PARAMIND',
      isLocked: true,
      updatedAt: now,
    },
  };
}

interface QuestionItem {
  question: string;
  score: number;
  reason: string;
}

interface WorkshopData {
  title: string;
  date: string;
  location: string;
  trainer: string;
  facilitator: string;
  registeredCount?: number | null;
  attendeesCount?: number | null;
  topics: string;
}

interface StoredReport {
  id: string;
  workshop: WorkshopData;
  success: QuestionItem[];
  trainer: QuestionItem[];
  facilitator: QuestionItem[];
  recommendations: string;
  evaluator: string;
  createdAt: string;
  updatedAt?: string;
}

const activeSessions = new Map<string, SessionRecord>();

async function ensureDataFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, '[]', 'utf-8');
  }
}

async function readReports(): Promise<StoredReport[]> {
  await ensureDataFile();
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeReports(reports: StoredReport[]): Promise<void> {
  await ensureDataFile();
  await fs.writeFile(DATA_FILE, JSON.stringify(reports, null, 2), 'utf-8');
}

async function readSettings(): Promise<SiteSettingsData> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SiteSettingsData>;
    return {
      meHeadName:
        typeof parsed.meHeadName === 'string' && parsed.meHeadName.trim()
          ? parsed.meHeadName.trim()
          : DEFAULT_SETTINGS.meHeadName,
      meHeadSignature:
        typeof parsed.meHeadSignature === 'string' && parsed.meHeadSignature.trim()
          ? parsed.meHeadSignature.trim()
          : DEFAULT_SETTINGS.meHeadSignature,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function writeSettings(settings: SiteSettingsData): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

async function readRbacStore(): Promise<RbacStore> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const defaults = createDefaultRbacStore();
  try {
    const raw = await fs.readFile(RBAC_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<RbacStore>;
    return {
      accounts: Array.isArray(parsed.accounts) && parsed.accounts.length > 0
        ? parsed.accounts
        : defaults.accounts,
      tech: parsed.tech && typeof parsed.tech === 'object'
        ? {
            appsScriptUrl: String(parsed.tech.appsScriptUrl ?? ''),
            googleSheetUrl: String(parsed.tech.googleSheetUrl ?? ''),
            enableRemoteAuth: Boolean(parsed.tech.enableRemoteAuth),
            emails: Array.isArray(parsed.tech.emails) ? parsed.tech.emails : defaults.tech.emails,
            updatedAt: parsed.tech.updatedAt,
          }
        : defaults.tech,
      template: parsed.template && typeof parsed.template === 'object'
        ? {
            header: String(parsed.template.header ?? defaults.template.header),
            subject: String(parsed.template.subject ?? defaults.template.subject),
            body: String(parsed.template.body ?? defaults.template.body),
            isLocked:
              typeof parsed.template.isLocked === 'boolean'
                ? parsed.template.isLocked
                : defaults.template.isLocked,
            updatedAt: parsed.template.updatedAt,
          }
        : defaults.template,
    };
  } catch {
    await writeRbacStore(defaults);
    return defaults;
  }
}

async function writeRbacStore(store: RbacStore): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(RBAC_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

async function readAuditLogs(): Promise<AuditLogEntry[]> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(AUDIT_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function appendAuditLog(entry: Omit<AuditLogEntry, 'id' | 'createdAt'>): Promise<AuditLogEntry> {
  const logs = await readAuditLogs();
  const full: AuditLogEntry = {
    id: crypto.randomUUID(),
    ...entry,
    createdAt: new Date().toISOString(),
  };
  logs.unshift(full);
  // Keep latest 1000 records
  await fs.writeFile(AUDIT_FILE, JSON.stringify(logs.slice(0, 1000), null, 2), 'utf-8');
  return full;
}

function sanitizeQuestionList(list: unknown): QuestionItem[] {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 20).map((item) => {
    const record = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const rawScore = Number(record.score);
    const score = Number.isFinite(rawScore) ? Math.min(5, Math.max(0, Math.round(rawScore))) : 0;
    return {
      question: String(record.question ?? '').slice(0, 500),
      score,
      reason: String(record.reason ?? '').slice(0, 2000),
    };
  });
}

function sanitizeOptionalCount(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.min(100_000, Math.round(num));
}

function sanitizeReportBody(body: unknown): Omit<StoredReport, 'id' | 'createdAt' | 'updatedAt'> | null {
  if (!body || typeof body !== 'object') return null;
  const payload = body as Record<string, unknown>;
  const rawWorkshop = (payload.workshop && typeof payload.workshop === 'object'
    ? payload.workshop
    : {}) as Record<string, unknown>;

  const title = String(rawWorkshop.title ?? '').trim().slice(0, 300);
  const date = String(rawWorkshop.date ?? '').trim().slice(0, 40);
  const trainer = String(rawWorkshop.trainer ?? '').trim().slice(0, 200);
  const facilitator = String(rawWorkshop.facilitator ?? '').trim().slice(0, 200);

  if (!title || !date || !trainer || !facilitator) {
    return null;
  }

  return {
    workshop: {
      title,
      date,
      location: String(rawWorkshop.location ?? '').trim().slice(0, 200),
      trainer,
      facilitator,
      registeredCount: sanitizeOptionalCount(rawWorkshop.registeredCount),
      attendeesCount: sanitizeOptionalCount(rawWorkshop.attendeesCount),
      topics: String(rawWorkshop.topics ?? '').trim().slice(0, 4000),
    },
    success: sanitizeQuestionList(payload.success),
    trainer: sanitizeQuestionList(payload.trainer),
    facilitator: sanitizeQuestionList(payload.facilitator),
    recommendations: String(payload.recommendations ?? '').trim().slice(0, 4000),
    evaluator: String(payload.evaluator ?? '').trim().slice(0, 200),
  };
}

function hasMissingReasonsForLowScores(
  report: Pick<StoredReport, 'success' | 'trainer' | 'facilitator'>
): boolean {
  return [...report.success, ...report.trainer, ...report.facilitator].some(
    (item) => item.score > 0 && item.score < 5 && !item.reason.trim()
  );
}

interface AuthenticatedRequest extends Request {
  authSession?: SessionRecord;
}

async function resolveLiveSession(req: Request): Promise<{ session: SessionRecord | null; blocked?: boolean }> {
  const token = String(req.headers['x-auth-token'] ?? '').trim();
  if (!token) return { session: null };
  const record = activeSessions.get(token);
  if (!record) return { session: null };

  if (record.source === 'local') {
    const rbac = await readRbacStore();
    const account = rbac.accounts.find((a) => a.id === record.accountId);
    if (!account) {
      activeSessions.delete(token);
      return { session: null };
    }
    if (account.status === 'Blocked') {
      activeSessions.delete(token);
      return { session: null, blocked: true };
    }
    // Live role/name sync if Admin updated account
    record.role = account.role;
    record.name = account.name;
    record.identifier = account.identifier;
  }

  return { session: record };
}

function isLegacyAdminPasswordValid(req: Request): boolean {
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const adminPass = String(req.headers['x-admin-password'] ?? body.adminPassword ?? '');
  return adminPass === ADMIN_PASSWORD;
}

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const { session, blocked } = await resolveLiveSession(req);
  if (blocked) {
    res.status(403).json({ error: 'تم تجميد هذا الحساب (Blocked) من قِبل الإدارة العليا.' });
    return;
  }
  if (!session) {
    res.status(401).json({ error: 'انتهت الجلسة، يرجى تسجيل الدخول مجدداً.' });
    return;
  }
  req.authSession = session;
  next();
}

async function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  if (isLegacyAdminPasswordValid(req)) {
    const { session } = await resolveLiveSession(req);
    req.authSession = session ?? {
      token: 'legacy-admin',
      accountId: 'admin-override',
      name: 'أدمن المبادرة',
      identifier: 'admin@paramind.org',
      role: 'Admin',
      source: 'local',
      createdAt: new Date().toISOString(),
    };
    next();
    return;
  }

  const { session, blocked } = await resolveLiveSession(req);
  if (blocked) {
    res.status(403).json({ error: 'تم تجميد هذا الحساب (Blocked) من قِبل الإدارة العليا.' });
    return;
  }
  if (!session) {
    res.status(401).json({ error: 'يرجى تسجيل الدخول بصلاحية الأدمن.' });
    return;
  }
  if (session.role !== 'Admin') {
    res.status(403).json({ error: 'هذه الصلاحية مخصصة للإدارة العليا (الأدمن) فقط.' });
    return;
  }
  req.authSession = session;
  next();
}

async function callRemoteAppsScript(
  appsScriptUrl: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // --- Auth & Central Remote Control ---
  app.post('/api/auth/login', async (req, res) => {
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const identifier = String(body.identifier ?? '').trim().toLowerCase();
      const pin = String(body.pin ?? '').trim();

      if (!identifier || !pin) {
        res.status(400).json({ error: 'يرجى إدخال البريد/اسم المستخدم ورمز الدخول (PIN).' });
        return;
      }

      const rbac = await readRbacStore();

      // 1) Remote Google Sheets / Apps Script check if enabled & configured
      if (rbac.tech.enableRemoteAuth && rbac.tech.appsScriptUrl.trim()) {
        const remote = await callRemoteAppsScript(rbac.tech.appsScriptUrl.trim(), {
          action: 'verifyUser',
          identifier,
          pin,
        });

        if (remote) {
          const rawStatus = String(remote.status ?? remote.role ?? '');
          if (rawStatus.toLowerCase() === 'blocked') {
            res.status(403).json({ error: 'تم إيقاف هذا الحساب (Blocked) في جدول الإدارة المركزي.' });
            return;
          }
          if (remote.ok === true) {
            const rawRole = String(remote.role ?? 'Limited');
            const role: UserRole =
              rawRole === 'Admin' ? 'Admin' : rawRole === 'M&E' ? 'M&E' : 'Limited';
            const name = String(remote.name ?? identifier);
            const token = crypto.randomUUID();
            const session: SessionRecord = {
              token,
              accountId: `remote-${identifier}`,
              name,
              identifier,
              role,
              source: 'remote',
              createdAt: new Date().toISOString(),
            };
            activeSessions.set(token, session);
            await appendAuditLog({
              actorName: name,
              actorIdentifier: identifier,
              actorRole: role,
              actionType: 'auth',
              details: 'تسجيل دخول عبر جدول الإدارة المركزي (Google Sheets)',
            });
            res.json(session);
            return;
          }
          if (remote.ok === false) {
            res.status(401).json({ error: String(remote.error || 'بيانات الدخول غير صحيحة في جدول الإدارة.') });
            return;
          }
        }
      }

      // 2) Local managed accounts lookup (matching identifier OR exact name)
      const matched = rbac.accounts.find(
        (acc) =>
          acc.identifier.trim().toLowerCase() === identifier ||
          acc.name.trim().toLowerCase() === identifier
      );

      if (!matched || matched.pin !== pin) {
        res.status(401).json({ error: 'البريد/اسم المستخدم أو رمز الدخول (PIN) غير صحيح.' });
        return;
      }

      if (matched.status === 'Blocked') {
        res.status(403).json({
          error: 'تم تجميد هذا الحساب (Blocked) من قِبل الإدارة العليا ولا يمكنه الدخول.',
        });
        return;
      }

      const token = crypto.randomUUID();
      const session: SessionRecord = {
        token,
        accountId: matched.id,
        name: matched.name,
        identifier: matched.identifier,
        role: matched.role,
        source: 'local',
        createdAt: new Date().toISOString(),
      };
      activeSessions.set(token, session);

      await appendAuditLog({
        actorName: matched.name,
        actorIdentifier: matched.identifier,
        actorRole: matched.role,
        actionType: 'auth',
        details: `تسجيل دخول بصلاحية (${matched.role})`,
      });

      res.json(session);
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'تعذر إتمام تسجيل الدخول.' });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    const { session, blocked } = await resolveLiveSession(req);
    if (blocked) {
      res.status(403).json({ error: 'تم تجميد هذا الحساب (Blocked) من قِبل الإدارة العليا.' });
      return;
    }
    if (!session) {
      res.status(401).json({ error: 'الجلسة غير صالحة.' });
      return;
    }
    res.json(session);
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = String(req.headers['x-auth-token'] ?? '').trim();
    if (token) activeSessions.delete(token);
    res.json({ ok: true });
  });

  // --- Site Settings (M&E Head) ---
  app.get('/api/settings', async (_req, res) => {
    try {
      const settings = await readSettings();
      res.json(settings);
    } catch (error) {
      console.error('Error reading settings:', error);
      res.status(500).json({ error: 'تعذر تحميل إعدادات النظام.' });
    }
  });

  app.post('/api/admin/verify', (req, res) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const password = String(body.password ?? '');
    if (password !== ADMIN_PASSWORD) {
      res.status(401).json({ error: 'كلمة مرور الأدمن غير صحيحة.' });
      return;
    }
    res.json({ verified: true });
  });

  app.put('/api/settings', requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const meHeadName = String(body.meHeadName ?? '').trim().slice(0, 200);
      const rawSignature = String(body.meHeadSignature ?? '').trim();

      if (!meHeadName) {
        res.status(400).json({ error: 'يرجى إدخال اسم مسؤول قسم التقييم والمتابعة.' });
        return;
      }

      const isValidSignature =
        rawSignature.startsWith('/assets/') ||
        /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(rawSignature);

      if (!isValidSignature || rawSignature.length > 600_000) {
        res.status(400).json({ error: 'صيغة التوقيع غير صالحة أو حجمه كبير جداً.' });
        return;
      }

      const nextSettings: SiteSettingsData = {
        meHeadName,
        meHeadSignature: rawSignature,
        updatedAt: new Date().toISOString(),
      };
      await writeSettings(nextSettings);

      if (req.authSession) {
        await appendAuditLog({
          actorName: req.authSession.name,
          actorIdentifier: req.authSession.identifier,
          actorRole: req.authSession.role,
          actionType: 'settings',
          details: `تحديث بيانات مسؤول قسم التقييم والمتابعة إلى: ${meHeadName}`,
        });
      }

      res.json(nextSettings);
    } catch (error) {
      console.error('Error saving settings:', error);
      res.status(500).json({ error: 'تعذر حفظ إعدادات الأدمن.' });
    }
  });

  // --- Admin RBAC, Tech Infrastructure, Templates & Audit Log ---
  app.get('/api/admin/rbac', requireAdmin, async (_req, res) => {
    try {
      const store = await readRbacStore();
      res.json(store);
    } catch (error) {
      console.error('Error reading RBAC:', error);
      res.status(500).json({ error: 'تعذر تحميل بيانات الصلاحيات.' });
    }
  });

  app.post('/api/admin/accounts', requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const name = String(body.name ?? '').trim().slice(0, 120);
      const identifier = String(body.identifier ?? '').trim().toLowerCase().slice(0, 160);
      const pin = String(body.pin ?? '').trim().slice(0, 64);
      const rawRole = String(body.role ?? 'Limited');
      const role: UserRole =
        rawRole === 'Admin' ? 'Admin' : rawRole === 'M&E' ? 'M&E' : 'Limited';
      const status: AccountStatus = body.status === 'Blocked' ? 'Blocked' : 'Active';

      if (!name || !identifier || pin.length < 4) {
        res.status(400).json({ error: 'يرجى إدخال الاسم، البريد/اسم المستخدم، ورمز دخول PIN (4 أحرف على الأقل).' });
        return;
      }

      const store = await readRbacStore();
      if (store.accounts.some((a) => a.identifier.toLowerCase() === identifier)) {
        res.status(409).json({ error: 'يوجد حساب مسجل مسبقاً بنفس البريد الإلكتروني أو اسم المستخدم.' });
        return;
      }

      const created: ManagedAccount = {
        id: crypto.randomUUID(),
        name,
        identifier,
        pin,
        role,
        status,
        createdAt: new Date().toISOString(),
      };
      store.accounts.push(created);
      await writeRbacStore(store);

      if (req.authSession) {
        await appendAuditLog({
          actorName: req.authSession.name,
          actorIdentifier: req.authSession.identifier,
          actorRole: req.authSession.role,
          actionType: 'rbac',
          details: `إنشاء حساب جديد: ${name} (${identifier}) بصلاحية ${role}`,
        });
      }

      res.status(201).json(created);
    } catch (error) {
      console.error('Error creating account:', error);
      res.status(500).json({ error: 'تعذر إنشاء الحساب.' });
    }
  });

  app.put('/api/admin/accounts/:id', requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const store = await readRbacStore();
      const idx = store.accounts.findIndex((a) => a.id === id);
      if (idx === -1) {
        res.status(404).json({ error: 'الحساب غير موجود.' });
        return;
      }

      const current = store.accounts[idx];
      const nextName = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : current.name;
      const nextIdentifier =
        typeof body.identifier === 'string' && body.identifier.trim()
          ? body.identifier.trim().toLowerCase().slice(0, 160)
          : current.identifier;
      const nextPin =
        typeof body.pin === 'string' && body.pin.trim().length >= 4
          ? body.pin.trim().slice(0, 64)
          : current.pin;
      const nextRole: UserRole =
        body.role === 'Admin' || body.role === 'Limited' || body.role === 'M&E'
          ? body.role
          : current.role;
      const nextStatus: AccountStatus =
        body.status === 'Blocked' || body.status === 'Active' ? body.status : current.status;

      // Prevent admin from locking themselves out accidentally
      if (req.authSession?.accountId === id && (nextStatus === 'Blocked' || nextRole !== 'Admin')) {
        res.status(400).json({ error: 'لا يمكنك تجميد حسابك الحالي أو سحب صلاحية الأدمن من نفسك.' });
        return;
      }

      const updated: ManagedAccount = {
        ...current,
        name: nextName,
        identifier: nextIdentifier,
        pin: nextPin,
        role: nextRole,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      };
      store.accounts[idx] = updated;
      await writeRbacStore(store);

      // Immediately revoke active tokens if Blocked
      if (nextStatus === 'Blocked') {
        for (const [tok, sess] of activeSessions.entries()) {
          if (sess.accountId === id) {
            activeSessions.delete(tok);
          }
        }
      }

      if (req.authSession) {
        await appendAuditLog({
          actorName: req.authSession.name,
          actorIdentifier: req.authSession.identifier,
          actorRole: req.authSession.role,
          actionType: 'rbac',
          details: `تعديل حساب ${updated.name}: الصلاحية (${updated.role}) · الحالة (${updated.status})`,
        });
      }

      res.json(updated);
    } catch (error) {
      console.error('Error updating account:', error);
      res.status(500).json({ error: 'تعذر تحديث الحساب.' });
    }
  });

  app.delete('/api/admin/accounts/:id', requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      if (req.authSession?.accountId === id) {
        res.status(400).json({ error: 'لا يمكنك حذف حسابك النشط حالياً.' });
        return;
      }

      const store = await readRbacStore();
      const target = store.accounts.find((a) => a.id === id);
      if (!target) {
        res.status(404).json({ error: 'الحساب غير موجود.' });
        return;
      }

      store.accounts = store.accounts.filter((a) => a.id !== id);
      await writeRbacStore(store);

      for (const [tok, sess] of activeSessions.entries()) {
        if (sess.accountId === id) {
          activeSessions.delete(tok);
        }
      }

      if (req.authSession) {
        await appendAuditLog({
          actorName: req.authSession.name,
          actorIdentifier: req.authSession.identifier,
          actorRole: req.authSession.role,
          actionType: 'rbac',
          details: `حذف حساب: ${target.name} (${target.identifier})`,
        });
      }

      res.json({ deleted: true, id });
    } catch (error) {
      console.error('Error deleting account:', error);
      res.status(500).json({ error: 'تعذر حذف الحساب.' });
    }
  });

  app.put('/api/admin/tech', requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const store = await readRbacStore();

      const rawEmails = Array.isArray(body.emails) ? body.emails : store.tech.emails;
      const sanitizedEmails: OfficialEmailEntry[] = rawEmails
        .slice(0, 30)
        .map((item): OfficialEmailEntry => {
          const rec = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
          return {
            id: String(rec.id || crypto.randomUUID()),
            email: String(rec.email ?? '').trim().slice(0, 160),
            label: String(rec.label ?? '').trim().slice(0, 160),
            type: rec.type === 'backup' ? 'backup' : 'official',
            active: rec.active !== false,
          };
        })
        .filter((e) => e.email.includes('@'));

      store.tech = {
        appsScriptUrl: String(body.appsScriptUrl ?? '').trim().slice(0, 1000),
        googleSheetUrl: String(body.googleSheetUrl ?? '').trim().slice(0, 1000),
        enableRemoteAuth: Boolean(body.enableRemoteAuth),
        emails: sanitizedEmails,
        updatedAt: new Date().toISOString(),
      };
      await writeRbacStore(store);

      if (req.authSession) {
        await appendAuditLog({
          actorName: req.authSession.name,
          actorIdentifier: req.authSession.identifier,
          actorRole: req.authSession.role,
          actionType: 'settings',
          details: `تحديث البنية التقنية (${sanitizedEmails.length} بريد رسمي/احتياطي · الربط الخارجي: ${
            store.tech.appsScriptUrl ? 'مضاف' : 'غير مضاف'
          })`,
        });
      }

      res.json(store.tech);
    } catch (error) {
      console.error('Error saving tech settings:', error);
      res.status(500).json({ error: 'تعذر حفظ إعدادات البنية التقنية.' });
    }
  });

  app.put('/api/admin/template', requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const store = await readRbacStore();

      const header = String(body.header ?? '').trim().slice(0, 300);
      const subject = String(body.subject ?? '').trim().slice(0, 300);
      const templateBody = String(body.body ?? '').trim().slice(0, 5000);
      if (!header || !subject || !templateBody) {
        res.status(400).json({ error: 'يرجى استكمال الترويسة وعنوان الرسالة ونص القالب الرسمي.' });
        return;
      }

      store.template = {
        header,
        subject,
        body: templateBody,
        isLocked: Boolean(body.isLocked),
        updatedAt: new Date().toISOString(),
      };
      await writeRbacStore(store);

      if (req.authSession) {
        await appendAuditLog({
          actorName: req.authSession.name,
          actorIdentifier: req.authSession.identifier,
          actorRole: req.authSession.role,
          actionType: 'settings',
          details: `تحديث القالب الرسمي (${store.template.isLocked ? 'مقفل على الأعضاء' : 'مفتوح للتخصيص'})`,
        });
      }

      res.json(store.template);
    } catch (error) {
      console.error('Error saving template:', error);
      res.status(500).json({ error: 'تعذر حفظ القالب الرسمي.' });
    }
  });

  app.get('/api/admin/audit-logs', requireAdmin, async (_req, res) => {
    try {
      const logs = await readAuditLogs();
      res.json(logs);
    } catch (error) {
      console.error('Error reading audit logs:', error);
      res.status(500).json({ error: 'تعذر تحميل سجل المراقبة.' });
    }
  });

  // --- Workshop Runner (Allowed for Limited Operator & Admin; NEVER exposes sensitive emails/URLs) ---
  app.get('/api/workshop-runner/config', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      if (req.authSession?.role !== 'Admin' && req.authSession?.role !== 'Limited') {
        res.status(403).json({ error: 'تشغيل الورش متاح للميسر المناوب أو الأدمن فقط.' });
        return;
      }
      const store = await readRbacStore();
      res.json({
        template: store.template,
        appsScriptConfigured: Boolean(store.tech.appsScriptUrl.trim()),
        activeSenderLabel:
          store.tech.emails.find((e) => e.active && e.type === 'official')?.label ||
          'البريد الرسمي للمبادرة',
      });
    } catch (error) {
      console.error('Error reading workshop runner config:', error);
      res.status(500).json({ error: 'تعذر تحميل إعدادات تشغيل الورشة.' });
    }
  });

  app.post('/api/workshop-runner/dispatch', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const actor = req.authSession;
      if (!actor || (actor.role !== 'Admin' && actor.role !== 'Limited')) {
        res.status(403).json({ error: 'صلاحية تشغيل الورشة غير متوفرة لهذا الحساب.' });
        return;
      }

      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const workshopTitle = String(body.workshopTitle ?? '').trim().slice(0, 300);
      const whatsappLink = String(body.whatsappLink ?? '').trim().slice(0, 500);
      const rawRecipients = Array.isArray(body.recipients) ? body.recipients : [];

      if (!workshopTitle) {
        res.status(400).json({ error: 'يرجى إدخال عنوان الورشة الحالية.' });
        return;
      }
      if (!whatsappLink) {
        res.status(400).json({ error: 'يرجى لصق رابط مجموعة الواتساب الخاص بالورشة.' });
        return;
      }
      if (rawRecipients.length === 0) {
        res.status(400).json({ error: 'يرجى رفع ملف المشاركين (Excel/CSV) أولاً.' });
        return;
      }

      const recipients = rawRecipients.slice(0, 2000).map((item) => {
        const rec = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
        return {
          name: String(rec.name ?? 'مشارك').trim().slice(0, 120),
          email: String(rec.email ?? '').trim().slice(0, 160),
          phone: String(rec.phone ?? '').trim().slice(0, 60),
        };
      });

      const withEmail = recipients.filter((r) => r.email.includes('@'));
      const phoneOnly = recipients.filter((r) => !r.email.includes('@') && r.phone.length > 0);

      if (withEmail.length === 0) {
        res.status(400).json({
          error: 'لا يوجد مشاركون لديهم بريد إلكتروني صالح للإرسال. يمكنك نسخ قائمة الأرقام بدون بريد وإضافتهم يدوياً.',
        });
        return;
      }

      const store = await readRbacStore();
      // Enforce official template when locked for Limited operators
      const useOfficialLocked = store.template.isLocked && actor.role !== 'Admin';
      const header = useOfficialLocked
        ? store.template.header
        : String(body.customHeader ?? store.template.header).trim() || store.template.header;
      const subject = useOfficialLocked
        ? store.template.subject
        : String(body.customSubject ?? store.template.subject).trim() || store.template.subject;
      const msgBody = useOfficialLocked
        ? store.template.body
        : String(body.customBody ?? store.template.body).trim() || store.template.body;

      let dispatchMode: 'apps-script' | 'recorded' = 'recorded';
      if (store.tech.appsScriptUrl.trim()) {
        const senderEmail = store.tech.emails.find((e) => e.active)?.email ?? '';
        const remoteRes = await callRemoteAppsScript(store.tech.appsScriptUrl.trim(), {
          action: 'sendWorkshopInvites',
          workshopTitle,
          whatsappLink,
          senderEmail,
          template: { header, subject, body: msgBody },
          recipients: withEmail,
        });
        if (remoteRes && remoteRes.ok !== false) {
          dispatchMode = 'apps-script';
        }
      }

      await appendAuditLog({
        actorName: actor.name,
        actorIdentifier: actor.identifier,
        actorRole: actor.role,
        actionType: 'dispatch',
        workshopTitle,
        messagesSent: withEmail.length,
        phoneOnlyCount: phoneOnly.length,
        details:
          dispatchMode === 'apps-script'
            ? `إرسال ${withEmail.length} رسالة عبر Google Apps Script لورشة «${workshopTitle}»`
            : `تجهيز وتسجيل إرسال ${withEmail.length} رسالة لورشة «${workshopTitle}» (أرقام بدون بريد: ${phoneOnly.length})`,
      });

      res.json({
        sentCount: withEmail.length,
        phoneOnlyCount: phoneOnly.length,
        mode: dispatchMode,
        message:
          dispatchMode === 'apps-script'
            ? `تم إرسال ${withEmail.length} دعوة بنجاح عبر Google Apps Script وتوثيق العملية في سجل المراقبة.`
            : `تم تنفيذ وتوثيق إرسال ${withEmail.length} دعوة لورشة «${workshopTitle}» في سجل المراقبة. (اربط رابط Google Apps Script من لوحة الإدارة للإرسال الفعلي عبر Gmail).`,
      });
    } catch (error) {
      console.error('Workshop dispatch error:', error);
      res.status(500).json({ error: 'تعذر إتمام عملية الإرسال.' });
    }
  });

  // --- M&E Reports (Strict privacy: Limited Operators CANNOT access previous workshops archive) ---
  app.get('/api/reports', async (req, res) => {
    try {
      const { session, blocked } = await resolveLiveSession(req);
      if (blocked) {
        res.status(403).json({ error: 'تم تجميد هذا الحساب (Blocked).' });
        return;
      }
      if (session && session.role === 'Limited') {
        res.status(403).json({ error: 'غير مصرح لحساب النشاط المحدود بالوصول إلى أرشيف الورش السابقة.' });
        return;
      }

      const reports = await readReports();
      reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      res.json(reports);
    } catch (error) {
      console.error('Error reading reports:', error);
      res.status(500).json({ error: 'تعذر تحميل التقارير من الخادم.' });
    }
  });

  app.post('/api/reports', async (req, res) => {
    try {
      const { session, blocked } = await resolveLiveSession(req);
      if (blocked) {
        res.status(403).json({ error: 'تم تجميد هذا الحساب (Blocked).' });
        return;
      }
      if (session && session.role === 'Limited') {
        res.status(403).json({ error: 'غير مصرح لحساب النشاط المحدود بإنشاء تقارير التقييم.' });
        return;
      }

      const sanitized = sanitizeReportBody(req.body);
      if (!sanitized) {
        res.status(400).json({ error: 'يرجى استكمال جميع الحقول الأساسية للورشة.' });
        return;
      }
      if (hasMissingReasonsForLowScores(sanitized)) {
        res.status(400).json({ error: 'يرجى كتابة سبب التقييم لجميع المعايير الحاصلة على أقل من 5 نجوم.' });
        return;
      }

      const reports = await readReports();
      const newReport: StoredReport = {
        id: crypto.randomUUID(),
        ...sanitized,
        createdAt: new Date().toISOString(),
      };
      reports.unshift(newReport);
      await writeReports(reports);

      if (session) {
        await appendAuditLog({
          actorName: session.name,
          actorIdentifier: session.identifier,
          actorRole: session.role,
          actionType: 'report',
          workshopTitle: newReport.workshop.title,
          details: `إنشاء تقرير تقييم جديد لورشة «${newReport.workshop.title}»`,
        });
      }

      res.status(201).json(newReport);
    } catch (error) {
      console.error('Error creating report:', error);
      res.status(500).json({ error: 'تعذر حفظ التقرير.' });
    }
  });

  app.put('/api/reports/:id', requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const sanitized = sanitizeReportBody(req.body);
      if (!sanitized) {
        res.status(400).json({ error: 'يرجى استكمال جميع الحقول الأساسية للورشة.' });
        return;
      }
      if (hasMissingReasonsForLowScores(sanitized)) {
        res.status(400).json({ error: 'يرجى كتابة سبب التقييم لجميع المعايير الحاصلة على أقل من 5 نجوم.' });
        return;
      }

      const reports = await readReports();
      const index = reports.findIndex((r) => r.id === id);
      if (index === -1) {
        res.status(404).json({ error: 'التقرير غير موجود.' });
        return;
      }

      const updated: StoredReport = {
        ...reports[index],
        ...sanitized,
        updatedAt: new Date().toISOString(),
      };
      reports[index] = updated;
      await writeReports(reports);

      if (req.authSession) {
        await appendAuditLog({
          actorName: req.authSession.name,
          actorIdentifier: req.authSession.identifier,
          actorRole: req.authSession.role,
          actionType: 'report',
          workshopTitle: updated.workshop.title,
          details: `تعديل تقرير تقييم ورشة «${updated.workshop.title}»`,
        });
      }

      res.json(updated);
    } catch (error) {
      console.error('Error updating report:', error);
      res.status(500).json({ error: 'تعذر تحديث التقرير.' });
    }
  });

  app.delete('/api/reports/:id', requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const reports = await readReports();
      const target = reports.find((r) => r.id === id);
      const filtered = reports.filter((r) => r.id !== id);
      if (filtered.length === reports.length) {
        res.status(404).json({ error: 'التقرير غير موجود.' });
        return;
      }
      await writeReports(filtered);

      if (req.authSession) {
        await appendAuditLog({
          actorName: req.authSession.name,
          actorIdentifier: req.authSession.identifier,
          actorRole: req.authSession.role,
          actionType: 'report',
          workshopTitle: target?.workshop.title,
          details: `حذف تقرير تقييم ورشة «${target?.workshop.title || id}»`,
        });
      }

      res.json({ deleted: true, id });
    } catch (error) {
      console.error('Error deleting report:', error);
      res.status(500).json({ error: 'تعذر حذف التقرير.' });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PARAMIND M&E server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
