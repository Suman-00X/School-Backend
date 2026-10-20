/* Certificates a school issues to its students, the details asked for when issuing each,
   and every placeholder a format may use. */

export const CERTIFICATE_TYPES = ["BONAFIDE", "CHARACTER", "TRANSFER"];
export const CERTIFICATE_STATUSES = ["ISSUED", "CANCELLED"];

/* The documents a school has HTML formats for: its certificates, and the report card
   (academics/report-cards fills that one) */
export const FORMAT_TYPES = [...CERTIFICATE_TYPES, "REPORT_CARD"];

const CONDUCT = ["Excellent", "Very good", "Good", "Satisfactory"];

/* Inputs: kind text | textarea | date | number | choice. `default` "today" is the school's
   date; `prefill` names a value the server works out for the student (it can be changed). */
export const CERTIFICATE_TYPE_INFO = {
  BONAFIDE: {
    label: "Bonafide certificate",
    prefix: "BC",
    description: "Confirms the student studies at the school this year",
    inputs: [
      {
        key: "purpose",
        label: "Purpose",
        kind: "text",
        required: true,
        max: 200,
        hint: "For example: passport application, bank account, scholarship"
      },
      { key: "remarks", label: "Remarks", kind: "textarea", max: 500 }
    ]
  },
  CHARACTER: {
    label: "Character certificate",
    prefix: "CC",
    description: "The school's word on the student's conduct",
    inputs: [
      { key: "conduct", label: "Conduct", kind: "choice", options: CONDUCT, required: true, default: "Good" },
      { key: "remarks", label: "Remarks", kind: "textarea", max: 500 }
    ]
  },
  TRANSFER: {
    label: "Transfer certificate",
    prefix: "TC",
    description: "Issued when a student leaves the school; one per student",
    inputs: [
      { key: "leavingDate", label: "Date of leaving", kind: "date", required: true, default: "today" },
      {
        key: "reason",
        label: "Reason for leaving",
        kind: "text",
        required: true,
        max: 200,
        hint: "For example: parent's transfer, completed the course"
      },
      { key: "applicationDate", label: "Date of application", kind: "date" },
      {
        key: "lastExamResult",
        label: "Last examination taken, with result",
        kind: "text",
        max: 200,
        hint: "For example: Class 5 annual examination, passed"
      },
      {
        key: "promotion",
        label: "Qualified for promotion to a higher class",
        kind: "choice",
        options: ["Yes", "No", "Not applicable"],
        default: "Yes"
      },
      {
        key: "feesPaidUpTo",
        label: "Fees paid up to",
        kind: "text",
        max: 60,
        hint: "Month and year, for example March 2027"
      },
      { key: "workingDays", label: "Working days in the year", kind: "number", prefill: "workingDays" },
      { key: "daysPresent", label: "Days present", kind: "number", prefill: "daysPresent" },
      { key: "nationality", label: "Nationality", kind: "text", max: 60, default: "Indian" },
      { key: "conduct", label: "General conduct", kind: "choice", options: CONDUCT, default: "Good" },
      { key: "remarks", label: "Remarks", kind: "textarea", max: 500 }
    ]
  }
};

/* Placeholders every format may use (the certificate's own inputs are added per type as
   certificate.<key>; a date input also has certificate.<key>Long). `sample` fills the
   format preview when no student is chosen. */
export const PLACEHOLDER_GROUPS = [
  {
    group: "School",
    fields: [
      ["school.name", "School name", "Green Valley School"],
      ["school.address", "Address", "12 Lake Road, Bengaluru 560001"],
      ["school.phone", "Phone", "080 2345 6789"],
      ["school.email", "Email", "office@greenvalley.example"],
      ["school.udiseCode", "UDISE code", "29200100101"],
      ["school.logo", "Logo (use as an image src)", ""]
    ]
  },
  {
    group: "Student",
    fields: [
      ["student.name", "Full name", "Aarav Sharma"],
      ["student.firstName", "First name", "Aarav"],
      ["student.lastName", "Last name", "Sharma"],
      ["student.admissionNumber", "Admission number", "ADM21-0042"],
      ["student.admissionDate", "Admission date", "01/04/2021"],
      ["student.admissionDateLong", "Admission date, long", "1 April 2021"],
      ["student.dob", "Date of birth", "14/08/2015"],
      ["student.dobLong", "Date of birth, long", "14 August 2015"],
      ["student.dobInWords", "Date of birth in words", "Fourteenth August Two Thousand Fifteen"],
      ["student.gender", "Gender", "Male"],
      ["student.heShe", "He / She", "He"],
      ["student.hisHer", "his / her", "his"],
      ["student.himHer", "him / her", "him"],
      ["student.sonDaughter", "son / daughter", "son"],
      ["student.category", "Category", "General"],
      ["student.religion", "Religion", "Hindu"],
      ["student.motherTongue", "Mother tongue", "Kannada"],
      ["student.bloodGroup", "Blood group", "B+"],
      ["student.pen", "PEN (UDISE+)", "29123456789"],
      ["student.apaarId", "APAAR id", "123456789012"]
    ]
  },
  {
    group: "Parents",
    fields: [
      ["parents.father", "Father's name", "Rohit Sharma"],
      ["parents.mother", "Mother's name", "Priya Sharma"],
      ["parents.guardian", "Guardian's name", ""],
      ["parents.parent", "Parent (father, else mother, else guardian)", "Rohit Sharma"]
    ]
  },
  {
    group: "Class",
    fields: [
      ["class.name", "Class", "Class 5"],
      ["class.section", "Section", "A"],
      ["class.classSection", "Class and section", "Class 5 – A"],
      ["class.rollNumber", "Roll number", "12"],
      ["class.academicYear", "Academic year", "2026-27"],
      ["class.admittedClass", "Class at admission", "Class 1"],
      ["class.subjects", "Subjects studied", "English, Hindi, Kannada, Mathematics, Science, Social Science"]
    ]
  },
  {
    group: "Certificate",
    fields: [
      ["certificate.title", "Certificate name", "Bonafide certificate"],
      ["certificate.serialNumber", "Certificate number", "BC/2026-27/0001"],
      ["certificate.issueDate", "Date of issue", "20/10/2026"],
      ["certificate.issueDateLong", "Date of issue, long", "20 October 2026"]
    ]
  }
];

/* Sample values of the inputs, for the preview */
export const SAMPLE_INPUTS = {
  purpose: "passport application",
  remarks: "",
  conduct: "Good",
  leavingDate: "2027-03-31",
  reason: "Parent's transfer",
  applicationDate: "2027-03-20",
  lastExamResult: "Class 5 annual examination, passed",
  promotion: "Yes",
  feesPaidUpTo: "March 2027",
  workingDays: "220",
  daysPresent: "208",
  nationality: "Indian"
};
