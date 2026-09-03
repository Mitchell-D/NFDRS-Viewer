"""
Update metadata from the config to the zarr database, including labels,
color maps, and static (non-selectable) polygons.
"""
import zarr
import numpy as np
import json
import geopandas as gpd
import matplotlib.pyplot as plt
import matplotlib.colors as pltc
from pathlib import Path
from pprint import pprint

import config

def parse_zarr_menu_paths(zarr_store_path, menu_roots):
    """
    """
    for i,mr in enumerate(menu_roots):
        if mr.startswith("/"):
            menu_roots[i] = menu_roots[i][1:]
    zgrp = zarr.open(zarr_store_path, mode="r")
    arrays = []
    for k,v in zgrp.members(max_depth=None):
        cur_root = None
        for mr in menu_roots:
            if k.startswith(mr):
                cur_root = mr
                break
        if cur_root is None:
            continue
        p = k.split("/")
        first_key = cur_root.split("/")[-1]
        fkix = p.index(first_key)
        p = p[fkix:]
        if isinstance(v, zarr.core.array.Array):
            assert len(p) % 2 == 0, "arrays must be inside key directories" \
                    + f"{p}"
            arrays.append({
                "path":k,
                "keys":p[::2],
                "vals":p[1::2],
                })
    return arrays

def get_cmaps(cmap_list, cmap_resolution, use_cmasher=False):
    """
    Given a list of string color map labels, generate a list table of
    flattened uint8 color map lookup tables and a list of slices that
    capture the slice partitioning each one if they are concatenated together.

    :@param cmap_list: matplotlib/cmasher string labels of color maps
    :@param cmap_resolution: integer resolution for all color maps
    :@param use_cmasher: If True, enables using cmasher color map strings too.
    """
    ## import dynamically so that cmasher dependency is optional, and heavy
    ## matplotlib load isn't default for the config script
    if use_cmasher:
        import cmasher as cmr
    cmap_arrays = []
    cmap_slices = []
    prv_ix = 0
    for cml in cmap_list:
        ## retrieve the color map and append a nan value last for transparent
        if cml in config.custom_cmaps.keys():
            ccmc = config.custom_cmaps[cml]
            if ccmc["type"] == "listed":
                cm = pltc.ListedColormap(
                    colors=ccmc["colors"],
                    name=cml,
                    )
            else:
                raise ValueError("unrecognized custom cmap type:",ccmc["type"])
        else:
            cm = plt.get_cmap(cml)
        tmp_cmap = cm(np.append(
            np.linspace(0, 1, int(cmap_resolution)),
            np.array(np.nan),
            ))

        ## convert to uint8 and flatten.
        cmap_arrays.append((tmp_cmap*255).astype(np.uint8).reshape(-1))
        new_ix = prv_ix + tmp_cmap.size
        cmap_slices.append((prv_ix, new_ix))
        prv_ix = new_ix
    return cmap_arrays,cmap_slices

if __name__=="__main__":
    out_zarr_path = Path("data/store/nfdrs-forecast.zarr")

    zgrp = zarr.open(out_zarr_path, mode="a")
    vec_dir = Path("data/vector")

    load_meta = False
    load_cmaps = False
    load_menu = False
    check_bounds = True
    #load_pgroups = False
    #load_domains = False

    if load_meta:
        '''
        rconf = {}
        for rk in zgrp["regions"].keys():
            ra = dict(zgrp[f"/regions/{rk}"].attrs)
            rconf[rk] = {
                "width":ra["geo_ref_out"]["width"],
                "height":ra["geo_ref_out"]["height"],
                "lat_bounds":ra["coord_range"][0],
                "lon_bounds":ra["coord_range"][1],
                }
        '''
        zgrp.attrs.update({
            **config.frontend,
            #"regions":rconf,
            #"plots":config.plot_config,
            })

    if load_cmaps:
        cmarr,cms = get_cmaps(
            cmap_list=config.cmap["options"],
            cmap_resolution=config.cmap["resolution"],
            use_cmasher=True,
            )
        if "cmaps" in zgrp.keys():
            del zgrp["cmaps"]
        cmarr = np.concatenate(cmarr, axis=0)
        zgrp.create_array("cmaps", shape=cmarr.shape, dtype=np.uint8)
        zgrp["cmaps"][...] = cmarr
        zgrp.attrs.update({"cmaps":{**config.cmap, "slices":cms}})
        print("got color maps")

    if load_menu:
        arrs = parse_zarr_menu_paths(out_zarr_path, ["/hrrr/itime"])
        pprint(arrs)

    if check_bounds:
        arrs = parse_zarr_menu_paths(out_zarr_path, ["/hrrr/itime"])
        for ad in arrs:
            x = zgrp[ad["path"]][...]
            x = x[np.isfinite(x)]
            x = x[x != -9999.]
            sig = " ".join([
                f"{k}:{v}"
                for k,v in zip(ad["keys"], ad["vals"])
                ])
            print()
            print(
                sig,
                f"\nmin:       {np.nanmin(x):.3f}",
                f"\nmean:      {np.nanmean(x):.3f}",
                f"\nmax:       {np.nanmax(x):.3f}",
                f"\nstddev:    {np.nanstd(x):.3f}",
                )

    '''
    if load_pgroups:
        vecs = {}
        for pgk in config.frontend["labels"]["pgroups"]:
            vecs[pgk] = {}
            for rk in config.frontend["labels"]["regions"]:
                print(f"getting {rk} {pgk}")
                keep_cols = config.backend["keep_pgroup_properties"][pgk]
                keep_cols.append("geometry")
                gj_path = vec_dir.joinpath(f"{pgk}_{rk}.geojson")
                tmpgj = gpd.read_file(gj_path)
                drop_cols = [
                    c for c in tmpgj.columns
                    if c not in keep_cols
                    ]
                tmpgj = tmpgj.drop(columns=drop_cols)
                tmpgj["UID"] = [f"{rk}_{pgk}_{i}" for i in range(len(tmpgj))]
                vecs[pgk][rk] = tmpgj.to_geo_dict()
        zgrp.attrs.update({"pgroups":vecs})
    '''

    '''
    if load_domains:
        raise ValueError("domain perimeter geojsons not supported")
    '''
    print("finished")
