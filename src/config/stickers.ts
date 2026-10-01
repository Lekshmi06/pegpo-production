export interface StickerDefinition {
  id: string;
  title: string;
  icon: string;
  description: string;
  category: "effort" | "behavioral" | "academic" | "creativity";
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
}

export const RECOGNITION_STICKERS: StickerDefinition[] = [
  {
    id: "hard-working",
    title: "Hard Working",
    icon: "⭐",
    description: "Consistently puts in dedicated effort and completes assignments with diligence.",
    category: "effort",
    color: "#f59e0b",
    bgColor: "#fffbeb",
    borderColor: "#fde68a",
    textColor: "#b45309",
  },
  {
    id: "helpful",
    title: "Helpful",
    icon: "🤝",
    description: "Always ready to assist peers and contribute positively to the class environment.",
    category: "behavioral",
    color: "#3b82f6",
    bgColor: "#eff6ff",
    borderColor: "#bfdbfe",
    textColor: "#1d4ed8",
  },
  {
    id: "great-participation",
    title: "Great Participation",
    icon: "🎯",
    description: "Actively engages in discussions, asks thoughtful questions, and contributes.",
    category: "academic",
    color: "#10b981",
    bgColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    textColor: "#047857",
  },
  {
    id: "excellent-progress",
    title: "Excellent Progress",
    icon: "📈",
    description: "Demonstrates noticeable improvement and steady academic growth.",
    category: "academic",
    color: "#8b5cf6",
    bgColor: "#f5f3ff",
    borderColor: "#ddd6fe",
    textColor: "#6d28d9",
  },
  {
    id: "team-player",
    title: "Team Player",
    icon: "👥",
    description: "Collaborates effectively with classmates and supports group activities.",
    category: "behavioral",
    color: "#06b6d4",
    bgColor: "#ecfeff",
    borderColor: "#a5f3fc",
    textColor: "#0e7490",
  },
  {
    id: "creative-thinker",
    title: "Creative Thinker",
    icon: "💡",
    description: "Brings fresh perspectives, inventive ideas, and imaginative solutions.",
    category: "creativity",
    color: "#ec4899",
    bgColor: "#fdf2f8",
    borderColor: "#fbcfe8",
    textColor: "#be185d",
  },
  {
    id: "consistent",
    title: "Consistent",
    icon: "⚡",
    description: "Regular, dependable, and maintains high standards over time.",
    category: "effort",
    color: "#eab308",
    bgColor: "#fefce8",
    borderColor: "#fef08a",
    textColor: "#a16207",
  },
  {
    id: "problem-solver",
    title: "Problem Solver",
    icon: "🧩",
    description: "Approaches challenges methodically and finds effective solutions.",
    category: "academic",
    color: "#6366f1",
    bgColor: "#eef2ff",
    borderColor: "#c7d2fe",
    textColor: "#4338ca",
  },
  {
    id: "good-listener",
    title: "Good Listener",
    icon: "👂",
    description: "Pays close attention to instructions, discussions, and peer input.",
    category: "behavioral",
    color: "#14b8a6",
    bgColor: "#f0fdfa",
    borderColor: "#99f6e4",
    textColor: "#0f766e",
  },
  {
    id: "outstanding-effort",
    title: "Outstanding Effort",
    icon: "🏆",
    description: "Goes above and beyond expectations in performance and attitude.",
    category: "effort",
    color: "#f97316",
    bgColor: "#fff7ed",
    borderColor: "#fed7aa",
    textColor: "#c2410c",
  },
];

export function getStickerById(id: string): StickerDefinition | undefined {
  const cleanId = id.trim().toLowerCase();
  return RECOGNITION_STICKERS.find((s) => s.id === cleanId);
}

export function getAllStickers(): StickerDefinition[] {
  return RECOGNITION_STICKERS;
}
