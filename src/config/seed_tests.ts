import mongoose from "mongoose";
import dotenv from "dotenv";
import connectDB from "./db";
import User from "../models/User";
import StudentProfile from "../models/StudentProfile";
import Test from "../models/Test";
import Question from "../models/Question";

dotenv.config();

interface SeedQuestionData {
  question: string;
  sidebarTitle?: string;
  options: { id: "A" | "B" | "C" | "D"; text: string }[];
  correctAnswer: "A" | "B" | "C" | "D";
  explanation: string;
  marks?: number;
  order: number;
}

interface SeedTestData {
  title: string;
  description: string;
  subject: string;
  board: string;
  classLevel: string;
  durationMinutes: number;
  isLocked: boolean;
  category: string;
  questions: SeedQuestionData[];
}

const seedTestsList: SeedTestData[] = [
  {
    title: "Test 1",
    description:
      "Lorem ipsum dolor sit amet consectetur adipisicing elit. Delectus placeat accusamus maxime distinctio quam atque molestias eaque aliquid! Unde, fugiat.",
    subject: "Science",
    board: "CBSE",
    classLevel: "Class 10",
    durationMinutes: 15,
    isLocked: false,
    category: "Science (CBSE Class 10)",
    questions: [
      {
        order: 1,
        question: "Magnesium ribbon is rubbed before burning because it has a coating of ?",
        sidebarTitle: "Magnesium ribbon is rubbed before burning because it has a coating of ?",
        options: [
          { id: "A", text: "basic magnesium carbonate" },
          { id: "B", text: "basic magnesium oxide" },
          { id: "C", text: "basic magnesium sulphide" },
          { id: "D", text: "basic magnesium chloride" },
        ],
        correctAnswer: "B",
        explanation:
          "Magnesium is a reactive metal. When stored, it reacts with atmospheric oxygen to form a stable, non-reactive protective layer of basic magnesium oxide (MgO) on its surface. Rubbing with sandpaper removes this oxide film so that it burns smoothly in air.",
        marks: 1,
      },
      {
        order: 2,
        question: "What is the capital city of India?",
        sidebarTitle: "Capital of India",
        options: [
          { id: "A", text: "Mumbai" },
          { id: "B", text: "New Delhi" },
          { id: "C", text: "Kolkata" },
          { id: "D", text: "Chennai" },
        ],
        correctAnswer: "B",
        explanation:
          "New Delhi is the national capital of India, housing the executive, judicial, and legislative branches of the Government of India.",
        marks: 1,
      },
      {
        order: 3,
        question: "Who is Tony Stark in the Marvel Cinematic Universe?",
        sidebarTitle: "Who is Tony Stark?",
        options: [
          { id: "A", text: "Captain America" },
          { id: "B", text: "Iron Man" },
          { id: "C", text: "Thor" },
          { id: "D", text: "Spider-Man" },
        ],
        correctAnswer: "B",
        explanation:
          "Tony Stark is a billionaire industrialist and genius inventor who crafts the powered armor suit to become the superhero Iron Man.",
        marks: 1,
      },
      {
        order: 4,
        question: "Which of the following reactions is an example of an exothermic combination reaction?",
        sidebarTitle: "Exothermic Combination Reaction",
        options: [
          { id: "A", text: "Decomposition of calcium carbonate" },
          { id: "B", text: "Reaction of quicklime (CaO) with water" },
          { id: "C", text: "Electrolysis of water" },
          { id: "D", text: "Dissolution of ammonium chloride in water" },
        ],
        correctAnswer: "B",
        explanation:
          "Calcium oxide (quicklime) reacts vigorously with water to produce slaked lime (calcium hydroxide) releasing large amounts of heat: CaO(s) + H2O(l) -> Ca(OH)2(aq) + Heat.",
        marks: 1,
      },
      {
        order: 5,
        question: "What is the chemical formula of rust on iron?",
        sidebarTitle: "Formula of Rust",
        options: [
          { id: "A", text: "FeO" },
          { id: "B", text: "Fe3O4" },
          { id: "C", text: "Fe2O3 · xH2O" },
          { id: "D", text: "FeCO3" },
        ],
        correctAnswer: "C",
        explanation:
          "Rust is hydrated ferric oxide formed when iron reacts with oxygen in the presence of water or moisture: Fe2O3 · xH2O.",
        marks: 1,
      },
    ],
  },
  {
    title: "Test 2",
    description:
      "Lorem ipsum dolor sit amet consectetur adipisicing elit. Delectus placeat accusamus maxime distinctio quam atque molestias eaque aliquid! Unde, fugiat.",
    subject: "Mathematics",
    board: "CBSE",
    classLevel: "Class 10",
    durationMinutes: 20,
    isLocked: false,
    category: "Mathematics (CBSE Class 10)",
    questions: [
      {
        order: 1,
        question: "If two positive integers a and b are written as a = x³y² and b = xy³, where x, y are prime numbers, then HCF(a, b) is:",
        sidebarTitle: "HCF of prime factorizations",
        options: [
          { id: "A", text: "xy" },
          { id: "B", text: "xy²" },
          { id: "C", text: "x³y³" },
          { id: "D", text: "x²y²" },
        ],
        correctAnswer: "B",
        explanation:
          "HCF is the product of the smallest power of each common prime factor involved in the numbers. Smallest power of x is x¹, and smallest power of y is y², so HCF = xy².",
        marks: 1,
      },
      {
        order: 2,
        question: "The zeroes of the quadratic polynomial x² + 7x + 10 are:",
        sidebarTitle: "Zeroes of polynomial",
        options: [
          { id: "A", text: "-2 and -5" },
          { id: "B", text: "2 and 5" },
          { id: "C", text: "-2 and 5" },
          { id: "D", text: "2 and -5" },
        ],
        correctAnswer: "A",
        explanation:
          "x² + 7x + 10 = (x + 2)(x + 5) = 0. Hence, x = -2 or x = -5.",
        marks: 1,
      },
      {
        order: 3,
        question: "Which of the following is an irrational number?",
        sidebarTitle: "Irrational Numbers",
        options: [
          { id: "A", text: "22/7" },
          { id: "B", text: "3.1415" },
          { id: "C", text: "√2" },
          { id: "D", text: "√9" },
        ],
        correctAnswer: "C",
        explanation:
          "√2 cannot be written in the form p/q where p, q are integers and q != 0; its decimal expansion is non-terminating and non-repeating.",
        marks: 1,
      },
      {
        order: 4,
        question: "For what value of k do the equations 2x + 3y = 7 and (k-1)x + (k+2)y = 3k have infinitely many solutions?",
        sidebarTitle: "Consistent linear system",
        options: [
          { id: "A", text: "k = 5" },
          { id: "B", text: "k = 7" },
          { id: "C", text: "k = 3" },
          { id: "D", text: "k = -5" },
        ],
        correctAnswer: "B",
        explanation:
          "For infinite solutions: 2/(k-1) = 3/(k+2) = 7/3k. Solving 2(k+2) = 3(k-1) gives 2k + 4 = 3k - 3 => k = 7.",
        marks: 1,
      },
    ],
  },
  {
    title: "Test 3",
    description:
      "Lorem ipsum dolor sit amet consectetur adipisicing elit. Delectus placeat accusamus maxime distinctio quam atque molestias eaque aliquid! Unde, fugiat.",
    subject: "Physics",
    board: "CBSE",
    classLevel: "Class 10",
    durationMinutes: 10,
    isLocked: false,
    category: "Physics (CBSE Class 10)",
    questions: [
      {
        order: 1,
        question: "A convex lens has a focal length of 20 cm. At what distance from the lens should an object be placed to obtain a real image of same size?",
        sidebarTitle: "Convex lens image distance",
        options: [
          { id: "A", text: "20 cm" },
          { id: "B", text: "40 cm" },
          { id: "C", text: "10 cm" },
          { id: "D", text: "Infinity" },
        ],
        correctAnswer: "B",
        explanation:
          "For a convex lens, a real and same-sized inverted image is formed when the object is placed at 2F (twice the focal length): 2 x 20 cm = 40 cm.",
        marks: 1,
      },
      {
        order: 2,
        question: "The SI unit of electric potential difference is:",
        sidebarTitle: "Unit of Potential Difference",
        options: [
          { id: "A", text: "Ampere" },
          { id: "B", text: "Volt" },
          { id: "C", text: "Ohm" },
          { id: "D", text: "Joule" },
        ],
        correctAnswer: "B",
        explanation:
          "The SI unit of electric potential difference is the Volt (V), named after Alessandro Volta. 1 Volt = 1 Joule / 1 Coulomb.",
        marks: 1,
      },
      {
        order: 3,
        question: "Which color of white light deviates the most when passing through a triangular glass prism?",
        sidebarTitle: "Dispersion of Light",
        options: [
          { id: "A", text: "Red" },
          { id: "B", text: "Green" },
          { id: "C", text: "Violet" },
          { id: "D", text: "Yellow" },
        ],
        correctAnswer: "C",
        explanation:
          "Violet light has the shortest wavelength in the visible spectrum and therefore travels slowest in glass, refracting (deviating) through the greatest angle.",
        marks: 1,
      },
    ],
  },
  {
    title: "Test 4",
    description:
      "Lorem ipsum dolor sit amet consectetur adipisicing elit. Delectus placeat accusamus maxime distinctio quam atque molestias eaque aliquid! Unde, fugiat.",
    subject: "Biology",
    board: "CBSE",
    classLevel: "Class 10",
    durationMinutes: 30,
    isLocked: true,
    category: "Biology (CBSE Class 10)",
    questions: [
      {
        order: 1,
        question: "In amoeba, food is digested inside the:",
        sidebarTitle: "Digestion in Amoeba",
        options: [
          { id: "A", text: "Food vacuole" },
          { id: "B", text: "Mitochondria" },
          { id: "C", text: "Pseudopodia" },
          { id: "D", text: "Chloroplast" },
        ],
        correctAnswer: "A",
        explanation: "Food vacuole is formed when pseudopodia enclose the food particle; digestive enzymes break down food inside it.",
        marks: 1,
      },
      {
        order: 2,
        question: "The breakdown of pyruvate to give carbon dioxide, water and energy takes place in:",
        sidebarTitle: "Pyruvate breakdown site",
        options: [
          { id: "A", text: "Cytoplasm" },
          { id: "B", text: "Mitochondria" },
          { id: "C", text: "Chloroplast" },
          { id: "D", text: "Nucleus" },
        ],
        correctAnswer: "B",
        explanation: "Aerobic respiration occurs in the mitochondria where pyruvate is oxidized to CO2, H2O, and 36-38 ATP molecules.",
        marks: 1,
      },
    ],
  },
  {
    title: "Test 5",
    description:
      "Lorem ipsum dolor sit amet consectetur adipisicing elit. Delectus placeat accusamus maxime distinctio quam atque molestias eaque aliquid! Unde, fugiat.",
    subject: "Chemistry",
    board: "CBSE",
    classLevel: "Class 10",
    durationMinutes: 45,
    isLocked: true,
    category: "Chemistry (CBSE Class 10)",
    questions: [
      {
        order: 1,
        question: "Which of the following non-metals is a liquid at room temperature?",
        sidebarTitle: "Liquid Non-Metal",
        options: [
          { id: "A", text: "Carbon" },
          { id: "B", text: "Bromine" },
          { id: "C", text: "Iodine" },
          { id: "D", text: "Phosphorus" },
        ],
        correctAnswer: "B",
        explanation: "Bromine (Br2) is the only non-metal that exists as a reddish-brown liquid at room temperature.",
        marks: 1,
      },
      {
        order: 2,
        question: "An alloy of mercury with other metals is known as:",
        sidebarTitle: "Alloy of Mercury",
        options: [
          { id: "A", text: "Amalgam" },
          { id: "B", text: "Solder" },
          { id: "C", text: "Bronze" },
          { id: "D", text: "Brass" },
        ],
        correctAnswer: "A",
        explanation: "An amalgam is an alloy of mercury with one or more other metals like silver, tin, or gold.",
        marks: 1,
      },
    ],
  },
  {
    title: "Test 6",
    description:
      "Lorem ipsum dolor sit amet consectetur adipisicing elit. Delectus placeat accusamus maxime distinctio quam atque molestias eaque aliquid! Unde, fugiat.",
    subject: "Comprehensive",
    board: "CBSE",
    classLevel: "Class 10",
    durationMinutes: 60,
    isLocked: true,
    category: "Full Mock Term Exam (CBSE Class 10)",
    questions: [
      {
        order: 1,
        question: "Electric current is measured using which instrument?",
        sidebarTitle: "Measuring electric current",
        options: [
          { id: "A", text: "Voltmeter" },
          { id: "B", text: "Ammeter" },
          { id: "C", text: "Galvanometer" },
          { id: "D", text: "Potentiometer" },
        ],
        correctAnswer: "B",
        explanation: "An ammeter is always connected in series in an electric circuit to measure electric current in amperes.",
        marks: 1,
      },
      {
        order: 2,
        question: "Which of the following compounds turns blue litmus red?",
        sidebarTitle: "Litmus indicator test",
        options: [
          { id: "A", text: "Sodium hydroxide" },
          { id: "B", text: "Hydrochloric acid" },
          { id: "C", text: "Sodium chloride" },
          { id: "D", text: "Potassium hydroxide" },
        ],
        correctAnswer: "B",
        explanation: "Acids like hydrochloric acid (HCl) turn blue litmus paper red due to presence of H+ ions.",
        marks: 1,
      },
    ],
  },
];

export const seedTests = async (): Promise<void> => {
  try {
    await connectDB();
    console.log("Connected to MongoDB for Test module seeding...");

    // 1. Ensure default demo student exists
    let studentUser = await User.findOne({ email: "student@edupye.com" });
    if (!studentUser) {
      studentUser = await User.create({
        email: "student@edupye.com",
        password: "password123",
        name: "Lekshman Student",
        userType: "student",
        language: "English",
      });
      console.log("Created demo student user: student@edupye.com");
    }

    let studentProfile = await StudentProfile.findOne({ userId: studentUser._id });
    if (!studentProfile) {
      studentProfile = await StudentProfile.create({
        userId: studentUser._id,
        name: "Lekshman Student",
        goal: "School Curriculum Mastery",
        learningPath: "school",
        education: {
          level: "school",
          institution: "Delhi Public School",
          board: "CBSE",
          classLevel: "Class 10",
        },
        schoolDetails: {
          schoolName: "Delhi Public School",
          board: "CBSE",
          classLevel: "Class 10",
          studyMode: "full_syllabus",
          selectedSubject: "Science",
        },
      });
      console.log("Created demo StudentProfile for Lekshman Student");
    }

    // 2. Clear old test questions and tests to prevent duplicate buildup
    const existingTests = await Test.find({ board: "CBSE", classLevel: "Class 10" });
    const existingTestIds = existingTests.map((t) => t._id);

    if (existingTestIds.length > 0) {
      await Question.deleteMany({ testId: { $in: existingTestIds } });
      await Test.deleteMany({ _id: { $in: existingTestIds } });
      console.log(`Cleared ${existingTestIds.length} existing tests for fresh seed.`);
    }

    // 3. Seed tests and their respective questions
    for (const testData of seedTestsList) {
      const testDoc = await Test.create({
        title: testData.title,
        description: testData.description,
        subject: testData.subject,
        board: testData.board,
        classLevel: testData.classLevel,
        durationMinutes: testData.durationMinutes,
        totalMarks: testData.questions.reduce((sum, q) => sum + (q.marks || 1), 0),
        passingMarks: Math.ceil(testData.questions.length * 0.4),
        isLocked: testData.isLocked,
        category: testData.category,
        status: "published",
        questions: [],
      });

      const questionIds: mongoose.Types.ObjectId[] = [];

      for (const qData of testData.questions) {
        const questionDoc = await Question.create({
          testId: testDoc._id,
          question: qData.question,
          sidebarTitle: qData.sidebarTitle || qData.question.slice(0, 45),
          options: qData.options,
          correctAnswer: qData.correctAnswer,
          explanation: qData.explanation,
          marks: qData.marks || 1,
          order: qData.order,
          subject: testData.subject,
          board: testData.board,
          classLevel: testData.classLevel,
        });

        questionIds.push(questionDoc._id as mongoose.Types.ObjectId);
      }

      testDoc.questions = questionIds;
      await testDoc.save();

      console.log(
        `Seeded "${testDoc.title}" (${testDoc.subject}, locked: ${testDoc.isLocked}) with ${questionIds.length} questions.`
      );
    }

    console.log("\nTest Module Seeding Completed Successfully!");
    console.log("Demo Student User ID:", studentUser._id.toString());
    console.log("Demo Student Profile ID:", studentProfile._id.toString());
  } catch (error) {
    console.error("Error seeding tests:", error);
    throw error;
  }
};

// Allow direct execution: npx tsx src/config/seed_tests.ts
if (process.argv[1]?.includes("seed_tests")) {
  seedTests()
    .then(() => {
      console.log("Done.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Failed to seed tests:", err);
      process.exit(1);
    });
}
