import cv2
import time
import torch
import numpy as np
import subprocess
from flask import Flask, render_template, Response, jsonify
import mediapipe as mp

app = Flask(__name__)

# Load YOLOv5 model
model = torch.hub.load('ultralytics/yolov5', 'yolov5s', pretrained=True)
model.conf = 0.2  # confidence threshold

# MediaPipe setup
mp_pose = mp.solutions.pose
pose = mp_pose.Pose()
mp_drawing = mp.solutions.drawing_utils

# Global flags
violence_trigger = False
violence_label = "No violence"
last_violence_time = 0  # NEW: To apply backend cooldown

def send_event(is_violent):
    label = "violence" if is_violent else "non-violence"
    try:
        subprocess.run(["node", "static/js/main.js", label], check=True)
        print(f"Event sent: {label}")
    except subprocess.CalledProcessError as e:
        print(f"Error sending event '{label}': {e}")

def detect_violence(all_people_landmarks):
    for i, person_a in enumerate(all_people_landmarks):
        for j, person_b in enumerate(all_people_landmarks):
            if i == j:
                continue

            a_feet = [person_a.get("left_foot"), person_a.get("right_foot")]
            a_hands = [person_a.get("left_hand"), person_a.get("right_hand")]
            b_head = person_b.get("head")
            b_torso = person_b.get("torso")

            for limb in a_hands:
                if not limb or not b_head:
                    continue
                if np.linalg.norm(np.array(limb) - np.array(b_head)) < 0.12:
                    return True, "Punching"

            for foot in a_feet:
                if not foot or not b_torso:
                    continue
                if foot[1] < 0.5 and np.linalg.norm(np.array(foot) - np.array(b_torso)) < 0.10:
                    return True, "Kicking"

    return False, "No violence"

def generate_frames():
    global violence_trigger, violence_label, last_violence_time

    cap = cv2.VideoCapture(0)

    while True:
        success, frame = cap.read()
        if not success:
            break

        orig_frame = frame.copy()

        # YOLOv5 detection
        yolo_results = model(frame)
        people = yolo_results.pandas().xyxy[0]
        people = people[people['name'] == 'person']

        all_keypoints = []

        for _, row in people.iterrows():
            x1, y1, x2, y2 = map(int, [row['xmin'], row['ymin'], row['xmax'], row['ymax']])
            person_crop = orig_frame[y1:y2, x1:x2]

            if person_crop.size == 0:
                continue

            person_rgb = cv2.cvtColor(person_crop, cv2.COLOR_BGR2RGB)
            results = pose.process(person_rgb)

            if results.pose_landmarks:
                h, w, _ = person_crop.shape
                lm = results.pose_landmarks.landmark

                keypoints = {
                    "left_hand": (lm[mp_pose.PoseLandmark.LEFT_WRIST].x, lm[mp_pose.PoseLandmark.LEFT_WRIST].y),
                    "right_hand": (lm[mp_pose.PoseLandmark.RIGHT_WRIST].x, lm[mp_pose.PoseLandmark.RIGHT_WRIST].y),
                    "left_foot": (lm[mp_pose.PoseLandmark.LEFT_FOOT_INDEX].x, lm[mp_pose.PoseLandmark.LEFT_FOOT_INDEX].y),
                    "right_foot": (lm[mp_pose.PoseLandmark.RIGHT_FOOT_INDEX].x, lm[mp_pose.PoseLandmark.RIGHT_FOOT_INDEX].y),
                    "head": (lm[mp_pose.PoseLandmark.NOSE].x, lm[mp_pose.PoseLandmark.NOSE].y),
                    "torso": (lm[mp_pose.PoseLandmark.LEFT_SHOULDER].x, lm[mp_pose.PoseLandmark.LEFT_SHOULDER].y)
                }

                all_keypoints.append(keypoints)

                for connection in mp_pose.POSE_CONNECTIONS:
                    start = lm[connection[0]]
                    end = lm[connection[1]]
                    start_point = (int(x1 + start.x * w), int(y1 + start.y * h))
                    end_point = (int(x1 + end.x * w), int(y1 + end.y * h))
                    cv2.line(frame, start_point, end_point, (0, 255, 0), 2)

        # Violence detection + backend cooldown
        is_violent, v_type = detect_violence(all_keypoints)
        current_time = time.time()

        if is_violent and (current_time - last_violence_time > 30):
            violence_trigger = True
            violence_label = v_type
            last_violence_time = current_time  # start cooldown
            send_event(True)
        elif not is_violent:
            send_event(False)

        # Drawing
        for _, row in people.iterrows():
            x1, y1, x2, y2 = map(int, [row['xmin'], row['ymin'], row['xmax'], row['ymax']])
            label_color = (0, 0, 255) if violence_trigger else (0, 255, 0)
            label = violence_label if violence_trigger else "No violence"
            prediction = row['confidence']
            cv2.putText(frame, f'{label}: {prediction:.2f}', (1580, 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, label_color, 2)

            cv2.rectangle(frame, (x1, y1 - 30), (x2, y1), (0, 0, 0), -1)
            cv2.putText(frame, label, (x1 + 5, y1 - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, label_color, 2)
            cv2.rectangle(frame, (x1, y1), (x2, y2), (255, 255, 0), 2)

        cv2.putText(frame, f"Violence: {violence_label}", (1540, 70),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, label_color, 2)

        _, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/check_trigger')
def check_trigger():
    global violence_trigger, violence_label

    if violence_trigger:
        response = {
            'trigger': True,
            'type': violence_label
        }

        # Reset immediately — only one frontend will catch it
        violence_trigger = False
        violence_label = "No violence"
    else:
        response = {
            'trigger': False,
            'type': "No violence"
        }

    return jsonify(response)


if __name__ == '__main__':
    app.run(debug=True)
