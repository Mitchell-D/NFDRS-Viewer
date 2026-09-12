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
from utils import RelationalConfig,AmbiguousMatchError

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

    load_meta = True
    load_cmaps = False
    load_menu = True
    check_bounds = False
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
            "norm":config.norm,
            "labels":config.labels,
            #"regions":rconf,
            #"plots":config.plot_config,
            })

    """ generate and store color maps """

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

    """
    use the zarr store structure to parse key-value relational configurations
    for menus used to select arrays, and mapping arrays to paths in the store.

    Also load the menu dependencies and triggers
    """

    if load_menu:
        arrs = parse_zarr_menu_paths(out_zarr_path, ["/hrrr/itime"])
        args = config.menu_args
        trigs = config.menu_triggers
        morder = config.backend["menu_order"]
        resolved = {}
        unresolved = list(args.keys())
        ## iterate until all menus are resolved
        while len(unresolved):
            got_one = False
            for k,a in args.items():
                ## if already resolved, skip
                if k in resolved.keys():
                    continue
                ## defer if still waiting on menu dependencies
                if not all(v in resolved.keys() for v in a):
                    continue

                resolved[k] = RelationalConfig()
                #cur_options = []
                for ar in arrs:
                    ## skip if this array not dependent on this menu
                    if not k in ar["keys"]:
                        continue
                    md = dict(zip(ar["keys"], ar["vals"]))
                    cur_key = {ak:md[ak] for ak in a}
                    try:
                        cur_val = resolved[k].get(cur_key)
                    except KeyError as e:
                        cur_val = []
                    ## on ambiguous match, probably the menu has multiple
                    ## entries that partially match one k/v pair
                    except AmbiguousMatchError as e:
                        cur_val = []
                    if md[k] in cur_val:
                        continue
                    cur_val.append(md[k])
                    resolved[k].set(cur_key, cur_val)
                unresolved.remove(k)
                got_one = True
            if not got_one:
                raise ValueError(
                    f"Can't resolve menus after:",
                    {rk:rc.store for rk,rc in resolved.items()}
                    )

        ## sort the menu value lists according to the configured rules,
        ## falling back to alphabetical if a menu entry isn't configured
        for k in args.keys():
            cstor = resolved[k].store
            new_cstor = []
            cfg_order = morder.get(k, [])
            for ck,cv in cstor:
                if isinstance(cfg_order, (list, tuple)):
                    ordered = list(sorted(
                        [v for v in cv if v in cfg_order],
                        key=lambda v: morder[k].index(v)
                        ))
                    alphabetic = list(sorted(
                        [v for v in cv if not v in cfg_order]
                        ))
                    new_cstor.append((ck, ordered + alphabetic))
                else:
                    new_cstor.append((ck, cfg_order(cv)))
                print(new_cstor[-1])
            resolved[k].store = new_cstor


        array_paths = RelationalConfig()
        for ar in arrs:
            md = dict(zip(ar["keys"], ar["vals"]))
            array_paths.set(md, ar["path"])
        zgrp.attrs.update({
            "menu":{
                "options":{k:m.store for k,m in resolved.items()},
                "arrays":array_paths.store,
                "triggers":trigs,
                }
            })

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
