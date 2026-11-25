import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  FACILITATOR_QUESTIONS,
  SUCCESS_QUESTIONS,
  TRAINER_QUESTIONS,
} from '../types/evaluation';

export type AppLanguage = 'ar' | 'en';

interface LanguageContextValue {
  lang: AppLanguage;
  isRtl: boolean;
  setLang: (next: AppLanguage) => void;
  toggleLang: () => void;
}

const LANG_STORAGE_KEY = 'paramind_lang';

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'ar',
  isRtl: true,
  setLang: () => {},
  toggleLang: () => {},
});

const ENGLISH_QUESTION_MAP: Record<string, string> = {
  // Section 2: Success
  [SUCCESS_QUESTIONS[0]]:
    'The workshop objectives were clear from the beginning and achieved by the end of the session.',
  [SUCCESS_QUESTIONS[1]]:
    'The scientific content was accurate, reliable, and free from unsubstantiated personal opinions.',
  [SUCCESS_QUESTIONS[2]]:
    'Complex information was simplified in a smooth and understandable way for non-specialists.',
  [SUCCESS_QUESTIONS[3]]:
    'The sequence of ideas and topics was logical and cohesive.',
  [SUCCESS_QUESTIONS[4]]:
    'The audience interacted actively with the trainer and the workshop was engaging.',
  // Section 3: Trainer
  [TRAINER_QUESTIONS[0]]:
    'The trainer demonstrated high mastery and deep knowledge of the workshop topic.',
  [TRAINER_QUESTIONS[1]]:
    'The trainer used a professional, motivating tone and language that kept attendees engaged.',
  [TRAINER_QUESTIONS[2]]:
    'The trainer succeeded in involving attendees and asking interactive questions instead of lecturing continuously.',
  [TRAINER_QUESTIONS[3]]:
    'The trainer adhered to awareness boundaries without prejudice, stigmatizing terms, or unprofessional conduct.',
  [TRAINER_QUESTIONS[4]]:
    'The trainer handled audience questions and interventions with full professionalism and respect.',
  // Section 4: Facilitator
  [FACILITATOR_QUESTIONS[0]]:
    'Registration and joining the WhatsApp group were clear and well-organized.',
  [FACILITATOR_QUESTIONS[1]]:
    'The facilitator succeeded in breaking the ice and creating a safe, welcoming environment before and during the workshop.',
  [FACILITATOR_QUESTIONS[2]]:
    'The facilitator strictly adhered to the scheduled start and end times.',
  [FACILITATOR_QUESTIONS[3]]:
    'Discussions, chat, and voice interventions were managed fairly and cleanly.',
  [FACILITATOR_QUESTIONS[4]]:
    'Any disruptions, interruptions, or disorder were effectively controlled within the workshop.',
};

export function getLocalizedQuestionText(arabicQuestion: string, lang: AppLanguage): string {
  if (lang === 'ar') return arabicQuestion;
  return ENGLISH_QUESTION_MAP[arabicQuestion] ?? arabicQuestion;
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<AppLanguage>(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      return saved === 'en' ? 'en' : 'ar';
    } catch {
      return 'ar';
    }
  });

  useEffect(() => {
    const isRtl = lang === 'ar';
    document.documentElement.lang = lang;
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.title =
      lang === 'ar'
        ? 'PARAMIND M&E — بوابة التقييم والمتابعة'
        : 'PARAMIND M&E — Evaluation & Follow-up Portal';
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // Ignore storage error
    }
  }, [lang]);

  const setLang = useCallback((next: AppLanguage) => {
    setLangState(next);
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => (prev === 'ar' ? 'en' : 'ar'));
  }, []);

  return (
    <LanguageContext.Provider value={{ lang, isRtl: lang === 'ar', setLang, toggleLang }}>
      {children}
    </LanguageContext.Provider>
  );
};

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
