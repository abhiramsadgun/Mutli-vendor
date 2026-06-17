const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema({
  productName: { type: String, required: true },
  category: { type: String, required: true },
  salesHistory: [
    {
      monthIndex: { type: Number, required: true },
      amount: { type: Number, required: true }
    }
  ]
});

module.exports = mongoose.model("Sale", saleSchema);
