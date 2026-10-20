/* The formats a school starts with: saved as version 1 of each type the first time the
   school's formats are read. Each is a body template (htmlTemplate.js placeholders) and
   a stylesheet. The page is A4 with no printer margin: `.page` carries the margins, so
   the screen preview and the PDF look the same. */

const CSS = `@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: "Georgia", "Times New Roman", serif; color: #1a1a1a; font-size: 12.5pt; line-height: 1.6; }
.page { width: 210mm; height: 297mm; padding: 14mm; }
.frame { height: 100%; border: 2.5pt double #23408e; padding: 10mm 12mm; display: flex; flex-direction: column; }
.letterhead { display: flex; align-items: center; gap: 6mm; border-bottom: 1pt solid #23408e; padding-bottom: 4mm; }
.letterhead img { width: 22mm; height: 22mm; object-fit: contain; }
.letterhead .school { flex: 1; text-align: center; }
.letterhead h1 { margin: 0; font-size: 21pt; letter-spacing: 0.5pt; color: #23408e; }
.letterhead p { margin: 1mm 0 0; font-size: 9.5pt; color: #444; }
.letterhead .contact span + span::before { content: "  ·  "; white-space: pre; }
.meta { display: flex; justify-content: space-between; font-size: 10.5pt; margin-top: 5mm; }
h2 { text-align: center; font-size: 16pt; letter-spacing: 2pt; text-transform: uppercase; margin: 9mm 0 7mm; }
h2 span { border-bottom: 1.5pt solid #1a1a1a; padding-bottom: 1mm; }
.body p { text-align: justify; margin: 0 0 5mm; text-indent: 12mm; }
strong { font-weight: bold; }
.signatures { margin-top: auto; display: flex; justify-content: space-between; align-items: flex-end; font-size: 10.5pt; }
.signatures div { text-align: center; min-width: 45mm; }
.signatures .line { border-top: 0.8pt solid #1a1a1a; padding-top: 1.5mm; }
.signatures .seal { min-width: 0; width: 28mm; height: 28mm; border: 0.8pt dashed #999; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #999; font-size: 8pt; }
@media screen {
  html { background: #eef0f3; }
  .page { margin: 16px auto; background: #fff; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15); }
}`;

const LETTERHEAD = `<div class="letterhead">
    {{#if school.logo}}<img src="{{school.logo}}" alt="">{{/if}}
    <div class="school">
      <h1>{{school.name}}</h1>
      <p>{{school.address}}</p>
      <p class="contact">{{#if school.phone}}<span>Phone: {{school.phone}}</span>{{/if}}{{#if school.email}}<span>{{school.email}}</span>{{/if}}{{#if school.udiseCode}}<span>UDISE: {{school.udiseCode}}</span>{{/if}}</p>
    </div>
  </div>`;

const SIGNATURES = `<div class="signatures">
    <div>Date: {{certificate.issueDate}}<br>Place: ____________</div>
    <div class="seal">School seal</div>
    <div><div class="line">Principal</div></div>
  </div>`;

const BONAFIDE = `<div class="page"><div class="frame">
  ${LETTERHEAD}
  <div class="meta"><span>No. {{certificate.serialNumber}}</span><span>Date: {{certificate.issueDate}}</span></div>
  <h2><span>Bonafide Certificate</span></h2>
  <div class="body">
    <p>This is to certify that <strong>{{student.name}}</strong>, {{student.sonDaughter}} of
      <strong>{{parents.parent}}</strong>, is a bonafide student of this school, studying in
      <strong>{{class.classSection}}</strong> in the academic year <strong>{{class.academicYear}}</strong>,
      with admission number <strong>{{student.admissionNumber}}</strong>.</p>
    <p>According to the school's admission register, {{student.hisHer}} date of birth is
      <strong>{{student.dobLong}}</strong> ({{student.dobInWords}}).</p>
    <p>This certificate is issued at the request of the parent for the purpose of
      <strong>{{certificate.purpose}}</strong>.</p>
    {{#if certificate.remarks}}<p>{{certificate.remarks}}</p>{{/if}}
  </div>
  ${SIGNATURES}
</div></div>`;

const CHARACTER = `<div class="page"><div class="frame">
  ${LETTERHEAD}
  <div class="meta"><span>No. {{certificate.serialNumber}}</span><span>Date: {{certificate.issueDate}}</span></div>
  <h2><span>Character Certificate</span></h2>
  <div class="body">
    <p>This is to certify that <strong>{{student.name}}</strong>, {{student.sonDaughter}} of
      <strong>{{parents.parent}}</strong>, admission number <strong>{{student.admissionNumber}}</strong>,
      has been a student of this school since <strong>{{student.admissionDateLong}}</strong> and is
      at present in <strong>{{class.classSection}}</strong> ({{class.academicYear}}).</p>
    <p>To the best of our knowledge, {{student.hisHer}} conduct and character have been
      <strong>{{certificate.conduct}}</strong>. {{student.heShe}} bears a good moral character
      and we wish {{student.himHer}} every success in life.</p>
    {{#if certificate.remarks}}<p>{{certificate.remarks}}</p>{{/if}}
  </div>
  ${SIGNATURES}
</div></div>`;

const TC_ROWS = [
  ["Name of the student", "{{student.name}}"],
  ["Admission number", "{{student.admissionNumber}}"],
  ["Father's name", "{{parents.father}}"],
  ["Mother's name", "{{parents.mother}}"],
  ["Nationality", "{{certificate.nationality}}"],
  ["Category", "{{student.category}}"],
  ["Date of birth (in figures)", "{{student.dob}}"],
  ["Date of birth (in words)", "{{student.dobInWords}}"],
  [
    "Date of first admission, with class",
    "{{student.admissionDate}}{{#if class.admittedClass}}, {{class.admittedClass}}{{/if}}"
  ],
  ["Class in which the student last studied", "{{class.classSection}} ({{class.academicYear}})"],
  ["Last examination taken, with result", "{{certificate.lastExamResult}}"],
  ["Subjects studied", "{{class.subjects}}"],
  ["Qualified for promotion to a higher class", "{{certificate.promotion}}"],
  ["Fees paid up to", "{{certificate.feesPaidUpTo}}"],
  [
    "Working days / days present",
    "{{#if certificate.workingDays}}{{certificate.workingDays}} / {{certificate.daysPresent}}{{/if}}"
  ],
  ["PEN (UDISE+)", "{{student.pen}}"],
  ["General conduct", "{{certificate.conduct}}"],
  ["Date of application for the certificate", "{{certificate.applicationDate}}"],
  ["Date of leaving the school", "{{certificate.leavingDate}}"],
  ["Reason for leaving", "{{certificate.reason}}"],
  ["Remarks", "{{certificate.remarks}}"]
];

const TRANSFER = `<div class="page"><div class="frame">
  ${LETTERHEAD}
  <div class="meta"><span>TC No. {{certificate.serialNumber}}</span><span>Admission No. {{student.admissionNumber}}</span></div>
  <h2><span>Transfer Certificate</span></h2>
  <table class="tc">
${TC_ROWS.map(([label, value], i) => `    <tr><td class="n">${i + 1}.</td><td class="label">${label}</td><td class="value">${value}</td></tr>`).join("\n")}
  </table>
  <p class="note">Certified that the above information is in accordance with the school's admission register.</p>
  <div class="signatures">
    <div>Date of issue: {{certificate.issueDate}}</div>
    <div><div class="line">Prepared by</div></div>
    <div><div class="line">Checked by</div></div>
    <div><div class="line">Principal</div></div>
  </div>
</div></div>`;

const TRANSFER_CSS = `${CSS}
.frame { padding: 8mm 10mm; }
.letterhead { padding-bottom: 3mm; }
.letterhead img { width: 18mm; height: 18mm; }
.letterhead h1 { font-size: 19pt; }
.meta { margin-top: 3mm; }
h2 { margin: 4mm 0 3mm; font-size: 15pt; }
.tc { width: 100%; border-collapse: collapse; font-size: 10pt; line-height: 1.3; }
.tc td { padding: 1.05mm 2mm; border-bottom: 0.5pt solid #c8ccd4; vertical-align: top; }
.tc .n { width: 8mm; color: #555; }
.tc .label { width: 46%; }
.tc .value { font-weight: bold; }
.note { font-size: 9.5pt; font-style: italic; margin: 3mm 0 0; }
.signatures { padding-top: 12mm; }
.signatures div { min-width: 34mm; }`;

export const DEFAULT_FORMATS = {
  BONAFIDE: { name: "Bonafide certificate", html: BONAFIDE, css: CSS },
  CHARACTER: { name: "Character certificate", html: CHARACTER, css: CSS },
  TRANSFER: { name: "Transfer certificate", html: TRANSFER, css: TRANSFER_CSS }
};

/* The house style and letterhead, for other documents' formats (the report card) */
export { CSS as FORMAT_CSS, LETTERHEAD as FORMAT_LETTERHEAD };
