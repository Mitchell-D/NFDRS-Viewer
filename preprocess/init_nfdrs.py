import zarr
import geopandas as gpd
import numpy as np
import netCDF4 as nc
from pathlib import Path
from datetime import date

from utils import get_hrrr_forecast_48h,get_region_mapping
import config

if __name__=="__main__":
    source_dir = Path("/rhome/mdodson/NFDRS-Viewer/data/source")
    out_zarr_dir = Path("/rhome/mdodson/NFDRS-Viewer/data/store")
    vector_dir = Path("/rhome/mdodson/NFDRS-Viewer/data/vector")

    out_zarr_path = out_zarr_dir.joinpath("nfdrs-forecast.zarr")
    sample_file = source_dir.joinpath(
        "nfdrsv4_hourly_HRRR_DYNAMICAL_20260513.nc")
    sample_var = "mc1"
    sample_slice = [0] ## used to return sample_var spatial dimensions only

    overwrite_existing = True

    """ ------------( end normal configuration )------------ """

    tmpz = get_hrrr_forecast_48h(
        variables=["temperature_2m"],
        date=date(2020, 1, 1),
        )

    tmpds = nc.Dataset(sample_file, "r")
    m_valid = ~tmpds[sample_var][*sample_slice].mask
    tmpds.close()

    ## for now, there is no regional logic, so put everything in a root
    ## group for the HRRR-derived data.

    cro,(grs,gro),src_slice,ixmap,(lat_out,lon_out),m_sub = get_region_mapping(
        crs_src=tmpz.spatial_ref.crs_wkt,
        crs_out=config.backend["crs_out"],
        x=tmpz["x"][...],
        y=tmpz["y"][...],
        m_valid=m_valid,
        domain_polygon=None,
        buffer=0.0,
        mask_oversample_factor=config.backend["mask_oversample_factor"],
        mask_coverage_cutoff=config.backend["mask_coverage_cutoff"],
        )

    zgrp = zarr.open(out_zarr_path, mode="w")
    if "hrrr" in zgrp.keys():
        if not overwrite_existing:
            raise ValueError(f"hrrr group already exists in ", out_zarr_path)
        del zgrp["hrrr"]
    zgrp.create_group("hrrr")

    zgrp["hrrr"].create_array("lat", data=lat_out)
    zgrp["hrrr"].create_array("lon", data=lon_out)
    zgrp["hrrr"].create_array("index_map", data=ixmap)
    zgrp["hrrr"].create_array("m_valid", data=m_sub)
    zgrp["hrrr"].attrs.update({
        "source_slice":src_slice,
        "geo_ref_src":grs,
        "geo_ref_out":gro,
        "coord_range_out":cro,
        })
