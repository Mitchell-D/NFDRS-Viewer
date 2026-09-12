"""
Defines fastapi endpoints for RxBurn Dashboard

This script is run by the ASGI server (uvicorn) once on startup, then the
decorated functions implementing the endpionts are invoked asynchronously
whenever a request is issued.
"""
import json
import zarr
import os
import numpy as np
from time import perf_counter
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from contextlib import asynccontextmanager
from starlette_compress import CompressMiddleware
from pathlib import Path

""" ---( data sourcing )--- """

## zarr store reference
zarr.config.set({"async.concurrency": 64})
zgrp = zarr.open("nfdrs-forecast.zarr", mode="r")
zattrs = dict(zgrp.attrs)

## restructure the plot config into ordered lists
plot_info = {}
for pgk,pgv in zattrs["plots"].items():
    plot_info[pgk] = {
        "layout":pgv["layout"],
        "legends":[
            {"legend_key":lk, **lv}
            for lk,lv in pgv["legends"].items()
            ],
        "elements":list(sorted(
            [ {"element_key":lk, **lv} for lk,lv in pgv["elements"].items() ],
            key=lambda v:pgv["order"].index(v["element_key"])
            )),
        }

## explicitly collect metadata relevant to IFS ensemble data.
meta_nfdrs = {
    ## metadata
    "labels":{
        **zattrs["labels"],
        "itimes":itimes,
        "vtimes":vtimes,
        },

    "nvtimes":zattrs["nvtimes"],

    ## data normalization
    "norm_bounds":zattrs["norm_bounds"],
    "norm_res":zattrs["norm_resolution"],
    "mask_val":zattrs["mask_val"],

    ## labels
    "long_labels":zattrs["long_labels"],
    "short_labels":zattrs["short_labels"],

    #"vector_toggle_state":zgrp.attrs["gefs"]["vector_toggle_state"],
    }

## color map metadata and concatenated color map array
cmap_info = {
    **zgrp.attrs["cmaps"],
    "cmaps":zgrp["cmaps"][...].tolist(),
    "default_bounds":zattrs["cmap_default_bounds"],
    "default_name":zattrs["cmap_default_name"],
    }

""" ---( app initialization )--- """

## declare app and add middleware for logging requests
app = FastAPI(title="NFDRS API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"], ## all HTTP methods (GET, POST, PUT, etc.)
    allow_headers=["*"], ## all headers
    )
app.add_middleware(
    CompressMiddleware,
    minimum_size=500,
    zstd_level=4,
    brotli_quality=4,
    gzip_level=6,
    )

""" ---( app endpoints )--- """

@app.get("/menu")
def req_menu():
    """ endpoint for menu information (labels, time range, etc) """
    return meta_nfdrs

@app.get("/cmaps")
def req_cmaps():
    """ endpoint for concatenated color maps array and its metadata """
    return cmap_info

@app.get("/plots")
def req_plots():
    return plot_info

'''
@app.get("/regionmap/raster")
def req_region_map_raster():
    return Response(
        content=rm_raster.tobytes(),
        media_type="application/octet-stream",
        headers={
            "Content-Type":"application/octet-stream",
            "Content-Length":str(rm_raster.nbytes),
            }
        )

@app.get("/regionmap/borders")
def req_region_map_borders():
    return Response(
        content=rm_borders.tobytes(),
        media_type="application/octet-stream",
        headers={
            "Content-Type":"application/octet-stream",
            "Content-Length":str(rm_borders.nbytes),
            }
        )
'''
