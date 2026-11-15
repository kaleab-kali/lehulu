import type { L10n, Lang } from './types';

export function text(v: L10n | undefined, lang: Lang): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return (lang === 'am' ? v.am : undefined) ?? v.en;
}

const UI = {
  en: {
    question: (i: number, n: number) => `Question ${i} of ${n}`,
    next: 'Next', back: 'Back', save: 'Save', later: 'Continue later', change: 'Change', optional: 'optional',
    voice: 'Answer by voice', stop: 'Stop recording', recording: 'Recording. Press “Stop recording” when you finish.',
    recorded: (s: number) => `Recording saved (${s} seconds). It counts as your answer. You can also type it.`,
    micBlocked: 'The microphone is not available here. Please type your answer.',
    reRecord: 'Record again', playMine: 'Play my recording', stopPlaying: 'Stop playing', playing: 'Playing your recording.',
    playRec: 'Play recording', deleteRec: 'Delete recording', deleted: 'Recording deleted.', savingRec: 'Saving your recording…',
    recPending: 'Recording kept on this phone. It will be sent when you are connected.', voiceAnswer: 'Answered by voice',
    playFailed: 'This recording cannot be played here.',
    play: 'Play question', audioMissing: 'Audio for this question is not recorded yet.',
    signLabel: 'Sign language video for this question', loadSign: 'Load sign language video', signMissing: 'Sign video not recorded yet.',
    day: 'Day', month: 'Month', year: 'Year (Ethiopian calendar)', gregorian: (t: string) => `That is ${t} in the Gregorian calendar.`,
    none: 'None', saved: (code: string) => `Saved. To continue later, use code ${code}. There is no time limit.`,
    restored: 'We restored the answers you saved earlier.', demo: 'Demo mode: your answers stay in this browser only.',
    done: { signup: 'Your account is ready', apply: 'Application sent', employer: 'Job posted' },
    idStatus: {
      not_given: 'ID: not given yet. Learning is not blocked.',
      not_checked: 'ID: not checked yet. Learning is not blocked.',
      waiting_partner: 'ID: waiting for your partner to confirm. Learning is not blocked.',
      confirmed_by_partner: 'ID: confirmed by your partner.',
    } as Record<string, string>,
    findJobs: 'Find jobs', startLesson: 'Start lesson 1', profile: 'My profile',
    sharedYes: 'Sent with your support request.', sharedNo: 'Sent. Your support needs stayed private.',
    signUpFirst: 'Please sign up first, then apply.', sending: 'Sending…', retry: 'It did not send. Your answers are saved. Try again.',
  },
  am: {
    question: (i: number, n: number) => `ጥያቄ ${i} ከ ${n}`,
    next: 'ቀጥል', back: 'ተመለስ', save: 'አስቀምጥ', later: 'በኋላ እቀጥላለሁ', change: 'ቀይር', optional: 'አማራጭ',
    voice: 'በድምፅ ይመልሱ', stop: 'መቅዳት አቁም', recording: 'በመቅዳት ላይ። ሲጨርሱ “መቅዳት አቁም” ይጫኑ።',
    recorded: (s: number) => `ድምፅዎ ተቀምጧል (${s} ሰከንድ)። እንደ መልስ ይቆጠራል። መጻፍም ይችላሉ።`,
    micBlocked: 'ማይክሮፎን እዚህ አይሰራም። እባክዎ ይጻፉ።',
    reRecord: 'እንደገና ቅዳ', playMine: 'የቀዳሁትን አጫውት', stopPlaying: 'ማጫወት አቁም', playing: 'ቅጂዎ እየተጫወተ ነው።',
    playRec: 'ቅጂውን አጫውት', deleteRec: 'ቅጂውን ሰርዝ', deleted: 'ቅጂው ተሰርዟል።', savingRec: 'ቅጂዎን በማስቀመጥ ላይ…',
    recPending: 'ቅጂው በዚህ ስልክ ተቀምጧል። ሲገናኙ ይላካል።', voiceAnswer: 'በድምፅ ተመልሷል',
    playFailed: 'ይህ ቅጂ እዚህ ሊጫወት አይችልም።',
    play: 'ጥያቄውን ያጫውቱ', audioMissing: 'የዚህ ጥያቄ ድምፅ ገና አልተቀዳም።',
    signLabel: 'የዚህ ጥያቄ የምልክት ቋንቋ ቪዲዮ', loadSign: 'የምልክት ቋንቋ ቪዲዮ ጫን', signMissing: 'የምልክት ቪዲዮ ገና አልተቀዳም።',
    day: 'ቀን', month: 'ወር', year: 'ዓመት (ኢ.ዓ.)', gregorian: (t: string) => `በፈረንጅ አቆጣጠር ${t} ነው።`,
    none: 'ምንም', saved: (code: string) => `ተቀምጧል። በኋላ ለመቀጠል ኮድ ${code} ይጠቀሙ። የጊዜ ገደብ የለም።`,
    restored: 'ቀደም ብለው ያስቀመጧቸውን መልሶች መልሰናል።', demo: 'የሙከራ ዘዴ፦ መልሶችዎ በዚህ ብሮውዘር ብቻ ይቀመጣሉ።',
    done: { signup: 'መለያዎ ተፈጥሯል', apply: 'ማመልከቻ ተልኳል', employer: 'ሥራው ተለጥፏል' },
    idStatus: {
      not_given: 'መታወቂያ፦ ገና አልተሰጠም። መማር አይከለከልም።',
      not_checked: 'መታወቂያ፦ ገና አልተረጋገጠም። መማር አይከለከልም።',
      waiting_partner: 'መታወቂያ፦ አጋርዎ እስኪያረጋግጥ። መማር አይከለከልም።',
      confirmed_by_partner: 'መታወቂያ፦ በአጋርዎ ተረጋግጧል።',
    } as Record<string, string>,
    findJobs: 'ሥራ ፈልግ', startLesson: 'ትምህርት 1 ጀምር', profile: 'የእኔ መገለጫ',
    sharedYes: 'ከድጋፍ ጥያቄዎ ጋር ተልኳል።', sharedNo: 'ተልኳል። የድጋፍ ፍላጎትዎ ሚስጥር ሆኖ ቀርቷል።',
    signUpFirst: 'እባክዎ መጀመሪያ ይመዝገቡ።', sending: 'በመላክ ላይ…', retry: 'አልተላከም። መልሶችዎ ተቀምጠዋል። እንደገና ይሞክሩ።',
  },
};

export function ui(lang: Lang) {
  return UI[lang];
}
