import numpy as np
import zarr
import itertools
import multiprocessing  as mp
import netCDF4 as nc
from datetime import date,datetime,timedelta
from pathlib import Path
from pprint import pprint

from utils import RelationalConfig
import config

def norm_uint16(x, nmin, nmax, nres, nmask):
    m_valid = np.isfinite(x)
    y = np.clip((x-nmin)/(nmax-nmin)*(nres-1), 0, nres-1)
    y[~m_valid] = nmask
    return np.round(y).astype(np.uint16)

norm_methods = {
    "none":lambda x:x,
    "uint16":norm_uint16,
    }

def parse_nfdrs_netcdf(
        itime, src_path, zarr_path, zarr_root, get_feats,
        subpaths, array_mapping, zarr_format:RelationalConfig,
        norm_config:RelationalConfig=None,
        ):
    """
    :@param zarr_format:
    """
    zgrp = zarr.open(zarr_path, path=zarr_root, mode="a")
    assert "itime" in zgrp.keys()
    assert not itime in zgrp["itime"].keys()
    zgrp["itime"].create_group(itime)

    ixmap = zgrp["index_map"][...]
    m_valid = zgrp["m_valid"]
    za = dict(zgrp.attrs)
    ncds = nc.Dataset(src_path, "r")
    ((ixy0,ixyf), (ixx0,ixxf)) = za["source_slice"]
    data = {}
    for fk_src in get_feats:
        x = ncds[fk_src][...].data
        subp = ("itime", itime, *subpaths[fk_src])
        aname = array_mapping.get(fk_src,fk_src)
        if isinstance(aname, str):
            subsubp = (*subp, aname)
            data[subsubp] = x
        else:
            assert len(aname) == 2, \
                f"must be (group_key:str, split_axes:list): {aname}"
            gk,split_axes = aname
            assert isinstance(split_axes, (list, tuple))
            subgroups,axes,labels = zip(*split_axes)
            assert len(list(set(subgroups))) == len(subgroups)
            assert len(list(set(axes))) == len(axes)
            combine = []
            for sgk,aix,ls in split_axes:
                assert x.shape[aix] == len(ls), (x.shape, ls)
                combine.append([])
                for i,l in enumerate(ls):
                    combine[-1].append((sgk,aix,i,l))
            nax = len(x.shape)
            for t in itertools.product(*combine):
                slc = [slice(None) for i in range(nax)]
                subsubp = []
                for sgk,aix,i,l in t:
                    slc[aix] = i
                    subsubp += [sgk,l]
                subsubp = (*subp, gk, *subsubp)
                assert subsubp not in data.keys(), subsubp
                data[subsubp] = x[*slc]

    ## make a zarr destination for each array and determine its signature,
    ## which is used to choose norm bounds, zarr format, etc.
    for subp,x in data.items():
        zgrp_sub = zgrp
        sig = {}
        sig_key = None
        for gk in subp[:-1]:
            if sig_key is None:
                assert not gk in sig.keys(), (gk, list(sig.keys()))
                sig_key = gk
            else:
                sig[sig_key] = gk
                sig_key = None
            if gk not in zgrp_sub.keys():
                zgrp_sub.create_group(gk)
            zgrp_sub = zgrp_sub[gk]
        assert not sig_key is None, "arrays must be stored under a key group"
        ## set array name to final element of signature
        sig[sig_key] = subp[-1]
        zprops = zarr_format.get(sig)
        print(f"creating {subp}")
        zgrp_sub.create_array(
            subp[-1],
            shape=x.shape,
            chunks=zprops.get("chunks", "auto"),
            shards=zprops.get("shards", "auto"),
            compressors=zprops.get("compressors", []),
            dtype=zprops.get("dtype", x.dtype)
            )
        if not norm_config is None:
            tmpn = norm_config.get(sig)
            nfunc = norm_methods[tmpn["method"]]
            x = nfunc(x, **{k:v for k,v in tmpn.items() if k != "method"})

        zgrp_sub[subp[-1]][...] = x


if __name__=="__main__":
    source_dir = Path("/rhome/mdodson/NFDRS-Viewer/data/source")
    out_zarr_dir = Path("/rhome/mdodson/NFDRS-Viewer/data/store")
    out_zarr_path = out_zarr_dir.joinpath("nfdrs-forecast.zarr")

    src_fmt = "nfdrsv4_hourly_HRRR_DYNAMICAL_%Y%m%d.nc"
    itime_fmt = "%Y-%m-%d"

    overwrite_existing = True
    delete_out_of_range = False

    start_itime = date(2026, 5, 13)
    end_itime = date(2026, 5, 14)

    """ ------------( end normal config )------------ """

    zgrp = zarr.open(out_zarr_path, mode="a")
    assert "hrrr" in zgrp.keys(), f"data store has not been initialized"

    has_dates = []
    if "itime" in zgrp["hrrr"].keys():
        has_dates = [
            datetime.strptime(v, itime_fmt).date()
            for v in zgrp["/hrrr/itime"].keys()
            ]
    else:
        zgrp["hrrr"].create_group("itime")

    get_dates = [
        start_itime + timedelta(days=i)
        for i in range((end_itime-start_itime).days+1)
        ]

    for d in has_dates:
        if (delete_out_of_range and not (start_itime <= d <= end_itime)) \
                or (d in get_dates and overwrite_existing):
            del zgrp[f"/hrrr/itime/{d.strftime(itime_fmt)}"]
        if not overwrite_existing and d in get_dates:
            get_dates.remove(d)

    cfg_zfmt = RelationalConfig()
    for sigs,cfg in config.zarr_format:
        for s in sigs:
            cfg_zfmt.set(s, cfg)

    cfg_norm = RelationalConfig()
    for sigs,cfg in config.norm:
        for s in sigs:
            cfg_norm.set(s, cfg)

    args = []
    for d in get_dates:
        tmp_path = source_dir.joinpath(d.strftime(src_fmt))
        if not tmp_path.exists():
            print(f"Missing netDCF: {tmp_path.as_posix()}")
            continue

        args.append({
            "itime":d.strftime(itime_fmt),
            "src_path":tmp_path,
            "zarr_path":out_zarr_path,
            "zarr_root":"hrrr",
            "get_feats":config.backend["extract_feats"],
            "subpaths":config.backend["zarr_array_subpaths"],
            "array_mapping":config.backend["zarr_array_mapping"],
            "zarr_format":cfg_zfmt,
            "norm_config":cfg_norm,
            #"norm_bounds":config.frontend["norm"]["bounds"],
            #"norm_resolution":config.frontend["norm"]["resolution"],
            })

    parse_nfdrs_netcdf(**args[0])

    print("finished")
