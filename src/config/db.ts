import mongoose from "mongoose";
import User from "../models/User";

const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGODB_URI;

    if (!mongoURI) {
      throw new Error("MONGODB_URI is not defined in the environment variables");
    }

    try {
      await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 5000 });
    } catch (primaryErr) {
      console.warn("Primary MongoDB connection failed, attempting local fallback (mongodb://127.0.0.1:27017/edupye)...");
      await mongoose.connect("mongodb://127.0.0.1:27017/edupye");
    }

    // Enforce unique indexes (including email unique index) at the database layer
    try {
      await User.init();
      await User.syncIndexes();
    } catch (indexErr) {
      console.warn("User index sync warning:", indexErr);
    }

    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
};

export default connectDB;