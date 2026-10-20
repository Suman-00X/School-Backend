# Decisions for review

Only **open** items are here: things that need your decision, or that you may want to change. Everything already settled (decided, answered or built) is in [DECISION_LOG.md](DECISION_LOG.md), with its reasoning.

**Legend:** 🔴 needs your decision · 🟡 worth a look (it stays as built unless you say otherwise)

## Start here

| | Item |
|---|---|
| 🟡 | D-87: report cards now print from an HTML + CSS format in the certificates' style, editable and versioned like certificate formats; choices to confirm |
| 🟡 | D-84: parents apply for their child's leave; the class teacher approves it; choices to confirm |
| 🟡 | D-86: the daily diary (classwork, homework, reminders, notes; signed by parents each day) is built; choices to confirm |
| 🟡 | D-85: below-75% attendance alerts to teachers and parents, with a home highlight and warning box; choices to confirm |
| 🟡 | D-83: bonafide, character and transfer certificates are built, printed from versioned HTML formats; choices to confirm |
| 🟡 | D-82: NEP 2020 options are built: the Holistic Progress Card and UDISE+ / APAAR exports, opted into per school; files now follow the DCF 2025-26 and APAAR mandatory fields; HPC terms and SDMS header text to confirm |
| 🟡 | D-81: behaviour log book (remarks seen by teachers, the student and parents) is built; choices to confirm |
| 🟡 | D-80: substitution planning for absent teachers is built; choices to confirm |
| 🟡 | D-79: exam eligibility (attendance, fee dues) and admit cards are built; choices to confirm |
| 🟡 | D-78: timetable generation (classes and exams) and AI agent tools are built; choices to confirm, and agent sign-in to decide |
| 🟡 | D-77: teacher assessment buckets are built; choices to confirm |
| 🟡 | D-76: exams can be removed while nothing depends on them |
| 🟡 | D-75: subjects are added per class, required or optional; choices to confirm |
| 🟡 | D-74: generated admission numbers and roll-number rules are built; choices to confirm |
| 🟡 | D-73: formats for academic years, classes and other names are built; choices to confirm |
| 🟡 | D-72: sign-in without a school code is built; choices to confirm |
| 🟡 | D-64 hostel; the fee and result choices to confirm (D-17 to D-21, D-09/D-10) |
| 🟡 | D-71: free periods and the school-wide mode are built; small choices to confirm |
| 🟡 | D-70: attendance as you answered D-66 is built; small choices to confirm |
| 🟡 | D-69: owners, handovers and activity logs are built; small choices to confirm |
| Later | D-44: restore drill, once there is drill data |

**Before go-live** (checklist; details in OPERATIONS.md):
- **Configuration:** `DATA_ENCRYPTION_KEY`, `REDIS_URL` (you will provide it), `TRUST_PROXY_HOPS`, `METRICS_TOKEN`, `WEB_APP_URL` + SMTP, and the MongoDB app role (`npm run mongo:app-role -- --all --dry-run`, then create it in Atlas).
- **Databases:** `DATABASE_URL` = the Neon **pooled** string to `school_platform`; `POSTGRES_ADMIN_URL` = the Neon **direct** string, used only when creating schools; `MONGO_URI` = the Atlas string to `school_platform`. Check your Neon plan's database limit per branch.
- **Razorpay:** each school's keys and webhooks. The test-mode run is yours (D-20).
- **Hosting:** host and registry (D-42). Try Sentry on staging if you use it.

---

## Needs your decision

---

## Worth a look

### 🟡 D-87: Report card PDFs from an HTML format (certificate style): choices to confirm
Built as you asked: report cards are no longer drawn in code (pdfkit). They print like certificates, from an **HTML + CSS format** filled with the student's results and turned into a PDF by headless Chrome. The standard format uses the certificates' house style: the same letterhead, double blue frame and Georgia type, with the marks table, a co-scholastic table, summary tiles (percentage, grade, GPA/CGPA, ranks, section average, result) and signature lines. Every report card PDF uses it: staff (Student tab), weighted (assessment schemes), published copies, and the portal.
- **Where it's edited (my choice):** a fourth tab, **Report card**, in Academics › Certificates › Formats, with the same editor, live preview, versions and restore. The Student tab of results has a **PDF format** link to it. Formats share one table: migration 0050 (`document_format_type` enum, adding `REPORT_CARD`). **It is not applied to the DEMO cloud database yet;** see below. Say if the report card's format should live under Exams & results instead.
- **Loops in formats:** the placeholder language now has `{{#each list}}…{{else}}…{{/each}}`, for subjects, their parts (theory, practical…), a weighted card's exams and co-scholastic areas. Unknown fields are still refused on save, inside loops too. Certificates can use it as well.
- **Columns follow the result policy:** `report.showMarks`, `showGrades`, `showGradePoints`, `showResultOnly` and `isScheme` switch columns in the standard format, so a card never shows what families aren't shown (marks on a pass/fail policy, ranks when hidden). A school editing its format could still remove a flag check. Say if that should be refused.
- **Published cards print with the format version in use when they were published** (like certificates keep theirs), so a later edit doesn't change an old card. The live card always uses the newest version. Say if published cards should follow the newest format instead.
- **Changes from the old PDF:** a "Parent" signature line next to "Class teacher" and "Principal", the printed date, and a coloured result tile. Without Chrome/Chromium on the server, report card PDFs now answer 503 (before, pdfkit worked everywhere). The Dockerfile already installs Chromium.
- **Not built yet:** attendance and teacher remarks on the card (they aren't part of the report body today), and several report card formats (for example one per stage or class).

### 🟡 D-84: Student leave applied by parents: choices to confirm
Built: in the portal, a child's **Leave** page (PO-14), where a parent applies for one or more days or half a day, with a reason, and can cancel. Staff use Academics › Attendance › **Leave requests** (AC-09c), the approval queue. The register shows "On leave" / "Leave requested" on each student, and **Mark all present** marks students on approved leave as Excused. API.md › Attendance, step 9; migration 0048.
- **Who approves:** the class teacher **or the deputy** of the child's section, the principal or an admin. Subject teachers of the section see the requests but can't decide. Say if only the class teacher should decide, or if leave of more than N days should go to the principal.
- **Approval changes attendance:** absences already marked on the leave's school days become **Excused**, which leaves them out of the attendance percentage, as Excused does today. This includes locked registers, because the leave request records why. Days not yet marked aren't written ahead: the register shows the leave, and the teacher marks Excused (one tap with Mark all present). Say if approved leave should instead count as absent in the percentage (some boards count it), or if it should pre-mark the days.
- **Half days** excuse only that session's register (two-session mode). In daily or period-wise mode a half-day leave is shown on the register but changes no marks; the teacher decides (for example Half day).
- **Past days:** a parent can apply for days already gone (the common "leave letter after the absence") only within the attendance edit window (`editWindowDays`, 2 days by default). For earlier days, they speak to the class teacher. One request covers at most 60 days and stays in one academic year.
- **Cancelling:** the parent can cancel a pending request, or an approved one before its first day (the class teacher is told). Once it has started it can't be withdrawn or shortened. Staff can't cancel a leave, only reject a pending one. Say if staff should be able to revoke approved leave.
- **No absence alert** goes to parents for a register covered by their approved leave.
- **Not built:** attaching a medical certificate (the files module has no parent uploads yet), the office entering leave on a parent's behalf (paper letters, phone calls), applying for several children at once, and email/SMS notices (in-app only, like behaviour remarks).

### 🟡 D-86: Daily diary: choices to confirm
Built: each section has a **daily diary** for the year (Academics › Diary, AC-20; My school › Diary, PO-15). Teachers write lines for a day: **Classwork** and **Homework** for a subject, **Reminders** (something to bring or remember) and **Notes**, to the whole section or to one student's family. Online homework set that day (AC-16) shows in the diary beside the written lines. A parent **signs** each day, optionally with a note to the class teacher, and the class teacher sees who signed and every note. API: `/academics/diary`, `/me/students/:studentId/diary`; migration 0051.
- **Who writes:** a subject teacher writes lines for the subjects they teach in the section. The class teacher reaches every subject. Lines without a subject (reminders and notes for the class) are for the class teacher or the deputy. ADMIN and PRINCIPAL write anywhere. Only the author, PRINCIPAL or ADMIN can edit or remove a line.
- **Dates:** a line is written for today or an earlier day of the year, never ahead. Write tomorrow's reminder on today's page. Archived years are read-only (database guard).
- **Notifications (in-app):** reminders and notes notify the families who read them (the whole section, or the one family). Classwork and homework lines don't notify, because families read them when they open the day. A parent's note notifies the class teacher, the deputy and any teacher who wrote to that family that day. Say if families want one evening digest of the whole day instead.
- **Signing:** one signature per student per day. Either parent may sign, and signing again replaces the earlier signature and note. A parent can sign a day with nothing written, to send the class teacher a note. If a line is added or changed after signing, the day shows **"changed since signed"** to the family and to the teacher, and asks to be signed again. The student reads the diary but doesn't sign.
- **Not built:** attachments on diary lines (photos of the board, circulars), the teacher answering a parent's note in the diary (today they get the notification and reply outside it), and a student who changes section mid-year seeing their old section's diary (families read their current section's diary).

### 🟡 D-85: Low-attendance alerts (below 75%): choices to confirm
Built: a student whose attendance for the year so far is below the school's threshold is flagged to teachers and parents. API.md › Attendance step 10. Migration 0049 adds two columns to `attendance_policies`.
- **Threshold and start:** 75% by default, set in Setup › Attendance policy › *Low attendance alert*. It counts only after **10 countable school days**, so one absence in the first week doesn't flag a child at 80%. The percentage is the one the attendance pages already show: days, or periods in a period-wise year. It isn't per subject. Say if you want a subject-wise rule for period-wise schools.
- **Teachers' home:** a red highlight, "N students are below 75% attendance". It opens a list by section: name, percentage, and how many full days in a row bring the student back. Each student opens their attendance drawer. A teacher sees every section they **lead or teach**, their own class first, so a subject teacher sees it too. It is shown to TEACHER only; ADMIN and PRINCIPAL already have the dashboard's low-attendance list, though the endpoint serves them too.
- **Parents' home:** an amber warning box, one line per child below, linking to the child's attendance. A **student** signing in sees the same box about themselves. Say if it should be parents only.
- **Notifications:** checked **every evening** (20:00 India). Parents get **one** in-app + SMS notice when their child **falls** below, then nothing more while the child stays below. If the child recovers and falls again, they are alerted again. The class teacher and deputy get one in-app list per evening of their students who fell. Subject teachers get no notice, only the home highlight. There are **no repeat reminders** while a child stays below; say if you want, for example, a weekly or monthly reminder. Email and WhatsApp can be added once those channels exist.
- **No switch** turns the alerts off separately from the home boxes. Say if a school should be able to keep the boxes but mute the notices.

### 🟡 D-83: Certificates (bonafide, character, TC): choices to confirm
Built: Academics › **Certificates** (AC-19). The list of issued certificates is newest first, with **Generate certificate** (choose the type and the student). The **Formats** tab edits each certificate's HTML + CSS with a live preview. Formats are stored in the database (`certificate_format_versions`); every save is a new version, and old versions can be opened or restored. API.md › Certificates; migration 0047 (already applied to the DEMO cloud database).
- **Reprints match the original.** Issuing freezes the student's details and what was entered with the format version in use. Editing a format later doesn't change certificates already issued. A cancelled certificate stays listed and prints with CANCELLED across it.
- **PDF engine:** HTML can't become a PDF in Node alone, so the server drives a headless **Chrome/Chromium** (`puppeteer-core`, new dependency). It uses Chrome on this Mac; the Dockerfile now installs Chromium and Noto fonts. Without a browser, PDFs answer 503 and the rest works. For safety, school-written HTML renders **with JavaScript off and no network access**: images and fonts must be embedded (data: URLs) or use `{{school.logo}}`. Say if you'd rather allow, for example, Google Fonts.
- **Placeholders** are `{{student.name}}`-style, with `{{#if …}}…{{else}}…{{/if}}`; nothing else runs. Unknown placeholders are refused on save, so a typo doesn't print a blank. Pronoun helpers (`{{student.heShe}}`, `{{student.sonDaughter}}`) come from gender; without one they print "He/She", "son/daughter".
- **Numbers:** `BC/2026-27/0001`, `CC/…`, `TC/…`: per type, restarting each academic year. Say if your school numbers TCs continuously or wants its own prefix.
- **TC rules (my choices):** one TC in force per student (cancel it to issue another). Issuing can **mark the student as left** (on by default while enrolled), which releases their bus seat and hostel bed like any leaving. The account is not deactivated, so parents keep portal access for fees. Cancelling a TC doesn't re-enroll the student. Fee dues don't block a TC. Say if they should ("no dues" check, as in D-79).
- **What the forms ask:** bonafide: purpose, remarks. Character: conduct (Excellent / Very good / Good / Satisfactory), remarks. TC (the CBSE-style fields): date of leaving, reason, date of application, last exam and result, promotion, fees paid up to, working days and days present (prefilled from attendance), nationality (default Indian), conduct, remarks. The rest comes from the student's record (parents, date of birth in words, first admission and class, subjects of the section, PEN).
- **Who:** office STAFF, PRINCIPAL and ADMIN issue and print. Only PRINCIPAL and ADMIN cancel and edit formats; staff can read formats. Teachers have no access.
- **Families (added 2026-10-21, as you agreed):** the student and their parents see the student's certificates in the portal (My school › Certificates, PO-13): every year's, newest first, to view on screen and download as the same PDF the office prints. **Cancelled certificates are hidden** from families, and a TC shows **as soon as it is issued**, with no separate "release". Families aren't notified when one is issued. Say if they should be (in-app, like behaviour remarks), or if a TC should wait for the office to release it, for example after a "no dues" check.
- **Not built yet:** signature or seal images uploaded per school (today they can be embedded as data: URLs in the HTML), several formats per type (for example a state-board TC beside a CBSE one), and bulk issue for a section.

### 🟡 D-82: NEP 2020 (Holistic Progress Card, UDISE+, APAAR): choices to confirm
Built as you asked: a school **opts in** under Setup › Policy › NEP 2020 (`academics/nep-policy`), and only then do the features appear, in Exams & results › Report cards & publishing (tabs **Holistic progress** and **UDISE+ / APAAR**). Everything is off by default, so schools that don't opt in see nothing new. API.md › NEP 2020.
- **Where it lives (my choice):** one school-wide NEP policy (like the roll-number rule), not a setting of each result policy, because the exports concern every student and the card goes by NEP stage, not by exam. Say if you want the card switched per result policy instead.
- **Stages:** the school picks the stages the card is used for: Foundational (Nursery to Class 2), Preparatory (3–5), Middle (6–8), Secondary (9–12). The default is the first three, the ones PARAKH has published cards for. Other classes keep the usual report card only, and the HPC tab says why.
- **What the card records (my reading of the PARAKH cards; please check against the official templates):** per subject the exam has, a level for each of **awareness, sensitivity and creativity**, plus a **self** and a **peer** assessment, and a teacher's note. Then the student's interests ("All about me"), strengths, areas to work on, the teacher's feedback and the parents' feedback. Levels are Beginner / Proficient / Advanced, shown as **Stream / Mountain / Sky** on the Foundational card. I couldn't confirm those labels from an official source, so check them. The card also shows the exam's result (what families see) and attendance up to the exam.
- **Who fills it:** the class teacher (as for report cards; subject teachers and deputies can't), the principal and administrators. Office staff can read it. Self and peer levels are entered by the teacher from the students' sheets, since students don't sign in to fill them. Say if students or parents should fill their parts in the portal.
- **One card per student per exam (term).** It is not part of the published report-card snapshot and isn't in the portal yet. Say if families should see it after publication.
- **National ids on the student profile:** PEN (11 digits), APAAR id (12 digits), the date the parents consented to APAAR, and mother tongue. PEN and APAAR id are unique in a school. **Aadhaar is not stored** (it is regulated data); the portals' Aadhaar fields stay for the school to fill there. Disability (CWSN), BPL and similar UDISE+ fields are not collected yet.
- **The files (matched to the official formats on 2026-10-21):** the SDMS bulk template itself sits behind the school's UDISE+ login, so I matched the published sources instead.
  - **UDISE+:** the file follows the Ministry of Education's **Data Capture Format 2025-26**, Part B "Student details". I used the copy the Delhi Directorate of Education circulated (edudel.nic.in, Annexure A of 13-05-2025).
    - **Order:** the header block (Academic Year, UDISE Code of School, Grade/Class, Section, Section Roll No., Student National Code), then **4.1.1–4.1.20** (general profile), **4.2.1–4.2.6** (enrolment) and **4.5.1–4.5.2** (result and days attended). Each header carries its DCF field number.
    - **Values:** coded fields hold the DCF codes, not text: gender 1/2/3; social category 1 General, 2 SC, 3 ST, 4 OBC (state BC lists count as OBC, EWS counts as General and also sets 4.1.16); minority group 1–7 from the religion; mother tongue as the DCF two-digit language code. Grades are PP3/PP2/PP1 for Nursery/LKG/UKG, then 1–12. Dates are DD/MM/YYYY and names are in capitals.
    - **4.2.5 previous year:** taken from last year's enrolment here. For a promoted student new to the system it is "same school" and the class below; for a repeater, the same class.
    - **4.5:** comes from the picked exam (Pass 1, Fail 3) plus the days attended so far.
    - **Blank columns:** fields the system doesn't hold stay blank so the columns line up: Aadhaar, BPL/AAY, CWSN, nationality, out-of-school, medium/language group, stream, RTE 12(1)(c).
    - **Left out:** 4.3 (facility profile) and 4.4 (vocational), since there is no data for them.
    - **Last column:** "To check before upload" lists missing fields and values with no code (e.g. a category "BC-A1" spelling the matcher doesn't know).
  - **APAAR:** the portal's mandatory fields in its order (apaar.education.gov.in, FAQ 6): PEN, student name, DOB, gender, mobile, mother's name, father's name, name as per Aadhaar, Aadhaar number (the last two blank). Then consent, consent date, APAAR ID and status. **PEN is now required for "ready for APAAR"**, as the portal generates the id against it.
  - **To confirm:**
    - (1) Whether your SDMS template's header text and order match the DCF. If you download it from SDMS and send it, I'll align the headers exactly.
    - (2) **Mother tongue codes:** the DCF prints one language list, but an older SDMS Excel used other numbers (Malayalam 98, not 08). Check a couple in SDMS.
    - (3) The 2026 consent form has an explicit **refusal** option ("Denied" in UDISE+). We only record a consent date, so refusal shows as "Consent pending". Say if you want a consent status (given/refused) on the profile.
    - (4) Free-text category/religion/mother tongue on the profile: should these become pick-lists, so every value has a code?
- **Who downloads:** ADMIN, PRINCIPAL, STAFF (personal data for the office), not teachers. A readiness view shows what is missing per student, linked to their profiles.
- **UDISE code:** kept in the NEP policy and required before the UDISE+ export can be switched on. It prints on the files and the card.

### 🟡 D-81: Behaviour log book: choices to confirm
Built: each student has a **behaviour log book** for the year. Teachers write entries; the student and the parents read them in the portal (My school › Behaviour, PO-12), and the student's teachers on the student profile (Behaviour tab) and in Academics › Behaviour (AC-18). A new entry notifies the student and the parents in-app. A parent **acknowledges** each entry, like signing the school diary. API: `/academics/behaviour-remarks`, `/me/students/:studentId/behaviour-remarks`; migration 0046.
- **Kinds:** Appreciation, Note, Concern, Serious incident. **Categories** are a fixed list (discipline, punctuality, uniform, classwork, participation, respect, kindness, leadership, safety, other). The list is checked in code only, so it can grow without a migration. Say if a school should edit its own list.
- **Any teacher can write** about any student enrolled this year, for example a duty teacher in the corridor. Teachers **read** entries from the sections they teach, plus the ones they wrote. ADMIN and PRINCIPAL see everything. Office STAFF can't see the log book. Say if they should.
- **Only the author, PRINCIPAL or ADMIN** can edit or remove an entry. An edit clears the parent's acknowledgement, so the parent sees the changed text and acknowledges again. Editing doesn't send a second notification.
- **Every entry is visible to the family.** There are no staff-only notes. Say if teachers need private entries.
- **Only parents acknowledge**, not the student. Entries can't be dated in the future or outside the academic year. Archived years are read-only (database guard).

### 🟡 D-72: Sign-in without a school code: choices to confirm
Built: people sign in with email and password only. If the password is right in more than one school, they pick the school from a list. API.md › Signing in without a school code has the details.
- **The list comes after the password.** Only schools where the password was right are listed. Listing them for any typed email would tell a stranger which schools an email belongs to.
- **Where the server looks:** a login directory in the platform database holds one row per account with a keyed hash of the email (not the email itself) and the school. Every account creation writes it; email changes and deactivations update it; `npm run directory:rebuild` rebuilds it.
- **Deactivated accounts** are removed from the directory (they can't sign in, and there is no reactivation yet).
- **Wrong passwords count in every school with that email.** A person with different passwords in two schools adds a failure in the other school each time; 5 within 15 minutes lock that school's account for 15 minutes. *Option:* count only where an account exists and the password failed everywhere.
- **Locked anywhere and no match:** the answer is "too many attempts" (429), so a lock is never hidden behind "wrong password".
- **Forgot password without a code:** every school with that email sends its own link, each naming its school.
- **Reworded message:** "The email or password is incorrect" (no school code).

### 🟡 D-75: Subjects per class: choices to confirm
Built (2026-10-20, at your request): Academics › Subjects is class-wise. Pick a class, then add a subject to it, either one the school already has or a new one typed in (its code is suggested). There is no separate school-wide subject list any more. `class_subjects` (migrations 0036, 0037) holds them per year; `/api/v1/academics/class-subjects` lists, adds, edits and removes them.
- **Required** (the default): every section of the class gets it, including sections created later. A section can be taken off by clicking its chip in the table.
- **Optional:** only the sections picked get it, in the add dialog or by ticking chips later.
- **Switching optional → required** gives it to the sections that lack it. Switching required → optional leaves the sections as they are.
- **Classes a week and the note** set on the class are copied to its sections, also when edited.
- **Removing a class subject** takes it off every section of the class.
- **Section subjects stay** the record that timetable, teacher assignments, exams and homework use.
- **Old API kept:** `POST /section-subjects` still works (the seed, tests and the By section tab use it). A subject the section's class lacks becomes an optional subject of that class. The By section tab only offers the class's subjects.
- **Existing data backfilled (0037):** each subject already in sections became a class subject, required when every section of the class had it, optional otherwise.
- **Required/optional lives on the class subject** now, so a subject can be optional in Class 9 and required in Class 5. The subject's own `isOptional` is only the default when it is added to another class.
- **Editing a subject's name or code** from a class changes it in every class.
- *Open:* a subject not in any class can't be seen or edited in the UI any more (the API still lists it).

### 🟡 D-80: Substitution planning: choices to confirm
Built: when teachers are away, the **home page** shows ADMIN and PRINCIPAL a highlighted count of the periods still to plan today. Clicking it opens the **Substitutions** overlay: every absent teacher with the periods they miss. For each period, ADMIN chooses a **substitute teacher**, an **activity** (extra or co-curricular, with a teacher in charge or none), or **leisure**. The highlight goes away once every period is planned. A period nobody plans is a **leisure period**. API: API.md › Attendance › Substitution planning; page AC-10b.
- **Who is away comes from Staff attendance:** ABSENT, LEAVE or HALF_DAY. Approved leave marks its days in advance, so tomorrow can be planned too. ON_DUTY counts as present. Say if on-duty teachers should need cover.
- **Half days:** with a check-in time, the teacher misses the periods that start before it. With a check-out time, the ones that end after it. With neither (a half-day leave doesn't say which half), every period is listed, and ADMIN can mark the ones the teacher still takes ("Teacher takes it").
- **Only ADMIN plans** (other roles by grant); PRINCIPAL sees the plan read-only. Say if PRINCIPAL should plan too.
- **Today and later dates only.** A past day's plan stays as it was. A period still unplanned when it ends was a leisure period.
- **Suggested teachers,** best first:
  - free in that period (not away, not teaching, not already covering)
  - teaches the section, then teaches the subject
  - fewest lessons and covers that day

  A new plan starts with the best one picked. A substitute may teach their own subject instead of the timetabled one.
- **Activities** are picked from a list (Library, Games / PE, Art & craft, Music, Dance, Yoga, Quiz, Story telling, Debate, Computer lab, Study period, Moral science), or any other can be typed. Say if you want a fixed list per school.
- **Attendance follows the plan.** The planned substitute (or the activity's teacher in charge) can open and take that period's register, even if they don't teach the section, and the register takes their subject. The cover screen lists the sections they cover today. In missing registers, a covered period is answered for by the substitute. A leisure period (unplanned, LEISURE, or an activity with no teacher) is listed apart, as no register due, and is never a missing register.
- **Notifications:** the substitute gets an in-app notice (`SUBSTITUTION`) when assigned, and another when taken off the period. None go to students or parents.
- **If the absence is withdrawn** (leave cancelled) or the timetable changes, the plan is listed under "Plans no longer needed" for ADMIN to remove. It is not removed automatically, because the substitute was already told.
- **Not built:** automatic assignment of the whole day in one click, limits on covers per teacher per week, and a report of who covered how much.

### 🟡 D-79: Exam eligibility and admit cards: choices to confirm
Built: **Academics › Setup › Policy › Exam eligibility** holds two rules, each switched on or off: a minimum attendance %, and a limit on overdue fees. Each exam has an **Admit cards** tab that shows every student of the sections sitting it, with their attendance, overdue fees and verdict, and a **Generate admit cards** button. Only eligible students get a card. Students and parents see it under **Admit cards** in the portal (with a PDF to print) and get an in-app notification.
- **Both rules start off**, so every student is eligible until an administrator turns them on. Only ADMIN changes the rules.
- **Attendance** is the percentage the attendance pages already show (days or periods, by the school's mode). It counts from the start of the year to the day before the exam starts, or to today if that is earlier. Days with no register count as absent. A year with no working day yet never blocks.
- **Dues** are fees past their due date and still unpaid on the day the cards are generated, from **any year** (arrears count). The limit is an amount, and 0 means everything due must be paid. Fees not yet due never block.
- **Exemptions (my addition):** ADMIN or PRINCIPAL can allow one student to sit one exam despite the rules, with a reason (for example a medical case or a fee arrangement). Say if you'd rather have no override.
- **Generating again makes the cards match today.** Newly eligible students get a card, existing cards get the current date sheet, and a card is **withdrawn** from a student who is no longer eligible or has left the section (the reason is kept). So a student who pays their dues gets a card on the next generation. Once the exam has started, attendance stops changing.
- **Who sees what:** ADMIN, PRINCIPAL and STAFF see eligibility and print cards; teachers don't. ADMIN and PRINCIPAL generate cards and grant exemptions. Removing an exam removes its cards and exemptions.
- **The card** shows the letterhead, the student's name, admission no., class and roll no., the section's papers (date, time, subject, room) and signature lines. It has no photo (students have none) and no hall-ticket number; the admission no. identifies the student. A section's cards print together as one PDF.
- **Notifications are in-app only for now.** When email and WhatsApp are ready, add them to the channels in `communication/subscribers/admitCards.subscriber.js`. The email channel already exists and is a one-word change.
- **Not built:** blocking marks entry for students without a card (a teacher can still record marks for them), and partial eligibility per paper.

### 🟡 D-78: Generated timetables and AI agent tools: choices to confirm
Built: class and exam timetables are generated as **drafts** that someone applies (API.md › Generating timetables). The same features are offered as **agent tools** over REST and MCP (API.md › AI agent tools). The solvers are pure code with no database (`academics/scheduling/solvers`). In tests they fill a 48-of-48-period week, and a teacher teaching 48 of 48, within a second, without breaking a rule.
- **Drafts first (my choice):** generating never changes the timetable or an exam. Applying writes everything at once, applies only once, and is refused if the bell schedule, sections, subjects, teacher assignments, timetable, the exam's papers or other exams changed since the draft was made ("generate again"). An agent can explore freely and only `apply` changes anything.
- **FILL is the default mode:** lessons already on the timetable stay, and only what is missing is placed. REPLACE plans the sections' week again and removes their current lessons when applied.
- **Incomplete drafts:** a class draft with classes left over applies only with `allowIncomplete` (the rest added by hand). An exam draft must be complete, because the exam's calendar timetable needs every paper.
- **Defaults:** a subject's classes are spread over the days its teacher and section are available, at most `ceil(classes a week ÷ days)` a day (2 with a double). Doubles count in the classes a week and never span a break. Teachers have no daily or in-a-row limit unless one is set. Exams: one paper a day per section, one 09:30–12:30 sitting, a subject sat at the same time by every section of a class, spread evenly over the window.
- **Rules are sent with each request**, not stored as school settings. Each draft keeps its rules, and the screen starts from the last draft's. Say if you want saved school-wide rules (teacher availability, labs, half-day Saturdays) instead.
- **Rooms:** only shared rooms named in a subject rule (a lab) are checked. Sections have no home rooms and there is no room list.
- **Not built:** invigilator duties for exams, teacher preferences beyond unavailability, and combined classes (two sections taught together).
- **Changing the timetable mid-year:** missing-register reports for past days use the timetable as it is now, as they already do after a hand edit. An effective-from date on timetables would fix it if that matters to you.
- **Drafts are kept** (they are small). Tell me if old ones should be cleaned up.
- **Agent access (your decision, later):** an agent uses the signed-in person's access token, so it is limited to what they can do. A new permission, `administration.agentTools.use`, gates connecting at all (every employee role by default; each tool also needs its own permission). Access tokens are short-lived, which is fine for trying it with Claude Code. For agents that run unattended you would need long-lived **agent keys** (per person, revocable, perhaps read-only by default) or OAuth for MCP. Tell me which you want when you get there.
- **MCP:** stateless HTTP with JSON responses (no event stream, sessions or batches). That is enough for tools; prompts and resources can come later.

### 🟡 D-77: Teacher assessment buckets: choices to confirm
Built as you asked. An admin gives an assessment scheme one or more **buckets**, e.g. Unit Test 1 20% + Half-Yearly 60% + **Teacher assessments 20%**; exam and bucket weights add up to 100. Teachers add any number of tests, assignments, projects and other items to a bucket for a subject and section they teach, and enter marks. Homework counts too: set its bucket ("Counts toward") when you give it, and its graded submissions are its marks.
- **The average (your choice):** per subject, a student's counted items are averaged, each item's percentage counting equally (a 10-mark homework weighs as much as a 50-mark project). The average fills the bucket's weight.
- **Missed items (your choice):** a missing entry or ABSENT counts 0%. EXEMPT and MEDICAL leave the item out of that student's average. Homework not handed in counts 0% unless the teacher marks the student exempt.
- **Counting (your choice):** each item has a "counts toward the final result" switch, on by default.
- **An item nobody has marks for yet is left out**, so adding a test doesn't drop everyone to 0 until marks are entered.
- **No items:** a subject with no marked items in a bucket leaves the bucket out, and its exams share the weight (as with an exempt exam). A student exempt from every item is treated the same way.
- **Pass marks** come from the exams only; a bucket has none.
- **Same weight for every subject:** a bucket's weight, like an exam's, is the same for all subjects of the scheme.
- **Who:** the subject teacher (a class teacher: every subject of their section), ADMIN and PRINCIPAL. Item types are labels only.
- **Locking:** once the scheme's results are published, its bucket items, their marks and their switches are locked; withdraw the results to change them. Grading a counted homework is not blocked: it changes the live results, not the published version.
- **Buckets are kept** while they have items: renaming or reweighing keeps them; removing one (or the scheme) is refused until its items are moved or deleted.
- Co-scholastic subjects (graded, not marked) don't take buckets.

### 🟡 D-76: Removing an exam
`DELETE /academics/exams/:examId` (ADMIN, PRINCIPAL) removes an exam with its papers and its exam-specific result-policy assignments. It is refused while the exam has published results, recorded marks, or a place in an assessment scheme. The exam's name can then be used again in the year (the unique name now counts active exams only).

### 🟡 D-74: Admission numbers and roll numbers: choices to confirm
Built: the server generates admission numbers, and roll numbers follow the school's rule. API.md › Roll numbers has the workflow.
- **Admission number format:** `ADM26-0001` = the admitting academic year's start year + a counter per school and year (4 digits, grows past 9999). Nobody can type or change it, not even in a CSV import. Existing students keep their numbers. *Option:* let an import carry old numbers when moving from another system.
- **Roll-number rule** (one per school, ADMIN and PRINCIPAL change it): **alphabetical** by first, middle, then last name; or **by last year's result**, best percentage first, students without a result after them alphabetically.
- **"Last year's result"** is the student's published final result of the previous academic year (from the assessment scheme, else the FINAL exam). Failed students are still ranked; withdrawn or incomplete results count as none.
- **When numbers change:** only when someone runs "Assign roll numbers" (a section, a class or the whole year; a preview shows the new order first). New admissions after that get the next number at the end; nothing is renumbered silently. Promotion into a new year numbers the new sections by the rule.
- **Students who left** a section are numbered after the current ones (so their old numbers change). *Option:* keep their numbers and leave gaps.
- **Published report cards** keep the roll number they were published with; the next version shows the new one.

### 🟡 D-73: Formats for academic years, classes and names: choices to confirm
Built so the same thing can't be entered twice in two spellings. API.md › Names and codes has the rules.
- **Academic year name** comes from the dates: 2026-06-01 to 2027-03-31 is "2026-27"; a year inside one calendar year is "2026". At most 13 months and two calendar years. Years can't overlap, archived ones included. Existing names stay as they are; the format applies to new years and edited dates.
- **Classes are levels:** Nursery, LKG, UKG, Class 1 … Class 12. Typing "Grade 1", "Std 1", "I" or "class-1" finds Class 1. A class's level can change only while it has no sections. *Open:* do you need Pre-KG/Playgroup, or streams for Classes 11–12 (Science, Commerce)? Today streams would be sections.
- **Sections** keep 1–5 letters or digits in capitals (A, B, SCI1).
- **Subject codes** are 2–10 capitals, digits or "-", starting with a letter.
- **Every other name** (subjects, fee heads, plans, concessions, leave types, hostels, rooms, routes, stops, exams, grade scales…) is trimmed and unique ignoring capitals; duplicates get a readable message such as "A fee head named Tuition already exists".
- **Existing data:** migration 0033 renames classes it recognises ("Std 5" → "Class 5") and stops with a list if two existing names differ only by capitals or spaces. Nothing is merged silently.
- **Not covered:** vendor and item names (no uniqueness before either), and fee structures without a class can still share a name.

### 🟡 D-66: Three attendance systems: choices to confirm
Built: a school picks **once a day**, **forenoon and afternoon**, or **every period**, for the whole school or per class, starting from a date. How each counts is in API.md › Attendance.
- **Switching modes:** a change starts tomorrow by default. It can start earlier only if no register has been taken in those classes from that date, so old registers keep their meaning.
- **A register not taken:** a session not taken counts as half a day absent, like an untaken day today. For periods, only periods actually taken count as "held".
- **Half day:** cannot be marked in a forenoon or afternoon register (the two sessions already make the halves). In a period register it is worth half that period.
- **Period-wise day:** present when at least 50% of the periods taken were attended. This is one school-wide setting, and it also re-evaluates past days.
- **Period registers follow the timetable:** a period can only be taken if the section has a class then, and the subject comes from the timetable. A one-day substitute is not modelled yet; changing the slot's teacher works.
- **Class teacher away:** only ADMIN or PRINCIPAL can take the daily register. *Option:* a deputy class teacher per section.
- **Last year:** a teacher still sees last year's sections (not its students). *Option:* current year only.
- **Absence alerts:** parents get one alert per missed session; in period mode, one per day at the first missed period.

### 🟡 D-71: Free periods and one mode for the whole school (round 9): choices to confirm
Built as you said (DECISION_LOG.md › D-66, round 9). These stay as built unless you say otherwise:
- **A timetabled teacher who teaches no subject in the section** (the timetable allows any teacher in a slot) can take and see that one period's register, nothing else of the section. *Option:* refuse them.
- **No future free periods:** a period can be marked free for today or a past day, not ahead for planned leave. *Option:* allow marking ahead.
- **A period with nothing timetabled** can be marked free too; whoever takes its register is not a substitute (nobody is replaced).
- **Removing a free period after the edit window** needs the override reason, as for registers.
- **Free periods in the missed-registers report** are listed separately, never as missed.
- **API changes for the app:** the dashboard shows the school's modes over the range (no per-section mode); the attendance policy has no `classModes`.
- **Class-level modes were removed by the migration.** That is safe only because no school is live with per-class modes.

### 🟡 D-70: Attendance as you answered (D-66): choices to confirm
Built (DECISION_LOG.md › D-66).
- 🟡 **Substitutes (period-wise only; round 9, see D-71):** only a teacher of the section (a subject teacher, the class teacher or the deputy) can stand in; otherwise the period is marked free. Anyone other than the timetabled teacher who takes the register is recorded as a substitute.
- 🟡 **Missed registers:**
  - Each evening (19:30 India time), every teacher gets one in-app notice for the registers they missed that day.
  - The deputy is never held responsible. A register whose class teacher's account is deactivated is listed as "unassigned".
  - Past days are checked against today's timetable, because the timetable keeps no history.
- 🟡 **Per-subject attendance:**
  - In period-wise classes, each subject has its own held / attended / percentage / days attended.
  - A half-day mark in a period counts as attended for "days attended".
  - The overall figures stay alongside.
- 🟡 **Deputy class teacher:**
  - One per section. The deputy takes daily registers and sees the section's students, attendance and timetable.
  - Marks and homework only for the subjects they teach; report cards stay with the class teacher.
- 🟡 **A refused mode change saves nothing**, including other policy settings sent in the same request.

### 🟡 D-69: Owners, handovers and activity logs: choices to confirm
Built as you answered D-67 (DECISION_LOG.md › D-67). Small choices, staying as built unless you say otherwise:
- **Upcoming assignments move too.** A handover also moves the old operator's assignments that have not started yet, keeping their start date, so the old operator has no access now or later.
- **Already holding the same role:** if the new operator already holds that role for overlapping dates, the handover is refused (409). *Option:* skip that one and keep theirs.
- **Built-in managers:** a handover from a built-in manager account (for example the hostel manager) moves their duties, but their role still gives them access. To remove it, change their role or deactivate the account.
- **Only one "responsible person" field exists today:** the hostel warden. Transport driver and attendant are plain names, not accounts; library and inventory have no in-charge fields. Add more when you want them, and handover will carry them.
- **Log dates** (`from`/`to`) are whole days in UTC, not the school's time zone.
- **Sign-ins** are in the central log (module `auth`), not in module tabs.

### 🟡 D-64: Hostel, flexible assignments: points to confirm
- **Pre-booking:** a student with an active enrollment in any year can be booked, so next year's room can be booked in March. Leavers' bookings are cancelled automatically.
- **Dates:** `toDate` is the last night. A transfer from day D ends the old bed on D−1. A booking that has not started can be cancelled; a stay that has started must be vacated, and a future move-out date is allowed.
- **Roll-over at year end** continues each resident in the same bed for the new year, as a new linked booking. It skips leavers, beds already taken and residents who no longer fit the hostel's gender rule, with a reason each. It is best-effort, not all-or-nothing.
- **Resources tied to a bed** (locker, cupboard) move and shrink with it. On a transfer, hostel-wide items (mess plan, laundry plan) continue and room items end. A student has at most one mess plan and one laundry plan per day.
- **Fees:** the monthly fee of a resource is stored on the resource only, and nothing is invoiced yet. When hostel fees are invoiced, the fee will be copied onto each assignment so later price changes do not rewrite history.
- **Old allocation data** was dropped by the migration, not converted. That is safe only because no school is live. Tell me if any real data exists.

### 🟡 D-09 / D-10: Results: points to confirm
Configurable result policies and frozen, sealed report cards are built (DECISION_LOG.md › D-09, D-10). These choices need your confirmation:
- 🟡 **Grace counts in the total** (`graceCountsInTotal`, default true), and the subject's grade uses the graced marks. Some boards keep grace out of the aggregate: set it to false.
- 🟡 **In assessment schemes, an absence counted as zero is 0% for that exam,** not an automatic fail of the year. The weighted result decides. Excluded absences (exempt, medical when excluded) drop that exam, and the other exams' weights are rescaled. Theory/practical pass rules apply in each exam's own result; the weighted subject is judged on its weighted total.
- 🟡 **Co-scholastic subjects in a scheme show the latest exam's grade.** Grades are not averaged.
- 🟡 **Ranks are hidden on the printed PDF too** when the policy hides them from families, because the card goes home.


### 🟡 D-17 to D-21: Fees: points to confirm
Built as you asked. The details are in DECISION_LOG.md › D-17 to D-21. These choices need your confirmation:
- **Plan changes:** a student's plan can change only while nothing of the year is paid; unpaid invoices are cancelled and re-issued under the new plan. The alternative is to refuse every change once invoices exist.
- **Concessions:**
  - Several concessions **stack**: percentages add up (10% + 20% = 30%), then fixed amounts. The alternative is one per student, or the best one only.
  - One granted mid-year lowers only the **unpaid** installments; paid invoices are never touched.
- **Late fees:** the delay is counted **from the end of the grace period**. The alternative is counting from the due date.
- **Online payments:** the minimum part-payment is a fixed **100.00**. The alternative is a per-school setting.
- **Credit:** credit from overpayments is applied to later bills **by an accountant**. The alternative is applying it automatically to the next invoice.

### 🟡 D-16: Money representation
- **Database:** `numeric(12,2)`.
- **API:** plain numbers with 2 decimals (`5400.5`).
- **Arithmetic:** integer paise in `common/money`, so 0.1 + 0.2 issues never happen.
- **Currency:** each school's `tenants.currency` (default INR).

Stripe-style integer minor units in the API would be stricter, but they're awkward for school admin screens. Changing later would be a breaking API change, so decide before launch.

### 🟡 D-28: Reports read other modules' tables directly
`reports/*/repositories` run aggregate SQL straight over academics, finance and users tables. It's a *read model* and a deliberate exception to "other modules only through their `index.js`", because one SQL `GROUP BY` beats loading thousands of rows through services.

**Cost:** renaming a column in another module means updating the report SQL, and the test suite catches it.

At scale, point these queries at a read replica or materialized views.

### 🟡 D-29: Exports are synchronous
Files are built in the request.
- Attendance grids are capped at 62 days.
- Roster, collections and defaulters exports are not capped.

That's fine for a school of a few thousand students. For very large schools, switch to "export job → stored file → signed download link". The storage layer and signed URLs needed for that already exist.

### 🟡 D-31: Report card PDF is a clean default layout
It has the school name, student details, a marks table, totals, grade, result, rank and class average.

**Update (Phase 6):** the school logo (`PUT /administration/settings/logo`) now appears on report cards and fee receipts, with the school's address and contact line in a shared letterhead (`common/export/branding.js`).

Schools usually want their own report-card format. Treat the template as a per-school setting before launch.

### 🟡 D-33: How files are stored and who can reach them
- **Bytes:** in the storage driver (local disk or S3).
- **Metadata:** in MongoDB (`stored_files`): owner, category, type, size, uploader.
- **Downloads:** always through 15-minute signed links. Storage keys are never returned.
- **Owners:** files belong to an owner: school, student, staff member, homework, submission, announcement, or general.
  - `/api/v1/files` is for the office (ADMIN, PRINCIPAL, STAFF upload and delete; every staff role reads): student documents, staff documents, general files.
  - Homework files are reached **only** through homework endpoints, so homework access rules apply. The school logo goes only through settings.
- **Deleting a file removes its bytes immediately.**

If you need retention (for example, admission documents kept for N years), switch to soft delete plus a purge job.

### 🟡 D-35: Homework rules
- **Who sets it:** a teacher sets homework only for a section and subject they teach (the same scope as marks, D-11). ADMIN and PRINCIPAL can set any homework.
- **Due date:**
  - It cannot be in the past.
  - Late submission is **off by default**; teachers can switch it on per homework. Late work is marked `LATE`.
- **Submitting:**
  - Only the **student** submits. Parents can view but not submit.
  - A submission is text and/or one file.
  - The student can resubmit until it is graded. **Returned** work (`RETURNED`, "redo this") opens it again.
- **Marks** are optional (`maxMarks`). Awarded marks cannot exceed the maximum.
- **Deleting:** homework with submissions cannot be deleted.
- **Notifications:** new homework goes to the section's students and their parents. Graded or returned work goes to the student and their parents. Both are in-app only, to keep SMS costs down.

### 🟡 D-38: Archived academic years are read-only, enforced in the database
- **Archive:** `POST /academics/academic-years/:id/archival`, ADMIN only. The year must have ended and must not be current. `DELETE …/archival` restores it.
- **Enforcement:** triggers on every academic table reject writes to an archived year with a 409 ("Academic year 2025-26 is archived and read-only"). That covers sections, enrollments, exams, marks, attendance, timetable, calendar and homework, so jobs, imports and future modules cannot bypass it. A middleware also rejects writes early when the year comes from the `X-Academic-Year-Id` header.
- **Fees are not frozen:** arrears from an old year must stay payable.
- **Order of year-end:** archiving is refused while students are still ACTIVE in that year ("12 students are still active in 2025-26. Promote them or mark them as left first."). Once a year is archived, its enrollments cannot be closed.
- **Operations modules are not frozen:** hostel and transport rows belong to a year but are not frozen, so staff can still vacate or end them.

The alternative was "archive = move rows to cold storage". It isn't needed at school-sized data volumes; indexes keep old years cheap.

### 🟡 D-42: Deployment is container-first; registry and host not chosen
- **Built:** a Dockerfile (Node 24, non-root, tini, healthcheck) and `docker-compose.yml` with api, worker, a one-off migrate service, PostgreSQL 18, MongoDB 8 and Redis 8.
- **CI:** GitHub Actions runs format, lint, a migration drift check, the e2e suite on Node 22 and 24, and an image build.
- **Untested here:** Docker is not installed on this machine, so the image and compose file have **not** been built. CI will build the image on the first push.
- **Your call:** the image registry and host (ECS, Cloud Run, Kubernetes, Fly, or a VM), and whether to auto-deploy to staging. Pushing images needs those secrets.

The engines field is now Node ≥ 22, because Node 20 reached end of life in April 2026.

### 🟡 D-43: Schools are onboarded by an operator CLI
`npm run school:create -- --name … --code … --admin-email …`:
- creates the school's databases and migrates them;
- registers the school;
- invites its first admin with a 7-day set-password link.

Self-service sign-up (a school registering itself) is not built.

### 🟡 D-46: API messages stay English; clients localise by error code
Every error has a stable `error.code` and field-level details. Localising server messages is only worth it for notification templates (SMS and email to parents). The plan is in OPERATIONS.md › languages.

---

### 🟡 D-53: Transport capacity rules
- A route with no vehicle takes no assignments, because capacity is unknown.
- Pick-up-only and drop-only riders take a full seat.
- Ending an assignment frees the seat at once, even with a future end date.
- Registration numbers are compared without spaces or hyphens.
- Stop fees are stored but **do not create invoices**. Linking them to finance's Transport fee head is a natural next step.

### 🟡 D-57: How loss of pay (LOP) is calculated
- **The charge:** gross pay (basic plus every earning line, including HRA as a percent of basic) ÷ days in the month × LOP days.
  - The alternative is basic plus fixed components only, a one-line change in `payrollMath.util.js`.
- **Absent and half days:** they cost the unworked part, minus any approved paid leave.
- **Leave:** approved unpaid leave costs pay. A LEAVE mark entered by hand with no request costs nothing.
- **Unmarked working days cost nothing.**
  - The alternative is to treat them as absent.

### 🟡 D-58: Payroll and leave rules
- **Finalized month:**
  - Once a month's payroll is finalized, that month is closed: attendance and leave changes touching it are refused.
  - Finalization does not recompute; recalculate first.
  - Later corrections would be arrears (not built).
- **Salary revisions:**
  - They start on the 1st of a month.
  - No pro-rating for joiners or changes mid-month.
  - A revision cannot be edited; you add a new one.
- **Leave quotas:**
  - Quotas are per calendar year, so a request must stay inside one.
  - There is no unlimited leave type (use a large quota).
  - Days outside any academic year count as calendar days.
- **Net pay** cannot go below 0. A deduction larger than pay is not carried forward.
- **Who decides:**
  - Nobody approves their own leave.
  - Rejecting needs a note.
  - Applicants can cancel while the request is pending; ADMIN can cancel after approval.

### 🟡 D-59: Inventory rules
- **Discontinued items:** "inactive" from the spec became `discontinued`, because `isActive` means soft-deleted here. Discontinued items stay visible and issuable, take no receipts, and are left out of low-stock.
- **Valuation:** average cost is kept to 2 decimals, so valuation can be a few paise off. The alternative is a running stock value.
- **Movements:**
  - An ISSUE needs a recipient (a user or free text).
  - A RETURN is not linked to an issue and not capped at what was issued.
  - A RECEIPT may have no vendor (donations, opening stock).
- **Low stock:** an item is low when stock ≤ its reorder level. The `inventory.item.lowStock` event fires only when an item crosses that level. It now notifies ADMIN and STAFF in-app, once per movement (added at merge).
- **GSTIN:** checked for format only, when the school's country is IN.
- **Unit:** whole units (PCS, BOX…) take whole quantities, and an item's unit cannot change once it has stock movements.

### 🟢 D-61: Action endpoints are named in two styles
- **Older modules** use nouns: `/result-publication`, `/cancellation`, `/finalization`, `/archival`.
- **Some new ones** use verbs: `/loans/:id/return`, `/allocations/:id/vacate`, `/assignments/:id/end`.
- Both are common REST practice, and all are `POST` returning 200 or 201. I left them as built rather than churn the API.
- If you want one style, it's a mechanical rename. It is breaking, so do it before any client exists.

---

### 🟡 D-44: Backups: targets and the first restore drill (later, with drill data)
**Your question: is this scheduled work?** Not inside the application. `npm run backup` is a script that the host's scheduler runs:
- **On a VM:** a cron line, e.g. `0 2 * * * cd /srv/school && npm run backup`.
- **On Kubernetes:** a CronJob.
- **On ECS:** a scheduled task.

With managed databases, their **automatic backups and point-in-time recovery are the primary protection**: they are scheduled by the provider, and you only switch them on. The script is the portable, provider-independent copy.

**Agreed:** run the restore drill once there is drill data. The steps are in OPERATIONS.md › backups. Still to confirm then: the targets (at most 15 minutes of data lost, at most 2 hours to restore).
