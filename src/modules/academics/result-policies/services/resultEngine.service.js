import { gradingService } from "../../grading/index.js";
import { roundTo } from "../../shared/utils/rounding.util.js";

/* Pure result computation: a policy + grade scales + one student's papers and marks
   -> subject lines, totals, grade, GPA, grace and result. No database access.

   Subjects arrive grouped: [{ subject, papers: [{ id, displayCode, component, gradingType,
   maxMarks, passMarks, mark }] }], where mark is null (not recorded) or
   { marksObtained, isAbsent, absenceReason, grade, gradeIsManual, remarks }. */

/* Today's rules, used when a school has no policy (D-09) */
export const BUILT_IN_POLICY = Object.freeze({
  id: null,
  name: "Standard (built-in)",
  gradingMode: "GRADES",
  gradeScaleId: null,
  coScholasticScaleId: null,
  gpaScale: null,
  usePaperPassMarks: true,
  subjectMinPercent: null,
  requirePassingGrade: true,
  requireComponentPass: true,
  overallMinPercent: null,
  maxCompartmentSubjects: 0,
  graceMaxPerSubject: 0,
  graceMaxTotal: 0,
  graceCountsInTotal: true,
  bestOfSubjects: null,
  absentTreatment: "ZERO_FAIL",
  medicalTreatment: "ZERO_FAIL",
  exemptTreatment: "EXCLUDE",
  rankingMethod: "COMPETITION",
  rankScope: "SECTION",
  rankFailedStudents: true,
  showRankToStudents: true,
  percentageDecimals: 2,
  gpaDecimals: 2,
  roundingMode: "HALF_UP",
  subjects: []
});

export const POLICY_FIELDS = Object.keys(BUILT_IN_POLICY).filter(key => !["id", "name", "subjects"].includes(key));

const OUTCOME_ORDER = { FAIL: 1, COMPARTMENT: 2, PASS: 3 };
const sum = values => values.reduce((total, value) => total + value, 0);
const marks2 = value => Math.round(value * 100) / 100;
/* Whole grace marks: 1.2 short -> 2 */
const wholeMarks = need => Math.max(0, Math.ceil(need - 1e-9));

const usesBands = policy => policy.gradingMode === "GRADES" || policy.gradingMode === "GPA";

const treatmentOf = (policy, reason) =>
  ({ ABSENT: policy.absentTreatment, MEDICAL: policy.medicalTreatment, EXEMPT: policy.exemptTreatment })[
    reason ?? "ABSENT"
  ];

/* Exact percentage: pass/fail and grade bands are decided on this, never on a rounded figure */
const exactPercent = (obtained, max) => (max > 0 ? (obtained / max) * 100 : null);

/* For display only */
const percentOf = (policy, obtained, max) =>
  max > 0 ? roundTo(exactPercent(obtained, max), policy.percentageDecimals, policy.roundingMode) : null;

/* A policy row (+ subject rules) -> the config the engine reads. Rules are keyed by subject id. */
export const toConfig = policy => {
  const config = { ...BUILT_IN_POLICY };
  for (const key of POLICY_FIELDS) if (policy?.[key] !== undefined && policy[key] !== null) config[key] = policy[key];
  for (const key of ["gradeScaleId", "coScholasticScaleId", "gpaScale", "subjectMinPercent", "overallMinPercent"]) {
    config[key] = policy?.[key] ?? null;
  }
  config.bestOfSubjects = policy?.bestOfSubjects ?? null;
  config.id = policy?.id ?? null;
  config.name = policy?.name ?? BUILT_IN_POLICY.name;
  config.subjects = (policy?.subjects ?? []).map(rule => ({
    subjectId: rule.subjectId,
    category: rule.category ?? "SCHOLASTIC",
    credits: rule.credits ?? 1,
    isMandatory: rule.isMandatory ?? false,
    minPercent: rule.minPercent ?? null
  }));
  config.rules = new Map(config.subjects.map(rule => [rule.subjectId, rule]));
  return config;
};

/* Which parts of a result a report card shows */
export const displayOf = policy => ({
  marks: policy.gradingMode !== "PASS_FAIL",
  percentage: policy.gradingMode !== "PASS_FAIL",
  grades: usesBands(policy),
  gradePoints: policy.gradingMode === "GPA",
  rank: policy.rankingMethod !== "NONE",
  rankToStudents: policy.rankingMethod !== "NONE" && policy.showRankToStudents,
  sectionRank: policy.rankingMethod !== "NONE" && policy.rankScope !== "CLASS",
  classRank: policy.rankingMethod !== "NONE" && policy.rankScope !== "SECTION"
});

/* One paper of a subject for one student */
const componentOf = (policy, paper) => {
  const base = {
    paperId: paper.id,
    displayCode: paper.displayCode,
    component: paper.component ?? null,
    maxMarks: paper.maxMarks,
    passMarks: paper.passMarks
  };
  const mark = paper.mark;
  if (!mark) return { ...base, status: "NOT_RECORDED", marksObtained: null };
  if (mark.isAbsent) {
    const reason = mark.absenceReason ?? "ABSENT";
    return {
      ...base,
      status: reason === "EXEMPT" ? "EXEMPT" : "ABSENT",
      absenceReason: reason,
      marksObtained: null,
      excluded: treatmentOf(policy, reason) === "EXCLUDE"
    };
  }
  return {
    ...base,
    status: paper.gradingType === "GRADE" ? "GRADED" : "PRESENT",
    marksObtained: mark.marksObtained ?? null,
    grade: paper.gradingType === "GRADE" || mark.gradeIsManual ? (mark.grade ?? null) : null,
    remarks: mark.remarks ?? null
  };
};

const awardedOf = (component, grace) => (component.marksObtained ?? 0) + (grace.components[component.paperId] ?? 0);

/* Pass/fail of a marks subject with some grace applied -> { passed, awarded, percentage, band } */
const judge = (ctx, line, counted, grace) => {
  const { policy, scale } = ctx;
  const awarded = marks2(sum(counted.map(c => awardedOf(c, grace))) + grace.extra);
  const percentage = percentOf(policy, awarded, line.maxMarks);
  const exact = exactPercent(awarded, line.maxMarks);
  const band = usesBands(policy) ? gradingService.gradeFor(scale, exact) : null;

  let passed = !line.forcedFail;
  if (policy.usePaperPassMarks) {
    const withPass = counted.filter(c => c.passMarks !== null && c.passMarks !== undefined);
    if (counted.length > 1 && policy.requireComponentPass) {
      passed &&= withPass.every(c => awardedOf(c, grace) >= c.passMarks);
    } else if (withPass.length) {
      passed &&= awarded >= sum(withPass.map(c => c.passMarks));
    }
  }
  const minPercent = line.minPercent ?? policy.subjectMinPercent;
  if (minPercent !== null && minPercent !== undefined) passed &&= exact >= minPercent;
  if (usesBands(policy) && policy.requirePassingGrade && band) passed &&= band.isPassing;
  return { passed, awarded, percentage, band };
};

const NO_GRACE = Object.freeze({ components: {}, extra: 0, total: 0 });

/* Smallest whole-mark grace that passes a failed subject, within the per-subject limit, or null */
const graceFor = (ctx, line, counted) => {
  const { policy, scale } = ctx;
  if (!(policy.graceMaxPerSubject > 0) || line.forcedFail || line.status !== "PRESENT") return null;

  const components = {};
  const perComponent = policy.usePaperPassMarks && counted.length > 1 && policy.requireComponentPass;
  if (perComponent) {
    for (const c of counted) {
      const need = c.passMarks === null || c.passMarks === undefined ? 0 : wholeMarks(c.passMarks - c.marksObtained);
      if (need > 0) components[c.paperId] = need;
    }
  }
  const awardedNow = sum(counted.map(c => awardedOf(c, { components })));
  const needs = [0];
  if (policy.usePaperPassMarks && !perComponent) {
    const passTotal = sum(counted.filter(c => c.passMarks !== null && c.passMarks !== undefined).map(c => c.passMarks));
    needs.push(passTotal - awardedNow);
  }
  const minPercent = line.minPercent ?? policy.subjectMinPercent;
  if (minPercent !== null && minPercent !== undefined) needs.push((minPercent * line.maxMarks) / 100 - awardedNow);
  const lowestPassing = usesBands(policy) && policy.requirePassingGrade && gradingService.lowestPassingPercent(scale);
  if (lowestPassing) needs.push((lowestPassing * line.maxMarks) / 100 - awardedNow);

  const grace = { components, extra: wholeMarks(Math.max(...needs)) };
  const total = () => sum(Object.values(grace.components)) + grace.extra;
  /* Rounding of percentages can leave it a fraction short: add whole marks until it passes */
  while (!judge(ctx, line, counted, grace).passed && total() <= policy.graceMaxPerSubject) grace.extra += 1;
  if (total() > policy.graceMaxPerSubject || awardedNow + grace.extra > line.maxMarks) return null;
  return { ...grace, total: total() };
};

/* A subject's line with a grace applied (NO_GRACE for none) */
const withGrace = (ctx, line, grace) => {
  const { policy } = ctx;
  const counted = line.parts.filter(c => !c.excluded);
  const verdict = judge(ctx, line, counted, grace);
  const manualGrade = line.parts.length === 1 ? line.parts[0].grade : null;
  return {
    ...line,
    graceMarks: grace.total,
    marksAwarded: line.marksObtained === null ? null : verdict.awarded,
    percentage: line.status === "ABSENT" ? 0 : verdict.percentage,
    grade: line.status === "ABSENT" ? "AB" : usesBands(policy) ? (manualGrade ?? verdict.band?.grade ?? null) : null,
    gradePoint: policy.gradingMode === "GPA" ? (verdict.band?.gradePoint ?? null) : null,
    remark: usesBands(policy) ? (verdict.band?.remark ?? null) : null,
    passed: verdict.passed,
    components: line.components?.map(c => ({ ...c, graceMarks: grace.components[c.paperId] ?? 0 }))
  };
};

/* A scholastic subject (counts toward results), before grace */
const scholasticLine = (ctx, group) => {
  const { policy } = ctx;
  const rule = policy.rules.get(group.subject.id);
  const parts = group.papers.map(paper => componentOf(policy, paper));
  const split = parts.length > 1 || Boolean(parts[0].component);
  const line = {
    paperId: parts[0].paperId,
    subject: group.subject,
    category: "SCHOLASTIC",
    credits: rule?.credits ?? 1,
    isMandatory: rule?.isMandatory ?? false,
    minPercent: rule?.minPercent ?? null,
    maxMarks: sum(parts.map(c => c.maxMarks ?? 0)),
    passMarks: parts.some(c => c.passMarks !== null && c.passMarks !== undefined)
      ? sum(parts.map(c => c.passMarks ?? 0))
      : null,
    marksObtained: null,
    graceMarks: 0,
    marksAwarded: null,
    percentage: null,
    grade: null,
    gradePoint: null,
    remark: null,
    status: "PRESENT",
    passed: false,
    counted: true,
    excluded: false,
    components: split ? parts.map(({ excluded: _excluded, ...c }) => c) : undefined,
    parts
  };

  if (parts.some(c => c.status === "NOT_RECORDED")) return { ...line, status: "NOT_RECORDED" };

  const counted = parts.filter(c => !c.excluded);
  if (!counted.length) {
    const exempt = parts.every(c => c.status === "EXEMPT");
    return {
      ...line,
      status: exempt ? "EXEMPT" : "ABSENT",
      absenceReason: parts[0].absenceReason,
      grade: exempt ? "EX" : "AB",
      passed: null,
      counted: false,
      excluded: true
    };
  }

  const present = counted.filter(c => c.status === "PRESENT");
  const absent = counted.filter(c => c.status !== "PRESENT");
  const evaluated = {
    ...line,
    maxMarks: sum(counted.map(c => c.maxMarks)),
    passMarks: counted.some(c => c.passMarks !== null && c.passMarks !== undefined)
      ? sum(counted.map(c => c.passMarks ?? 0))
      : null,
    marksObtained: present.length ? marks2(sum(present.map(c => c.marksObtained))) : null,
    status: present.length ? "PRESENT" : "ABSENT",
    absenceReason: present.length ? undefined : absent[0].absenceReason,
    /* An absence counted as zero fails the subject outright (no grace) */
    forcedFail: absent.length > 0
  };
  return withGrace(ctx, evaluated, NO_GRACE);
};

/* A co-scholastic or grade-only subject: shown with its grade and descriptor, never counted */
const coScholasticLine = (ctx, group) => {
  const { policy, coScale } = ctx;
  const parts = group.papers.map(paper => componentOf(policy, paper));
  const graded = parts.every(c => c.status === "GRADED" || c.status === "NOT_RECORDED" || c.marksObtained === null);
  const status = parts.some(c => c.status === "NOT_RECORDED")
    ? "NOT_RECORDED"
    : parts.every(c => c.status === "ABSENT" || c.status === "EXEMPT")
      ? parts[0].status
      : graded && group.papers.every(p => p.gradingType === "GRADE")
        ? "GRADED"
        : "PRESENT";

  const line = {
    paperId: parts[0].paperId,
    subject: group.subject,
    category: "CO_SCHOLASTIC",
    status,
    grade: null,
    remark: null,
    teacherRemarks:
      parts
        .map(c => c.remarks)
        .filter(Boolean)
        .join("; ") || null,
    counted: false,
    components: parts.length > 1 ? parts.map(({ excluded: _excluded, ...c }) => c) : undefined
  };
  if (status === "NOT_RECORDED") return line;
  if (status === "ABSENT" || status === "EXEMPT") return { ...line, grade: status === "EXEMPT" ? "EX" : "AB" };

  if (group.papers.every(p => p.gradingType === "GRADE")) {
    const grade = parts.length === 1 ? parts[0].grade : null;
    return { ...line, grade, remark: gradingService.bandForGrade(coScale, grade)?.remark ?? null };
  }
  const maxMarks = sum(parts.map(c => c.maxMarks ?? 0));
  const marksObtained = marks2(sum(parts.map(c => c.marksObtained ?? 0)));
  const percentage = percentOf(policy, marksObtained, maxMarks);
  const band = gradingService.gradeFor(coScale, percentage);
  const manual = parts.length === 1 ? parts[0].grade : null;
  return {
    ...line,
    maxMarks,
    marksObtained,
    percentage,
    grade: manual ?? band?.grade ?? null,
    remark: (manual ? gradingService.bandForGrade(coScale, manual) : band)?.remark ?? null
  };
};

const isCoScholastic = (policy, group) =>
  policy.rules.get(group.subject.id)?.category === "CO_SCHOLASTIC" ||
  group.papers.every(p => p.gradingType === "GRADE");

/* Best N subjects count; mandatory ones always. Passed subjects are preferred, then higher %. */
const selectCounted = (policy, lines) => {
  const eligible = lines.filter(line => !line.excluded && line.status !== "NOT_RECORDED");
  const n = policy.bestOfSubjects;
  if (!n || eligible.length <= n) return lines.map(line => ({ ...line, counted: !line.excluded }));

  const mandatory = eligible.filter(line => line.isMandatory);
  const others = eligible
    .filter(line => !line.isMandatory)
    .sort(
      (a, b) =>
        Number(b.passed) - Number(a.passed) ||
        (b.percentage ?? 0) - (a.percentage ?? 0) ||
        a.subject.subjectCode.localeCompare(b.subject.subjectCode)
    );
  const chosen = new Set([...mandatory, ...others.slice(0, Math.max(0, n - mandatory.length))].map(l => l.subject.id));
  return lines.map(line => ({
    ...line,
    counted: line.status === "NOT_RECORDED" || chosen.has(line.subject.id)
  }));
};

const outcomeOf = (policy, lines, percentage, coScholastic) => {
  if (!lines.length) {
    if (!coScholastic.length || coScholastic.some(l => l.status === "NOT_RECORDED")) return "INCOMPLETE";
    return "PASS";
  }
  if (lines.some(line => line.status === "NOT_RECORDED")) return "INCOMPLETE";
  const counted = lines.filter(line => line.counted);
  if (!counted.length) return "INCOMPLETE";
  const failed = counted.filter(line => line.passed === false).length;
  const belowOverall =
    policy.overallMinPercent !== null && percentage !== null && percentage < policy.overallMinPercent;
  if (!failed && !belowOverall) return "PASS";
  if (!belowOverall && policy.maxCompartmentSubjects > 0 && failed <= policy.maxCompartmentSubjects) {
    return "COMPARTMENT";
  }
  return "FAIL";
};

const totalsOf = (ctx, lines) => {
  const { policy, scale } = ctx;
  const counted = lines.filter(line => line.counted);
  const recorded = counted.filter(line => line.status !== "NOT_RECORDED");
  const totalMax = marks2(sum(counted.map(line => line.maxMarks)));
  const totalObtained = marks2(
    sum(counted.map(line => (policy.graceCountsInTotal ? (line.marksAwarded ?? 0) : (line.marksObtained ?? 0))))
  );
  const percentage = recorded.length && totalMax ? percentOf(policy, totalObtained, totalMax) : null;
  const overall = usesBands(policy)
    ? gradingService.gradeFor(scale, percentage === null ? null : exactPercent(totalObtained, totalMax))
    : null;

  let gpa = null;
  if (policy.gradingMode === "GPA") {
    const pointed = counted.filter(line => line.gradePoint !== null && line.gradePoint !== undefined);
    const credits = sum(pointed.map(line => line.credits));
    if (credits > 0) {
      gpa = roundTo(
        sum(pointed.map(line => line.credits * line.gradePoint)) / credits,
        policy.gpaDecimals,
        policy.roundingMode
      );
    }
  }
  return {
    totalObtained,
    totalMax,
    percentage,
    grade: overall?.grade ?? null,
    gpa,
    graceTotal: marks2(sum(counted.map(line => line.graceMarks ?? 0)))
  };
};

/* Grace for failed counted subjects, smallest need first, within the total limit */
const applyGrace = (ctx, lines) => {
  const { policy } = ctx;
  const candidates = lines
    .filter(line => line.counted && line.passed === false)
    .map(line => ({
      line,
      grace: graceFor(
        ctx,
        line,
        line.parts.filter(c => !c.excluded)
      )
    }))
    .filter(candidate => candidate.grace)
    .sort((a, b) => a.grace.total - b.grace.total);

  let used = 0;
  const granted = new Map();
  for (const { line, grace } of candidates) {
    if (used + grace.total > policy.graceMaxTotal) continue;
    used += grace.total;
    granted.set(line.subject.id, grace);
  }
  return lines.map(line => (granted.has(line.subject.id) ? withGrace(ctx, line, granted.get(line.subject.id)) : line));
};

const finish = (ctx, lines, coScholastic) => {
  const totals = totalsOf(ctx, lines);
  const exact = totals.percentage === null ? null : exactPercent(totals.totalObtained, totals.totalMax);
  const result = outcomeOf(ctx.policy, lines, exact, coScholastic);
  return { lines, totals, result };
};

const publicLine = ({ parts: _parts, forcedFail: _forcedFail, excluded: _excluded, minPercent: _min, ...line }) => line;

/* One student's result under a policy */
export const evaluateStudent = ({ policy, scale, coScale = scale, subjects }) => {
  const ctx = { policy, scale, coScale };
  const groups = subjects.filter(group => group.papers.length);
  const coScholastic = groups.filter(group => isCoScholastic(policy, group)).map(group => coScholasticLine(ctx, group));
  const initial = selectCounted(
    policy,
    groups.filter(group => !isCoScholastic(policy, group)).map(group => scholasticLine(ctx, group))
  );

  let outcome = finish(ctx, initial, coScholastic);
  if (policy.graceMaxTotal > 0 && (outcome.result === "FAIL" || outcome.result === "COMPARTMENT")) {
    const graced = finish(ctx, selectCounted(policy, applyGrace(ctx, outcome.lines)), coScholastic);
    /* Grace only stands when it improves the result */
    if (OUTCOME_ORDER[graced.result] > OUTCOME_ORDER[outcome.result]) outcome = graced;
  }

  const failed = outcome.lines.filter(line => line.counted && line.passed === false);
  return {
    subjects: outcome.lines.map(publicLine),
    coScholastic,
    ...outcome.totals,
    result: outcome.result,
    failedSubjects: failed.map(line => line.subject),
    compartmentSubjects: outcome.result === "COMPARTMENT" ? failed.map(line => line.subject) : []
  };
};

/* What students are ranked by: GPA in GPA mode, else percentage */
export const rankValue = (policy, row) => (policy.gradingMode === "GPA" ? row.gpa : row.percentage);

/* Ranks rows in place: COMPETITION (1, 2, 2, 4), DENSE (1, 2, 2, 3) or NONE */
export const assignRanks = (policy, rows, field = "rank") => {
  for (const row of rows) row[field] = null;
  if (policy.rankingMethod === "NONE") return rows;
  const ranked = rows
    /* Students with marks still missing are not ranked: a partial total is not comparable */
    .filter(
      row =>
        rankValue(policy, row) !== null &&
        row.result !== "INCOMPLETE" &&
        (policy.rankFailedStudents || row.result !== "FAIL")
    )
    .sort((a, b) => rankValue(policy, b) - rankValue(policy, a));
  ranked.forEach((row, index) => {
    const previous = ranked[index - 1];
    if (previous && rankValue(policy, row) === rankValue(policy, previous)) row[field] = previous[field];
    else row[field] = policy.rankingMethod === "DENSE" ? (previous ? previous[field] + 1 : 1) : index + 1;
  });
  return rows;
};

const average = values => (values.length ? sum(values) / values.length : null);

/* Pass counts, averages and per-subject figures of a set of students */
export const statisticsOf = (policy, students) => {
  const decided = students.filter(s => s.result !== "INCOMPLETE");
  const passed = decided.filter(s => s.result === "PASS").length;
  const compartment = decided.filter(s => s.result === "COMPARTMENT").length;
  /* Averages and the highest figure come from complete results only */
  const percentages = decided.map(s => s.percentage).filter(p => p !== null);
  const gpas = decided.map(s => s.gpa).filter(g => g !== null && g !== undefined);
  const subjectIds = [...new Map(students.flatMap(s => s.subjects).map(line => [line.subject.id, line])).values()];

  return {
    students: students.length,
    appeared: students.filter(s => s.percentage !== null).length,
    passed,
    compartment,
    failed: decided.length - passed - compartment,
    incomplete: students.length - decided.length,
    passPercentage: decided.length ? roundTo((passed / decided.length) * 100, 1) : null,
    averagePercentage: roundTo(average(percentages), policy.percentageDecimals, policy.roundingMode),
    highestPercentage: percentages.length ? Math.max(...percentages) : null,
    averageGpa: policy.gradingMode === "GPA" ? roundTo(average(gpas), policy.gpaDecimals, policy.roundingMode) : null,
    subjects: subjectIds.map(({ paperId, subject }) => {
      const lines = students.map(s => s.subjects.find(line => line.subject.id === subject.id)).filter(Boolean);
      const scores = lines.filter(line => line.status === "PRESENT").map(line => line.marksObtained);
      return {
        paperId,
        subject,
        average: roundTo(average(scores), 2),
        highest: scores.length ? Math.max(...scores) : null,
        lowest: scores.length ? Math.min(...scores) : null,
        passed: lines.filter(line => line.passed).length
      };
    })
  };
};
