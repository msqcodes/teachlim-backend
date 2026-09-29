import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  User,
  TutorProfile,
  Tuition,
  Application,
} from "./models.js";

const {
  MONGO_URI,
  JWT_SECRET,
  CLIENT_URL = "https://teachlim.vercel.app",
  PORT = 5050,
} = process.env;

if (!MONGO_URI) {
  throw new Error("MONGO_URI is missing in .env");
}

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is missing in .env");
}

const app = express();

app.use(
  cors({
    origin: "https://teachlim.vercel.app",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json({ limit: "100kb" }));

// --------------------------------------------------
// Helpers
// --------------------------------------------------

const asyncHandler = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    console.error("API ERROR:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        message: "A record with these details already exists",
      });
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors)
        .map((err) => err.message)
        .join(", ");

      return res.status(400).json({
        message: messages || "Validation failed",
      });
    }

    if (error.name === "CastError") {
      return res.status(400).json({
        message: "Invalid ID or data format",
      });
    }

    return res.status(500).json({
      message: error.message || "Server error",
    });
  }
};

const getToken = (req) => {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return null;
  }

  return header.substring(7);
};

const getCurrentUser = async (req) => {
  const token = getToken(req);

  if (!token) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    return await User.findById(decoded.id);
  } catch {
    return null;
  }
};

const requireAuth = (role = null) =>
  asyncHandler(async (req, res, next) => {
    const user = await getCurrentUser(req);

    if (!user) {
      return res.status(401).json({
        message: "Please log in",
      });
    }

    if (role && user.role !== role) {
      return res.status(403).json({
        message: `Only ${role} accounts can perform this action`,
      });
    }

    req.user = user;
    next();
  });

const optionalAuth = asyncHandler(async (req, _res, next) => {
  req.user = await getCurrentUser(req);
  next();
});

const signToken = (user) =>
  jwt.sign(
    {
      id: user._id.toString(),
    },
    JWT_SECRET,
    {
      expiresIn: "30d",
    }
  );

const publicUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
});

const toArray = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item).trim())
    .filter(Boolean);
};

// --------------------------------------------------
// Health
// --------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    message: "API is running",
  });
});

// --------------------------------------------------
// Authentication
// --------------------------------------------------

app.post(
  "/api/auth/register",
  asyncHandler(async (req, res) => {
    const {
      name,
      email,
      phone,
      password,
      role,
    } = req.body;

    if (!name || !email || !phone || !password || !role) {
      return res.status(400).json({
        message: "Please fill all required fields",
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        message: "Password must contain at least 6 characters",
      });
    }

    if (!["student", "tutor"].includes(role)) {
      return res.status(400).json({
        message: "Invalid role",
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedPhone = String(phone).trim();

    if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
      return res.status(400).json({
        message: "Enter a valid 10-digit Indian mobile number",
      });
    }

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Email already registered",
      });
    }

    const existingPhone = await User.findOne({
      phone: normalizedPhone,
    });

    if (existingPhone) {
      return res.status(409).json({
        message: "Phone number already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(
      String(password),
      10
    );

    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      phone: normalizedPhone,
      password: hashedPassword,
      role,
    });

    res.status(201).json({
      token: signToken(user),
      user: publicUser(user),
    });
  })
);

app.post(
  "/api/auth/login",
  asyncHandler(async (req, res) => {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({
      email,
    }).select("+password");

    if (!user) {
      return res.status(401).json({
        message: "Wrong email or password",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Wrong email or password",
      });
    }

    res.json({
      token: signToken(user),
      user: publicUser(user),
    });
  })
);

app.get(
  "/api/auth/me",
  requireAuth(),
  (req, res) => {
    res.json({
      user: publicUser(req.user),
    });
  }
);

// --------------------------------------------------
// Tutors
// --------------------------------------------------

app.get(
  "/api/tutors",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const {
      area,
      subject,
      category,
    } = req.query;

    const query = {};

    if (area) {
      query.areas = String(area);
    }

    if (subject) {
      query.subjects = String(subject);
    }

    if (category) {
      query.categories = String(category);
    }

    const tutors = await TutorProfile.find(query)
      .sort({ updatedAt: -1 })
      .limit(100)
      .populate({
        path: "user",
        select: req.user
          ? "name email phone role"
          : "name role",
      })
      .lean();

    const result = tutors
      .filter((tutor) => tutor.user)
      .map((tutor) => ({
        ...tutor,
        user: tutor.user,
      }));

    res.json({
      tutors: result,
    });
  })
);

app.get(
  "/api/tutors/me",
  requireAuth("tutor"),
  asyncHandler(async (req, res) => {
    const profile = await TutorProfile.findOne({
      user: req.user._id,
    }).populate("user", "name email phone role");

    res.json({
      profile,
    });
  })
);

app.put(
  "/api/tutors/me",
  requireAuth("tutor"),
  asyncHandler(async (req, res) => {
    const body = req.body || {};

    const profileData = {
      user: req.user._id,

      headline: body.headline
        ? String(body.headline).trim()
        : "",

      qualification: body.qualification
        ? String(body.qualification).trim()
        : "",

      bio: body.bio
        ? String(body.bio).trim()
        : "",

      experienceYears:
        Number(body.experienceYears) >= 0
          ? Number(body.experienceYears)
          : 0,

      feePerHour:
        Number(body.feePerHour) >= 0
          ? Number(body.feePerHour)
          : 0,

      subjects: toArray(body.subjects),

      categories: toArray(body.categories),

      areas: toArray(body.areas),

      modes: toArray(body.modes),
    };

    const profile =
      await TutorProfile.findOneAndUpdate(
        {
          user: req.user._id,
        },
        {
          $set: profileData,
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        }
      ).populate(
        "user",
        "name email phone role"
      );

    res.json({
      message: "Tutor profile saved successfully",
      profile,
    });
  })
);

// --------------------------------------------------
// Tuitions
// --------------------------------------------------

app.get(
  "/api/tuitions",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const {
      area,
      subject,
      category,
    } = req.query;

    const query = {
      status: "open",
    };

    if (area) {
      query.area = String(area);
    }

    if (subject) {
      query.subjects = String(subject);
    }

    if (category) {
      query.category = String(category);
    }

    const tuitions = await Tuition.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({
      tuitions,
    });
  })
);

app.post(
  "/api/tuitions",
  requireAuth("student"),
  asyncHandler(async (req, res) => {
    const body = req.body || {};

    if (
      !body.subjects ||
      !Array.isArray(body.subjects) ||
      body.subjects.length === 0
    ) {
      return res.status(400).json({
        message: "At least one subject is required",
      });
    }

    if (!body.category) {
      return res.status(400).json({
        message: "Category is required",
      });
    }

    if (!body.area) {
      return res.status(400).json({
        message: "Area is required",
      });
    }

    const tuition = await Tuition.create({
      student: req.user._id,

      subjects: toArray(body.subjects),

      category: String(body.category).trim(),

      area: String(body.area).trim(),

      mode:
        body.mode === "Online"
          ? "Online"
          : "Home",

      budget:
        Number(body.budget) >= 0
          ? Number(body.budget)
          : 0,

      daysPerWeek:
        Number(body.daysPerWeek) > 0
          ? Number(body.daysPerWeek)
          : 1,

      description: body.description
        ? String(body.description).trim()
        : "",
    });

    res.status(201).json({
      message: "Tuition created successfully",
      tuition,
    });
  })
);

app.get(
  "/api/tuitions/mine",
  requireAuth("student"),
  asyncHandler(async (req, res) => {
    const tuitions = await Tuition.find({
      student: req.user._id,
    })
      .sort({ createdAt: -1 })
      .lean();

    const tuitionIds = tuitions.map(
      (tuition) => tuition._id
    );

    const applications =
      await Application.find({
        tuition: {
          $in: tuitionIds,
        },
      })
        .populate("tutor", "name phone email")
        .lean();

    const items = tuitions.map((tuition) => ({
      ...tuition,

      applicants: applications.filter(
        (application) =>
          String(application.tuition) ===
          String(tuition._id)
      ),
    }));

    res.json({
      items,
    });
  })
);

app.post(
  "/api/tuitions/:id/apply",
  requireAuth("tutor"),
  asyncHandler(async (req, res) => {
    const tuition = await Tuition.findOne({
      _id: req.params.id,
      status: "open",
    });

    if (!tuition) {
      return res.status(404).json({
        message: "This tuition is no longer open",
      });
    }

    const profileExists =
      await TutorProfile.exists({
        user: req.user._id,
      });

    if (!profileExists) {
      return res.status(400).json({
        message:
          "Create your tutor profile before applying",
      });
    }

    const existingApplication =
      await Application.findOne({
        tuition: tuition._id,
        tutor: req.user._id,
      });

    if (existingApplication) {
      return res.status(409).json({
        message: "You already applied",
      });
    }

    const application =
      await Application.create({
        tuition: tuition._id,
        tutor: req.user._id,
        status: "pending",
      });

    res.status(201).json({
      message: "Application submitted successfully",
      application,
    });
  })
);

// --------------------------------------------------
// Applications
// --------------------------------------------------

app.get(
  "/api/applications/mine",
  requireAuth("tutor"),
  asyncHandler(async (req, res) => {
    const items =
      await Application.find({
        tutor: req.user._id,
      })
        .sort({ createdAt: -1 })
        .populate({
          path: "tuition",
          populate: {
            path: "student",
            select: "name phone email",
          },
        })
        .lean();

    items.forEach((application) => {
      if (
        application.status !== "accepted" &&
        application.tuition
      ) {
        delete application.tuition.student;
      }
    });

    res.json({
      items,
    });
  })
);

app.patch(
  "/api/applications/:id",
  requireAuth("student"),
  asyncHandler(async (req, res) => {
    const status = req.body.status;

    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({
        message: "Invalid status",
      });
    }

    const application =
      await Application.findById(
        req.params.id
      ).populate("tuition");

    if (!application || !application.tuition) {
      return res.status(404).json({
        message: "Application not found",
      });
    }

    if (
      String(application.tuition.student) !==
      String(req.user._id)
    ) {
      return res.status(404).json({
        message: "Application not found",
      });
    }

    application.status = status;

    await application.save();

    res.json({
      message:
        status === "accepted"
          ? "Application accepted"
          : "Application rejected",

      application,
    });
  })
);

// --------------------------------------------------
// 404
// --------------------------------------------------

app.use((_req, res) => {
  res.status(404).json({
    message: "API endpoint not found",
  });
});

// --------------------------------------------------
// Start server
// --------------------------------------------------

const startServer = async () => {
  try {
    await mongoose.connect(MONGO_URI);

    console.log("MongoDB connected");

    app.listen(PORT, () => {
      console.log(`API running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error(
      "MongoDB connection failed:",
      error.message
    );

    process.exit(1);
  }
};

startServer();