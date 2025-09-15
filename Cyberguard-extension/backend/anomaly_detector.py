# backend/anomaly_detector.py

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

class AnomalyDetector:
    def __init__(self, contamination=0.05, random_state=42):
        self.model = IsolationForest(contamination=contamination, random_state=random_state)
    
    def fit(self, X):
        self.model.fit(X)

    def predict(self, X):
        # Returns 1 for normal, -1 for anomaly
        return self.model.predict(X)
    
    def score_samples(self, X):
        # Lower scores = more anomalous
        return self.model.decision_function(X)