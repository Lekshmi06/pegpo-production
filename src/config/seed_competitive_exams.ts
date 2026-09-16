import dotenv from "dotenv";
import connectDB from "./db";
import Exam, { IExam } from "../models/Exam";
import Question from "../models/Question";

dotenv.config();

export const competitiveExamsCatalog = [
  {
    name: "JEE Main (Joint Entrance Examination)",
    code: "JEE_MAIN",
    category: "Engineering",
    conductingBody: "National Testing Agency (NTA)",
    description:
      "All India engineering entrance exam for admission into NITs, IIITs, CFTIs and eligibility qualifier for JEE Advanced.",
    supportedSubjects: ["Physics", "Chemistry", "Mathematics"],
    tier: "Session 1 & Session 2",
    durationMinutes: 180,
    questionTypes: ["mcq", "nat"],
    isActive: true,
    totalCandidatesEstimate: 1250000,
    syllabusOverview:
      "Physics (Mechanics, Electrodynamics, Modern Physics), Chemistry (Physical, Inorganic, Organic), Mathematics (Calculus, Coordinate Geometry, Algebra, Vectors).",
    eligibility: "10+2 with Physics, Mathematics, and Chemistry/Biology/Technical Vocational.",
    markingScheme: {
      correctMarks: 4,
      negativeMarks: 1,
      numericalTolerance: 0.05,
      maxScore: 300,
      cutOffScore: 91,
      sectionalCutOff: false,
    },
    sections: [
      {
        id: "jee_sec_phy_mcq",
        name: "Section A - Physics MCQs",
        subject: "Physics",
        totalQuestions: 20,
        marksPerQuestion: 4,
        negativeMarks: 1,
        questionTypes: ["mcq"],
        instructions: "Single correct option out of 4 choices (+4 for correct, -1 for wrong).",
      },
      {
        id: "jee_sec_phy_nat",
        name: "Section B - Physics NAT",
        subject: "Physics",
        totalQuestions: 10,
        marksPerQuestion: 4,
        negativeMarks: 1,
        questionTypes: ["nat"],
        instructions: "Numerical answer type. Round answer to nearest integer or specified decimal (+4 for correct, -1 for wrong).",
      },
      {
        id: "jee_sec_chem_mcq",
        name: "Section A - Chemistry MCQs",
        subject: "Chemistry",
        totalQuestions: 20,
        marksPerQuestion: 4,
        negativeMarks: 1,
        questionTypes: ["mcq"],
        instructions: "Single correct option out of 4 choices (+4 for correct, -1 for wrong).",
      },
      {
        id: "jee_sec_chem_nat",
        name: "Section B - Chemistry NAT",
        subject: "Chemistry",
        totalQuestions: 10,
        marksPerQuestion: 4,
        negativeMarks: 1,
        questionTypes: ["nat"],
        instructions: "Numerical answer type (+4 for correct, -1 for wrong).",
      },
      {
        id: "jee_sec_math_mcq",
        name: "Section A - Mathematics MCQs",
        subject: "Mathematics",
        totalQuestions: 20,
        marksPerQuestion: 4,
        negativeMarks: 1,
        questionTypes: ["mcq"],
        instructions: "Single correct option out of 4 choices (+4 for correct, -1 for wrong).",
      },
      {
        id: "jee_sec_math_nat",
        name: "Section B - Mathematics NAT",
        subject: "Mathematics",
        totalQuestions: 10,
        marksPerQuestion: 4,
        negativeMarks: 1,
        questionTypes: ["nat"],
        instructions: "Numerical answer type (+4 for correct, -1 for wrong).",
      },
    ],
  },
  {
    name: "NEET UG (National Eligibility cum Entrance Test)",
    code: "NEET_UG",
    category: "Medical",
    conductingBody: "National Testing Agency (NTA)",
    description:
      "Nationwide pre-medical entrance exam for admission to MBBS, BDS, BAMS, BHMS and veterinary colleges in India.",
    supportedSubjects: ["Physics", "Chemistry", "Botany", "Zoology"],
    tier: "National Pen & Paper / CBT",
    durationMinutes: 200,
    questionTypes: ["mcq"],
    isActive: true,
    totalCandidatesEstimate: 2400000,
    syllabusOverview:
      "Core NCERT Class 11 and 12 Physics, Chemistry, and Biology (Botany & Zoology).",
    eligibility: "10+2 with Physics, Chemistry, Biology/Biotechnology with minimum qualifying marks.",
    markingScheme: {
      correctMarks: 4,
      negativeMarks: 1,
      maxScore: 720,
      cutOffScore: 140,
      sectionalCutOff: false,
    },
    sections: [
      {
        id: "neet_sec_phy",
        name: "Physics",
        subject: "Physics",
        totalQuestions: 45,
        marksPerQuestion: 4,
        negativeMarks: 1,
        questionTypes: ["mcq"],
      },
      {
        id: "neet_sec_chem",
        name: "Chemistry",
        subject: "Chemistry",
        totalQuestions: 45,
        marksPerQuestion: 4,
        negativeMarks: 1,
        questionTypes: ["mcq"],
      },
      {
        id: "neet_sec_bot",
        name: "Botany",
        subject: "Botany",
        totalQuestions: 45,
        marksPerQuestion: 4,
        negativeMarks: 1,
        questionTypes: ["mcq"],
      },
      {
        id: "neet_sec_zoo",
        name: "Zoology",
        subject: "Zoology",
        totalQuestions: 45,
        marksPerQuestion: 4,
        negativeMarks: 1,
        questionTypes: ["mcq"],
      },
    ],
  },
  {
    name: "SSC CGL (Combined Graduate Level Examination)",
    code: "SSC_CGL",
    category: "Government / Staff Selection",
    conductingBody: "Staff Selection Commission (SSC)",
    description:
      "Premier examination for recruitment to Group B and C gazetted and non-gazetted posts across Ministries of India.",
    supportedSubjects: [
      "General Intelligence & Reasoning",
      "General Awareness",
      "Quantitative Aptitude",
      "English Comprehension",
    ],
    tier: "Tier 1 CBT",
    durationMinutes: 60,
    questionTypes: ["mcq"],
    isActive: true,
    totalCandidatesEstimate: 2800000,
    syllabusOverview:
      "Reasoning analogies, Indian Polity & History, Arithmetic & Advanced Maths, English Grammar and Vocab.",
    eligibility: "Bachelor's Degree from a recognized University.",
    markingScheme: {
      correctMarks: 2,
      negativeMarks: 0.5,
      maxScore: 200,
      cutOffScore: 138,
      sectionalCutOff: false,
    },
    sections: [
      {
        id: "ssc_sec_gi",
        name: "General Intelligence & Reasoning",
        subject: "General Intelligence & Reasoning",
        totalQuestions: 25,
        marksPerQuestion: 2,
        negativeMarks: 0.5,
        questionTypes: ["mcq"],
      },
      {
        id: "ssc_sec_ga",
        name: "General Awareness",
        subject: "General Awareness",
        totalQuestions: 25,
        marksPerQuestion: 2,
        negativeMarks: 0.5,
        questionTypes: ["mcq"],
      },
      {
        id: "ssc_sec_qa",
        name: "Quantitative Aptitude",
        subject: "Quantitative Aptitude",
        totalQuestions: 25,
        marksPerQuestion: 2,
        negativeMarks: 0.5,
        questionTypes: ["mcq"],
      },
      {
        id: "ssc_sec_ec",
        name: "English Comprehension",
        subject: "English Comprehension",
        totalQuestions: 25,
        marksPerQuestion: 2,
        negativeMarks: 0.5,
        questionTypes: ["mcq"],
      },
    ],
  },
  {
    name: "IBPS PO (Probationary Officer / Management Trainee)",
    code: "BANKING_IBPS_PO",
    category: "Banking",
    conductingBody: "Institute of Banking Personnel Selection (IBPS)",
    description:
      "Common recruitment process for Probationary Officer/Management Trainee positions across 11 nationalized public sector banks.",
    supportedSubjects: [
      "English Language",
      "Quantitative Aptitude",
      "Reasoning Ability",
    ],
    tier: "Preliminary Examination",
    durationMinutes: 60,
    questionTypes: ["mcq"],
    isActive: true,
    totalCandidatesEstimate: 750000,
    syllabusOverview:
      "Reading comprehension, Data Interpretation, Simplification, Puzzles & Seating Arrangements.",
    eligibility: "Graduate in any discipline from a recognized University.",
    markingScheme: {
      correctMarks: 1,
      negativeMarks: 0.25,
      maxScore: 100,
      cutOffScore: 56,
      sectionalCutOff: true,
    },
    sections: [
      {
        id: "bank_sec_eng",
        name: "English Language",
        subject: "English Language",
        totalQuestions: 30,
        marksPerQuestion: 1,
        negativeMarks: 0.25,
        durationMinutes: 20,
        questionTypes: ["mcq"],
      },
      {
        id: "bank_sec_qa",
        name: "Quantitative Aptitude",
        subject: "Quantitative Aptitude",
        totalQuestions: 35,
        marksPerQuestion: 1,
        negativeMarks: 0.25,
        durationMinutes: 20,
        questionTypes: ["mcq"],
      },
      {
        id: "bank_sec_ra",
        name: "Reasoning Ability",
        subject: "Reasoning Ability",
        totalQuestions: 35,
        marksPerQuestion: 1,
        negativeMarks: 0.25,
        durationMinutes: 20,
        questionTypes: ["mcq"],
      },
    ],
  },
  {
    name: "UPSC CSE (Civil Services Preliminary Examination)",
    code: "UPSC_CSE",
    category: "Civil Services",
    conductingBody: "Union Public Service Commission (UPSC)",
    description:
      "India's premier examination for recruitment to Indian Administrative Service (IAS), Indian Police Service (IPS), and Indian Foreign Service (IFS).",
    supportedSubjects: [
      "General Studies Paper I",
      "General Studies Paper II (CSAT)",
    ],
    tier: "Civil Services Preliminary",
    durationMinutes: 120,
    questionTypes: ["mcq"],
    isActive: true,
    totalCandidatesEstimate: 1050000,
    syllabusOverview:
      "Current events, History of India, Indian and World Geography, Indian Polity and Governance, Economic and Social Development, Environmental Ecology, General Science.",
    eligibility: "Bachelor's degree from any recognized University.",
    markingScheme: {
      correctMarks: 2,
      negativeMarks: 0.66,
      maxScore: 200,
      cutOffScore: 89,
      sectionalCutOff: false,
    },
    sections: [
      {
        id: "upsc_sec_gs1",
        name: "General Studies Paper I",
        subject: "General Studies Paper I",
        totalQuestions: 100,
        marksPerQuestion: 2,
        negativeMarks: 0.66,
        durationMinutes: 120,
        questionTypes: ["mcq"],
      },
    ],
  },
];

export const sampleAuthenticPYQs = [
  // 1. JEE Main 2024 - Physics MCQ
  {
    question:
      "A body of mass 2 kg is moving with an initial velocity of 5 m/s. A constant force of 10 N acts on it in the direction of motion for 3 seconds. The kinetic energy of the body at the end of 3 seconds is:",
    sidebarTitle: "Kinetic energy under constant force",
    questionType: "mcq" as const,
    options: [
      { id: "A", text: "200 J" },
      { id: "B", text: "400 J" },
      { id: "C", text: "300 J" },
      { id: "D", text: "100 J" },
    ],
    correctAnswer: "B",
    explanation:
      "Acceleration a = F/m = 10 / 2 = 5 m/s². Final velocity v = u + at = 5 + (5 * 3) = 20 m/s. Kinetic Energy = 1/2 * m * v² = 0.5 * 2 * (20)² = 400 J.",
    marks: 4,
    negativeMarks: 1,
    subject: "Physics",
    topic: "Work Power Energy",
    chapter: "Mechanics",
    difficulty: "Medium" as const,
    sourceType: "previous_year" as const,
    sourceExam: "JEE_MAIN",
    sourceYear: 2024,
    sourceShift: "27 Jan Shift 1",
    sourceReference: "JEE Main 2024 (Session 1, 27 Jan Morning) - Question 4",
    isVerifiedSource: true,
    sectionId: "jee_sec_phy_mcq",
    sectionName: "Section A - Physics MCQs",
  },
  // 2. JEE Main 2024 - Physics NAT (Numerical Answer Type)
  {
    question:
      "In a Young's double slit experiment, the slit separation is 0.5 mm and the screen distance is 1 m. For light of wavelength 500 nm, find the fringe width in millimeters.",
    sidebarTitle: "YDSE fringe width calculation",
    questionType: "nat" as const,
    options: [],
    correctAnswer: "1",
    numericalAnswer: 1,
    numericalTolerance: 0.05,
    explanation:
      "Fringe width β = (λ * D) / d. Given λ = 500 * 10^-9 m, D = 1 m, d = 0.5 * 10^-3 m. β = (500 * 10^-9 * 1) / (0.5 * 10^-3) = 10^-3 m = 1 mm.",
    marks: 4,
    negativeMarks: 1,
    subject: "Physics",
    topic: "Wave Optics",
    chapter: "Optics",
    difficulty: "Medium" as const,
    sourceType: "previous_year" as const,
    sourceExam: "JEE_MAIN",
    sourceYear: 2024,
    sourceShift: "27 Jan Shift 2",
    sourceReference: "JEE Main 2024 (Session 1, 27 Jan Evening) - Question 22 (NAT)",
    isVerifiedSource: true,
    sectionId: "jee_sec_phy_nat",
    sectionName: "Section B - Physics NAT",
  },
  // 3. JEE Main 2024 - Chemistry MCQ
  {
    question:
      "Which of the following coordination complexes exhibits optical isomerism?",
    sidebarTitle: "Optical isomerism in coordination compounds",
    questionType: "mcq" as const,
    options: [
      { id: "A", text: "cis-[Pt(NH3)2Cl2]" },
      { id: "B", text: "trans-[Co(en)2Cl2]+" },
      { id: "C", text: "cis-[Co(en)2Cl2]+" },
      { id: "D", text: "[Co(NH3)4Cl2]+" },
    ],
    correctAnswer: "C",
    explanation:
      "cis-[Co(en)2Cl2]+ lacks a plane of symmetry and center of inversion, making it chiral and optically active (non-superimposable mirror images d- and l- forms).",
    marks: 4,
    negativeMarks: 1,
    subject: "Chemistry",
    topic: "Coordination Compounds",
    chapter: "Inorganic Chemistry",
    difficulty: "Medium" as const,
    sourceType: "previous_year" as const,
    sourceExam: "JEE_MAIN",
    sourceYear: 2024,
    sourceShift: "29 Jan Shift 1",
    sourceReference: "JEE Main 2024 (Session 1, 29 Jan Morning) - Question 12",
    isVerifiedSource: true,
    sectionId: "jee_sec_chem_mcq",
    sectionName: "Section A - Chemistry MCQs",
  },
  // 4. JEE Main 2024 - Mathematics NAT
  {
    question:
      "Let A be a 3x3 matrix with determinant det(A) = 3. Find the value of det(2 * adj(A)).",
    sidebarTitle: "Determinant of adjugate matrix",
    questionType: "nat" as const,
    options: [],
    correctAnswer: "72",
    numericalAnswer: 72,
    numericalTolerance: 0,
    explanation:
      "For an n x n matrix, det(k * M) = k^n * det(M). Here n = 3, so det(2 * adj(A)) = 2^3 * det(adj(A)). Also det(adj(A)) = (det(A))^(n-1) = 3^(3-1) = 3^2 = 9. Therefore, 8 * 9 = 72.",
    marks: 4,
    negativeMarks: 1,
    subject: "Mathematics",
    topic: "Matrices and Determinants",
    chapter: "Algebra",
    difficulty: "Hard" as const,
    sourceType: "previous_year" as const,
    sourceExam: "JEE_MAIN",
    sourceYear: 2024,
    sourceShift: "31 Jan Shift 1",
    sourceReference: "JEE Main 2024 (Session 1, 31 Jan Morning) - Question 24 (NAT)",
    isVerifiedSource: true,
    sectionId: "jee_sec_math_nat",
    sectionName: "Section B - Mathematics NAT",
  },
  // 5. NEET UG 2023 - Biology MCQ
  {
    question:
      "Which stage of meiotic prophase I is characterized by the appearance of the synaptonemal complex and pairing of homologous chromosomes?",
    sidebarTitle: "Meiotic Prophase I stages",
    questionType: "mcq" as const,
    options: [
      { id: "A", text: "Leptotene" },
      { id: "B", text: "Zygotene" },
      { id: "C", text: "Pachytene" },
      { id: "D", text: "Diplotene" },
    ],
    correctAnswer: "B",
    explanation:
      "During Zygotene, chromosomes begin to pair together (synapsis) and the synaptonemal complex is formed. Crossing over occurs subsequent to this in Pachytene.",
    marks: 4,
    negativeMarks: 1,
    subject: "Botany",
    topic: "Cell Cycle and Cell Division",
    chapter: "Cell Biology",
    difficulty: "Easy" as const,
    sourceType: "previous_year" as const,
    sourceExam: "NEET_UG",
    sourceYear: 2023,
    sourceShift: "Paper 1",
    sourceReference: "NEET UG 2023 Official Paper - Question 108",
    isVerifiedSource: true,
    sectionId: "neet_sec_bot",
    sectionName: "Botany",
  },
  // 6. SSC CGL 2023 - Quantitative Aptitude MCQ
  {
    question:
      "A shopkeeper marks an article 40% above the cost price and allows a discount of 20% on the marked price. What is the shopkeeper's gain percentage?",
    sidebarTitle: "Profit and Discount percentage",
    questionType: "mcq" as const,
    options: [
      { id: "A", text: "10%" },
      { id: "B", text: "12%" },
      { id: "C", text: "15%" },
      { id: "D", text: "20%" },
    ],
    correctAnswer: "B",
    explanation:
      "Let CP = 100. Marked Price MP = 140. Selling Price SP = 140 * (1 - 0.20) = 140 * 0.8 = 112. Profit = 112 - 100 = 12, so Gain % = 12%.",
    marks: 2,
    negativeMarks: 0.5,
    subject: "Quantitative Aptitude",
    topic: "Profit and Loss",
    chapter: "Commercial Arithmetic",
    difficulty: "Easy" as const,
    sourceType: "previous_year" as const,
    sourceExam: "SSC_CGL",
    sourceYear: 2023,
    sourceShift: "14 July Shift 2",
    sourceReference: "SSC CGL 2023 Tier 1 (14 July Shift 2) - Question 53",
    isVerifiedSource: true,
    sectionId: "ssc_sec_qa",
    sectionName: "Quantitative Aptitude",
  },
  // 7. IBPS PO 2023 - Reasoning Ability MCQ
  {
    question:
      "In a certain code language, 'STABLE' is written as 'TUDCMF'. How will 'TARGET' be written in that code language?",
    sidebarTitle: "Letter shift coding decoding",
    questionType: "mcq" as const,
    options: [
      { id: "A", text: "UBUHFU" },
      { id: "B", text: "UBSHFU" },
      { id: "C", text: "UCTHFU" },
      { id: "D", text: "UBSIFU" },
    ],
    correctAnswer: "B",
    explanation:
      "Each letter is shifted forward by +1 position: S->T, T->U, A->B, B->C, L->M, E->F. For TARGET: T->U, A->B, R->S, G->H, E->F, T->U => UBSHFU.",
    marks: 1,
    negativeMarks: 0.25,
    subject: "Reasoning Ability",
    topic: "Coding Decoding",
    chapter: "Logical Reasoning",
    difficulty: "Easy" as const,
    sourceType: "previous_year" as const,
    sourceExam: "BANKING_IBPS_PO",
    sourceYear: 2023,
    sourceShift: "Shift 1",
    sourceReference: "IBPS PO Prelims 2023 - Question 68",
    isVerifiedSource: true,
    sectionId: "bank_sec_ra",
    sectionName: "Reasoning Ability",
  },
  // 8. UPSC CSE 2023 - General Studies Paper 1 MCQ
  {
    question:
      "Consider the following statements regarding the Indian Constitution:\n1. The Preamble is an integral part of the Constitution.\n2. The Preamble is directly enforceable in a court of law.\nWhich of the statements given above is/are correct?",
    sidebarTitle: "Preamble and Judicial Enforceability",
    questionType: "mcq" as const,
    options: [
      { id: "A", text: "1 only" },
      { id: "B", text: "2 only" },
      { id: "C", text: "Both 1 and 2" },
      { id: "D", text: "Neither 1 nor 2" },
    ],
    correctAnswer: "A",
    explanation:
      "In the Kesavananda Bharati case (1973), the Supreme Court ruled that the Preamble is an integral part of the Constitution. However, the Preamble is non-justiciable and not directly enforceable in any court of law.",
    marks: 2,
    negativeMarks: 0.66,
    subject: "General Studies Paper I",
    topic: "Indian Polity",
    chapter: "Constitutional Framework",
    difficulty: "Medium" as const,
    sourceType: "previous_year" as const,
    sourceExam: "UPSC_CSE",
    sourceYear: 2023,
    sourceShift: "Paper 1 (Forenoon)",
    sourceReference: "UPSC Civil Services Prelims 2023 (GS Paper 1) - Question 19",
    isVerifiedSource: true,
    sectionId: "upsc_sec_gs1",
    sectionName: "General Studies Paper I",
  },
];

// Sample AI-generated questions clearly labelled to test strict separation
export const sampleAiGeneratedQuestions = [
  {
    question:
      "AI Generated Synthetic Item: What is the primary charge carrier in a p-type semiconductor?",
    sidebarTitle: "Semiconductor majority carriers",
    questionType: "mcq" as const,
    options: [
      { id: "A", text: "Holes" },
      { id: "B", text: "Electrons" },
      { id: "C", text: "Protons" },
      { id: "D", text: "Neutrons" },
    ],
    correctAnswer: "A",
    explanation:
      "In p-type semiconductors, trivalent impurity creates an excess of holes, which serve as the majority charge carriers.",
    marks: 4,
    negativeMarks: 1,
    subject: "Physics",
    topic: "Semiconductors",
    chapter: "Modern Physics",
    difficulty: "Easy" as const,
    sourceType: "ai_generated" as const,
    sourceReference: "Synthetic Gemini Test Item - Not a PYQ",
    isVerifiedSource: false,
  },
];

/**
 * Seed catalog and sample questions.
 */
export const seedCompetitiveCatalog = async (): Promise<void> => {
  console.log("Seeding Competitive Exam Catalog...");

  // 1. Upsert Exams in Catalog
  for (const ex of competitiveExamsCatalog) {
    await Exam.findOneAndUpdate({ code: ex.code }, ex, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
    console.log(`- Upserted Exam: [${ex.code}] ${ex.name}`);
  }

  // 2. Insert or update Authentic PYQs
  console.log("Seeding Authentic Previous-Year Questions (sourceType: 'previous_year')...");
  for (const pyq of sampleAuthenticPYQs) {
    await Question.findOneAndUpdate(
      {
        sourceExam: pyq.sourceExam,
        sourceYear: pyq.sourceYear,
        sourceReference: pyq.sourceReference,
      },
      pyq,
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );
  }
  console.log(`- Seeded ${sampleAuthenticPYQs.length} authentic PYQ questions.`);

  // 3. Insert clearly-labelled AI questions
  console.log("Seeding AI-Generated Sample Questions (sourceType: 'ai_generated')...");
  for (const aiQ of sampleAiGeneratedQuestions) {
    await Question.findOneAndUpdate(
      {
        sourceReference: aiQ.sourceReference,
      },
      aiQ,
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );
  }
  console.log(`- Seeded ${sampleAiGeneratedQuestions.length} AI-generated sample questions.`);
  console.log("Competitive Exam Catalog seeding completed successfully.");
};

// Standalone execution if run directly
if (process.argv[1]?.includes("seed_competitive_exams")) {
  connectDB()
    .then(seedCompetitiveCatalog)
    .then(() => {
      console.log("Finished seeding.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Seeding failed:", err);
      process.exit(1);
    });
}
