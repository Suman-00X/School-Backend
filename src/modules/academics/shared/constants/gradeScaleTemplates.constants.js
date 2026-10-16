/* Ready-made grade scales used by Indian and international schools.
   A school creates its own copy (POST /grade-scales { templateKey }) and may edit the bands.
   Bands are [minPercent, maxPercent); the top band includes 100. */
const band = (grade, minPercent, maxPercent, gradePoint, remark, isPassing = true) => ({
  grade,
  minPercent,
  maxPercent,
  gradePoint,
  remark,
  isPassing
});

export const GRADE_SCALE_TEMPLATES = Object.freeze({
  CBSE_9_POINT: {
    name: "CBSE 9-point (A1-E2)",
    description: "CBSE scholastic grades; 33% to pass; grade points on a 10-point scale",
    maxGradePoint: 10,
    bands: [
      band("A1", 91, 100, 10, "Outstanding"),
      band("A2", 81, 91, 9, "Excellent"),
      band("B1", 71, 81, 8, "Very good"),
      band("B2", 61, 71, 7, "Good"),
      band("C1", 51, 61, 6, "Above average"),
      band("C2", 41, 51, 5, "Average"),
      band("D", 33, 41, 4, "Pass"),
      band("E1", 21, 33, 0, "Needs improvement", false),
      band("E2", 0, 21, 0, "Needs improvement", false)
    ]
  },
  CBSE_CO_SCHOLASTIC: {
    name: "CBSE co-scholastic (A-C)",
    description: "3-point grades for co-scholastic areas and discipline",
    maxGradePoint: null,
    bands: [
      band("A", 75, 100, null, "Outstanding"),
      band("B", 50, 75, null, "Very good"),
      band("C", 0, 50, null, "Fair")
    ]
  },
  IB_1_7: {
    name: "IB 1-7",
    description: "IB subject grades 1-7 (boundaries vary by subject; adjust the bands)",
    maxGradePoint: 7,
    bands: [
      band("7", 80, 100, 7, "Excellent"),
      band("6", 70, 80, 6, "Very good"),
      band("5", 60, 70, 5, "Good"),
      band("4", 50, 60, 4, "Satisfactory"),
      band("3", 40, 50, 3, "Mediocre"),
      band("2", 25, 40, 2, "Poor", false),
      band("1", 0, 25, 1, "Very poor", false)
    ]
  },
  US_LETTER_4_0: {
    name: "US letter grades (4.0)",
    description: "A-F with plus and minus on a 4.0 GPA scale",
    maxGradePoint: 4,
    bands: [
      band("A", 93, 100, 4.0),
      band("A-", 90, 93, 3.7),
      band("B+", 87, 90, 3.3),
      band("B", 83, 87, 3.0),
      band("B-", 80, 83, 2.7),
      band("C+", 77, 80, 2.3),
      band("C", 73, 77, 2.0),
      band("C-", 70, 73, 1.7),
      band("D+", 67, 70, 1.3),
      band("D", 60, 67, 1.0),
      band("F", 0, 60, 0, "Fail", false)
    ]
  },
  UGC_10_POINT: {
    name: "10-point CGPA (O-F)",
    description: "UGC choice-based credit system letter grades",
    maxGradePoint: 10,
    bands: [
      band("O", 90, 100, 10, "Outstanding"),
      band("A+", 80, 90, 9, "Excellent"),
      band("A", 70, 80, 8, "Very good"),
      band("B+", 60, 70, 7, "Good"),
      band("B", 50, 60, 6, "Above average"),
      band("C", 45, 50, 5, "Average"),
      band("P", 40, 45, 4, "Pass"),
      band("F", 0, 40, 0, "Fail", false)
    ]
  }
});

export const GRADE_SCALE_TEMPLATE_KEYS = Object.keys(GRADE_SCALE_TEMPLATES);
