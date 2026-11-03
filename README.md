# Champion Making Process — Bluejays Girls Wrestling practice system

**CONSISTENT • PERSISTENT • RESILIENT • RELENTLESS**

Plan practices, run them hands-free from a phone, put the live timer on the room TV, and keep a permanent record of every practice.

Live site: https://willardwonder.github.io/practice/
Room TV: https://willardwonder.github.io/practice/#/room

## What's in it
- **Builder**: drills from last season's full library, rest, live goes (rounds × work/rest), station rotations, and group splits. Drag to reorder. Live total, end time, and over/under against the "must end by" time. Saves automatically.
- **Live run**: one shared session in Firestore. The coach's phone is the remote. The TV and every other device follow the same server-timed clock. Refreshing or a phone going to sleep won't reset it. Other coaches can **Take control**.
- **Sound**: one unlocked audio engine with horns scheduled ahead on the audio clock (so they fire on time), 3-2-1 beeps, a "Switch!" call at halfway, voice announcements, screen wake lock, and iPhone silent-switch handling.
- **History**: plan vs. actual, skipped blocks, extensions, overtime, wrestlers, rating, and reflection. Records are locked once a practice ends; only the reflection can be edited.
- **Quick Dictate**: say or type what you want ("90 minutes, warm up, 4 stations 6 min each, 10 live goes, sprints"). Gemini builds it from the drill library and only asks when it has to. Uses Firebase AI Logic on the free Gemini Developer API tier, so no key is in the page. If AI is unavailable, a keyword builder still makes a draft.
- **Sharing**: coaches only, coaches + athletes, or a public link. Also print (coach plan or wall card) and file export/import.

## Roles
| Role | Can do |
|---|---|
| Owner (stutting.josh@gmail.com, Google sign-in) | everything |
| Admin Coach (coach@test.com) | everything, including users |
| Coach | build, run, share, add drills |
| Viewer (test@test.com) | read-only, follow live |
| Athlete (student@test.com) | practices shared with athletes, follow live |
| Pending | nothing until approved |

Sign-up is limited to verified **@mapsedu.org** emails (start as Pending) and the named staff list (start as Coach). Both are enforced in `firestore.rules`. Keep `js/config.js` in sync with it.

## Setup checklist
1. Firestore → Rules → paste `firestore.rules` → Publish.
2. Authentication → Settings → Authorized domains → `willardwonder.github.io`.
3. Sign in with **Google** as stutting.josh@gmail.com → Admin → **Create test accounts** → **Load drill library**.
4. Firebase console → **AI Logic** → Get started → **Gemini Developer API** (free). If it offers App Check enforcement, leave it unenforced for now.
5. Sign in as each test account and run **Check my access** (user menu).

## Develop
No build step. `python3 -m http.server`, then open `http://localhost:8000/?local` for Local Demo mode (browser-only data). `npm test` runs the timer/engine tests.
