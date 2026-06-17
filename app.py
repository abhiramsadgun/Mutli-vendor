from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import numpy as np
from sklearn.linear_model import LinearRegression

app = FastAPI(title="ForecastMart AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ForecastRequest(BaseModel):
    sales_data: List[List[float]]  
    horizon: int = 6               

class ForecastResponse(BaseModel):
    historical: List[List[float]]
    forecast: List[List[float]]
    slope: float
    intercept: float
    r2_score: float

@app.get("/")
def read_root():
    return {"status": "running", "service": "ForecastMart Machine Learning Engine"}

@app.post("/forecast", response_model=ForecastResponse)
def generate_forecast(request: ForecastRequest):
    data = request.sales_data
    horizon = request.horizon
    
    if len(data) < 2:
        # Not enough data points to train a regression model
        # Return default static forecast
        return ForecastResponse(
            historical=data,
            forecast=[[float(i + len(data) + 1), float(data[0][1] if data else 0)] for i in range(horizon)],
            slope=0.0,
            intercept=float(data[0][1] if data else 0),
            r2_score=1.0
        )
        
    try:
        # Convert lists to NumPy arrays
        np_data = np.array(data)
        X = np_data[:, 0].reshape(-1, 1)  # Month indexes
        y = np_data[:, 1]                 # Sales values
        
        # Train Scikit-Learn Linear Regression model
        model = LinearRegression()
        model.fit(X, y)
        
        # Calculate training confidence (R-squared score)
        r2 = model.score(X, y)
        
        # If r2 is negative (can happen on extremely irregular data), clip it to 0
        r2_score = max(0.0, float(r2))
        
        # Predict historical values to verify fit
        slope = float(model.coef_[0])
        intercept = float(model.intercept_)
        
        # Generate predictions for the future horizon
        last_month = int(X[-1][0])
        forecast_points = []
        for i in range(1, horizon + 1):
            future_month = last_month + i
            # Predict sales value (and ensure it's not negative)
            predicted_value = max(0.0, float(model.predict([[future_month]])[0]))
            forecast_points.append([float(future_month), round(predicted_value, 2)])
            
        return ForecastResponse(
            historical=data,
            forecast=forecast_points,
            slope=round(slope, 4),
            intercept=round(intercept, 4),
            r2_score=round(r2_score, 4)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ML Error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
