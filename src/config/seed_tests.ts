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
  {
    title: "Physics - Units, Measurements & Motion (Test 1)",
    description:
      "Core exam assessment covering dimensional analysis, kinematics graphs, vector resolution, projectile trajectory, and rectilinear motion.",
    subject: "Physics",
    board: "State Board",
    classLevel: "Class 11",
    durationMinutes: 15,
    isLocked: false,
    category: "Physics (State Board Class 11)",
    questions: [
      {
        order: 1,
        question: "What is the dimensional formula of the Universal Gravitational Constant (G)?",
        sidebarTitle: "Dimensions of Gravitational Constant",
        options: [
          { id: "A", text: "[M⁻¹ L³ T⁻²]" },
          { id: "B", text: "[M L² T⁻²]" },
          { id: "C", text: "[M⁻¹ L² T⁻¹]" },
          { id: "D", text: "[M L³ T⁻³]" },
        ],
        correctAnswer: "A",
        explanation: "From Newton's law F = G·m₁·m₂/r², G = F·r²/(m₁·m₂) = [M L T⁻²]·[L²] / [M²] = [M⁻¹ L³ T⁻²].",
        marks: 1,
      },
      {
        order: 2,
        question: "What physical quantity is represented by the area under a Velocity-Time graph?",
        sidebarTitle: "Area under V-T graph",
        options: [
          { id: "A", text: "Acceleration" },
          { id: "B", text: "Displacement" },
          { id: "C", text: "Force" },
          { id: "D", text: "Speed" },
        ],
        correctAnswer: "B",
        explanation: "The area under a velocity-time graph equals the integral ∫ v dt, which corresponds to the displacement of the body.",
        marks: 1,
      },
      {
        order: 3,
        question: "For a body executing uniform circular motion, which of the following quantities remains constant throughout?",
        sidebarTitle: "Uniform circular motion",
        options: [
          { id: "A", text: "Velocity" },
          { id: "B", text: "Acceleration" },
          { id: "C", text: "Speed" },
          { id: "D", text: "Linear momentum" },
        ],
        correctAnswer: "C",
        explanation: "In uniform circular motion, the direction of motion changes continuously, causing velocity, acceleration, and momentum to change. Only the scalar speed remains constant.",
        marks: 1,
      },
      {
        order: 4,
        question: "At what angle of projection with the horizontal is the horizontal range of a projectile maximum on level ground?",
        sidebarTitle: "Maximum horizontal range",
        options: [
          { id: "A", text: "30°" },
          { id: "B", text: "45°" },
          { id: "C", text: "60°" },
          { id: "D", text: "90°" },
        ],
        correctAnswer: "B",
        explanation: "Range R = (u² sin 2θ) / g. Range is maximum when sin 2θ = 1, meaning 2θ = 90° or θ = 45°.",
        marks: 1,
      },
      {
        order: 5,
        question: "If the displacement of a particle varies with time according to s = 2t³, what is its acceleration at t = 2 seconds?",
        sidebarTitle: "Acceleration from displacement",
        options: [
          { id: "A", text: "12 m/s²" },
          { id: "B", text: "24 m/s²" },
          { id: "C", text: "16 m/s²" },
          { id: "D", text: "8 m/s²" },
        ],
        correctAnswer: "B",
        explanation: "Velocity v = ds/dt = 6t². Acceleration a = dv/dt = 12t. At t = 2 s, a = 12(2) = 24 m/s².",
        marks: 1,
      },
    ],
  },
  {
    title: "Physics - Laws of Motion, Work & Energy (Test 2)",
    description:
      "Core principles of inertia, Newton's laws, impulse, friction, conservation of momentum, and work-energy theorem.",
    subject: "Physics",
    board: "State Board",
    classLevel: "Class 11",
    durationMinutes: 20,
    isLocked: false,
    category: "Physics (State Board Class 11)",
    questions: [
      {
        order: 1,
        question: "A rocket propulsion system functions fundamentally on the conservation of:",
        sidebarTitle: "Rocket propulsion principle",
        options: [
          { id: "A", text: "Linear momentum" },
          { id: "B", text: "Angular momentum" },
          { id: "C", text: "Kinetic energy" },
          { id: "D", text: "Mass" },
        ],
        correctAnswer: "A",
        explanation: "The backward expulsion of high-velocity exhaust gases imparts forward momentum to the rocket, conserving total linear momentum.",
        marks: 1,
      },
      {
        order: 2,
        question: "A uniform copper wire of resistance R is stretched so that its length doubles while volume stays constant. What is its new resistance?",
        sidebarTitle: "Resistance of stretched wire",
        options: [
          { id: "A", text: "2R" },
          { id: "B", text: "4R" },
          { id: "C", text: "R / 2" },
          { id: "D", text: "R / 4" },
        ],
        correctAnswer: "B",
        explanation: "Resistance R = ρ·(L / A). If length doubles (L' = 2L), area halves (A' = A/2) since volume V = L·A is constant. R' = ρ·(2L / (A/2)) = 4R.",
        marks: 1,
      },
      {
        order: 3,
        question: "What is the work done by centripetal force on an object executing uniform circular motion?",
        sidebarTitle: "Work done by centripetal force",
        options: [
          { id: "A", text: "Zero" },
          { id: "B", text: "Positive" },
          { id: "C", text: "Negative" },
          { id: "D", text: "Infinity" },
        ],
        correctAnswer: "A",
        explanation: "The centripetal force is always perpendicular to the instantaneous displacement (cos 90° = 0), so W = F·d·cos(90°) = 0.",
        marks: 1,
      },
      {
        order: 4,
        question: "In an inelastic collision between two isolated bodies, which of the following physical quantities is always conserved?",
        sidebarTitle: "Inelastic collision conservation",
        options: [
          { id: "A", text: "Total mechanical energy" },
          { id: "B", text: "Total kinetic energy" },
          { id: "C", text: "Total linear momentum" },
          { id: "D", text: "Total velocity" },
        ],
        correctAnswer: "C",
        explanation: "Total linear momentum is always conserved in any collision in the absence of external forces, whereas kinetic energy is partially converted into heat/sound in inelastic collisions.",
        marks: 1,
      },
      {
        order: 5,
        question: "What is the SI unit of Impulse of a force?",
        sidebarTitle: "Unit of Impulse",
        options: [
          { id: "A", text: "N·s or kg·m/s" },
          { id: "B", text: "N/s" },
          { id: "C", text: "J·s" },
          { id: "D", text: "W·s" },
        ],
        correctAnswer: "A",
        explanation: "Impulse = Force × time = N·s. Since Impulse also equals change in linear momentum (Δp), it can also be expressed as kg·m/s.",
        marks: 1,
      },
    ],
  },
  {
    title: "Physics - Gravitation & Bulk Matter (Test 3)",
    description:
      "Study of planetary motion, gravitational acceleration variations, escape velocity, elasticity, and fluid mechanics.",
    subject: "Physics",
    board: "State Board",
    classLevel: "Class 11",
    durationMinutes: 20,
    isLocked: false,
    category: "Physics (State Board Class 11)",
    questions: [
      {
        order: 1,
        question: "What is the escape velocity for any object launched from the surface of the Earth (standard value)?",
        sidebarTitle: "Earth's escape velocity",
        options: [
          { id: "A", text: "9.8 km/s" },
          { id: "B", text: "11.2 km/s" },
          { id: "C", text: "8.0 km/s" },
          { id: "D", text: "42.0 km/s" },
        ],
        correctAnswer: "B",
        explanation: "v_escape = √(2gR) = √(2 × 9.8 × 6.4 × 10⁶) ≈ 11.2 km/s.",
        marks: 1,
      },
      {
        order: 2,
        question: "What is the value of the acceleration due to gravity (g) at the center of the Earth?",
        sidebarTitle: "Gravity at Earth center",
        options: [
          { id: "A", text: "9.8 m/s²" },
          { id: "B", text: "Zero" },
          { id: "C", text: "Infinity" },
          { id: "D", text: "4.9 m/s²" },
        ],
        correctAnswer: "B",
        explanation: "At depth d = R (center of the Earth), g' = g(1 - d/R) = g(1 - 1) = 0.",
        marks: 1,
      },
      {
        order: 3,
        question: "Kepler’s Second Law (Law of Equal Areas) is a direct consequence of which fundamental conservation principle?",
        sidebarTitle: "Kepler's second law",
        options: [
          { id: "A", text: "Conservation of Linear Momentum" },
          { id: "B", text: "Conservation of Angular Momentum" },
          { id: "C", text: "Conservation of Mechanical Energy" },
          { id: "D", text: "Conservation of Mass" },
        ],
        correctAnswer: "B",
        explanation: "Because gravitational force is purely a central force, the torque about the Sun is zero (τ = 0). Hence angular momentum L = m·r²·ω is strictly conserved, giving constant areal velocity dA/dt = L / (2m).",
        marks: 1,
      },
      {
        order: 4,
        question: "According to Hooke’s Law, within the proportional elastic limit, which relationship holds true?",
        sidebarTitle: "Hooke's Law",
        options: [
          { id: "A", text: "Stress is directly proportional to Strain" },
          { id: "B", text: "Stress is inversely proportional to Strain" },
          { id: "C", text: "Strain is proportional to (Stress)²" },
          { id: "D", text: "Stress is independent of Strain" },
        ],
        correctAnswer: "A",
        explanation: "Hooke's law states that for small deformations within the elastic limit, Stress = Modulus of Elasticity × Strain.",
        marks: 1,
      },
    ],
  },
  {
    title: "Physics - Thermodynamics & Oscillations (Test 4)",
    description:
      "Comprehensive unit test covering thermal expansion, heat engines, laws of thermodynamics, and simple harmonic motion.",
    subject: "Physics",
    board: "State Board",
    classLevel: "Class 11",
    durationMinutes: 25,
    isLocked: true,
    category: "Physics (State Board Class 11)",
    questions: [
      {
        order: 1,
        question: "Which Law of Thermodynamics establishes the physical definition and concept of Temperature?",
        sidebarTitle: "Concept of temperature",
        options: [
          { id: "A", text: "Zeroth Law of Thermodynamics" },
          { id: "B", text: "First Law of Thermodynamics" },
          { id: "C", text: "Second Law of Thermodynamics" },
          { id: "D", text: "Third Law of Thermodynamics" },
        ],
        correctAnswer: "A",
        explanation: "The Zeroth law states that if systems A and B are in thermal equilibrium with C, they are in thermal equilibrium with each other, defining temperature as a property indicating thermal equilibrium.",
        marks: 1,
      },
      {
        order: 2,
        question: "For a reversible adiabatic process involving an ideal gas, which equation represents the correct relation?",
        sidebarTitle: "Adiabatic gas equation",
        options: [
          { id: "A", text: "P · V = constant" },
          { id: "B", text: "P · V^γ = constant" },
          { id: "C", text: "P / T = constant" },
          { id: "D", text: "V / T = constant" },
        ],
        correctAnswer: "B",
        explanation: "In an adiabatic process (no heat exchange dQ = 0), the pressure and volume follow Poisson's equation: P·V^γ = constant, where γ = Cp/Cv.",
        marks: 1,
      },
      {
        order: 3,
        question: "What is the formula for the time period (T) of a simple pendulum of length L executing small-angle oscillations?",
        sidebarTitle: "Simple pendulum time period",
        options: [
          { id: "A", text: "T = 2π √(L / g)" },
          { id: "B", text: "T = 2π √(g / L)" },
          { id: "C", text: "T = π √(L / g)" },
          { id: "D", text: "T = 4π (L / g)" },
        ],
        correctAnswer: "A",
        explanation: "For small oscillations, restoring torque gives angular frequency ω = √(g/L), so time period T = 2π/ω = 2π√(L/g).",
        marks: 1,
      },
      {
        order: 4,
        question: "How does the total mechanical energy (E) of a particle executing Simple Harmonic Motion depend on its amplitude (A)?",
        sidebarTitle: "SHM energy vs amplitude",
        options: [
          { id: "A", text: "E ∝ A" },
          { id: "B", text: "E ∝ A²" },
          { id: "C", text: "E ∝ √A" },
          { id: "D", text: "E is independent of A" },
        ],
        correctAnswer: "B",
        explanation: "Total energy in SHM is E = (1/2) k A² = (1/2) m ω² A². Hence total energy is directly proportional to the square of amplitude (E ∝ A²).",
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
    const existingTests = await Test.find({
      $or: [
        { board: "CBSE", classLevel: "Class 10" },
        { board: "State Board", classLevel: "Class 11" },
      ],
    });
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
