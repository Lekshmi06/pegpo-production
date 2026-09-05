import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db";
import studentRoutes from "./routes/student_routes";
import sourceRoutes from "./routes/source_routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use("/api/students", studentRoutes);
app.use("/api", sourceRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "EduPay backend is running!",
  });
});

const startServer = async (): Promise<void> => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

startServer();