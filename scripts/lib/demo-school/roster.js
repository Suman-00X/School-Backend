/* The people and the static catalogue of the demo school (see seed.js for how they are used).
   Everything here is fictional. Keys (`en1`, `f05`, …) only link the records to each other. */

/* Non-teaching accounts, one per privileged role (two office staff: one is a hostel warden) */
export const STAFF = [
  {
    key: "principal",
    role: "PRINCIPAL",
    first: "Meera",
    last: "Krishnamurthy",
    gender: "FEMALE",
    designation: "Principal",
    department: "Management",
    qualification: "PhD Education",
    joined: "2015-04-01"
  },
  {
    key: "accountant",
    role: "ACCOUNTANT",
    first: "Rakesh",
    last: "Gupta",
    gender: "MALE",
    designation: "Senior Accountant",
    department: "Accounts",
    qualification: "M.Com",
    joined: "2018-06-01"
  },
  {
    key: "office",
    role: "STAFF",
    first: "Pooja",
    last: "Bhatt",
    gender: "FEMALE",
    designation: "Office Administrator",
    department: "Front Office",
    qualification: "BBA",
    joined: "2019-07-15"
  },
  {
    key: "warden",
    role: "STAFF",
    first: "Ramesh",
    last: "Chauhan",
    gender: "MALE",
    designation: "Hostel Warden",
    department: "Hostel",
    qualification: "BA",
    joined: "2020-06-01"
  },
  {
    key: "hr",
    role: "HR_MANAGER",
    first: "Sanjay",
    last: "Mehta",
    gender: "MALE",
    designation: "HR Manager",
    department: "Human Resources",
    qualification: "MBA (HR)",
    joined: "2017-01-10"
  },
  {
    key: "librarian",
    role: "LIBRARIAN",
    first: "Kavita",
    last: "Joshi",
    gender: "FEMALE",
    designation: "Librarian",
    department: "Library",
    qualification: "M.Lib.Sc",
    joined: "2016-08-01"
  },
  {
    key: "transport",
    role: "TRANSPORT_MANAGER",
    first: "Harish",
    last: "Kumar",
    gender: "MALE",
    designation: "Transport Manager",
    department: "Transport",
    qualification: "Diploma, Logistics",
    joined: "2019-04-01"
  },
  {
    key: "hostel",
    role: "HOSTEL_MANAGER",
    first: "Deepa",
    last: "Menon",
    gender: "FEMALE",
    designation: "Hostel Manager",
    department: "Hostel",
    qualification: "MSW",
    joined: "2018-05-20"
  },
  {
    key: "inventory",
    role: "INVENTORY_MANAGER",
    first: "Farhan",
    last: "Sheikh",
    gender: "MALE",
    designation: "Store Manager",
    department: "Stores",
    qualification: "B.Com",
    joined: "2021-02-01"
  }
];

/* Each teacher teaches one subject (see SUBJECTS) in the grades listed, which keeps the
   generated timetable free of clashes */
export const TEACHERS = [
  {
    key: "en1",
    first: "Anita",
    last: "Sharma",
    gender: "FEMALE",
    subject: "ENG",
    grades: [6, 7],
    experience: 12,
    qualification: "MA English, B.Ed",
    joined: "2014-06-01"
  },
  {
    key: "en2",
    first: "Priya",
    last: "Das",
    gender: "FEMALE",
    subject: "ENG",
    grades: [8],
    experience: 6,
    qualification: "MA English, B.Ed",
    joined: "2020-06-01"
  },
  {
    key: "hi",
    first: "Sunita",
    last: "Verma",
    gender: "FEMALE",
    subject: "HIN",
    grades: [6, 7, 8],
    experience: 15,
    qualification: "MA Hindi, B.Ed",
    joined: "2012-06-01"
  },
  {
    key: "ma1",
    first: "Vikram",
    last: "Desai",
    gender: "MALE",
    subject: "MAT",
    grades: [6, 7],
    experience: 9,
    qualification: "MSc Mathematics, B.Ed",
    joined: "2017-06-01"
  },
  {
    key: "ma2",
    first: "Neha",
    last: "Kulkarni",
    gender: "FEMALE",
    subject: "MAT",
    grades: [8],
    experience: 7,
    qualification: "MSc Mathematics, B.Ed",
    joined: "2019-06-01"
  },
  {
    key: "sc1",
    first: "Arjun",
    last: "Reddy",
    gender: "MALE",
    subject: "SCI",
    grades: [6, 7],
    experience: 8,
    qualification: "MSc Physics, B.Ed",
    joined: "2018-06-01"
  },
  {
    key: "sc2",
    first: "Lakshmi",
    last: "Pillai",
    gender: "FEMALE",
    subject: "SCI",
    grades: [8],
    experience: 11,
    qualification: "MSc Chemistry, B.Ed",
    joined: "2015-06-01"
  },
  {
    key: "sst",
    first: "Rajesh",
    last: "Singh",
    gender: "MALE",
    subject: "SST",
    grades: [6, 7, 8],
    experience: 14,
    qualification: "MA History, B.Ed",
    joined: "2013-06-01"
  },
  {
    key: "cs",
    first: "Ayesha",
    last: "Khan",
    gender: "FEMALE",
    subject: "CSC",
    grades: [6, 7, 8],
    experience: 5,
    qualification: "MCA",
    joined: "2021-06-01"
  }
];

/* The order fixes each subject's place in the timetable rotation */
export const SUBJECTS = [
  { code: "ENG", name: "English" },
  { code: "HIN", name: "Hindi" },
  { code: "MAT", name: "Mathematics" },
  { code: "SCI", name: "Science", type: "THEORY" },
  { code: "SST", name: "Social Studies" },
  { code: "CSC", name: "Computer Science", type: "PRACTICAL" }
];

export const GRADES = [6, 7, 8];
export const SECTION_NAMES = ["A", "B"];

/* Class teacher and deputy of each section (both teach in it) */
export const SECTION_TEACHERS = {
  "6A": ["en1", "sst"],
  "6B": ["ma1", "cs"],
  "7A": ["sc1", "hi"],
  "7B": ["hi", "sst"],
  "8A": ["ma2", "en2"],
  "8B": ["sc2", "cs"]
};

/* Families: father, mother (null when absent) or a guardian */
export const FAMILIES = {
  f01: {
    last: "Agarwal",
    father: "Mahesh",
    mother: "Ritu",
    fatherJob: "Chartered Accountant",
    motherJob: "Architect",
    income: 2400000,
    address: "14, Lake View Apartments, Indiranagar, Bengaluru"
  },
  f02: {
    last: "Bose",
    father: "Subhash",
    mother: "Mitali",
    fatherJob: "Professor",
    motherJob: "Journalist",
    income: 1800000,
    address: "7B, Palm Grove, Koramangala, Bengaluru"
  },
  f03: {
    last: "Chatterjee",
    father: "Abhijit",
    mother: "Sreya",
    fatherJob: "Software Engineer",
    motherJob: "Doctor",
    income: 3200000,
    address: "201, Sobha Crest, HSR Layout, Bengaluru"
  },
  f04: {
    last: "DSouza",
    father: "Joseph",
    mother: "Maria",
    fatherJob: "Hotel Manager",
    motherJob: "Nurse",
    income: 1200000,
    address: "33, St. Mark's Road, Bengaluru"
  },
  f05: {
    last: "Fernandes",
    father: "Carl",
    mother: "Linda",
    fatherJob: "Pilot",
    motherJob: "Homemaker",
    income: 4000000,
    address: "9, Richmond Town, Bengaluru"
  },
  f06: {
    last: "Ghosh",
    father: "Partha",
    mother: "Rina",
    fatherJob: "Banker",
    motherJob: "Teacher",
    income: 1600000,
    address: "52, BTM Layout 2nd Stage, Bengaluru"
  },
  f07: {
    last: "Hegde",
    father: "Prakash",
    mother: "Shobha",
    fatherJob: "Business Owner",
    motherJob: "Business Owner",
    income: 2800000,
    address: "18, Malleshwaram 8th Cross, Bengaluru"
  },
  f08: {
    last: "Iyer",
    father: "Krishnan",
    mother: "Lakshmi",
    fatherJob: "Civil Engineer",
    motherJob: "Musician",
    income: 1500000,
    address: "4, Basavanagudi, Bengaluru"
  },
  f09: {
    last: "Jain",
    father: "Sunil",
    mother: "Payal",
    fatherJob: "Jeweller",
    motherJob: "Homemaker",
    income: 3600000,
    address: "61, Jayanagar 4th Block, Bengaluru"
  },
  f10: {
    last: "Kapoor",
    father: "Rajiv",
    mother: "Neelam",
    fatherJob: "Film Producer",
    motherJob: "Interior Designer",
    income: 5000000,
    address: "Villa 12, Prestige Lakeside, Whitefield, Bengaluru"
  },
  f11: {
    last: "Malhotra",
    father: "Vivek",
    mother: "Shalini",
    fatherJob: "Lawyer",
    motherJob: "Lawyer",
    income: 3000000,
    address: "22, Frazer Town, Bengaluru"
  },
  f12: {
    last: "Nair",
    father: "Suresh",
    mother: "Divya",
    fatherJob: "Naval Officer",
    motherJob: "Dentist",
    income: 2200000,
    address: "Quarters 5, ASC Centre, Bengaluru"
  },
  f13: {
    last: "Patel",
    father: "Hitesh",
    mother: "Komal",
    fatherJob: "Pharmacist",
    motherJob: "Homemaker",
    income: 1100000,
    address: "3, Banashankari 3rd Stage, Bengaluru"
  },
  f14: {
    last: "Qureshi",
    father: "Imran",
    mother: "Nazia",
    fatherJob: "Restaurateur",
    motherJob: "Fashion Designer",
    income: 2000000,
    address: "40, Shivajinagar, Bengaluru"
  },
  f15: {
    last: "Rao",
    father: "Venkat",
    mother: "Padma",
    fatherJob: "Farmer",
    motherJob: "Homemaker",
    income: 600000,
    address: "Gollahalli Village, Hosur Road, Bengaluru Rural"
  },
  f16: {
    last: "Saxena",
    father: "Alok",
    mother: "Swati",
    fatherJob: "IAS Officer",
    motherJob: "Professor",
    income: 2600000,
    address: "11, Sadashivanagar, Bengaluru"
  },
  f17: {
    last: "Thomas",
    father: "George",
    mother: "Annie",
    fatherJob: "Pastor",
    motherJob: "Teacher",
    income: 900000,
    address: "8, Cox Town, Bengaluru"
  },
  f18: {
    last: "Usmani",
    father: "Faisal",
    mother: "Rubina",
    fatherJob: "Gulf Engineer",
    motherJob: "Homemaker",
    income: 2100000,
    address: "27, RT Nagar, Bengaluru"
  },
  f19: {
    last: "Varma",
    guardian: { first: "Ramnath", gender: "MALE", job: "Retired Judge" },
    income: 1400000,
    address: "2, Cubbonpet, Bengaluru"
  },
  f20: {
    last: "Wadhwa",
    father: "Manish",
    mother: "Pallavi",
    fatherJob: "Startup Founder",
    motherJob: "Product Manager",
    income: 4500000,
    address: "1701, Brigade Gateway, Rajajinagar, Bengaluru"
  },
  f21: {
    last: "Yadav",
    father: "Dinesh",
    mother: "Seema",
    fatherJob: "Army Officer",
    motherJob: "Homemaker",
    income: 1300000,
    address: "MES Quarters, Ulsoor, Bengaluru"
  },
  f22: {
    last: "Zaveri",
    father: "Nilesh",
    mother: "Hetal",
    fatherJob: "Diamond Trader",
    motherJob: "Homemaker",
    income: 3800000,
    address: "15, Cunningham Road, Bengaluru"
  },
  f23: {
    last: "Bhatia",
    father: "Karan",
    mother: "Simran",
    fatherJob: "Hotelier",
    motherJob: "Chef",
    income: 2300000,
    address: "6, Church Street, Bengaluru"
  },
  f24: {
    last: "Mishra",
    mother: "Anjali",
    motherJob: "Bank Manager",
    income: 1400000,
    address: "45, Vijayanagar, Bengaluru"
  },
  f25: {
    last: "Pandey",
    father: "Ashok",
    mother: "Geeta",
    fatherJob: "Auto Driver",
    motherJob: "Tailor",
    income: 300000,
    address: "19, Mathikere, Bengaluru"
  },
  f26: {
    last: "Shetty",
    father: "Ravi",
    mother: "Asha",
    fatherJob: "Fisherman",
    motherJob: "Homemaker",
    income: 400000,
    address: "Fishermen Colony, Mangaluru"
  }
};

/* Five students in each section. Flags: hostel (boarder), bus (school transport),
   plan (ANNUAL pays the year at once), concession, scenario (the latest invoice: UNPAID / PARTIAL) */
export const STUDENTS = [
  { key: "arnav", first: "Arnav", gender: "MALE", family: "f02", section: "6A", bus: "R1-S2", concession: "SIBLING" },
  { key: "diya", first: "Diya", gender: "FEMALE", family: "f03", section: "6A" },
  { key: "aarav", first: "Aarav", gender: "MALE", family: "f07", section: "6A" },
  { key: "sara", first: "Sara", gender: "FEMALE", family: "f17", section: "6A", bus: "R2-S3" },
  { key: "vihaan", first: "Vihaan", gender: "MALE", family: "f20", section: "6A" },

  { key: "isha", first: "Isha", gender: "FEMALE", family: "f01", section: "6B", bus: "R1-S1", concession: "SIBLING" },
  { key: "kunal", first: "Kunal", gender: "MALE", family: "f06", section: "6B", bus: "R2-S1" },
  { key: "myra", first: "Myra", gender: "FEMALE", family: "f11", section: "6B", scenario: "PARTIAL" },
  { key: "ayaan", first: "Ayaan", gender: "MALE", family: "f14", section: "6B" },
  {
    key: "riya",
    first: "Riya",
    gender: "FEMALE",
    family: "f25",
    section: "6B",
    bus: "R2-S2",
    scenario: "UNPAID",
    waiveLateFee: true
  },

  { key: "ananya", first: "Ananya", gender: "FEMALE", family: "f02", section: "7A", bus: "R1-S2" },
  {
    key: "kiara",
    first: "Kiara",
    gender: "FEMALE",
    family: "f10",
    section: "7A",
    plan: "ANNUAL",
    concession: "SIBLING"
  },
  { key: "dev", first: "Dev", gender: "MALE", family: "f13", section: "7A", hostel: "BOYS" },
  { key: "zoya", first: "Zoya", gender: "FEMALE", family: "f18", section: "7A", hostel: "GIRLS" },
  {
    key: "aditya",
    first: "Aditya",
    gender: "MALE",
    family: "f19",
    section: "7A",
    scenario: "UNPAID",
    frequentlyAbsent: true
  },

  { key: "tanya", first: "Tanya", gender: "FEMALE", family: "f05", section: "7B", bus: "R1-S3", concession: "SIBLING" },
  { key: "neil", first: "Neil", gender: "MALE", family: "f04", section: "7B", bus: "R1-S4", scenario: "PARTIAL" },
  { key: "ishaan", first: "Ishaan", gender: "MALE", family: "f16", section: "7B" },
  { key: "meher", first: "Meher", gender: "FEMALE", family: "f23", section: "7B", hostel: "GIRLS" },
  { key: "om", first: "Om", gender: "MALE", family: "f26", section: "7B", hostel: "BOYS", concession: "FINANCIAL_AID" },

  { key: "rohan", first: "Rohan", gender: "MALE", family: "f01", section: "8A", bus: "R1-S1" },
  { key: "kabir", first: "Kabir", gender: "MALE", family: "f10", section: "8A", plan: "ANNUAL" },
  {
    key: "aditi",
    first: "Aditi",
    gender: "FEMALE",
    family: "f09",
    section: "8A",
    hostel: "GIRLS",
    concession: "MERIT"
  },
  { key: "nikhil", first: "Nikhil", gender: "MALE", family: "f15", section: "8A", hostel: "BOYS" },
  { key: "shreya", first: "Shreya", gender: "FEMALE", family: "f24", section: "8A", scenario: "UNPAID" },

  { key: "ryan", first: "Ryan", gender: "MALE", family: "f05", section: "8B", bus: "R1-S3" },
  { key: "avni", first: "Avni", gender: "FEMALE", family: "f12", section: "8B", bus: "R2-S3" },
  { key: "yash", first: "Yash", gender: "MALE", family: "f21", section: "8B", hostel: "BOYS", scenario: "UNPAID" },
  { key: "pari", first: "Pari", gender: "FEMALE", family: "f22", section: "8B", hostel: "GIRLS", plan: "ANNUAL" },
  { key: "tara", first: "Tara", gender: "FEMALE", family: "f08", section: "8B", plan: "ANNUAL", refund: true }
];

/* Annual fees per class (rupees), split over the installment plan */
export const FEE_HEADS = [
  { code: "TUI", name: "Tuition Fee", description: "Classroom teaching" },
  { code: "DEV", name: "Development Fee", description: "Buildings and facilities" },
  { code: "LAB", name: "Laboratory Fee", description: "Science laboratory" },
  { code: "CMP", name: "Computer Fee", description: "Computer lab and software" },
  { code: "ACT", name: "Activity Fee", description: "Clubs, sports and excursions" }
];
export const ANNUAL_FEES = {
  6: { TUI: 36000, DEV: 6000, LAB: 3000, CMP: 2400, ACT: 2000 },
  7: { TUI: 39000, DEV: 6000, LAB: 3600, CMP: 2400, ACT: 2000 },
  8: { TUI: 42000, DEV: 6500, LAB: 4200, CMP: 3000, ACT: 2400 }
};

export const BUS_ROUTES = [
  {
    code: "R1",
    name: "Route 1 – Indiranagar & Whitefield",
    vehicle: {
      registrationNumber: "KA01AB1234",
      make: "Tata",
      model: "Starbus 41",
      capacity: 41,
      driverName: "Mohan Lal",
      driverPhone: "+91 98450 11111",
      driverLicenseNumber: "KA0120110012345",
      attendantName: "Savitri Bai",
      attendantPhone: "+91 98450 22222"
    },
    stops: [
      {
        code: "S1",
        name: "Indiranagar 100ft Road",
        pickupTime: "07:05",
        dropTime: "15:10",
        landmark: "Opposite metro station",
        monthlyFee: 1800
      },
      {
        code: "S2",
        name: "Koramangala Forum",
        pickupTime: "07:20",
        dropTime: "14:55",
        landmark: "Forum Mall gate 2",
        monthlyFee: 1600
      },
      {
        code: "S3",
        name: "Richmond Circle",
        pickupTime: "07:35",
        dropTime: "14:40",
        landmark: "Near the flyover",
        monthlyFee: 1400
      },
      {
        code: "S4",
        name: "St. Mark's Road",
        pickupTime: "07:45",
        dropTime: "14:30",
        landmark: "Bishop Cotton gate",
        monthlyFee: 1200
      }
    ]
  },
  {
    code: "R2",
    name: "Route 2 – BTM & Mathikere",
    vehicle: {
      registrationNumber: "KA05CD5678",
      make: "Ashok Leyland",
      model: "Lynx Smart",
      capacity: 32,
      driverName: "Abdul Rahim",
      driverPhone: "+91 98450 33333",
      driverLicenseNumber: "KA0520130067890",
      attendantName: "Lalitha",
      attendantPhone: "+91 98450 44444"
    },
    stops: [
      {
        code: "S1",
        name: "BTM Layout Water Tank",
        pickupTime: "07:00",
        dropTime: "15:15",
        landmark: "BDA complex",
        monthlyFee: 1700
      },
      {
        code: "S2",
        name: "Mathikere Bus Stand",
        pickupTime: "07:25",
        dropTime: "14:50",
        landmark: "Ramaiah college road",
        monthlyFee: 1500
      },
      {
        code: "S3",
        name: "Cox Town Market",
        pickupTime: "07:40",
        dropTime: "14:35",
        landmark: "Near the church",
        monthlyFee: 1300
      }
    ]
  }
];

export const BOOKS = [
  {
    title: "Wings of Fire",
    authors: ["A. P. J. Abdul Kalam", "Arun Tiwari"],
    publisher: "Universities Press",
    publishedYear: 1999,
    category: "Biography",
    shelfLocation: "B-1",
    copies: 3,
    price: 350
  },
  {
    title: "Malgudi Days",
    authors: ["R. K. Narayan"],
    publisher: "Indian Thought Publications",
    publishedYear: 1943,
    category: "Fiction",
    shelfLocation: "F-2",
    copies: 2,
    price: 250
  },
  {
    title: "The Jungle Book",
    authors: ["Rudyard Kipling"],
    publisher: "Macmillan",
    publishedYear: 1894,
    category: "Fiction",
    shelfLocation: "F-3",
    copies: 2,
    price: 199
  },
  {
    title: "A Brief History of Time",
    authors: ["Stephen Hawking"],
    publisher: "Bantam",
    publishedYear: 1988,
    category: "Science",
    shelfLocation: "S-1",
    copies: 2,
    price: 499
  },
  {
    title: "Discovery of India",
    authors: ["Jawaharlal Nehru"],
    publisher: "Penguin",
    publishedYear: 1946,
    category: "History",
    shelfLocation: "H-1",
    copies: 1,
    price: 450
  },
  {
    title: "Harry Potter and the Philosopher's Stone",
    authors: ["J. K. Rowling"],
    publisher: "Bloomsbury",
    publishedYear: 1997,
    category: "Fiction",
    shelfLocation: "F-4",
    copies: 3,
    price: 399
  },
  {
    title: "Panchatantra Tales",
    authors: ["Vishnu Sharma"],
    publisher: "Amar Chitra Katha",
    publishedYear: 2010,
    category: "Folk Tales",
    language: "Hindi",
    shelfLocation: "F-1",
    copies: 2,
    price: 150
  },
  {
    title: "Mathematics Olympiad Primer",
    authors: ["V. Krishnamurthy"],
    publisher: "Prism Books",
    publishedYear: 2015,
    category: "Mathematics",
    subject: "MAT",
    shelfLocation: "R-2",
    copies: 2,
    price: 320,
    itemType: "REFERENCE"
  },
  {
    title: "Oxford Student Atlas",
    authors: ["Oxford University Press"],
    publisher: "OUP India",
    publishedYear: 2021,
    category: "Geography",
    subject: "SST",
    shelfLocation: "R-1",
    copies: 2,
    price: 425,
    itemType: "REFERENCE"
  },
  {
    title: "Python for Young Coders",
    authors: ["Asha Rao"],
    publisher: "TechKids",
    publishedYear: 2022,
    category: "Computers",
    subject: "CSC",
    shelfLocation: "C-1",
    copies: 2,
    price: 299
  },
  {
    title: "Godaan",
    authors: ["Munshi Premchand"],
    publisher: "Rajkamal Prakashan",
    publishedYear: 1936,
    category: "Fiction",
    language: "Hindi",
    subject: "HIN",
    shelfLocation: "F-5",
    copies: 1,
    price: 220
  },
  {
    title: "The Science Magazine – Monthly",
    authors: ["Editorial Board"],
    publisher: "Vigyan Prasar",
    publishedYear: 2026,
    category: "Periodicals",
    shelfLocation: "P-1",
    copies: 1,
    price: 60,
    itemType: "PERIODICAL"
  }
];

export const INVENTORY = {
  categories: [
    { key: "stationery", name: "Stationery", description: "Paper, pens and classroom supplies" },
    { key: "lab", name: "Laboratory", description: "Science lab consumables and apparatus" },
    { key: "sports", name: "Sports", description: "Sports and PE equipment" },
    { key: "housekeeping", name: "Housekeeping", description: "Cleaning and hygiene supplies" }
  ],
  vendors: [
    {
      key: "kalpana",
      name: "Kalpana Stationers",
      contactPerson: "Kalpana Rao",
      phone: "+91 80 2222 1111",
      email: "orders@kalpana.example",
      taxId: "29ABCDE1234F1Z5",
      address: "Avenue Road, Bengaluru"
    },
    {
      key: "scientific",
      name: "Bangalore Scientific Co.",
      contactPerson: "M. Iqbal",
      phone: "+91 80 2333 4444",
      email: "sales@bscientific.example",
      taxId: "29PQRSX5678K1Z2",
      address: "Lalbagh Road, Bengaluru"
    },
    {
      key: "sportsworld",
      name: "Sports World",
      contactPerson: "Rohit Nanda",
      phone: "+91 80 2444 5555",
      email: "hello@sportsworld.example",
      taxId: "29LMNOP9012Q1Z8",
      address: "Brigade Road, Bengaluru"
    }
  ],
  /* received: [quantity, unit cost, vendor]; issued: [quantity, teacher or staff key, reason] */
  items: [
    {
      sku: "STN-A4-75",
      name: "A4 paper 75 gsm",
      category: "stationery",
      unit: "REAM",
      reorderLevel: 20,
      location: "Store room shelf 1",
      received: [[60, 245, "kalpana"]],
      issued: [
        [12, "office", "Office printing"],
        [8, "en1", "Worksheets for Class 6"]
      ]
    },
    {
      sku: "STN-MKR-WB",
      name: "Whiteboard marker (black)",
      category: "stationery",
      unit: "BOX",
      reorderLevel: 10,
      location: "Store room shelf 2",
      received: [[25, 180, "kalpana"]],
      issued: [
        [4, "ma1", "Classroom use"],
        [3, "sst", "Classroom use"]
      ]
    },
    {
      sku: "STN-CHALK",
      name: "Dustless chalk",
      category: "stationery",
      unit: "BOX",
      reorderLevel: 15,
      location: "Store room shelf 2",
      received: [[20, 60, "kalpana"]],
      issued: [[9, "hi", "Classroom use"]]
    },
    {
      sku: "LAB-BKR-250",
      name: "Glass beaker 250 ml",
      category: "lab",
      unit: "PCS",
      reorderLevel: 12,
      location: "Science lab cabinet A",
      received: [[40, 85, "scientific"]],
      issued: [[6, "sc1", "Class 7 practicals"]],
      adjustment: [-2, "Broken during practical"]
    },
    {
      sku: "LAB-LITMUS",
      name: "Litmus paper strips",
      category: "lab",
      unit: "PACK",
      reorderLevel: 10,
      location: "Science lab cabinet B",
      received: [[12, 40, "scientific"]],
      issued: [[5, "sc2", "Class 8 acids and bases"]]
    },
    {
      sku: "SPT-FTBL-5",
      name: "Football size 5",
      category: "sports",
      unit: "PCS",
      reorderLevel: 4,
      location: "Sports room",
      received: [[10, 650, "sportsworld"]],
      issued: [[3, "office", "Inter-house matches"]]
    },
    {
      sku: "SPT-CRKT-BAT",
      name: "Cricket bat (full size)",
      category: "sports",
      unit: "PCS",
      reorderLevel: 3,
      location: "Sports room",
      received: [[6, 1200, "sportsworld"]],
      issued: []
    },
    {
      sku: "HSK-SANITIZER",
      name: "Hand sanitizer 500 ml",
      category: "housekeeping",
      unit: "PCS",
      reorderLevel: 30,
      location: "Store room shelf 4",
      received: [[36, 120, "kalpana"]],
      issued: [[14, "warden", "Hostel washrooms"]]
    }
  ]
};
