import cv2, sys, json

video_path = sys.argv[1]
start_sec = float(sys.argv[2])
end_sec = float(sys.argv[3])

cap = cv2.VideoCapture(video_path)
fps = cap.get(cv2.CAP_PROP_FPS) or 25
width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

sample_count = 8
centers_x = []

for i in range(sample_count):
    t = start_sec + (end_sec - start_sec) * (i + 0.5) / sample_count
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps))
    ret, frame = cap.read()
    if not ret:
        continue
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = cascade.detectMultiScale(gray, 1.1, 5, minSize=(60, 60))
    for (x, y, w, h) in faces:
        centers_x.append(x + w / 2)

cap.release()

avg_x = sum(centers_x) / len(centers_x) if centers_x else width / 2

print(json.dumps({"width": width, "height": height, "face_center_x": avg_x, "faces_found": len(centers_x)}))
