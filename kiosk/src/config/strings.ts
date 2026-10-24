import type { Language } from './settings'

// All guest-facing copy. Tamil lines are first drafts: have a native speaker review before the first event.
const en = {
  title: 'Kuri: The Digital Oracle',
  subtitle: 'Discover Your Destiny',
  touchToBegin: 'Touch to Begin',
  welcomeTo: 'Welcome to',

  consentTitle: 'Before I Begin',
  consentBody:
    'I will take your photo and an image of your palm. They are used only for your reading and your keepsake card.',
  agree: 'I Agree',
  decline: 'Not Now',

  faceTitle: 'Face of the Seeker',
  faceHint: 'Look into the light and smile',
  capture: 'Capture',
  retake: 'Retake',
  continue: 'Continue',

  palmTitle: 'Lines of Destiny',
  palmHint: 'Place your right palm flat on the glass, fingers apart',
  palmCapture: 'Read My Palm',
  palmWaking: 'The Oracle is opening her eyes…',
  palmStatus: {
    none: 'Place your palm on the glass',
    multiple: 'Just one hand, please',
    back: 'Turn your hand over, palm facing the light',
    closed: 'Open your hand and spread your fingers',
    'too-far': 'Bring your hand closer to the glass',
    'too-close': 'Move your hand a little away, the whole hand must be seen',
    'off-center': 'Move your hand to the centre',
    ok: 'Hold still…',
  },
  palmHold: 'Hold still… the Oracle is reading',
  palmProcessing: 'Capturing your lines…',

  scanning: 'Scanning your destiny…',
  keepStill: 'Please keep your hand still.',
  reading: 'Kurathi is reading your lines…',
  almost: 'The stars are aligning…',

  resultTitle: 'Your Fortune',
  yourPhoto: 'Your Photo',
  yourPalm: 'Your Palm Print',
  print: 'Print Your Fortune',
  home: 'Home',

  printingTitle: 'Your Destiny Is Printing',
  collect: 'Please collect your keepsake below',
  returning: (n: number) => `Returning to the temple in ${n}…`,

  stillThere: 'Are you still there, seeker?',
  stillThereBody: (n: number) => `The reading will end in ${n} seconds.`,
  imHere: "I'm Here",

  cameraClouded: "The Oracle's eye is clouded",
  cameraCloudedBody: 'The camera is not available right now.',
  skip: 'Continue Without',
  readingNo: 'Reading',
}

const ta: typeof en = {
  title: 'குறி: டிஜிட்டல் குறத்தி',
  subtitle: 'உங்கள் விதியை அறியுங்கள்',
  touchToBegin: 'தொட்டுத் தொடங்குங்கள்',
  welcomeTo: 'வரவேற்கிறோம்',

  consentTitle: 'தொடங்கும் முன்',
  consentBody: 'உங்கள் புகைப்படத்தையும் உள்ளங்கையின் படத்தையும் எடுப்பேன். அவை உங்கள் குறிக்கும் நினைவுப் அட்டைக்கும் மட்டுமே பயன்படும்.',
  agree: 'சம்மதம்',
  decline: 'இப்போது வேண்டாம்',

  faceTitle: 'தேடுபவரின் முகம்',
  faceHint: 'ஒளியைப் பார்த்து புன்னகையுங்கள்',
  capture: 'படம் எடு',
  retake: 'மீண்டும் எடு',
  continue: 'தொடரவும்',

  palmTitle: 'விதியின் ரேகைகள்',
  palmHint: 'வலது உள்ளங்கையை விரல்களைப் பிரித்து கண்ணாடியின் மேல் வையுங்கள்',
  palmCapture: 'என் கையைப் பாருங்கள்',
  palmWaking: 'குறத்தி கண் திறக்கிறாள்…',
  palmStatus: {
    none: 'உள்ளங்கையைக் கண்ணாடியின் மேல் வையுங்கள்',
    multiple: 'ஒரு கை மட்டும் போதும்',
    back: 'கையைத் திருப்புங்கள், உள்ளங்கை ஒளியை நோக்கி இருக்கட்டும்',
    closed: 'கையைத் திறந்து விரல்களைப் பிரியுங்கள்',
    'too-far': 'கையைக் கண்ணாடிக்கு அருகில் கொண்டு வாருங்கள்',
    'too-close': 'கையைச் சற்று விலக்குங்கள், முழுக் கையும் தெரிய வேண்டும்',
    'off-center': 'கையை நடுவில் வையுங்கள்',
    ok: 'அசையாமல் வையுங்கள்…',
  },
  palmHold: 'அசையாமல் வையுங்கள்… குறத்தி படிக்கிறாள்',
  palmProcessing: 'உங்கள் ரேகைகளைப் பதிவு செய்கிறேன்…',

  scanning: 'உங்கள் விதியைப் படிக்கிறேன்…',
  keepStill: 'கையை அசையாமல் வையுங்கள்.',
  reading: 'குறத்தி உங்கள் ரேகைகளைப் படிக்கிறாள்…',
  almost: 'நட்சத்திரங்கள் ஒன்றுசேர்கின்றன…',

  resultTitle: 'உங்கள் குறி',
  yourPhoto: 'உங்கள் படம்',
  yourPalm: 'உங்கள் கைரேகை',
  print: 'அச்சிடுக',
  home: 'முகப்பு',

  printingTitle: 'உங்கள் விதி அச்சாகிறது',
  collect: 'கீழே உங்கள் நினைவுப் அட்டையைப் பெற்றுக்கொள்ளுங்கள்',
  returning: (n: number) => `${n} வினாடிகளில் முகப்புக்குத் திரும்புகிறது…`,

  stillThere: 'இன்னும் இருக்கிறீர்களா?',
  stillThereBody: (n: number) => `${n} வினாடிகளில் குறி முடிவடையும்.`,
  imHere: 'இருக்கிறேன்',

  cameraClouded: 'குறத்தியின் கண் மங்கியுள்ளது',
  cameraCloudedBody: 'கேமரா இப்போது கிடைக்கவில்லை.',
  skip: 'இல்லாமல் தொடரவும்',
  readingNo: 'குறி எண்',
}

export const strings: Record<Language, typeof en> = { en, ta }
export type Strings = typeof en
