/* Data migration (dev/demo): open the next academic year of an existing school as its current
   year and fill it with people, through the public API so every rule and code is real.

     node scripts/data-migrations/0001_new_year_roster.js                 # school DEMO
     node scripts/data-migrations/0001_new_year_roster.js --school DEMO --password Demo12345

   - The year after the school's latest one (same months, weekly offs and off Saturdays),
     made current; the previous year gets its usual grace period.
   - Every class level (Nursery … Class 12), each with 3 or 4 sections in the new year.
     No class teachers and no subjects: the school assigns those.
   - 20-30 students in each section, each admitted with a father and a mother.
   - As many teachers as sections, plus 10, spread over the subject-code stages by how many
     sections each stage has. A teacher's last name carries the stage and the subject they
     are meant for, "Iyer S3 (Mathematics)", so they are easy to assign.

   Seeded accounts use a reserved domain (no mail can reach a real inbox) and get one password.
   Same data on every run (seeded generator), and re-running skips what already exists, so
   an interrupted run can simply be started again. Refused in production. */
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    school: { type: "string", default: "DEMO" },
    password: { type: "string", default: "Demo12345" },
    domain: { type: "string", default: "demo.example" },
    concurrency: { type: "string", default: "4" }
  }
});

const fail = message => {
  console.error(`0001_new_year_roster: ${message}`);
  process.exit(1);
};
if (process.env.NODE_ENV === "production") fail("refused in production: demo data does not belong there");
if (!args.domain.endsWith(".example")) fail("--domain must end in .example, so no mail can reach a real inbox");

/* Thousands of requests from one address, and nothing may email or text the fictional people */
Object.assign(process.env, {
  LOG_LEVEL: "warn",
  RATE_LIMIT_MAX: "1000000",
  AUTH_RATE_LIMIT_MAX: "1000000",
  EMAIL_DRIVER: "memory",
  SMS_DRIVER: "memory"
});

const { and, asc, eq, isNull, like, sql } = await import("drizzle-orm");
const { startInfrastructure, stopInfrastructure } = await import("../../src/bootstrap.js");
const postgres = await import("../../src/common/database/postgres.js");
const { runInTenant } = await import("../../src/common/tenancy/context.js");
const { findTenantByCode } = await import("../../src/common/tenancy/tenant.service.js");
const { signAccessToken } = await import("../../src/common/auth/authenticate.middleware.js");
const { hashPassword } = await import("../../src/common/crypto/password.js");
const { academicYears, users } = await import("../../src/database.schema.js");
const { CLASS_LEVELS } = await import("../../src/modules/academics/shared/constants/academic.constants.js");

/* ---------- names ---------- */
const MALE = [
  "Aarav",
  "Vivaan",
  "Aditya",
  "Arjun",
  "Sai",
  "Reyansh",
  "Krishna",
  "Ishaan",
  "Rohan",
  "Kabir",
  "Ayaan",
  "Dhruv",
  "Vihaan",
  "Atharv",
  "Karthik",
  "Pranav",
  "Siddharth",
  "Rahul",
  "Nikhil",
  "Varun",
  "Harsh",
  "Yash",
  "Manav",
  "Rudra",
  "Tanish",
  "Advait",
  "Shaurya",
  "Aryan",
  "Lakshay",
  "Om",
  "Dev",
  "Parth",
  "Gautam",
  "Naveen",
  "Sanjay",
  "Rajesh",
  "Suresh",
  "Mahesh",
  "Ramesh",
  "Vikram",
  "Anand",
  "Prakash",
  "Ganesh",
  "Manoj",
  "Ashok",
  "Deepak",
  "Vinod",
  "Sunil",
  "Ajay",
  "Arun",
  "Srinivas",
  "Venkat",
  "Mohan",
  "Kiran",
  "Abhishek",
  "Amit",
  "Rakesh",
  "Hari",
  "Murali",
  "Balaji"
];
const FEMALE = [
  "Ananya",
  "Diya",
  "Aadhya",
  "Saanvi",
  "Pari",
  "Anika",
  "Myra",
  "Ira",
  "Kavya",
  "Riya",
  "Navya",
  "Aarohi",
  "Ishita",
  "Meera",
  "Tanvi",
  "Sneha",
  "Pooja",
  "Nandini",
  "Shreya",
  "Kiara",
  "Avni",
  "Sara",
  "Mahi",
  "Prisha",
  "Anvi",
  "Janvi",
  "Siya",
  "Trisha",
  "Lavanya",
  "Divya",
  "Lakshmi",
  "Priya",
  "Deepa",
  "Kavitha",
  "Sunita",
  "Rekha",
  "Anitha",
  "Geetha",
  "Meena",
  "Radha",
  "Swathi",
  "Padma",
  "Revathi",
  "Shalini",
  "Usha",
  "Vidya",
  "Bhavana",
  "Sangeetha",
  "Archana",
  "Jyothi",
  "Asha",
  "Neha",
  "Rashmi",
  "Sowmya",
  "Harini",
  "Keerthi",
  "Nithya",
  "Pavithra",
  "Sushma",
  "Yamini"
];
const SURNAMES = [
  "Sharma",
  "Verma",
  "Iyer",
  "Iyengar",
  "Nair",
  "Menon",
  "Pillai",
  "Reddy",
  "Rao",
  "Naidu",
  "Patel",
  "Shah",
  "Mehta",
  "Desai",
  "Joshi",
  "Kulkarni",
  "Deshpande",
  "Patil",
  "Gupta",
  "Agarwal",
  "Bansal",
  "Singh",
  "Chauhan",
  "Rathore",
  "Yadav",
  "Mishra",
  "Pandey",
  "Tiwari",
  "Dubey",
  "Srivastava",
  "Mukherjee",
  "Banerjee",
  "Chatterjee",
  "Ghosh",
  "Bose",
  "Das",
  "Sen",
  "Krishnan",
  "Subramanian",
  "Raman",
  "Venkatesh",
  "Gowda",
  "Shetty",
  "Hegde",
  "Kamath",
  "Bhat",
  "Kapoor",
  "Malhotra",
  "Khanna",
  "Chopra",
  "Arora",
  "Sethi",
  "Bhatia",
  "Saxena",
  "Trivedi",
  "Chandra",
  "Murthy",
  "Prasad",
  "Sinha",
  "Thakur"
];
const JOBS = [
  "Software Engineer",
  "Doctor",
  "Teacher",
  "Accountant",
  "Business Owner",
  "Bank Officer",
  "Civil Engineer",
  "Government Employee",
  "Lawyer",
  "Pharmacist",
  "Architect",
  "Sales Manager",
  "Nurse",
  "Professor",
  "Shopkeeper",
  "Homemaker",
  "Consultant",
  "Police Officer",
  "Farmer",
  "Chartered Accountant"
];

/* What each subject-code stage teaches, most-needed first: a stage's teachers take these in turn */
const STAGE_SUBJECTS = {
  1: ["English", "Mathematics", "Environmental Studies", "Art & Craft", "Music & Dance"],
  2: [
    "English",
    "Mathematics",
    "Hindi",
    "Environmental Studies",
    "Computer Science",
    "Art & Craft",
    "Physical Education"
  ],
  3: [
    "English",
    "Mathematics",
    "Science",
    "Social Science",
    "Hindi",
    "Sanskrit",
    "Computer Science",
    "Physical Education"
  ],
  4: [
    "Mathematics",
    "English",
    "Physics",
    "Chemistry",
    "Biology",
    "Social Science",
    "Hindi",
    "Computer Science",
    "Physical Education"
  ],
  5: [
    "Mathematics",
    "Physics",
    "Chemistry",
    "English",
    "Biology",
    "Computer Science",
    "Accountancy",
    "Economics",
    "Business Studies",
    "Physical Education"
  ]
};
const OTHER_SUBJECTS = ["English", "Mathematics", "Science", "Social Science", "Hindi", "Computer Science"];
const QUALIFICATION = {
  1: "D.El.Ed, Montessori Training",
  2: "B.A., B.Ed",
  3: "B.Sc., B.Ed",
  4: "M.Sc., B.Ed",
  5: "M.Sc., M.Ed"
};

/* ---------- helpers ---------- */
const generator = seed => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
};
const rand = generator(20_261_020);
const pick = list => list[Math.floor(rand() * list.length)];
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));
const pad = n => String(n).padStart(2, "0");

const isoOf = date => date.toISOString().slice(0, 10);
const addDays = (date, days) => isoOf(new Date(Date.parse(date) + days * 86_400_000));
const addYears = (date, years) => `${Number(date.slice(0, 4)) + years}${date.slice(4)}`;
const dobFor = (yearStart, age) =>
  `${Number(yearStart.slice(0, 4)) - age}-${pad(between(1, 12))}-${pad(between(1, 28))}`;

/* Emails are unique within the plan, so the same people come out on every run */
const taken = new Set();
const emailOf = (first, last) => {
  const base = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "");
  let email = `${base}@${args.domain}`;
  for (let n = 2; taken.has(email); n++) email = `${base}${n}@${args.domain}`;
  taken.add(email);
  return email;
};
let phone = 9_880_000_000;
const nextPhone = () => `+91 ${String(phone++).replace(/(\d{5})(\d{5})/, "$1 $2")}`;

/* Run `work` over `items`, `limit` at a time */
const pool = async (items, limit, work) => {
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) await work(items[next++]);
    })
  );
};

/* ---------- run ---------- */
await startInfrastructure({ runJobs: false });
let server;
try {
  const tenant = await findTenantByCode(args.school);
  if (!tenant) fail(`no school with code ${args.school}`);
  const inSchool = work => runInTenant(tenant.id, work);

  const [admin] = await inSchool(() =>
    postgres.db.select().from(users).where(eq(users.role, "ADMIN")).orderBy(asc(users.createdAt)).limit(1)
  );
  if (!admin) fail(`${args.school} has no administrator to act as`);

  const { default: app } = await import("../../src/app.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

  /* Acts as the school's administrator: a token for a session of this run only */
  const sessionId = randomUUID();
  const inYear = {};
  const send = async (method, path, body) => {
    const token = signAccessToken({ userId: admin.id, tenantId: tenant.id, role: admin.role, sessionId });
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        ...(inYear.id && { "x-academic-year-id": inYear.id })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      const details = (json?.error?.details ?? []).map(d => `${d.field} ${d.message}`).join("; ");
      throw new Error(
        `${method} ${path} -> ${response.status}: ${json?.message ?? response.statusText}${details ? ` (${details})` : ""}`
      );
    }
    return json.data;
  };
  const get = path => send("GET", path);
  const post = (path, body) => send("POST", path, body);
  const listAll = async path => {
    const rows = [];
    for (let page = 1; ; page++) {
      const token = signAccessToken({ userId: admin.id, tenantId: tenant.id, role: admin.role, sessionId });
      const response = await fetch(`${baseUrl}${path}${path.includes("?") ? "&" : "?"}limit=100&page=${page}`, {
        headers: { authorization: `Bearer ${token}`, ...(inYear.id && { "x-academic-year-id": inYear.id }) }
      });
      const json = await response.json();
      if (!response.ok) throw new Error(`GET ${path} -> ${response.status}: ${json?.message}`);
      rows.push(...json.data);
      if (page >= (json.meta?.totalPages ?? 1)) return rows;
    }
  };

  console.log(`${tenant.name} (${tenant.code}), acting as ${admin.firstName} ${admin.lastName}`);

  /* ===== the academic year: the one after the latest, made current ===== */
  const MARK = "Opened by data migration 0001";
  const [latest] = await inSchool(() =>
    postgres.db
      .select()
      .from(academicYears)
      .where(eq(academicYears.isActive, true))
      .orderBy(sql`${academicYears.startDate} desc`)
      .limit(1)
  );
  if (!latest) fail("the school has no academic year to follow");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tenant.timezone ?? "Asia/Kolkata" }).format(new Date());
  let year;
  if (latest.description === MARK) {
    year = latest;
    console.log(`· academic year ${year.yearName} already opened by this migration`);
  } else {
    const startDate = addYears(latest.startDate, 1);
    const endDate = addDays(addYears(addDays(latest.endDate, 1), 1), -1);
    if (!(startDate <= today && today <= endDate))
      fail(`the next year (${startDate} to ${endDate}) would not include today (${today})`);
    year = await post("/academics/academic-years", {
      startDate,
      endDate,
      isCurrent: true,
      weeklyOffDays: latest.weeklyOffDays ?? [0],
      ...(latest.offSaturdays?.length && { offSaturdays: latest.offSaturdays }),
      description: MARK
    });
    console.log(`· academic year ${year.yearName} (${year.startDate} to ${year.endDate}), now current`);
  }
  if (!year.isCurrent) await send("PATCH", `/academics/academic-years/${year.id}`, { isCurrent: true });
  inYear.id = year.id;

  /* ===== every class level ===== */
  const existingClasses = await listAll("/academics/classes");
  const missing = CLASS_LEVELS.filter(l => !existingClasses.some(c => c.level === l.level));
  if (missing.length) await post("/academics/classes/bulk", { classes: missing.map(l => ({ level: l.level })) });
  const classes = (await listAll("/academics/classes"))
    .filter(c => c.level)
    .sort((a, b) => a.classOrder - b.classOrder);
  console.log(`· ${classes.length} classes (${missing.length} new)`);

  /* Each class's stage in the school's subject codes */
  const slots = new Map((await get("/academics/subject-codes/slots")).map(s => [s.classId, s.stage]));

  /* ===== sections: 3 or 4 a class in the new year ===== */
  const plannedSections = [];
  for (const klass of classes) {
    const count = between(3, 4);
    for (const name of ["A", "B", "C", "D"].slice(0, count)) plannedSections.push({ klass, name });
  }
  const yearSections = await listAll("/academics/sections");
  const toCreate = plannedSections.filter(
    p => !yearSections.some(s => s.classId === p.klass.id && s.sectionName === p.name)
  );
  if (toCreate.length)
    await post("/academics/sections/bulk", {
      sections: toCreate.map(p => ({ classId: p.klass.id, sectionName: p.name, capacity: 40 }))
    });
  const sectionRows = await listAll("/academics/sections");
  const sections = plannedSections.map(p => ({
    ...p,
    stage: slots.get(p.klass.id),
    id: sectionRows.find(s => s.classId === p.klass.id && s.sectionName === p.name).id
  }));
  console.log(`· ${sections.length} sections in ${year.yearName} (${toCreate.length} new)`);

  /* ===== the plan of people (all of it drawn first, so every run draws the same) ===== */
  const yearStart = year.startDate;
  const ageOf = klass => {
    const level = CLASS_LEVELS.find(l => l.level === klass.level);
    return level.classOrder + 2; /* Nursery 3 … Class 12 17 */
  };
  const students = [];
  for (const section of sections) {
    const count = between(20, 30);
    for (let i = 0; i < count; i++) {
      const last = pick(SURNAMES);
      const gender = rand() < 0.5 ? "MALE" : "FEMALE";
      const first = pick(gender === "MALE" ? MALE : FEMALE);
      const father = pick(MALE);
      const mother = pick(FEMALE);
      const address = `${between(1, 250)}, ${pick(["MG Road", "Anna Nagar", "Jayanagar", "Indiranagar", "Koramangala", "T Nagar", "Banjara Hills", "Salt Lake", "Andheri West", "Kothrud"])}, ${pick(["Bengaluru", "Chennai", "Hyderabad", "Kolkata", "Mumbai", "Pune"])}`;
      const fresh = section.klass.level === "NURSERY" || rand() < 0.12;
      const age = ageOf(section.klass);
      const income = between(4, 40) * 100_000;
      const adult = (firstName, sex, relation, primary) => ({
        user: { firstName, lastName: last, email: emailOf(firstName, last), phone: nextPhone(), gender: sex, address },
        profile: { occupation: pick(JOBS), annualIncome: income },
        relation,
        isPrimaryContact: primary
      });
      students.push({
        section,
        body: {
          user: {
            firstName: first,
            lastName: last,
            email: emailOf(first, last),
            gender,
            dob: dobFor(yearStart, age),
            address
          },
          profile: {
            admissionDate: fresh
              ? addDays(yearStart, -between(5, 40))
              : `${Number(yearStart.slice(0, 4)) - between(1, Math.max(1, age - 3))}-${pad(between(2, 3))}-${pad(between(1, 28))}`,
            bloodGroup: pick(["A+", "B+", "O+", "AB+", "O-", "B-", "A-"])
          },
          parents: [adult(father, "MALE", "FATHER", false), adult(mother, "FEMALE", "MOTHER", true)],
          enrollment: { academicYearId: year.id, sectionId: section.id, admissionType: fresh ? "NEW" : "PROMOTED" }
        }
      });
    }
  }

  /* Teachers: sections + 10, shared out by each stage's sections (largest remainder) */
  const teacherCount = sections.length + 10;
  const stages = [...new Set(sections.map(s => s.stage ?? 9))].sort();
  const stageSections = Object.fromEntries(stages.map(st => [st, sections.filter(s => (s.stage ?? 9) === st).length]));
  const shares = stages.map(st => ({ st, exact: (stageSections[st] / sections.length) * teacherCount }));
  for (const share of shares) share.count = Math.floor(share.exact);
  let left = teacherCount - shares.reduce((sum, s) => sum + s.count, 0);
  for (const share of [...shares].sort((a, b) => b.exact - b.count - (a.exact - a.count)))
    if (left-- > 0) share.count++;
  const teachers = [];
  for (const { st, count } of shares) {
    const subjects = STAGE_SUBJECTS[st] ?? OTHER_SUBJECTS;
    for (let i = 0; i < count; i++) {
      const subject = subjects[i % subjects.length];
      const gender = rand() < (st <= 2 ? 0.8 : 0.55) ? "FEMALE" : "MALE";
      const first = pick(gender === "MALE" ? MALE : FEMALE);
      const surname = pick(SURNAMES);
      const experience = between(2, 25);
      teachers.push({
        stage: st,
        subject,
        body: {
          user: {
            firstName: first,
            lastName: `${surname} S${st} (${subject})`,
            email: emailOf(first, surname),
            phone: nextPhone(),
            gender,
            dob: dobFor(yearStart, 24 + experience + between(0, 4))
          },
          profile: {
            qualification: QUALIFICATION[st] ?? "B.Ed",
            joiningDate: `${Number(yearStart.slice(0, 4)) - between(0, Math.min(experience, 12))}-${pad(between(4, 6))}-${pad(between(1, 28))}`,
            experienceYears: experience,
            employmentType: "FULL_TIME"
          }
        }
      });
    }
  }

  /* What a previous run already made */
  const existing = new Set(
    (
      await inSchool(() =>
        postgres.db
          .select({ email: users.email })
          .from(users)
          .where(like(users.email, `%@${args.domain}`))
      )
    ).map(u => u.email)
  );

  /* ===== teachers ===== */
  const newTeachers = teachers.filter(t => !existing.has(t.body.user.email));
  for (const t of newTeachers) await post("/users/teachers", t.body);
  console.log(
    `· ${teachers.length} teachers (${newTeachers.length} new): ${shares.map(s => `stage ${s.st} ${s.count}`).join(", ")}`
  );

  /* ===== students with their parents ===== */
  const newStudents = students.filter(s => !existing.has(s.body.user.email));
  console.log(`· ${students.length} students with ${students.length * 2} parents (${newStudents.length} to admit)…`);
  let done = 0;
  const started = Date.now();
  await pool(newStudents, Math.max(1, Number(args.concurrency) || 1), async s => {
    await post("/users/students", s.body);
    if (++done % 50 === 0 || done === newStudents.length) {
      const perStudent = (Date.now() - started) / done;
      console.log(
        `  ${done}/${newStudents.length} admitted, about ${Math.round(((newStudents.length - done) * perStudent) / 60_000)} min left`
      );
    }
  });

  /* ===== one password for every seeded account (invitations would need an inbox) ===== */
  const passwordHash = await hashPassword(args.password);
  const updated = await inSchool(() =>
    postgres.db
      .update(users)
      .set({ passwordHash })
      .where(and(like(users.email, `%@${args.domain}`), isNull(users.passwordHash)))
      .returning({ id: users.id })
  );
  const { accountDirectory } = await import("../../src/modules/users/accounts/index.js");
  await accountDirectory.rebuild(tenant.id);
  console.log(`· password set on ${updated.length} accounts; sign-in directory rebuilt`);

  console.log("\nSections per class:");
  for (const klass of classes)
    console.log(
      `  ${klass.className.padEnd(9)} stage ${slots.get(klass.id) ?? "-"}  ${sections
        .filter(s => s.klass.id === klass.id)
        .map(s => `${s.name}:${students.filter(st => st.section === s).length}`)
        .join("  ")}`
    );
  console.log("\nTeachers by stage and subject:");
  for (const { st } of shares) {
    const tally = {};
    for (const t of teachers.filter(t => t.stage === st)) tally[t.subject] = (tally[t.subject] ?? 0) + 1;
    console.log(
      `  S${st}: ${Object.entries(tally)
        .map(([subject, n]) => `${subject} ${n}`)
        .join(", ")}`
    );
  }
  console.log(`\nDone. Every seeded account (…@${args.domain}) signs in with ${args.password}.`);
} finally {
  server?.close();
  await stopInfrastructure();
}
