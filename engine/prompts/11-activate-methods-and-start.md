# 11 — Activate Methods and Start

Paste everything below the line into Claude Code from the repo root. Read `design/SPEC.md` first if you are editing this prompt.

---

Read CLAUDE.md, engine/CONTEXT.md, design/SPEC.md, and the Result sections of engine/prompts/09 and /10. Save this prompt as engine/prompts/11-activate-methods-and-start.md.

0. Diagnose first, before writing any code. Report to me, as a short list: does src/web/method.html exist and does it render; does src/web/start.html exist; is solo mode (session mode: "solo") implemented in the engine or only specced; what exactly happens when the method buttons on index.html are clicked (wrong href, missing file, JS error — say which); and which of prompts 09 and 10 landed only partially. Do not guess: open the files and the routes. Put this list in the Result section too, so the record is accurate.

Then build whatever that list says is missing, in this order:

1. Method pages that work. One page per method at method.html?m=<id>, built from the method JSON, covering: what this way of thinking is and where it comes from; what it is good for and what it is bad for; how long it takes; each lens or role as a card with its name, its one-line instruction and, for roles, its brief; the block sequence as a simple visual (frame → the lenses in order → decide → commit); one short worked fragment showing what a good answer under one lens looks like versus a weak one, taken from a scenario's canned content; what the AI does and does not do in this method; and buttons to "Watch a walkthrough" (linking to the scenarios using that method) and "Run this on your problem". Four pages: six-hats, six-hats-problem-solving, six-shoes, lateral-provocation. Every link on index.html to these must resolve — test each one.

2. Start a session, start.html, served by the engine. One screen: the problem in a text area with the frame-block guidance as the placeholder; a method picker showing each method's one-liner and duration, linking to its method page for detail; a choice of "Just me" or "With a group"; for a group, number of seats (2–6) and an anonymous toggle with one line explaining what it does. One primary button, "Start session". No account, no email, no payment.

3. What happens on Start:
   - Just me → straight into the participant view, solo mode, first block, clock running.
   - With a group → a lobby screen showing the room code in large type, the join link with a copy button, a QR code for the link (inline SVG, no external service, no network call), the list of seats filling as people join, and a "Start" button that is enabled once at least two seats are present. This one screen serves both in-person (project it, everyone scans) and online (paste the link into the call chat). Say that in one line on the screen.
   - The creator's device becomes the facilitator view once started, and can also hold a seat.

4. Coming back. The room code is the only key. Show it persistently in the participant and facilitator views with "Bookmark this or note the code to come back". Keep a list of the codes this browser has used in localStorage and show it on start.html as "Your recent sessions" with their date, method and status — clearly labelled as stored in this browser only. Wrap every localStorage call in try/catch and render correctly when it is empty or throws.

5. Accounts seam, no accounts. Wherever the engine needs to know who a participant is, go through one function (getParticipantIdentity) that today returns the seat and display name from the session. Do not add auth, a database, or a users table. Note in the Result what an accounts slice would need to change, in three lines, so a future prompt can pick it up.

6. Honesty on the page. If no model key is configured, start.html says in one line what runs without it (structure, timing, private-then-reveal, the report) and what does not (hints, clustering, the reviewer). No disabled buttons that look broken.

Constraints unchanged: no auth, no database, no framework, self-contained pages, grep -ri "hat\|shoe" src/ returns nothing.

When done: from a cold browser, go index → a method page → Start → run a solo session to the report; then create a group session, join it from a second browser and a phone on the same network, and run it to the report. Report what broke and what confused you. Append the Result with commit hash and add three lines to design/exam-map.md.

---

## Result

### Diagnosis (item 0)

1. **Does `src/web/views/method.html` exist and render?** Yes. The file exists and renders correctly when served from the static site (`dist/site/method.html?m=six-hats`). It loads the method JSON via fetch, shows walkthroughIntro, lens/role cards, block sequence, AI note, and walkthrough links. However, it is only in the **static site** — the engine (`main.ts`) does not serve it. There is no route for `method.html` in the engine's Express app.

2. **Does `src/web/views/start.html` exist?** No. The file does not exist. There is no start page anywhere.

3. **Is solo mode implemented?** No. The word "solo" does not appear anywhere in `src/`, `design/SPEC.md`, or the session-state schema. The engine requires at least one participant to join via `/api/sessions/:code/join` and a facilitator to start via `/api/sessions/:code/start`. There is no single-player path.

4. **What happens when method buttons on index.html are clicked?**
   - The **engine's** `GET /` serves `src/web/views/index.html` — a basic create/join page with a method `<select>` dropdown and a "Create Session" button. It has no links to method pages at all. It creates a session via `POST /api/sessions` and shows room/join/facilitate links.
   - The **static site's** `dist/site/index.html` (served by `serve-site.cjs` on port 5000, or from `file://`) has method links in the nav bar pointing to `method.html?m=<id>`. These resolve correctly within the static site. The scenario cards link to `walkthroughs/<id>.html` which also work.
   - The two index pages are completely separate — the engine does not know about the static site pages.

5. **Which prompts landed partially?**
   - **Prompt 09** landed fully (09, 09b, 09c all documented in the Result section). All 6 items delivered: walkthrough narration, step model, walkthrough player, method explainer pages, landing page, build output. Visual fixes in 09b and nav in 09c also complete.
   - **Prompt 10** does not exist at all. There is no `engine/prompts/10*.md` file. The numbering jumps from 09 to 11.

### 2026-09-20 audit correction

The original Result above is historical. See [the repair record](../../audit/slopcheck/AFTER.md) for integration fixes and current validation. Private transport, reports, detours, solo completion, voting, drafts and compiled/static delivery now have regression coverage. Changes remain uncommitted; no deployment is claimed.
