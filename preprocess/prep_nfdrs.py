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

norm_funcs = {
    "none":lambda x:x,
    "uint16":norm_uint16,
    }

def mp_parse_netcdf_to_zarr(args):
    return args,parse_netcdf_to_zarr(**args)
def parse_netcdf_to_zarr(
        src_path, zarr_path, get_feats,
        parent_key_path, parent_name,
        array_key_paths, array_names,
        zarr_kwargs:RelationalConfig,
        source_slice=None, index_map=None, m_valid=None,
        resample_axes:RelationalConfig=None,
        norm_config:RelationalConfig=None,
        ):
    """
    Extract variables from a netCDF file into a zarr store formatted according
    to a nested key/value convention that enables relational lookups.

    All zarr paths starting with and under parent_key_path must be organized
    like: `key1/value1/key2/value2/.../keyN/arrayN` such that each array
    can be uniquely indexed by a unique dict-like signature of key/value pairs.

    :@param src_path: Path to the source netCDF file to parse
    :@param zarr_path: Path to the zarr store to dump data into
    :@param parent_key_path: path to the key directory within the zarr store
        where the parent_name directory containing this file's data
        will be placed.
    :@param parent_name: string associated with this source file's root
        value, used as the value to the key defined in parent_key_path.
    :@param get_feats: data features to extract from the file
    :@param array_key_paths: dict mapping file feat names to the string subpath
        under parent_name where the array will be stored.
    :@param array_names: dict mapping file feat names to either the single
        unique string name of that array (the value under the corresponding
        array_key_paths entry), or a 2-tuple (sub_value_name, child_arrays)
        representing an array that is split into multiple arrays along an axis.
        sub_value_name must be the string name of the value directory under the
        corresponding entry in array_key_paths, and child_arrays must be a list
        of 3-tuples (sub_key_name:str, split_axis:int, sub_array_names:list)
        where sub_key_name is the string name of the value directory
        containing split arrays, split_axis defines the axis (eventualy axes)
        that is separated, and sub_array_names provides a unique string name
        for each sub-array stored under sub_key_name.
    :@param index_map: (2, y, x) integer array of source indeces in the place
        of their valid destination location
    :@param m_valid: (y, x) boolean array indicating valid output locations
    :@param zarr_kwargs: RelationalConfig mapping array signatures to a
        dict of keyword arguments to zarr's create_array method.
    :@param norm_config: RelationalConfig mapping array signatures to a string
        key of norm_funcs indicating the normalization method to use, and a
        collection of keyword arguments to the corresponding method.
    """
    ncds = nc.Dataset(src_path, "r")

    ## determine the parent key as the last group in the parent key path
    parent_key = [
        str(v) for v in parent_key_path.replace(" ", "").split("/") if v
        ][-1]
    zgrp = zarr.open(
        zarr_path,
        path=parent_key_path.replace(parent_key, ""),
        mode="a",
        )

    ## extract all the arrays up-front and split them if requested.
    sp = {
        spk:[str(v) for v in spl.replace(" ", "").split("/") if v]
        for spk,spl in array_key_paths.items()
        }
    data = {}
    for fk_src in get_feats:
        x = ncds[fk_src][...].data
        subp = (parent_key, parent_name, *sp[fk_src])
        aname = array_names.get(fk_src,fk_src)
        ## extract a single array and store under its subpath
        if isinstance(aname, str):
            subsubp = (*subp, aname)
            data[subsubp] = x
        ## extract multiple arrays by splitting along axes
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
        ## determine the signature exists and create its parent groups
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
        sig[sig_key] = subp[-1]
        assert not sig_key is None, "arrays must be stored under a key group"

        ## make the assumption that the parent value name isn't important
        ## for configuration signatures since it will change by file.
        del sig[parent_key]

        ## get the zarr properties of this array
        zprops = zarr_kwargs.get(sig)

        ## normalize the array if configured to do so
        tmpn = {}
        if not norm_config is None:
            tmpn = norm_config.get(sig)
            nfunc = norm_funcs[tmpn["method"]]
            x = nfunc(x, **{k:v for k,v in tmpn.items() if k != "method"})

        ## resample the array if configured to do so
        if not resample_axes is None:
            try:
                (yixs,xixs),(yixo,xixo) = resample_axes.get(sig)
                assert yixs != xixs
                assert yixo != xixo
                assert not index_map is None
                assert not m_valid is None
                oy,ox = m_valid.shape
                assert index_map.shape[1:] == m_valid.shape
                ixm = index_map
                ## move spatial axes to end of array
                x = np.moveaxis(x, (yixs,xixs), (-2, -1))
                if not source_slice is None:
                    x = x[...,*source_slice]
                ## determine the ultimate output array shape
                out_shape = tuple([
                    [[a, oy][i == yixo], ox][i == xixo]
                    for i,a in enumerate(x.shape)
                    ])
                out = np.full(
                    out_shape,
                    zprops.get("fill_value", tmpn.get("nmask", np.nan)),
                    dtype=x.dtype
                    )
                ## move the output array spatial axes to the end
                out = np.moveaxis(out, (yixo,xixo), (-2, -1))
                out[..., m_valid] = x[..., ixm[0, m_valid], ixm[1, m_valid]]
                ## move the output array axes back where they belong
                out = np.moveaxis(out, (-2, -1), (yixo, xixo))
            except KeyError:
                #print(f"skipping resampling for {sig}, x.shape")
                out = x

        ## set array name to final element of signature
        sig[sig_key] = subp[-1]
        print(f"creating {subp}")
        try:
            zgrp_sub.create_array(
                subp[-1],
                shape=out.shape,
                **zprops,
                )
            zgrp_sub[subp[-1]][...] = out
        except Exception as e:
            print(f"Failed creating {subp} with shape {out.shape}")
            raise e


if __name__=="__main__":
    source_dir = Path("/rhome/mdodson/NFDRS-Viewer/data/source")
    out_zarr_dir = Path("/rhome/mdodson/NFDRS-Viewer/data/store")
    out_zarr_path = out_zarr_dir.joinpath("nfdrs-forecast.zarr")

    src_fmt = "nfdrsv4_hourly_HRRR_DYNAMICAL_%Y%m%d.nc"
    itime_fmt = "%Y-%m-%d"

    nworkers = 4

    overwrite_existing = True
    delete_out_of_range = True

    start_itime = date(2026, 8, 29)
    end_itime = date(2026, 9, 1)

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

    ## remove stale itimes, or skip existing ones
    for d in has_dates:
        if (delete_out_of_range and not (start_itime <= d <= end_itime)) \
                or (d in get_dates and overwrite_existing):
            del zgrp[f"/hrrr/itime/{d.strftime(itime_fmt)}"]
        if not overwrite_existing and d in get_dates:
            get_dates.remove(d)

    ## set up relational configs for zarr keyword arguments, norm settings,
    ## and spatial array resampling settings.
    cfg_zfmt = RelationalConfig()
    for sigs,cfg in config.backend["zarr_kwargs"]:
        for s in sigs:
            cfg_zfmt.set(s, cfg)
    cfg_norm = RelationalConfig()
    for sigs,cfg in config.norm:
        for s in sigs:
            cfg_norm.set(s, cfg)
    cfg_resample = RelationalConfig()
    for sigs,cfg in config.backend["resample_axes"]:
        for s in sigs:
            cfg_resample.set(s, cfg)

    ## create arguments to parse each source netCDF
    args = []
    for d in get_dates:
        tmp_path = source_dir.joinpath(d.strftime(src_fmt))
        if not tmp_path.exists():
            print(f"Missing netDCF: {tmp_path.as_posix()}")
            continue

        args.append({
            "src_path":tmp_path,
            "zarr_path":out_zarr_path,
            "get_feats":config.backend["extract_feats"],
            "parent_key_path":"hrrr/itime",
            "parent_name":d.strftime(itime_fmt),
            "array_key_paths":config.backend["zarr_array_subpaths"],
            "array_names":config.backend["zarr_array_mapping"],
            "zarr_kwargs":cfg_zfmt,
            "norm_config":cfg_norm,
            "resample_axes":cfg_resample,
            "source_slice":[
                slice(*ss) for ss in zgrp["hrrr"].attrs["source_slice"]],
            "m_valid":zgrp["/hrrr/m_valid"][...],
            "index_map":zgrp["/hrrr/index_map"][...],
            #"norm_bounds":config.frontend["norm"]["bounds"],
            #"norm_resolution":config.frontend["norm"]["resolution"],
            })

    with mp.Pool(nworkers) as pool:
        for a,r in pool.imap_unordered(mp_parse_netcdf_to_zarr, args):
            print(f"stored {a['parent_key_path']}/{a['parent_name']}")

    print("finished")
