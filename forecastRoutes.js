const express = require("express");
const router = express.Router();
const Sale = require("../models/Sale");

// Enterprise-grade fallback: A standard linear regression solver in case the Python FastAPI microservice is offline
function jsFallbackForecast(salesData, horizon) {
  const n = salesData.length;
  if (n < 2) {
    const defaultVal = n === 1 ? salesData[0][1] : 0;
    const forecast = [];
    for (let i = 1; i <= horizon; i++) {
      forecast.push([n + i, defaultVal]);
    }
    return { forecast, slope: 0, intercept: defaultVal, r2_score: 1.0 };
  }

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    const x = salesData[i][0];
    const y = salesData[i][1];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R-squared (R2)
  const meanY = sumY / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const x = salesData[i][0];
    const y = salesData[i][1];
    const fit = slope * x + intercept;
    ssTot += Math.pow(y - meanY, 2);
    ssRes += Math.pow(y - fit, 2);
  }

  const r2_score = ssTot === 0 ? 1.0 : 1 - (ssRes / ssTot);
  const forecast = [];
  const lastMonth = salesData[n - 1][0];
  for (let i = 1; i <= horizon; i++) {
    const futureMonth = lastMonth + i;
    const prediction = Math.max(0, slope * futureMonth + intercept);
    forecast.push([futureMonth, Math.round(prediction * 100) / 100]);
  }

  return {
    forecast,
    slope: Math.round(slope * 400) / 400,
    intercept: Math.round(intercept * 100) / 100,
    r2_score: Math.max(0, Math.round(r2_score * 10000) / 10000)
  };
}

// Seed data function to populate MongoDB with rich sales histories if it's empty
async function seedSalesDataIfNeeded() {
  const count = await Sale.countDocuments();
  if (count < 5) {
    console.log("Seeding MongoDB with historical product sales...");
    await Sale.deleteMany({});
    const seedProducts = [
      {
        productName: "iPhone Pro Max",
        category: "Smartphones",
        salesHistory: [
          { monthIndex: 1, amount: 120 },
          { monthIndex: 2, amount: 140 },
          { monthIndex: 3, amount: 155 },
          { monthIndex: 4, amount: 180 },
          { monthIndex: 5, amount: 210 },
          { monthIndex: 6, amount: 235 }
        ]
      },
      {
        productName: "Premium Wireless Headset",
        category: "Audio",
        salesHistory: [
          { monthIndex: 1, amount: 80 },
          { monthIndex: 2, amount: 95 },
          { monthIndex: 3, amount: 110 },
          { monthIndex: 4, amount: 105 },
          { monthIndex: 5, amount: 130 },
          { monthIndex: 6, amount: 125 }
        ]
      },
      {
        productName: "Elite Smart Watch",
        category: "Wearables",
        salesHistory: [
          { monthIndex: 1, amount: 50 },
          { monthIndex: 2, amount: 65 },
          { monthIndex: 3, amount: 85 },
          { monthIndex: 4, amount: 110 },
          { monthIndex: 5, amount: 135 },
          { monthIndex: 6, amount: 160 }
        ]
      },
      {
        productName: "4K Ultra HD Smart TV",
        category: "TVs",
        salesHistory: [
          { monthIndex: 1, amount: 40 },
          { monthIndex: 2, amount: 45 },
          { monthIndex: 3, amount: 60 },
          { monthIndex: 4, amount: 55 },
          { monthIndex: 5, amount: 70 },
          { monthIndex: 6, amount: 85 }
        ]
      },
      {
        productName: "AI & Deep Learning Guide",
        category: "Books",
        salesHistory: [
          { monthIndex: 1, amount: 90 },
          { monthIndex: 2, amount: 110 },
          { monthIndex: 3, amount: 95 },
          { monthIndex: 4, amount: 120 },
          { monthIndex: 5, amount: 140 },
          { monthIndex: 6, amount: 165 }
        ]
      }
    ];
    await Sale.insertMany(seedProducts);
  }
}

// GET /api/forecast/stats - Main entrypoint to retrieve seeded products and run forecasting
router.get("/stats", async (req, res) => {
  try {
    await seedSalesDataIfNeeded();
    const products = await Sale.find({});
    const forecastResults = [];

    for (const prod of products) {
      // Map the DB sales schema to a flat coordinate format: [ [month_index, sales_amount], ... ]
      const salesData = prod.salesHistory
        .sort((a, b) => a.monthIndex - b.monthIndex)
        .map(s => [s.monthIndex, s.amount]);

      let forecastData;
      let isPythonUsed = false;

      // Attempt to communicate with the FastAPI Python ML service
      try {
        const response = await fetch("http://127.0.0.1:8000/forecast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sales_data: salesData, horizon: 6 }),
          signal: AbortSignal.timeout(1500) // Fallback quickly if Python microservice is not responding
        });

        if (response.ok) {
          forecastData = await response.json();
          isPythonUsed = true;
        } else {
          console.warn(`Python ML service returned ${response.status}. Using native JS engine fallback.`);
          forecastData = jsFallbackForecast(salesData, 6);
        }
      } catch (err) {
        console.warn("Python ML service offline. Executing native JS engine regression fallback.");
        forecastData = jsFallbackForecast(salesData, 6);
      }

      // Calculate simple growth percentage between first and last historical sales
      const firstSales = salesData[0][1];
      const lastSales = salesData[salesData.length - 1][1];
      const growthPct = firstSales === 0 ? 0 : Math.round(((lastSales - firstSales) / firstSales) * 100);

      forecastResults.push({
        _id: prod._id,
        productName: prod.productName,
        category: prod.category,
        historical: salesData,
        forecast: forecastData.forecast,
        r2_score: forecastData.r2_score,
        growthRate: growthPct,
        isPythonService: isPythonUsed
      });
    }

    // Return the forecasting outcomes
    res.json({
      success: true,
      timestamp: new Date(),
      data: forecastResults
    });

  } catch (error) {
    console.error("Forecasting Route Error:", error);
    res.status(500).json({ success: false, message: "Error running forecasting engine", error: error.message });
  }
});

module.exports = router;
