import { FORMAT_CSS, FORMAT_LETTERHEAD } from "../../certificates/index.js";

/* The report card a school starts with (version 1 of its REPORT_CARD format): the
   certificates' house style and letterhead, with the marks table. The columns follow the
   result policy through the report.show* flags; a weighted card (assessment scheme) has
   a column per exam instead of marks. Long cards run on to a second page.
   A function, not a constant: certificates imports this module's index too. */

const CELLS = `{{#if report.isScheme}}{{#each exams}}<td>{{percentage}}</td>{{/each}}<td>{{percentage}}</td>{{/if}}
          {{#if report.showMarks}}<td>{{maxMarks}}</td><td>{{passMarks}}</td><td>{{marks}}</td><td>{{percentage}}</td>{{/if}}
          {{#if report.showResultOnly}}<td>{{result}}</td>{{/if}}
          {{#if report.showGrades}}<td>{{grade}}</td>{{/if}}
          {{#if report.showGradePoints}}<td>{{gradePoint}}</td>{{/if}}`;

const HTML = () => `<div class="page"><div class="frame">
  ${FORMAT_LETTERHEAD}
  <h2><span>{{report.title}}</span></h2>
  <p class="exam">{{report.name}}{{#if class.academicYear}} · {{class.academicYear}}{{/if}}</p>
  <table class="student">
    <tr><td class="label">Student</td><td class="value">{{student.name}}</td><td class="label">Admission no.</td><td class="value">{{student.admissionNumber}}</td></tr>
    <tr><td class="label">Class</td><td class="value">{{class.classSection}}</td><td class="label">Roll no.</td><td class="value">{{student.rollNumber}}</td></tr>
  </table>
  <table class="marks">
    <thead>
      <tr>
        <th class="subject">Subject</th>
        {{#if report.isScheme}}{{#each report.exams}}<th>{{name}}<br><small>{{weight}}%</small></th>{{/each}}<th>Weighted %</th>{{/if}}
        {{#if report.showMarks}}<th>Max</th><th>Pass</th><th>Marks</th><th>%</th>{{/if}}
        {{#if report.showResultOnly}}<th>Result</th>{{/if}}
        {{#if report.showGrades}}<th>Grade</th>{{/if}}
        {{#if report.showGradePoints}}<th>GP</th>{{/if}}
      </tr>
    </thead>
    <tbody>
      {{#each report.subjects}}
        <tr>
          <td class="subject">{{name}}</td>
          ${CELLS}
        </tr>
        {{#each components}}
        <tr class="part">
          <td class="subject">{{name}}</td>
          ${CELLS}
        </tr>
        {{/each}}
      {{/each}}
      {{#if report.showMarks}}
        <tr class="total">
          <td class="subject">Total</td>
          <td>{{report.total.maxMarks}}</td><td></td><td>{{report.total.marks}}</td><td>{{report.total.percentage}}</td>
          {{#if report.showGrades}}<td>{{report.total.grade}}</td>{{/if}}
          {{#if report.showGradePoints}}<td></td>{{/if}}
        </tr>
      {{/if}}
    </tbody>
  </table>
  {{#if report.coScholastic}}
  <table class="marks co">
    <thead><tr><th class="subject">Co-scholastic</th><th>Grade</th><th class="subject">Descriptor</th></tr></thead>
    <tbody>
      {{#each report.coScholastic}}<tr><td class="subject">{{name}}</td><td>{{grade}}</td><td class="subject">{{descriptor}}</td></tr>{{/each}}
    </tbody>
  </table>
  {{/if}}
  <div class="summary">
    {{#if report.percentage}}<div><span>Percentage</span><strong>{{report.percentage}}%</strong></div>{{/if}}
    {{#if report.grade}}<div><span>Grade</span><strong>{{report.grade}}</strong></div>{{/if}}
    {{#if report.gpa}}<div><span>GPA</span><strong>{{report.gpa}}</strong></div>{{/if}}
    {{#if report.cgpa}}<div><span>CGPA</span><strong>{{report.cgpa}}</strong></div>{{/if}}
    {{#if report.rank}}<div><span>Rank in section</span><strong>{{report.rank}} of {{report.sectionSize}}</strong></div>{{/if}}
    {{#if report.classRank}}<div><span>Rank in class</span><strong>{{report.classRank}} of {{report.classSize}}</strong></div>{{/if}}
    {{#if report.sectionAverage}}<div><span>Section average</span><strong>{{report.sectionAverage}}%</strong></div>{{/if}}
    <div class="result result-{{report.resultCode}}"><span>Result</span><strong>{{report.result}}</strong>{{#if report.compartmentIn}}<em>in {{report.compartmentIn}}</em>{{/if}}</div>
  </div>
  {{#if report.graceTotal}}<p class="note">Grace marks: {{report.graceTotal}} ({{report.graceDetails}})</p>{{/if}}
  {{#if report.policyName}}<p class="note">Assessed under: {{report.policyName}}</p>{{/if}}
  {{#if report.footnote}}<p class="note">{{report.footnote}}</p>{{/if}}
  <div class="signatures">
    <div>Date: {{report.issueDate}}</div>
    <div><div class="line">Class teacher</div></div>
    <div><div class="line">Parent</div></div>
    <div><div class="line">Principal</div></div>
  </div>
</div></div>`;

const CSS = () => `${FORMAT_CSS}
.page { height: auto; min-height: 297mm; }
.frame { height: auto; min-height: 269mm; padding: 8mm 10mm; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.letterhead { padding-bottom: 3mm; }
.letterhead img { width: 18mm; height: 18mm; }
.letterhead h1 { font-size: 19pt; }
h2 { margin: 5mm 0 1mm; font-size: 15pt; }
.exam { text-align: center; margin: 0 0 4mm; font-size: 11pt; color: #444; }
.student { width: 100%; border-collapse: collapse; font-size: 10pt; line-height: 1.35; margin-bottom: 4mm; }
.student td { padding: 1mm 2mm; border-bottom: 0.5pt solid #c8ccd4; }
.student .label { width: 17%; color: #555; }
.student .value { font-weight: bold; }
.marks { width: 100%; border-collapse: collapse; font-size: 10pt; line-height: 1.3; }
.marks th { background: #23408e; color: #fff; padding: 1.6mm 2mm; font-size: 9pt; text-align: center; }
.marks th small { font-weight: normal; }
.marks td { padding: 1.3mm 2mm; border-bottom: 0.5pt solid #c8ccd4; text-align: center; }
.marks .subject { text-align: left; }
.marks tr { break-inside: avoid; }
.marks tr.part td { padding-top: 0.6mm; padding-bottom: 0.6mm; font-size: 9pt; color: #555; }
.marks tr.part td.subject { padding-left: 7mm; }
.marks tr.total td { font-weight: bold; border-top: 1pt solid #23408e; border-bottom: 1pt solid #23408e; }
.co { margin-top: 5mm; }
.summary { display: flex; flex-wrap: wrap; gap: 3mm; margin-top: 5mm; break-inside: avoid; }
.summary div { flex: 1 1 28mm; border: 0.8pt solid #c8ccd4; border-radius: 2mm; padding: 2mm 3mm; text-align: center; line-height: 1.3; }
.summary span { display: block; font-size: 8pt; color: #555; text-transform: uppercase; letter-spacing: 0.5pt; }
.summary strong { font-size: 13pt; }
.summary em { display: block; font-size: 9pt; }
.summary .result { border-color: #23408e; }
.result-fail strong, .result-compartment strong { color: #b42318; }
.note { font-size: 9pt; font-style: italic; margin: 3mm 0 0; color: #444; }
.signatures { padding-top: 14mm; break-inside: avoid; }
.signatures div { min-width: 34mm; }`;

export const defaultReportCardFormat = () => ({ name: "Report card", html: HTML(), css: CSS() });
