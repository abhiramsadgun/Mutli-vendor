
const express=require("express");
const mongoose=require("mongoose");
const cors=require("cors");
require("dotenv").config();

mongoose.set("bufferCommands", false);

const authRoutes=require("./routes/authRoutes");
const dashboardRoutes=require("./routes/dashboardRoutes");
const forecastRoutes=require("./routes/forecastRoutes");

const app=express();

app.use(cors());
app.use(express.json());

const User = require("./models/User");
const bcrypt = require("bcryptjs");

mongoose.connect(process.env.MONGO_URI)
.then(async () => {
  console.log("MongoDB Connected");
  try {
    const count = await User.countDocuments();
    if (count === 0) {
      const hashed = await bcrypt.hash("password123", 10);
      await User.create({
        name: "Admin User",
        email: "admin@forecastmart.com",
        password: hashed,
        loginCount: 1,
        lastLogin: new Date()
      });
      console.log("Default admin user seeded: admin@forecastmart.com / password123");
    }
  } catch (err) {
    console.error("Failed to seed admin user:", err);
  }
})
.catch(err => console.error("MongoDB Connection Error:", err));

app.use("/api/auth",authRoutes);
app.use("/api/dashboard",dashboardRoutes);
app.use("/api/forecast",forecastRoutes);

app.listen(5000,()=>console.log("Server Running"));

