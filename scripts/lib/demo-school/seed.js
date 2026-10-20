/* Dev/demo only: fill a freshly provisioned school with a realistic, connected dataset
   through the public API (so every rule, code sequence, ledger posting and activity log
   is real), acting as the user who would do each thing (a class teacher takes the
   register, the librarian issues books, the accountant takes fees, …).

   The school must already exist with an administrator who can sign in. Runs in the
   process that started the databases: the one shortcut is setting every seeded account's
   password directly, since invitations would need an inbox.

   Dates are relative to today in the school's time zone, so the data stays current:
   the academic year started about four and a half months ago, exams, fees, attendance
   and payroll fall in the months since, and the rest of the year is still ahead. */
import { isNull } from "drizzle-orm";
import * as postgres from "../../../src/common/database/postgres.js";
import { hashPassword } from "../../../src/common/crypto/password.js";
import { runInTenant } from "../../../src/common/tenancy/context.js";
import { users } from "../../../src/database.schema.js";
import { yearNameFor } from "../../../src/modules/academics/academic-years/utils/yearName.util.js";
import { lateFeeService } from "../../../src/modules/finance/invoices/services/lateFee.service.js";
import {
  ANNUAL_FEES,
  BOOKS,
  BUS_ROUTES,
  FAMILIES,
  FEE_HEADS,
  GRADES,
  INVENTORY,
  SECTION_NAMES,
  SECTION_TEACHERS,
  STAFF,
  STUDENTS,
  SUBJECTS,
  TEACHERS
} from "./roster.js";

/* ---------- dates (ISO yyyy-mm-dd strings, compared as strings) ---------- */
const DAY_MS = 86_400_000;
const isoOf = date => date.toISOString().slice(0, 10);
const addDays = (date, days) => isoOf(new Date(Date.parse(date) + days * DAY_MS));
const addMonths = (date, months) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return isoOf(d);
};
const firstOfMonth = date => `${date.slice(0, 7)}-01`;
const lastOfMonth = date => addDays(addMonths(firstOfMonth(date), 1), -1);
/* 0 = Sunday … 6 = Saturday */
const dayOfWeek = date => new Date(`${date}T00:00:00Z`).getUTCDay();
const todayIn = timeZone => new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
const between = (date, from, to) => date >= from && date <= to;

/* A seeded generator: every run makes the same school */
const generator = seed => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
};

const emailOf = (first, last, domain) => `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "") + `@${domain}`;
const sectionKey = (grade, name) => `${grade}${name}`;
const gradeOf = key => Number(key.slice(0, -1));

/* ---------- HTTP ---------- */
const httpClient = baseUrl => {
  const send = async (method, path, { body, as, form } = {}) => {
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers: { ...(!form && { "content-type": "application/json" }), ...(as && { authorization: `Bearer ${as}` }) },
      body: form ?? (body === undefined ? undefined : JSON.stringify(body))
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      const details = (json?.error?.details ?? []).map(d => `${d.field} ${d.message}`).join("; ");
      throw new Error(
        `${method} ${path} -> ${response.status}: ${json?.message ?? response.statusText}${details ? ` (${details})` : ""}`
      );
    }
    return json;
  };
  /* api(token).post(path, body) -> the response body */
  return token => ({
    get: path => send("GET", path, { as: token }),
    post: (path, body) => send("POST", path, { as: token, body }),
    patch: (path, body) => send("PATCH", path, { as: token, body }),
    put: (path, body) => send("PUT", path, { as: token, body }),
    upload: (path, { name, type, content }) => {
      const form = new FormData();
      form.append("file", new Blob([content], { type }), name);
      return send("POST", path, { as: token, form });
    }
  });
};

/* Every page of a list endpoint */
const listAll = async (client, path) => {
  const rows = [];
  for (let page = 1; ; page++) {
    const res = await client.get(`${path}${path.includes("?") ? "&" : "?"}limit=100&page=${page}`);
    rows.push(...res.data);
    if (page >= (res.meta?.totalPages ?? 1)) return rows;
  }
};

/**
 * Seed the demo school.
 * @param {object} options
 * @param {string} options.baseUrl   the running API, e.g. http://127.0.0.1:3000
 * @param {string} options.schoolCode the school's sign-in code
 * @param {string} options.adminEmail an administrator who can sign in with `password`
 * @param {string} options.password  the password given to every seeded account
 * @param {string} options.domain    email domain of the seeded accounts
 * @returns {Promise<{ accounts: Array<{ role: string, name: string, email: string, note?: string }> }>}
 */
export const seedDemoSchool = async ({ baseUrl, schoolCode, adminEmail, password, domain, log = () => {} }) => {
  const api = httpClient(baseUrl);
  const rand = generator(20_261_019);
  const pick = list => list[Math.floor(rand() * list.length)];
  const step = label => log(`  · ${label}`);

  /* ---------- sign-in ---------- */
  const signIn = async email => (await api(null).post("/auth/login", { schoolCode, email, password })).data;
  const session = await signIn(adminEmail);
  const school = session.school;
  const admin = api(session.accessToken);
  const today = todayIn(school.timezone ?? "Asia/Kolkata");

  /* Every seeded account gets the demo password (one hash: this is throwaway data) */
  const passwordHash = await hashPassword(password);
  const setPasswords = () =>
    runInTenant(school.id, () => postgres.db.update(users).set({ passwordHash }).where(isNull(users.passwordHash)));

  /* people[key]: { userId, id (teacher/staff/student/parent id), email, name, role, token? } */
  const people = {};
  const tokens = {};
  const as = async key => {
    tokens[key] ??= api((await signIn(people[key].email)).accessToken);
    return tokens[key];
  };

  /* ---------- the academic year: started ~4.5 months ago, ten months long ---------- */
  const yearStart = firstOfMonth(addDays(today, -140));
  const yearEnd = lastOfMonth(addMonths(yearStart, 9));
  /* The API derives the name from the dates ("2026-27", or "2027" within one calendar year) */
  const yearName = yearNameFor(yearStart, yearEnd);
  const WEEKLY_OFF = [0, 6];

  /* Fixed-date holidays that fall inside the year */
  const holidays = [];
  for (const year of [yearStart.slice(0, 4), yearEnd.slice(0, 4)]) {
    holidays.push(
      { title: "Independence Day", date: `${year}-08-15` },
      { title: "Gandhi Jayanti", date: `${year}-10-02` },
      { title: "Republic Day", date: `${year}-01-26` }
    );
  }
  const winterBreak = { from: `${yearStart.slice(0, 4)}-12-24`, to: `${yearEnd.slice(0, 4)}-01-01` };
  const isHoliday = date => holidays.some(h => h.date === date) || (winterBreak.from <= date && date <= winterBreak.to);
  const isSchoolDay = date =>
    between(date, yearStart, yearEnd) && !WEEKLY_OFF.includes(dayOfWeek(date)) && !isHoliday(date);
  /* The n school days up to `until` (inclusive), oldest first */
  const schoolDaysUpTo = (until, n) => {
    const days = [];
    for (let d = until; days.length < n && d >= yearStart; d = addDays(d, -1)) if (isSchoolDay(d)) days.unshift(d);
    return days;
  };
  /* The n school days from `from` (inclusive) */
  const schoolDaysFrom = (from, n) => {
    const days = [];
    for (let d = from; days.length < n && d <= yearEnd; d = addDays(d, 1)) if (isSchoolDay(d)) days.push(d);
    return days;
  };
  const nextSchoolDay = from => schoolDaysFrom(from, 1)[0];

  /* ================= school profile ================= */
  step("school profile");
  await admin.patch("/administration/settings", {
    address: "Sunrise Campus, 12th Main Road, Indiranagar, Bengaluru 560038",
    contactEmail: `office@${domain}`,
    contactPhone: "+91 80 4123 4567",
    description: "A CBSE-affiliated co-educational day and boarding school for Classes 6 to 8 (demo data)"
  });

  /* ================= people: staff and teachers ================= */
  step(`${STAFF.length} staff accounts and ${TEACHERS.length} teachers`);
  let phone = 98_860_00_000;
  const nextPhone = () => `+91 ${String(phone++).replace(/(\d{5})(\d{5})/, "$1 $2")}`;
  const dobFor = age =>
    `${Number(yearStart.slice(0, 4)) - age}-${String(1 + Math.floor(rand() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}`;

  for (const s of STAFF) {
    const email = emailOf(s.first, s.last, domain);
    const res = await admin.post("/users/staff", {
      role: s.role,
      user: {
        firstName: s.first,
        lastName: s.last,
        email,
        phone: nextPhone(),
        gender: s.gender,
        dob: dobFor(32 + Math.floor(rand() * 20))
      },
      profile: {
        designation: s.designation,
        department: s.department,
        qualification: s.qualification,
        joiningDate: s.joined,
        employmentType: "FULL_TIME"
      }
    });
    people[s.key] = {
      id: res.data.id,
      userId: res.data.userId,
      code: res.data.employeeCode,
      email,
      role: s.role,
      name: `${s.first} ${s.last}`,
      note: s.designation
    };
  }
  for (const t of TEACHERS) {
    const email = emailOf(t.first, t.last, domain);
    const res = await admin.post("/users/teachers", {
      user: {
        firstName: t.first,
        lastName: t.last,
        email,
        phone: nextPhone(),
        gender: t.gender,
        dob: dobFor(26 + t.experience)
      },
      profile: {
        qualification: t.qualification,
        joiningDate: t.joined,
        experienceYears: t.experience,
        employmentType: "FULL_TIME"
      }
    });
    people[t.key] = {
      id: res.data.id,
      userId: res.data.userId,
      code: res.data.employeeCode,
      email,
      role: "TEACHER",
      name: `${t.first} ${t.last}`,
      teacher: t
    };
  }
  await setPasswords();
  const principal = await as("principal");

  /* ================= academic structure ================= */
  step(`academic year ${yearName} (${yearStart} to ${yearEnd}), classes, subjects, sections`);
  const year = (
    await principal.post("/academics/academic-years", {
      startDate: yearStart,
      endDate: yearEnd,
      isCurrent: true,
      weeklyOffDays: WEEKLY_OFF,
      description: "Demo academic year"
    })
  ).data;

  const classes = {};
  for (const cls of (
    await principal.post("/academics/classes/bulk", {
      classes: GRADES.map(grade => ({ level: `GRADE_${grade}`, description: `Grade ${grade}` }))
    })
  ).data)
    classes[Number(cls.level.replace("GRADE_", ""))] = cls;

  const subjects = {};
  for (const subject of (
    await principal.post("/academics/subjects/bulk", {
      subjects: SUBJECTS.map(s => ({ subjectName: s.name, subjectCode: s.code, subjectType: s.type ?? "THEORY" }))
    })
  ).data)
    subjects[subject.subjectCode] = subject;

  const sections = {};
  for (const grade of GRADES)
    for (const name of SECTION_NAMES) {
      const key = sectionKey(grade, name);
      const [classTeacher, deputy] = SECTION_TEACHERS[key];
      const section = (
        await principal.post("/academics/sections", {
          classId: classes[grade].id,
          sectionName: name,
          capacity: 40,
          classTeacherId: people[classTeacher].id,
          deputyClassTeacherId: people[deputy].id,
          description: `Room ${grade}0${SECTION_NAMES.indexOf(name) + 1}`
        })
      ).data;
      sections[key] = { ...section, key, grade, classTeacher, deputy };
    }
  const sectionList = Object.values(sections);

  /* The teacher of each subject in each section */
  const teacherOf = (key, code) => TEACHERS.find(t => t.subject === code && t.grades.includes(gradeOf(key))).key;

  step("subjects of each class (its sections get them) and teacher assignments");
  for (const classId of new Set(sectionList.map(section => section.classId)))
    for (const s of SUBJECTS)
      await principal.post("/academics/class-subjects", { classId, subjectId: subjects[s.code].id, weeklyNoOfClasses: 5 });
  for (const section of sectionList)
    for (const s of SUBJECTS) {
      await principal.post("/academics/teacher-assignments", {
        teacherId: people[teacherOf(section.key, s.code)].id,
        sectionId: section.id,
        subjectId: subjects[s.code].id
      });
    }

  /* ================= bell schedule and timetable ================= */
  step("bell schedule and a clash-free timetable");
  const BELL = [
    ["Period 1", "08:00", "08:45"],
    ["Period 2", "08:45", "09:30"],
    ["Period 3", "09:30", "10:15"],
    ["Short break", "10:15", "10:30", true],
    ["Period 4", "10:30", "11:15"],
    ["Period 5", "11:15", "12:00"],
    ["Lunch", "12:00", "12:40", true],
    ["Period 6", "12:40", "13:25"]
  ];
  const teachingPeriods = [];
  for (const [index, [name, startTime, endTime, isBreak]] of BELL.entries()) {
    const period = (
      await principal.post("/academics/periods", {
        periodNumber: index + 1,
        name,
        startTime,
        endTime,
        isBreak: !!isBreak
      })
    ).data;
    if (!isBreak) teachingPeriods.push(period);
  }
  /* Section k has subject (day + period + k) mod 6 in each slot: in any one slot every section
     has a different subject, and each teacher teaches one subject, so no teacher is double-booked */
  for (const [k, section] of sectionList.entries())
    for (let day = 1; day <= 5; day++)
      for (const [p, period] of teachingPeriods.entries()) {
        const subject = SUBJECTS[(day + p + k) % SUBJECTS.length];
        await principal.post("/academics/timetable/slots", {
          sectionId: section.id,
          weekday: day,
          periodId: period.id,
          subjectId: subjects[subject.code].id,
          room:
            subject.code === "CSC"
              ? "Computer Lab"
              : `Room ${section.grade}0${SECTION_NAMES.indexOf(section.sectionName) + 1}`
        });
      }

  /* ================= school calendar ================= */
  step("school calendar");
  for (const holiday of holidays.filter(h => between(h.date, yearStart, yearEnd)))
    await principal.post("/academics/calendar/events", {
      title: holiday.title,
      eventType: "HOLIDAY",
      category: "NATIONAL",
      startDate: holiday.date,
      isHoliday: true
    });
  await principal.post("/academics/calendar/events", {
    title: "Winter Break",
    eventType: "VACATION",
    category: "WINTER",
    startDate: winterBreak.from,
    endDate: winterBreak.to,
    isHoliday: true,
    description: "School closed; hostels stay open"
  });

  /* ================= students and parents ================= */
  step(`${STUDENTS.length} students with their parents (siblings share them)`);
  const familyParents = {};
  for (const s of STUDENTS) {
    const family = FAMILIES[s.family];
    const grade = gradeOf(s.section);
    const admittedYear = Number(yearStart.slice(0, 4)) - (grade - 6) - Math.floor(rand() * 3);

    let parents = familyParents[s.family];
    if (!parents) {
      const adult = (first, gender, relation, job, primary) => ({
        user: {
          firstName: first,
          lastName: family.last,
          email: emailOf(first, family.last, domain),
          phone: nextPhone(),
          gender,
          address: family.address
        },
        profile: { occupation: job, annualIncome: family.income },
        relation,
        isPrimaryContact: primary
      });
      parents = [
        family.father && adult(family.father, "MALE", "FATHER", family.fatherJob, !family.mother),
        family.mother && adult(family.mother, "FEMALE", "MOTHER", family.motherJob, true),
        family.guardian && adult(family.guardian.first, family.guardian.gender, "GUARDIAN", family.guardian.job, true)
      ].filter(Boolean);
    }

    const email = emailOf(s.first, family.last, domain);
    const res = await admin.post("/users/students", {
      user: {
        firstName: s.first,
        lastName: family.last,
        email,
        gender: s.gender,
        dob: dobFor(11 + grade - 6),
        address: family.address
      },
      /* The admission number is generated (ADM26-0001) */
      profile: {
        admissionDate: `${admittedYear}-0${4 + Math.floor(rand() * 2)}-${String(10 + Math.floor(rand() * 18))}`,
        bloodGroup: pick(["A+", "B+", "O+", "AB+", "O-", "B-"])
      },
      parents,
      enrollment: {
        academicYearId: year.id,
        sectionId: sections[s.section].id,
        admissionType: admittedYear === Number(yearStart.slice(0, 4)) ? "NEW" : "PROMOTED"
      }
    });
    const student = res.data;
    people[s.key] = {
      id: student.id,
      userId: student.userId,
      code: student.studentCode,
      email,
      role: "STUDENT",
      name: `${s.first} ${family.last}`,
      student: s,
      enrollment: student.enrollment
    };

    if (!familyParents[s.family]) {
      familyParents[s.family] = student.parents.map(p => ({
        parentId: p.parentId,
        relation: p.relation,
        isPrimaryContact: p.isPrimaryContact
      }));
      for (const p of student.parents) {
        const first =
          p.relation === "FATHER" ? family.father : p.relation === "MOTHER" ? family.mother : family.guardian.first;
        people[`${s.family}-${p.relation.toLowerCase()}`] = {
          id: p.parentId,
          email: emailOf(first, family.last, domain),
          role: "PARENT",
          name: `${first} ${family.last}`,
          children: []
        };
      }
    }
    for (const p of familyParents[s.family])
      people[`${s.family}-${p.relation.toLowerCase()}`].children.push(people[s.key].name);
  }
  await setPasswords();
  const studentsIn = key => STUDENTS.filter(s => s.section === key).map(s => people[s.key]);

  /* ================= attendance ================= */
  step("attendance registers for every school day of the year so far");
  /* Registers lock two days after their date: open the window while the history is written */
  await admin.patch("/academics/attendance/policy", { editWindowDays: 365 });
  const registerDays = schoolDaysUpTo(today, Infinity);
  for (const date of registerDays)
    for (const section of sectionList) {
      /* Today's register for 8B is still missing (it shows on the missing-registers screen) */
      if (date === today && section.key === "8B") continue;
      const records = studentsIn(section.key).map(student => {
        const r = rand();
        const absentRate = student.student.frequentlyAbsent ? 0.3 : 0.03;
        const status =
          r < absentRate
            ? "ABSENT"
            : r < absentRate + 0.03
              ? "LATE"
              : r < absentRate + 0.04
                ? "HALF_DAY"
                : r < absentRate + 0.05
                  ? "EXCUSED"
                  : "PRESENT";
        return { studentId: student.id, status, ...(status === "EXCUSED" && { remarks: "Inter-school competition" }) };
      });
      await (await as(section.classTeacher)).post("/academics/attendance", { sectionId: section.id, date, records });
    }
  await admin.patch("/academics/attendance/policy", { editWindowDays: 2 });

  /* ================= grading, exams and marks ================= */
  step("grade scale, result policy, exams, papers and marks");
  const gradeScale = (await principal.post("/academics/grade-scales", { templateKey: "CBSE_9_POINT", isDefault: true }))
    .data;
  await principal.post("/academics/result-policies", {
    name: "CBSE Middle School",
    description: "33% per subject and overall; ranks within the section",
    gradingMode: "MARKS",
    gradeScaleId: gradeScale.id,
    subjectMinPercent: 33,
    overallMinPercent: 33,
    rankingMethod: "COMPETITION",
    rankScope: "SECTION",
    showRankToStudents: true,
    isDefault: true
  });

  /* Each student's ability (0.45–0.95) shapes their marks */
  const ability = Object.fromEntries(STUDENTS.map(s => [s.key, s.frequentlyAbsent ? 0.42 : 0.5 + rand() * 0.45]));
  const examPlans = [
    {
      name: "Unit Test 1",
      type: "INTERNAL",
      start: nextSchoolDay(addDays(yearStart, 45)),
      maxMarks: 25,
      passMarks: 8,
      marked: true
    },
    {
      name: "Half-Yearly Examination",
      type: "INTERNAL",
      start: nextSchoolDay(addDays(today, -42)),
      maxMarks: 80,
      passMarks: 27,
      marked: true
    },
    {
      name: "Annual Examination",
      type: "FINAL",
      start: nextSchoolDay(addDays(yearEnd, -28)),
      maxMarks: 80,
      passMarks: 27,
      marked: false
    }
  ];
  const exams = [];
  for (const plan of examPlans) {
    const days = schoolDaysFrom(plan.start, SUBJECTS.length);
    const exam = (
      await principal.post("/academics/exams", {
        examName: plan.name,
        examType: plan.type,
        startDate: days[0],
        endDate: days.at(-1),
        gradeScaleId: gradeScale.id
      })
    ).data;
    exams.push({ ...exam, plan });
    for (const section of sectionList)
      for (const [i, s] of SUBJECTS.entries()) {
        const paper = (
          await principal.post(`/academics/exams/${exam.id}/papers`, {
            sectionId: section.id,
            subjectId: subjects[s.code].id,
            gradingType: "MARKS",
            component: "THEORY",
            examDate: days[i],
            startTime: "09:00",
            endTime: plan.maxMarks > 25 ? "12:00" : "10:00",
            room: `Room ${section.grade}0${SECTION_NAMES.indexOf(section.sectionName) + 1}`,
            maxMarks: plan.maxMarks,
            passMarks: plan.passMarks
          })
        ).data;
        if (!plan.marked) continue;
        /* The subject teacher enters the marks */
        const marks = studentsIn(section.key).map(student => {
          if (rand() < 0.02)
            return { studentId: student.id, examPaperId: paper.id, isAbsent: true, absenceReason: "MEDICAL" };
          const score = Math.min(1, Math.max(0.15, ability[student.student.key] + (rand() - 0.5) * 0.25));
          return {
            studentId: student.id,
            examPaperId: paper.id,
            marksObtained: Math.round(score * plan.maxMarks * 2) / 2
          };
        });
        await (await as(teacherOf(section.key, s.code))).post("/academics/marks/bulk", { marks });
      }
  }
  for (const exam of exams.filter(e => e.plan.marked))
    await principal.post(`/academics/exams/${exam.id}/result-publication`);
  const term1 = (
    await principal.post("/academics/assessment-schemes", {
      name: "Term 1",
      description: "Unit Test 1 (20%), the Half-Yearly Examination (60%) and teachers' own assessments (20%)",
      exams: [
        { examId: exams[0].id, weight: 20 },
        { examId: exams[1].id, weight: 60 }
      ],
      buckets: [{ name: "Teacher assessments", weight: 20 }]
    })
  ).data;
  const teacherBucket = term1.buckets[0];

  /* ================= homework ================= */
  step("homework, attachments, submissions and grading");
  const homeworkPlans = [
    { code: "MAT", title: "Fractions and decimals – exercise 4.2", due: 3, maxMarks: 10 },
    { code: "ENG", title: "Essay: My favourite festival (300 words)", due: 5, maxMarks: 20, attachment: true },
    { code: "SCI", title: "Draw and label the parts of a flower", due: 2, maxMarks: 10 }
  ];
  for (const section of sectionList)
    for (const plan of homeworkPlans) {
      const teacher = await as(teacherOf(section.key, plan.code));
      const homework = (
        await teacher.post("/academics/homework", {
          sectionId: section.id,
          subjectId: subjects[plan.code].id,
          title: plan.title,
          description: "Write neatly in your notebook and upload a scan or a typed copy.",
          dueDate: addDays(today, plan.due),
          maxMarks: plan.maxMarks,
          allowLateSubmission: true,
          /* The maths homework counts toward Term 1's teacher assessments */
          ...(plan.code === "MAT" && { bucketId: teacherBucket.id })
        })
      ).data;
      if (plan.attachment)
        await teacher.upload(`/academics/homework/${homework.id}/attachments`, {
          name: "essay-guidelines.txt",
          type: "text/plain",
          content: "Introduction, three paragraphs, conclusion. Underline five new words you used."
        });
      if (plan.code !== "MAT") continue;
      /* Three students hand in the maths homework; the teacher grades two of them */
      for (const [i, student] of studentsIn(section.key).slice(0, 3).entries()) {
        const submission = (
          await (
            await as(student.student.key)
          ).upload(`/me/homework/${homework.id}/submission`, {
            name: "exercise-4-2.txt",
            type: "text/plain",
            content: `${student.name}: answers to exercise 4.2\n1) 0.75  2) 3/8  3) 1.25  4) 7/20`
          })
        ).data;
        if (i < 2)
          await teacher.post(`/academics/homework/${homework.id}/submissions/${submission.id}/grading`, {
            status: "GRADED",
            marksAwarded: 6 + Math.floor(rand() * 5),
            feedback:
              i === 0 ? "Well done – show the working for Q3." : "Good effort. Revise converting fractions to decimals."
          });
      }
    }


  /* Teachers' own assessments in Term 1's bucket: a maths class test and a science project */
  step("teacher assessments");
  const itemPlans = [
    { code: "MAT", type: "TEST", title: "Class test 1: fractions", maxMarks: 20 },
    { code: "SCI", type: "PROJECT", title: "Project: model of a plant cell", maxMarks: 25 }
  ];
  for (const section of sectionList)
    for (const plan of itemPlans) {
      const teacher = await as(teacherOf(section.key, plan.code));
      const item = (
        await teacher.post("/academics/assessments", {
          bucketId: teacherBucket.id,
          sectionId: section.id,
          subjectId: subjects[plan.code].id,
          assessmentType: plan.type,
          title: plan.title,
          assessedOn: addDays(today, -7),
          maxMarks: plan.maxMarks
        })
      ).data;
      const marks = studentsIn(section.key).map((student, i) => {
        if (i === 1) return { studentId: student.id, status: "ABSENT" };
        if (i === 2 && plan.code === "SCI") return { studentId: student.id, status: "EXEMPT", remarks: "Joined after the project was set" };
        const score = Math.min(1, Math.max(0.2, ability[student.student.key] + (rand() - 0.5) * 0.3));
        return { studentId: student.id, status: "MARKED", marksObtained: Math.round(score * plan.maxMarks) };
      });
      await teacher.post(`/academics/assessments/${item.id}/marks`, { marks });
    }

  /* ================= finance ================= */
  step("fees: heads, plans, late fees, structures, concessions, invoices, payments, a refund");
  const accountant = await as("accountant");
  const feeHeads = {};
  for (const head of FEE_HEADS) feeHeads[head.code] = (await accountant.post("/finance/fee-heads", head)).data;

  const quarterDues = [0, 3, 6, 9].map(m => addDays(addMonths(yearStart, m), 9));
  const quarterly = (
    await accountant.post("/finance/installment-plans", {
      name: "Quarterly",
      description: "Four equal installments",
      installments: quarterDues.map((dueDate, i) => ({ name: `Q${i + 1}`, dueDate, sharePercent: 25 }))
    })
  ).data;
  const annual = (
    await accountant.post("/finance/installment-plans", {
      name: "Annual",
      description: "The whole year at once",
      installments: [{ name: "Annual", dueDate: quarterDues[0], sharePercent: 100 }]
    })
  ).data;
  const lateFeeRule = (
    await accountant.post("/finance/late-fee-rules", {
      name: "Standard late fee",
      description: "₹100 in the first month after a week's grace, then ₹10 a day, at most ₹1,000",
      graceDays: 7,
      maxAmount: 1000,
      isDefault: true,
      slabs: [
        { fromDay: 1, toDay: 30, chargeType: "FIXED", amount: 100 },
        { fromDay: 31, chargeType: "PER_DAY", amount: 10 }
      ]
    })
  ).data;
  const structures = {};
  for (const grade of GRADES)
    structures[grade] = (
      await accountant.post("/finance/fee-structures", {
        name: `Class ${grade} fees ${yearName}`,
        classId: classes[grade].id,
        items: FEE_HEADS.map(head => ({ feeHeadId: feeHeads[head.code].id, amount: ANNUAL_FEES[grade][head.code] })),
        installmentPlanIds: [quarterly.id, annual.id],
        defaultInstallmentPlanId: quarterly.id,
        chargesLateFee: true,
        lateFeeRuleId: lateFeeRule.id
      })
    ).data;

  const concessions = {
    SIBLING: (
      await accountant.post("/finance/concessions", {
        name: "Sibling discount",
        category: "SIBLING",
        concessionType: "PERCENT",
        value: 10,
        feeHeadIds: [feeHeads.TUI.id],
        description: "10% of tuition for the younger sibling"
      })
    ).data,
    MERIT: (
      await accountant.post("/finance/concessions", {
        name: "Merit scholarship",
        category: "MERIT",
        concessionType: "PERCENT",
        value: 25,
        feeHeadIds: [feeHeads.TUI.id],
        description: "Top of the class last year"
      })
    ).data,
    FINANCIAL_AID: (
      await accountant.post("/finance/concessions", {
        name: "Need-based aid",
        category: "FINANCIAL_AID",
        concessionType: "FIXED",
        value: 6000,
        description: "Reviewed every year"
      })
    ).data
  };
  for (const s of STUDENTS.filter(s => s.concession))
    await accountant.post("/finance/concession-grants", {
      studentId: people[s.key].id,
      concessionId: concessions[s.concession].id,
      reason: {
        SIBLING: "Elder sibling studies here",
        MERIT: "First in class last year",
        FINANCIAL_AID: "Family income below the aid threshold"
      }[s.concession]
    });
  for (const s of STUDENTS.filter(s => s.plan === "ANNUAL"))
    await accountant.post("/finance/plan-assignments", { studentId: people[s.key].id, installmentPlanId: annual.id });

  /* The first installment was billed when the year began, the rest three weeks before each due date */
  const lastDue = quarterDues.filter(due => due <= today).at(-1) ?? quarterDues[0];
  for (const section of sectionList) {
    const structureId = structures[section.grade].id;
    await accountant.post("/finance/invoices/generation", {
      feeStructureId: structureId,
      sectionId: section.id,
      throughDate: quarterDues[0],
      issueDate: yearStart,
      notes: "First installment"
    });
    if (lastDue > quarterDues[0])
      await accountant.post("/finance/invoices/generation", {
        feeStructureId: structureId,
        sectionId: section.id,
        throughDate: lastDue,
        issueDate: addDays(lastDue, -21)
      });
  }

  /* Everyone paid the earlier installments; the latest one follows each student's scenario */
  const office = await as("office");
  const methods = [
    ["UPI", () => `UPI${Math.floor(1e11 + rand() * 9e11)}`],
    ["CASH", () => undefined],
    ["BANK_TRANSFER", () => `NEFT${Math.floor(1e9 + rand() * 9e9)}`],
    ["CHEQUE", () => `CHQ ${Math.floor(100_000 + rand() * 900_000)}`],
    ["CARD", () => `POS-${Math.floor(1e5 + rand() * 9e5)}`]
  ];
  let refundablePayment;
  for (const s of STUDENTS) {
    const invoices = (await listAll(accountant, `/finance/invoices?studentId=${people[s.key].id}`)).sort((a, b) =>
      a.dueDate < b.dueDate ? -1 : 1
    );
    for (const [i, invoice] of invoices.entries()) {
      const latest = i === invoices.length - 1;
      if (latest && s.scenario === "UNPAID") continue;
      const balance = Number(invoice.balance);
      const amount = latest && s.scenario === "PARTIAL" ? Math.round(balance / 2) : balance;
      const [method, reference] = pick(methods);
      const paidAt = [addDays(invoice.dueDate, -Math.floor(rand() * 12)), today].sort()[0];
      /* The counter (office) takes cash; the accountant records the rest */
      const res = await (method === "CASH" ? office : accountant).post(`/finance/invoices/${invoice.id}/payments`, {
        amount,
        method,
        reference: reference(),
        paidAt: paidAt < invoice.issueDate ? invoice.issueDate : paidAt,
        notes: latest && s.scenario === "PARTIAL" ? "Balance promised next month" : undefined
      });
      if (s.refund) refundablePayment = res.data.payment ?? res.data;
    }
  }
  /* The nightly job charges late fees on what is overdue; run tonight's now */
  await runInTenant(school.id, () => lateFeeService.applyLateFees());
  for (const s of STUDENTS.filter(s => s.waiveLateFee)) {
    const overdue = (await listAll(accountant, `/finance/invoices?studentId=${people[s.key].id}`)).find(
      i => Number(i.lateFee) > 0
    );
    if (overdue)
      await accountant.post(`/finance/invoices/${overdue.id}/late-fee-waiver`, {
        reason: "Medical emergency in the family"
      });
  }
  if (refundablePayment?.id) {
    const refund = (
      await accountant.post(`/finance/payments/${refundablePayment.id}/refunds`, {
        amount: 1200,
        method: "BANK_TRANSFER",
        reason: "Activity fee: the student is exempt from the excursion programme",
        reference: `NEFT${Math.floor(1e9 + rand() * 9e9)}`
      })
    ).data;
    /* Above the school's limit an accountant's refund waits for an administrator */
    if (refund.status === "REQUESTED") await admin.post(`/finance/refunds/${refund.id}/approval`);
  }

  /* School expenses straight into the ledger */
  const ledgerAccounts = await listAll(accountant, "/finance/ledger/accounts");
  const bank =
    ledgerAccounts.find(a => a.accountType === "ASSET" && /bank/i.test(a.name)) ??
    ledgerAccounts.find(a => a.accountType === "ASSET");
  const electricity = (
    await accountant.post("/finance/ledger/accounts", {
      code: "5410",
      name: "Electricity",
      accountType: "EXPENSE",
      description: "BESCOM bills"
    })
  ).data;
  const maintenance = (
    await accountant.post("/finance/ledger/accounts", {
      code: "5420",
      name: "Repairs and maintenance",
      accountType: "EXPENSE"
    })
  ).data;
  for (const [months, account, amount, narration] of [
    [1, electricity, 18_450, "BESCOM electricity bill"],
    [2, electricity, 21_300, "BESCOM electricity bill"],
    [1, maintenance, 7_800, "Plumbing repairs, hostel block"]
  ])
    await accountant.post("/finance/ledger/journal-entries", {
      date: [addDays(firstOfMonth(addMonths(today, -months)), 6), today].sort()[0],
      narration,
      lines: [
        { accountId: account.id, debit: amount, memo: narration },
        { accountId: bank.id, credit: amount }
      ]
    });

  /* ================= transport ================= */
  step("transport: vehicles, routes, stops and riders");
  const transport = await as("transport");
  const stops = {};
  for (const route of BUS_ROUTES) {
    const vehicle = (
      await transport.post("/transport/vehicles", {
        ...route.vehicle,
        insuranceExpiresOn: addMonths(today, 7),
        fitnessCertificateExpiresOn: addMonths(today, 11),
        permitExpiresOn: route.code === "R2" ? addDays(today, 20) : addMonths(today, 14),
        status: "ACTIVE"
      })
    ).data;
    const created = (
      await transport.post("/transport/routes", {
        name: route.name,
        code: route.code,
        vehicleId: vehicle.id,
        /* `code` only links riders to stops in the roster */
        stops: route.stops.map(({ code: _code, ...stop }, i) => ({ ...stop, sequence: i + 1 }))
      })
    ).data;
    for (const stop of route.stops)
      stops[`${route.code}-${stop.code}`] = {
        routeId: created.id,
        stopId: created.stops.find(s => s.name === stop.name).id
      };
  }
  for (const s of STUDENTS.filter(s => s.bus))
    await transport.post("/transport/assignments", {
      studentId: people[s.key].id,
      ...stops[s.bus],
      direction: s.key === "sara" ? "PICKUP_ONLY" : "BOTH",
      startDate: yearStart
    });

  /* ================= hostel ================= */
  step("hostels: rooms, boarders, mess plans and lockers");
  const hostelManager = await as("hostel");
  const houses = {
    BOYS: {
      name: "Aravali House",
      code: "ARV",
      residentGender: "BOYS",
      wardenUserId: people.warden.userId,
      prefix: "A"
    },
    GIRLS: {
      name: "Nilgiri House",
      code: "NLG",
      residentGender: "GIRLS",
      wardenUserId: people.hostel.userId,
      prefix: "N"
    }
  };
  for (const [kind, house] of Object.entries(houses)) {
    const { prefix, ...body } = house;
    house.record = (
      await hostelManager.post("/hostel/hostels", {
        ...body,
        contactPhone: nextPhone(),
        address: "Sunrise Campus, North Block"
      })
    ).data;
    house.rooms = [];
    for (const [number, capacity, status] of [
      ["101", 2],
      ["102", 2],
      ["201", 3, "MAINTENANCE"]
    ])
      house.rooms.push(
        (
          await hostelManager.post("/hostel/rooms", {
            hostelId: house.record.id,
            roomNumber: `${prefix}-${number}`,
            floor: Number(number[0]),
            capacity,
            roomType: capacity === 2 ? "Twin sharing" : "Triple sharing",
            monthlyFee: 6000,
            status: status ?? "AVAILABLE"
          })
        ).data
      );
    house.mess = (
      await hostelManager.post("/hostel/resources", {
        hostelId: house.record.id,
        resourceType: "MESS_PLAN",
        name: "Vegetarian mess plan",
        capacity: 100,
        monthlyFee: 3500
      })
    ).data;
    house.lockers = [];
    for (let n = 1; n <= 4; n++)
      house.lockers.push(
        (
          await hostelManager.post("/hostel/resources", {
            hostelId: house.record.id,
            resourceType: "LOCKER",
            name: `Locker ${prefix}-L${n}`,
            capacity: 1,
            monthlyFee: 200
          })
        ).data
      );
    const boarders = STUDENTS.filter(s => s.hostel === kind);
    for (const [i, s] of boarders.entries()) {
      const allocation = (
        await hostelManager.post("/hostel/allocations", {
          studentId: people[s.key].id,
          roomId: house.rooms[Math.floor(i / 2)].id,
          bedNumber: (i % 2) + 1,
          fromDate: yearStart
        })
      ).data;
      await hostelManager.post("/hostel/resource-assignments", {
        resourceId: house.mess.id,
        studentId: people[s.key].id,
        allocationId: allocation.id,
        fromDate: yearStart
      });
      if (i < 2)
        await hostelManager.post("/hostel/resource-assignments", {
          resourceId: house.lockers[i].id,
          studentId: people[s.key].id,
          allocationId: allocation.id,
          fromDate: yearStart
        });
    }
  }

  /* ================= library ================= */
  step("library: rules, books, copies, loans, returns, fines and a hold");
  const librarian = await as("librarian");
  await librarian.patch("/library/policy", {
    notifyParents: true,
    fineDayBasis: "ACADEMIC_DAYS",
    holdPickupDays: 3,
    maxHoldsPerBorrower: 2
  });
  /* The library opens with default rules: adjust those, add the rest */
  const existingRules = await listAll(librarian, "/library/circulation-rules");
  for (const { borrowerRole, ...terms } of [
    {
      borrowerRole: "STUDENT",
      loanDays: 14,
      maxLoans: 2,
      maxRenewals: 1,
      finePerDay: 2,
      fineGraceDays: 0,
      maxFine: 100
    },
    { borrowerRole: "TEACHER", loanDays: 30, maxLoans: 5, maxRenewals: 2, finePerDay: 0 }
  ]) {
    const rule = existingRules.find(r => r.borrowerRole === borrowerRole && !r.classId && !r.itemType);
    if (rule) await librarian.patch(`/library/circulation-rules/${rule.id}`, terms);
    else await librarian.post("/library/circulation-rules", { borrowerRole, ...terms });
  }
  const books = {};
  for (const book of BOOKS) {
    const { copies, price, subject, ...details } = book;
    const created = (
      await librarian.post("/library/books", {
        ...details,
        language: details.language ?? "English",
        subjectId: subject ? subjects[subject].id : undefined
      })
    ).data;
    const added = (
      await librarian.post(`/library/books/${created.id}/copies`, {
        count: copies,
        price,
        acquiredOn: addDays(yearStart, -200),
        source: "Annual purchase"
      })
    ).data;
    books[book.title] = { ...created, copies: added.copies ?? added };
  }
  const issue = (title, copy, borrowerKey, daysAgo) =>
    librarian.post("/library/loans", {
      copyId: books[title].copies[copy].id,
      borrowerUserId: people[borrowerKey].userId,
      ...(daysAgo > 0 && { issuedOn: addDays(today, -daysAgo), backdateReason: "Copied from the paper issue register" })
    });
  /* On loan now */
  await issue("Wings of Fire", 0, "arnav", 3);
  const renewed = (await issue("Malgudi Days", 0, "diya", 12)).data;
  await librarian.post(`/library/loans/${renewed.id}/renewal`);
  await issue("Harry Potter and the Philosopher's Stone", 0, "ananya", 5);
  await issue("Harry Potter and the Philosopher's Stone", 1, "rohan", 2);
  await issue("Harry Potter and the Philosopher's Stone", 2, "zoya", 1);
  await issue("A Brief History of Time", 0, "sc1", 9);
  await issue("Discovery of India", 0, "sst", 6);
  await issue("Malgudi Days", 1, "en1", 0);
  /* Overdue */
  await issue("The Jungle Book", 0, "kunal", 25);
  await issue("Python for Young Coders", 0, "ishaan", 22);
  /* Returned: one on time, one late with the fine paid at the desk */
  const onTime = (await issue("Panchatantra Tales", 0, "aarav", 8)).data;
  await librarian.post(`/library/loans/${onTime.id}/return`, { condition: "OK" });
  const late = (await issue("Wings of Fire", 1, "myra", 20)).data;
  const returned = (
    await librarian.post(`/library/loans/${late.id}/return`, { condition: "OK", notes: "Returned after the due date" })
  ).data;
  const fine = Number(returned.lateFine ?? returned.loan?.lateFine ?? 0);
  if (fine > 0) await librarian.post(`/library/loans/${late.id}/fine-payment`, { amount: fine, method: "CASH" });
  /* Every copy of Harry Potter is out: a hold joins the queue */
  await librarian.post("/library/holds", {
    bookId: books["Harry Potter and the Philosopher's Stone"].id,
    borrowerUserId: people.nikhil.userId
  });
  await librarian.post("/library/closures", {
    fromDate: nextSchoolDay(addDays(today, 18)),
    toDate: nextSchoolDay(addDays(today, 18)),
    reason: "Annual stock verification"
  });

  /* ================= inventory ================= */
  step("inventory: categories, vendors, items and stock movements");
  const storeManager = await as("inventory");
  const categories = {};
  for (const { key, ...category } of INVENTORY.categories)
    categories[key] = (await storeManager.post("/inventory/categories", category)).data;
  const vendors = {};
  for (const { key, ...vendor } of INVENTORY.vendors)
    vendors[key] = (await storeManager.post("/inventory/vendors", vendor)).data;
  for (const { category, received, issued, adjustment, ...item } of INVENTORY.items) {
    const created = (await storeManager.post("/inventory/items", { ...item, categoryId: categories[category].id }))
      .data;
    for (const [i, [quantity, unitCost, vendor]] of received.entries())
      await storeManager.post(`/inventory/items/${created.id}/movements`, {
        type: "RECEIPT",
        quantity,
        unitCost,
        vendorId: vendors[vendor].id,
        reference: `PO-${yearStart.slice(0, 4)}-${String(100 + i + Object.keys(vendors).indexOf(vendor) * 10)}`,
        movementDate: addDays(yearStart, -10)
      });
    for (const [i, [quantity, holder, reason]] of issued.entries())
      await storeManager.post(`/inventory/items/${created.id}/movements`, {
        type: "ISSUE",
        quantity,
        issuedToUserId: people[holder].userId,
        reason,
        movementDate: addDays(today, -(30 - i * 9))
      });
    if (adjustment)
      await storeManager.post(`/inventory/items/${created.id}/movements`, {
        type: "ADJUSTMENT",
        quantityChange: adjustment[0],
        reason: adjustment[1],
        movementDate: addDays(today, -4)
      });
  }

  /* ================= HR: leave, staff attendance, salaries, payroll ================= */
  step("HR: leave types and requests, staff attendance, salaries and payroll");
  const hr = await as("hr");
  const leaveTypes = {};
  for (const type of [
    { name: "Casual Leave", code: "CL", annualQuotaDays: 12, isPaid: true, description: "Personal work, short notice" },
    { name: "Sick Leave", code: "SL", annualQuotaDays: 10, isPaid: true },
    {
      name: "Earned Leave",
      code: "EL",
      annualQuotaDays: 15,
      isPaid: true,
      description: "Planned leave, apply two weeks ahead"
    }
  ])
    leaveTypes[type.code] = (await hr.post("/hr/leave-types", type)).data;

  /* Staff attendance for every school day so far; the leave falls in the last fortnight */
  const staffDays = schoolDaysUpTo(addDays(today, -1), Infinity);
  const recentDays = staffDays.slice(-10);
  const leaveDay = recentDays[4];
  const halfDayDate = recentDays[7];
  const decided = (
    await (
      await as("en2")
    ).post("/hr/leave-requests", {
      leaveTypeId: leaveTypes.CL.id,
      fromDate: leaveDay,
      toDate: leaveDay,
      reason: "Family function"
    })
  ).data;
  await hr.post(`/hr/leave-requests/${decided.id}/decision`, {
    decision: "APPROVED",
    note: "Class 8 English covered by substitution"
  });
  const halfDay = (
    await librarian.post("/hr/leave-requests", {
      leaveTypeId: leaveTypes.CL.id,
      fromDate: halfDayDate,
      toDate: halfDayDate,
      halfDay: true,
      reason: "Bank work"
    })
  ).data;
  await hr.post(`/hr/leave-requests/${halfDay.id}/decision`, { decision: "APPROVED" });
  const [sickFrom, sickTo] = schoolDaysFrom(addDays(today, 3), 2);
  await (
    await as("sc2")
  ).post("/hr/leave-requests", {
    leaveTypeId: leaveTypes.SL.id,
    fromDate: sickFrom,
    toDate: sickTo,
    reason: "Minor medical procedure"
  });
  const earnedFrom = nextSchoolDay(addDays(today, 10));
  const refused = (
    await accountant.post("/hr/leave-requests", {
      leaveTypeId: leaveTypes.EL.id,
      fromDate: earnedFrom,
      toDate: schoolDaysFrom(earnedFrom, 5).at(-1),
      reason: "Family trip"
    })
  ).data;
  await principal.post(`/hr/leave-requests/${refused.id}/decision`, {
    decision: "REJECTED",
    note: "Fee collection week – please choose other dates"
  });

  const employees = [...STAFF, ...TEACHERS].map(e => e.key);
  for (const date of staffDays)
    await hr.post("/hr/staff-attendance", {
      date,
      records: employees.map(key => {
        if (key === "en2" && date === leaveDay)
          return { userId: people[key].userId, status: "LEAVE", remarks: "Casual leave" };
        if (key === "librarian" && date === halfDayDate)
          return { userId: people[key].userId, status: "HALF_DAY", checkIn: "08:05", checkOut: "11:30" };
        const late = rand() < 0.08;
        return {
          userId: people[key].userId,
          status: "PRESENT",
          checkIn: late ? "08:25" : `07:${45 + Math.floor(rand() * 14)}`,
          checkOut: `15:${String(30 + Math.floor(rand() * 25))}`,
          ...(late && { remarks: "Late arrival" })
        };
      })
    });

  const components = {};
  for (const component of [
    { code: "HRA", name: "House rent allowance", kind: "EARNING", calculation: "PERCENT_OF_BASIC", defaultValue: 40 },
    { code: "DA", name: "Dearness allowance", kind: "EARNING", calculation: "PERCENT_OF_BASIC", defaultValue: 12 },
    { code: "CONV", name: "Conveyance allowance", kind: "EARNING", calculation: "FIXED", defaultValue: 1600 },
    {
      code: "PF",
      name: "Provident fund (employee)",
      kind: "DEDUCTION",
      calculation: "PERCENT_OF_BASIC",
      defaultValue: 12
    },
    { code: "PT", name: "Professional tax", kind: "DEDUCTION", calculation: "FIXED", defaultValue: 200 }
  ])
    components[component.code] = (await hr.post("/hr/salary-components", component)).data;
  const BASIC = {
    principal: 95_000,
    accountant: 48_000,
    office: 30_000,
    warden: 24_000,
    hr: 52_000,
    librarian: 38_000,
    transport: 36_000,
    hostel: 40_000,
    inventory: 34_000
  };
  for (const [i, key] of employees.entries())
    await hr.post("/hr/employee-salaries", {
      userId: people[key].userId,
      effectiveFrom: yearStart,
      monthlyBasic: BASIC[key] ?? 32_000 + people[key].teacher.experience * 1_500,
      lines: Object.values(components).map(c => ({ componentId: c.id })),
      bankAccountNumber: `5010${String(10_000_000 + i * 7_919)}`,
      bankIfsc: "HDFC0001234",
      panNumber: `ABCPK${String(1000 + i)}${"LMNOPQRSTUVWXYZ"[i % 15]}`
    });
  /* Every finished month of the year is paid; the last one is still a draft */
  const months = [];
  for (let m = yearStart.slice(0, 7); m < today.slice(0, 7); m = addMonths(`${m}-01`, 1).slice(0, 7)) months.push(m);
  for (const [i, month] of months.entries()) {
    const run = (await hr.post("/hr/payroll-runs", { month, notes: `Salaries for ${month}` })).data;
    if (i < months.length - 1) await hr.post(`/hr/payroll-runs/${run.id}/finalization`);
  }

  /* ================= access: operator roles ================= */
  step("access: operator roles from module owners");
  const libraryDesk = (
    await librarian.post("/administration/access/operator-roles", {
      module: "library",
      name: "Library assistant",
      description: "Issues and returns books at the front desk",
      permissions: [
        "library.books.read",
        "library.copies.read",
        "library.loans.circulate",
        "library.loans.read",
        "library.holds.manage",
        "library.holds.read"
      ]
    })
  ).data;
  await librarian.post("/administration/access/assignments", {
    operatorRoleId: libraryDesk.id,
    userId: people.office.userId,
    note: "Covers the desk during the librarian's lunch hour"
  });
  const transportDesk = (
    await transport.post("/administration/access/operator-roles", {
      module: "transport",
      name: "Transport desk",
      description: "Seats students on routes and prints rosters",
      permissions: [
        "transport.routes.read",
        "transport.vehicles.read",
        "transport.assignments.read",
        "transport.assignments.manage",
        "transport.roster.read"
      ]
    })
  ).data;
  await transport.post("/administration/access/assignments", {
    operatorRoleId: transportDesk.id,
    userId: people.office.userId
  });
  const nightWarden = (
    await hostelManager.post("/administration/access/operator-roles", {
      module: "hostel",
      name: "Warden",
      description: "Sees rooms, boarders and their resources",
      permissions: [
        "hostel.hostels.read",
        "hostel.rooms.read",
        "hostel.allocations.read",
        "hostel.resources.read",
        "hostel.resourceAssignments.read"
      ]
    })
  ).data;
  await hostelManager.post("/administration/access/assignments", {
    operatorRoleId: nightWarden.id,
    userId: people.warden.userId
  });

  /* ================= communication ================= */
  step("announcements and messages");
  const ptmDate = nextSchoolDay(addDays(today, 12));
  const sportsDay = nextSchoolDay(addDays(today, 30));
  const announce = async (author, body, publishAt) => {
    const created = (await author.post("/communication/announcements", { channels: ["IN_APP"], ...body })).data;
    if (publishAt !== null)
      await author.post(`/communication/announcements/${created.id}/publication`, publishAt ? { publishAt } : {});
  };
  await announce(principal, {
    title: `Parent-teacher meeting on ${ptmDate}`,
    body: "Meet your child's class teacher between 9 am and 1 pm to discuss the half-yearly results. Please bring the report card.",
    audience: { roles: ["PARENT", "TEACHER"] }
  });
  await announce(principal, {
    title: "Half-yearly results are out",
    body: "Report cards for the Half-Yearly Examination are now available in the app.",
    audience: { roles: ["STUDENT", "PARENT"] }
  });
  await announce(principal, {
    title: "Staff meeting this Friday",
    body: "All staff: 3:45 pm in the conference room. Agenda: annual day planning and the new attendance mode.",
    audience: { roles: ["ADMIN", "PRINCIPAL", "ACCOUNTANT", "STAFF", "TEACHER"] }
  });
  await announce(office, {
    title: "Class 8 science excursion",
    body: "Class 8 visits the Visvesvaraya Industrial and Technological Museum next week. Consent forms are due by Monday.",
    audience: { roles: ["STUDENT", "PARENT"], classIds: [classes[8].id] }
  });
  await announce(
    principal,
    {
      title: `Annual Sports Day on ${sportsDay}`,
      body: "Students report in house colours by 7:30 am. Parents are welcome from 9 am.",
      audience: { roles: ["ADMIN", "PRINCIPAL", "ACCOUNTANT", "STAFF", "TEACHER", "STUDENT", "PARENT"] }
    },
    `${addDays(sportsDay, -7)}T03:30:00.000Z`
  );
  await announce(
    office,
    {
      title: "Winter uniform from 1 December",
      body: "Draft – to be confirmed by the principal.",
      audience: { roles: ["STUDENT", "PARENT"] }
    },
    null
  );
  await office.post("/communication/messages", {
    studentIds: [people.aditya.id],
    includeParents: true,
    title: "Attendance below 75%",
    body: "Aditya has missed several days this month. Please meet the class teacher at the parent-teacher meeting.",
    channels: ["IN_APP"]
  });
  await office.post("/communication/messages", {
    studentIds: STUDENTS.filter(s => s.scenario === "UNPAID").map(s => people[s.key].id),
    includeParents: true,
    title: "Fee reminder",
    body: "The latest fee installment is overdue. Please pay at the school office or online to avoid further late fees.",
    channels: ["IN_APP"]
  });

  /* ================= the account list ================= */
  const order = [
    "PRINCIPAL",
    "ACCOUNTANT",
    "STAFF",
    "HR_MANAGER",
    "LIBRARIAN",
    "TRANSPORT_MANAGER",
    "HOSTEL_MANAGER",
    "INVENTORY_MANAGER",
    "TEACHER",
    "STUDENT",
    "PARENT"
  ];
  /* Parents' account ids are not in the admission response: take everyone's from the account list */
  const userIds = new Map((await listAll(admin, "/users")).map(user => [user.email, user.id]));
  const accounts = Object.values(people)
    .map(p => ({
      role: p.role,
      name: p.name,
      email: p.email,
      userId: userIds.get(p.email) ?? p.userId,
      /* The id of the teacher / student / parent / staff record */
      profileId: p.id,
      code: p.code,
      note:
        p.note ??
        (p.teacher &&
          `${SUBJECTS.find(s => s.code === p.teacher.subject).name}, Class ${p.teacher.grades.join("/")}`) ??
        (p.student &&
          `Class ${p.student.section}${[
            p.student.hostel && "boarder",
            p.student.bus && "bus",
            p.student.scenario && `fees ${p.student.scenario.toLowerCase()}`
          ]
            .filter(Boolean)
            .map(x => `, ${x}`)
            .join("")}`) ??
        (p.children && `parent of ${p.children.join(", ")}`)
    }))
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
  return {
    admin: { userId: userIds.get(adminEmail) },
    accounts,
    academicYear: { name: yearName, startDate: yearStart, endDate: yearEnd }
  };
};
