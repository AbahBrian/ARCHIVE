# Stage 1: build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: production image
FROM python:3.11-slim
WORKDIR /app

# Install Node.js (yt-dlp n-challenge solver) + ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install backend Python deps
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source into WORKDIR so imports resolve correctly
COPY backend/ ./

# Copy built frontend to path expected by main.py static mount
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Create persistent data directories
RUN mkdir -p /videos /data

ENV DB_PATH=/data/library.db
ENV VIDEOS_DIR=/videos

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
