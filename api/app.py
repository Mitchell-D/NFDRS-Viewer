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

'''
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
'''

## explicitly collect metadata relevant to IFS ensemble data.
meta_nfdrs = {
    "norm":zattrs["norm"],
    "labels":zattrs["labels"],
    "cmaps":{
        **zattrs["cmaps"],
        "arrs":zgrp["cmaps"][...].tolist()
        },
    "menu":zattrs["menu"]
    }


""" ---( app initialization )--- """

## declare app and add middleware for logging requests
app = FastAPI(title="NFDRS API")
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

@app.get("/meta")
def req_meta():
    """ endpoint for meta information (labels, time range, etc) """
    return meta_nfdrs

'''
@app.get("/plots")
def req_plots():
    return plot_info
'''
