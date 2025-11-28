FROM python:3.9-slim

# Install system dependencies for OpenCV and audio processing
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgl1 \
    libasound2 \
    portaudio19-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
WORKDIR /app
COPY . .

# Expose the default port
EXPOSE 8080

# Run the application
CMD ["python", "server.py"]