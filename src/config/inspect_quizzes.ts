import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User";

async function checkUser() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const user = await User.findOne({ email: "jaya@mail.com" });
  console.log("Jaya password:", user?.password);
  await mongoose.disconnect();
}
checkUser();
