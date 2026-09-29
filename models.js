import mongoose from "mongoose";
const { Schema, model } = mongoose;
const ref = (m) => ({ type: Schema.Types.ObjectId, ref: m });

export const User = model("User", new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, required: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ["student", "tutor"], required: true },
}, { timestamps: true }));

export const TutorProfile = model("TutorProfile", new Schema({
  user: { ...ref("User"), required: true, unique: true },
  headline: String, qualification: String, bio: String,
  experienceYears: { type: Number, default: 0 },
  feePerHour: Number,
  subjects: [String], categories: [String], areas: [String], modes: [String],
}, { timestamps: true }));

export const Tuition = model("Tuition", new Schema({
  student: { ...ref("User"), required: true },
  subjects: { type: [String], validate: (v) => v.length > 0 },
  category: String, area: { type: String, required: true },
  mode: { type: String, enum: ["Home", "Online"], default: "Home" },
  budget: Number, daysPerWeek: Number, description: String,
  status: { type: String, enum: ["open", "closed"], default: "open" },
}, { timestamps: true }));

const appSchema = new Schema({
  tuition: { ...ref("Tuition"), required: true },
  tutor: { ...ref("User"), required: true },
  status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" },
}, { timestamps: true });
appSchema.index({ tuition: 1, tutor: 1 }, { unique: true });
export const Application = model("Application", appSchema);
