import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Lock,
  Upload,
  PenTool,
  RotateCcw,
  Save,
  AlertCircle,
  Eraser,
  Check,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { DEFAULT_SITE_SETTINGS, SiteSettings } from '../types/evaluation';

interface AdminSettingsModalProps {
  isOpen: boolean;
  currentSettings: SiteSettings;
  adminPassword: string | null;
  authToken?: string;
  isAdminSession?: boolean;
  onAdminVerified: (password: string) => void;
  onLockAdmin?: () => void;
  onSaved: (nextSettings: SiteSettings) => void;
  onClose: () => void;
}

async function extractCleanSignatureFromFile(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Invalid image'));
    el.src = dataUrl;
  });

  const maxW = 500;
  const maxH = 260;
  const scale = Math.min(1, maxW / img.width, maxH / img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;

  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const pixels = imageData.data;

  let hasAlpha = false;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] < 245) {
      hasAlpha = true;
      break;
    }
  }

  if (!hasAlpha) {
    for (let i = 0; i < pixels.length; i += 4) {
      const lum = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      if (lum > 185) {
        pixels[i + 3] = 0;
      } else {
        const alpha = Math.min(255, Math.round(((185 - lum) / 100) * 255));
        pixels[i] = 0;
        pixels[i + 1] = 0;
        pixels[i + 2] = 0;
        pixels[i + 3] = alpha;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  return canvas.toDataURL('image/png');
}

export const AdminSettingsModal: React.FC<AdminSettingsModalProps> = ({
  isOpen,
  currentSettings,
  adminPassword,
  authToken,
  isAdminSession = false,
  onAdminVerified,
  onLockAdmin,
  onSaved,
  onClose,
}) => {
  const { lang } = useLanguage();
  const isAr = lang === 'ar';

  const [passwordInput, setPasswordInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [authError, setAuthError] = useState('');

  const [meHeadName, setMeHeadName] = useState(currentSettings.meHeadName);
  const [meHeadSignature, setMeHeadSignature] = useState(currentSettings.meHeadSignature);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [hasDrawnStrokes, setHasDrawnStrokes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMeHeadName(currentSettings.meHeadName);
      setMeHeadSignature(currentSettings.meHeadSignature);
      setSaveError('');
      setAuthError('');
      setIsDrawingMode(false);
      setHasDrawnStrokes(false);
    }
  }, [isOpen, currentSettings]);

  if (!isOpen) return null;

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    setAuthError('');
    try {
      const response = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          body.error || (isAr ? 'كلمة مرور الأدمن غير صحيحة.' : 'Incorrect Admin password.')
        );
      }
      onAdminVerified(passwordInput);
      setPasswordInput('');
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : isAr
          ? 'تعذر التحقق من الصلاحية.'
          : 'Verification failed.'
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaveError('');
    try {
      const cleaned = await extractCleanSignatureFromFile(file);
      setMeHeadSignature(cleaned);
      setIsDrawingMode(false);
    } catch {
      setSaveError(
        isAr
          ? 'تعذر قراءة ملف الصورة. يرجى اختيار صورة PNG أو JPG صالحة.'
          : 'Could not read image file. Please select a valid PNG or JPG.'
      );
    }
    e.target.value = '';
  };

  const getPointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(e.pointerId);
    const pos = getPointerPos(e);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    isDrawingRef.current = true;
    setHasDrawnStrokes(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPointerPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const handlePointerUp = () => {
    isDrawingRef.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawnStrokes(false);
  };

  const applyDrawnSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawnStrokes) return;
    setMeHeadSignature(canvas.toDataURL('image/png'));
    setIsDrawingMode(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPassword && !isAdminSession) return;
    const trimmedName = meHeadName.trim();
    if (!trimmedName) {
      setSaveError(
        isAr
          ? 'يرجى إدخال اسم مسؤول قسم التقييم والمتابعة.'
          : 'Please enter the M&E Department Head name.'
      );
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers['x-auth-token'] = authToken;
      if (adminPassword) headers['x-admin-password'] = adminPassword;

      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          ...(adminPassword ? { adminPassword } : {}),
          meHeadName: trimmedName,
          meHeadSignature,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || (isAr ? 'تعذر حفظ الإعدادات.' : 'Failed to save settings.'));
      }
      const updated = (await response.json()) as SiteSettings;
      onSaved(updated);
      onClose();
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : isAr
          ? 'حدث خطأ أثناء حفظ الإعدادات.'
          : 'Error saving settings.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#1B093B]/60 dark:bg-black/75 backdrop-blur-[1px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-settings-title"
    >
      <div className="bg-white dark:bg-[#170D2B] rounded-xl border border-slate-200 dark:border-purple-900/60 max-w-lg w-full overflow-hidden shadow-xl">
        <div className="px-6 py-4 bg-[#2E1065] dark:bg-[#160730] text-white flex items-center justify-between border-b border-purple-900/60">
          <div className="flex items-center gap-2">
            <Lock size={18} className="text-amber-400" />
            <h3 id="admin-settings-title" className="text-base font-bold">
              {isAr ? 'صلاحيات وإعدادات الأدمن' : 'Admin Permissions & Settings'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-purple-200 hover:text-white rounded-md cursor-pointer"
            aria-label={isAr ? 'إغلاق النافذة' : 'Close modal'}
          >
            <X size={18} />
          </button>
        </div>

        {!adminPassword && !isAdminSession ? (
          <form onSubmit={handleVerify} className="p-6 space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {isAr
                ? 'تفعيل صلاحيات الأدمن يتيح لك تعديل وحذف التقارير بالإضافة إلى تغيير اسم وتوقيع مسؤول قسم التقييم والمتابعة. أدخل كلمة مرور الأدمن للمتابعة.'
                : 'Unlocking Admin permissions allows editing and deleting reports as well as updating the M&E Department Head name and signature.'}
            </p>

            {authError && (
              <div
                role="alert"
                className="bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 px-3.5 py-2.5 rounded-lg text-sm flex items-center gap-2"
              >
                <AlertCircle size={16} className="shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{authError}</span>
              </div>
            )}

            <div>
              <label htmlFor="admin-pass" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                {isAr ? 'كلمة مرور الأدمن' : 'Admin Password'}
              </label>
              <input
                id="admin-pass"
                type="password"
                required
                autoFocus
                dir="ltr"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder={isAr ? 'أدخل رمز الأدمن' : 'Enter Admin PIN'}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 text-left focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:border-transparent"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2A184A] rounded-lg cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={verifying}
                className="px-5 py-2 text-sm font-semibold text-white bg-[#2E1065] hover:bg-purple-950 dark:bg-purple-700 dark:hover:bg-purple-600 rounded-lg disabled:opacity-60 cursor-pointer"
              >
                {verifying
                  ? isAr
                    ? 'جاري التحقق...'
                    : 'Verifying...'
                  : isAr
                  ? 'تفعيل صلاحيات الأدمن'
                  : 'Unlock Admin'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSave} className="p-6 space-y-5">
            <div className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 px-3.5 py-2.5 rounded-lg text-xs font-medium flex items-center justify-between gap-2">
              <span>
                {isAr
                  ? 'صلاحيات الأدمن مفعّلة: يمكنك الآن تعديل وحذف التقارير وتحديث بيانات مسؤول القسم.'
                  : 'Admin active: you can edit/delete reports and update the M&E Head settings.'}
              </span>
              {onLockAdmin && !isAdminSession && (
                <button
                  type="button"
                  onClick={onLockAdmin}
                  className="text-emerald-800 dark:text-emerald-300 underline font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isAr ? 'قفل الصلاحية' : 'Lock'}
                </button>
              )}
            </div>

            {saveError && (
              <div
                role="alert"
                className="bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 px-3.5 py-2.5 rounded-lg text-sm flex items-center gap-2"
              >
                <AlertCircle size={16} className="shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{saveError}</span>
              </div>
            )}

            <div>
              <label htmlFor="me-head-name" className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                {isAr
                  ? 'اسم مسؤول قسم التقييم والمتابعة (الثابت في جميع التقارير)'
                  : 'M&E Department Head Name (Fixed on all reports)'}
              </label>
              <input
                id="me-head-name"
                type="text"
                required
                value={meHeadName}
                onChange={(e) => setMeHeadName(e.target.value)}
                placeholder={isAr ? 'الاسم الكامل لمسؤول القسم' : 'Full name'}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 dark:border-purple-800/70 rounded-lg bg-white dark:bg-[#110822] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:border-transparent"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {isAr ? 'توقيع مسؤول قسم التقييم والمتابعة' : 'M&E Department Head Signature'}
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#2E1065] dark:text-purple-100 bg-purple-50 dark:bg-purple-900/40 hover:bg-purple-100 dark:hover:bg-purple-900/60 rounded-md cursor-pointer transition-colors"
                  >
                    <Upload size={13} />
                    <span>{isAr ? 'رفع صورة' : 'Upload'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsDrawingMode((prev) => !prev)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                      isDrawingMode
                        ? 'bg-[#2E1065] dark:bg-purple-700 text-white'
                        : 'text-[#2E1065] dark:text-purple-100 bg-purple-50 dark:bg-purple-900/40 hover:bg-purple-100 dark:hover:bg-purple-900/60'
                    }`}
                  >
                    <PenTool size={13} />
                    <span>{isAr ? 'رسم توقيع' : 'Draw'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMeHeadSignature(DEFAULT_SITE_SETTINGS.meHeadSignature);
                      setIsDrawingMode(false);
                    }}
                    title={isAr ? 'استعادة التوقيع الافتراضي' : 'Reset Default'}
                    className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-[#2E1065] dark:hover:text-white hover:bg-purple-50 dark:hover:bg-purple-900/40 rounded-md cursor-pointer transition-colors"
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              </div>

              {isDrawingMode ? (
                <div className="space-y-2">
                  <canvas
                    ref={canvasRef}
                    width={460}
                    height={140}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    className="w-full h-36 border border-dashed border-purple-300 dark:border-purple-600 rounded-lg bg-white touch-none cursor-crosshair"
                  />
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={clearCanvas}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-[#2E1065] dark:hover:text-white cursor-pointer"
                    >
                      <Eraser size={14} />
                      <span>{isAr ? 'مسح اللوحة' : 'Clear'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={!hasDrawnStrokes}
                      onClick={applyDrawnSignature}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#2E1065] hover:bg-purple-950 dark:bg-purple-700 dark:hover:bg-purple-600 rounded-md disabled:opacity-50 cursor-pointer"
                    >
                      <Check size={14} />
                      <span>{isAr ? 'اعتماد التوقيع المرسوم' : 'Apply Drawn Signature'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-28 border border-slate-200 dark:border-purple-700/60 rounded-lg bg-white flex items-center justify-center p-3">
                  <img
                    src={meHeadSignature}
                    alt={meHeadName}
                    referrerPolicy="no-referrer"
                    className="max-h-20 max-w-[200px] object-contain"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-purple-900/60">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2A184A] rounded-lg cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg disabled:opacity-60 cursor-pointer shadow-xs"
              >
                <Save size={16} />
                <span>
                  {saving
                    ? isAr
                      ? 'جاري الحفظ...'
                      : 'Saving...'
                    : isAr
                    ? 'حفظ التعديلات'
                    : 'Save Changes'}
                </span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
