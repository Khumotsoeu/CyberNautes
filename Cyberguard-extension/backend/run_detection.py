import pandas as pd
from anomaly_detector import AnomalyDetector

# Simulated behaviour data
data = pd.DataFrame({
    'event_duration': [1.2, 0.9, 1.1, 10.5, 0.8, 1.0, 12.0],
    'click_count': [5, 4, 6, 50, 3, 5, 60]
})

detector = AnomalyDetector()
detector.fit(data)

predictions = detector.predict(data)
scores = detector.score_samples(data)

for i, (pred, score) in enumerate(zip(predictions, scores)):
    if pred == -1:
        print(f"Anomaly detected at index {i} | Score: {score:.3f}")