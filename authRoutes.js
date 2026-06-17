
const express=require("express");
const bcrypt=require("bcryptjs");
const jwt=require("jsonwebtoken");
const User=require("../models/User");

const router=express.Router();

router.post("/register",async(req,res)=>{

const {name,email,password}=req.body;

const exists=await User.findOne({email});

if(exists){
return res.status(400).json({message:"User Exists"});
}

const hashed=await bcrypt.hash(password,10);

await User.create({
name,email,password:hashed
});

res.json({message:"Registered"});

});

router.post("/login",async(req,res)=>{

const {email,password}=req.body;

const user=await User.findOne({email});

if(!user){
return res.status(400).json({message:"Invalid Credentials"});
}

const match=await bcrypt.compare(password,user.password);

if(!match){
return res.status(400).json({message:"Invalid Credentials"});
}

user.loginCount +=1;
user.lastLogin = new Date();

await user.save();

const token=jwt.sign(
{id:user._id},
process.env.JWT_SECRET
);

res.json({
token,
message:"Login Successful"
});

});

module.exports=router;
