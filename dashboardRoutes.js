
const express=require("express");
const User=require("../models/User");

const router=express.Router();

router.get("/stats",async(req,res)=>{

const totalUsers=await User.countDocuments();

const totalLogins=await User.aggregate([
{$group:{_id:null,total:{$sum:"$loginCount"}}}
]);

const latestUsers=await User.find()
.sort({lastLogin:-1})
.limit(5);

res.json({
totalUsers,
totalLogins:totalLogins[0]?.total || 0,
latestUsers
});

});

module.exports=router;
