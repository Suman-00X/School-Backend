/* The fields a student import fills, with the column names schools commonly use for them.
   Matching ignores case, spaces and punctuation: "Date of Birth" = "dateofbirth".
   There is no admission number: it is generated on admission, so a column with one is
   left unmapped and ignored. */
export const STUDENT_FIELDS = [
  {
    field: "firstName",
    label: "First name",
    required: true,
    synonyms: ["first name", "student first name", "given name", "forename", "name"]
  },
  {
    field: "lastName",
    label: "Last name",
    required: true,
    synonyms: ["last name", "student last name", "surname", "family name"]
  },
  {
    field: "email",
    label: "Email",
    required: true,
    synonyms: ["email", "e-mail", "student email", "email address", "mail id"]
  },
  {
    field: "phone",
    label: "Phone",
    required: false,
    synonyms: ["phone", "mobile", "student phone", "contact number", "mobile number"]
  },
  { field: "gender", label: "Gender", required: false, synonyms: ["gender", "sex"] },
  {
    field: "dob",
    label: "Date of birth",
    required: false,
    synonyms: ["dob", "date of birth", "birth date", "birthday"]
  },
  {
    field: "admissionDate",
    label: "Admission date",
    required: false,
    synonyms: ["admission date", "date of admission", "joining date"]
  },
  { field: "className", label: "Class", required: true, synonyms: ["class", "class name", "grade", "standard", "std"] },
  { field: "sectionName", label: "Section", required: true, synonyms: ["section", "section name", "division", "div"] },
  {
    field: "parentFirstName",
    label: "Parent first name",
    required: false,
    synonyms: [
      "parent first name",
      "guardian first name",
      "father first name",
      "mother first name",
      "fathers first name",
      "mothers first name"
    ]
  },
  {
    field: "parentLastName",
    label: "Parent last name",
    required: false,
    synonyms: [
      "parent last name",
      "guardian last name",
      "father last name",
      "mother last name",
      "fathers last name",
      "mothers last name"
    ]
  },
  {
    field: "parentEmail",
    label: "Parent email",
    required: false,
    synonyms: [
      "parent email",
      "guardian email",
      "father email",
      "mother email",
      "fathers email",
      "mothers email",
      "parent e-mail"
    ]
  },
  {
    field: "parentPhone",
    label: "Parent phone",
    required: false,
    synonyms: [
      "parent phone",
      "guardian phone",
      "father phone",
      "mother phone",
      "fathers phone",
      "mothers phone",
      "parent mobile"
    ]
  },
  {
    field: "parentRelation",
    label: "Parent relation",
    required: false,
    synonyms: ["parent relation", "relation", "relationship", "guardian relation"]
  }
];

export const STUDENT_FIELD_NAMES = STUDENT_FIELDS.map(f => f.field);

const normalise = text =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/* Best guess: field -> column header. Each column is used at most once; exact field
   names win over synonyms, so the template's own headers always map. */
export const suggestMapping = headers => {
  const byKey = new Map(headers.map(header => [normalise(header), header]));
  const used = new Set();
  const mapping = {};
  const take = (field, header) => {
    if (!header || used.has(header) || mapping[field]) return;
    mapping[field] = header;
    used.add(header);
  };
  for (const { field, label } of STUDENT_FIELDS)
    take(field, byKey.get(normalise(field)) ?? byKey.get(normalise(label)));
  for (const { field, synonyms } of STUDENT_FIELDS)
    for (const name of synonyms) take(field, byKey.get(normalise(name)));
  return mapping;
};

/* A row (array of cells) as a field object under a mapping */
export const applyMapping = (headers, mapping, cells) => {
  const index = new Map(headers.map((header, i) => [header, i]));
  return Object.fromEntries(Object.entries(mapping).map(([field, header]) => [field, cells[index.get(header)]]));
};

export const missingRequired = mapping => STUDENT_FIELDS.filter(f => f.required && !mapping[f.field]);
