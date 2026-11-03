// Firebase project: practice-2f0c7. These values identify the project. They
// aren't secrets; access is controlled by Firebase Auth plus firestore.rules.
export const firebaseConfig = {
  apiKey: 'AIzaSyD89NNhzYOoDlRsvJP8FSCw62e71I7nxWQ',
  authDomain: 'practice-2f0c7.firebaseapp.com',
  projectId: 'practice-2f0c7',
  storageBucket: 'practice-2f0c7.firebasestorage.app',
  messagingSenderId: '1004913130249',
  appId: '1:1004913130249:web:9d43ce55ed54dad75e31d8',
};
// Add ?local to the URL to try the app in Local Demo mode (browser-only data).
if (new URLSearchParams(location.search).has('local')) firebaseConfig.apiKey = '';

// The program owner. This must match the email in firestore.rules.
export const OWNER_EMAIL = 'stutting.josh@gmail.com';

// Who may create an account. Enforced in firestore.rules (keep both in sync).
//  - any verified @mapsedu.org address → starts as Pending until an admin approves
//  - the named staff below → automatically Coach
export const ALLOWED_DOMAINS = ['mapsedu.org'];
export const STAFF_EMAILS = [
  't.derleth@huber.com',
  'edward.fuchs@mapsedu.org',
  'robert.klug@mapsedu.org',
  'reneekrueger58@yahoo.com',
  'kent.reinhardt@wisconsinpublicservice.com',
  'jessesevert@outlook.com',
  'stutting.josh@gmail.com',
  'adamweise2015@gmail.com',
  'bumweixie@gmail.com',
];

// Team identity. It's shown on the room display and in the header.
export const TEAM_NAME = 'Bluejays Girls Wrestling';
export const PROGRAM_NAME = 'Champion Making Process';
export const MOTTO = ['CONSISTENT', 'PERSISTENT', 'RESILIENT', 'RELENTLESS'];

// Test accounts set up from Admin → "Create test accounts"
export const TEST_ACCOUNTS = [
  { email: 'coach@test.com',   password: 'coachpassword',   role: 'admin',   name: 'Test Coach (Admin)' },
  { email: 'test@test.com',    password: 'password',        role: 'viewer',  name: 'Test Viewer' },
  { email: 'student@test.com', password: 'studentpassword', role: 'athlete', name: 'Test Student' },
];

// Quick Dictate uses Gemini through Firebase AI Logic (no API key in the page).
// Tried in order; the first name the project supports is used.
export const AI_MODELS = ['gemini-flash-latest', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash'];

// Natural coach voice (Gemini text-to-speech through Firebase AI Logic)
export const TTS_MODEL = 'gemini-3.1-flash-tts-preview';

export const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/12.19.0';
