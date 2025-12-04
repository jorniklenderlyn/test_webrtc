# Use a consistent and supported Python version
FROM python:3.9-slim

# Prevent Python from writing pycache files and buffers stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install minimal system dependencies (only those actually needed by your app)
# Your current app doesn't use OpenCV/image processing, so these may be unnecessary.
# But kept in case you extend it later.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgl1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Ensure the certs and static directories exist (optional but safe)
RUN mkdir -p /app/certs /app/static

# Expose the port your app actually uses (8001 in your code, but mapped to 8000 or 80 externally if desired)
EXPOSE 8001

# Run with Uvicorn using the same config as your __main__ block
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "80", "--ssl-certfile", "/app/certs/cert.pem", "--ssl-keyfile", "/app/certs/key.pem"]