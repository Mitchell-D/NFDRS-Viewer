# syntax=docker/dockerfile:1
FROM python:3.11-slim

## Install system deps for rasterio/GDAL
RUN apt-get update && apt-get install -y \
    build-essential \
    gdal-bin \
    libgdal-dev \
    && rm -rf /var/lib/apt/lists/*

## Set dir
WORKDIR /app
## Copy app files
#COPY app.py /app/

## Install titiler and FastAPI deps
RUN pip install --no-cache-dir \
    zarr \
    uvicorn[standard] \
    fastapi[standard] \
    rasterio \
    starlette-compress \
    redis[asyncio]>=8.0

## Expose the app on port 81
EXPOSE 81
## Start FastAPI app
CMD ["uvicorn","app:app","--host","0.0.0.0","--port","81","--workers","12"]
