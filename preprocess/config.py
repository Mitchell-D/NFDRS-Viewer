num_fuel_models = 1

## encode the group structure options of the zarr store, which is used on
## server to traverse the tree and determine the current catalog of arrays.
## The first entry in each component list is a unique string group name,
## and the second is a list of potentially-nested subgroups.

## Within each group labeled below, there may be arbitrarily-labeled subgroups
## or arrays. That way, any array can be referenced with alternating key groups
## and value groups
## ie: /itime/20260829/variable/mc/mtype/herb/metric/mean
## or: /itime/20260829/variable/ftemp
## so that all arrays are under /{key1}/{grp1}/{key2}/{grp2}

## each nested group entry is a 2-tuple (group_key:str, subgroups:list)
## where each element of subgroups is either a string (terminal subgroup)
## or another 2-tuple (subgroup with child groups)
zarr_key_groups = [
    ("itime", [ ("variable", ["mtype", "model", "timelag"]) ]),
    ]


## full array shape: (1205, 2181)
zarr_format = [
    [[{"time":"hourly"}], {"dims":["hour"]}],
    [[{"time":"daily"}], {"dims":["day"]}],
    [
        [{"variable":k} for k in ["ftemp", "dfm", "sc", "erc", "bi", "ic"]],
        {
            "dims":["hour", "y", "x"],
            "chunks":(6,180,220), ## ~475 KB per chunk
            "shards":(24,1080,2200), ## (8, 7, 10) chunk grid; ~226 MB
            "fill_value":-9999.,
            "dtype":"u2",
            "compressors":[
                {
                    "name":"blosc",
                    "configuration":{
                        "cname":"zstd",
                        "clevel":4,
                        "shuffle":"bitshuffle",
                        "typesize":2,
                        "blocksize":0, ## determined at runtime
                        },
                    },
                ],
            },
        ],
    [
        [{"variable":fk} for fk in ["mc", "gsi", "kbdi"]],
        {
            "dims":["day", "y", "x"],
            "chunks":(2, 180, 220),
            "shards":(2, 1080, 2200),
            "fill_value":-9999.,
            "dtype":"u2",
            "compressors":[
                {
                    "name":"blosc",
                    "configuration":{
                        "cname":"zstd",
                        "clevel":4,
                        "shuffle":"bitshuffle",
                        "typesize":2,
                        "blocksize":0, ## determined at runtime
                        },
                    },
                ],
            },
        ],
    ]

## map partial signatures to normalization method kwargs, plus an extra
## "methods" key indicating which normalization function to run.
norm_resolution = 2048
norm_mask = 65535
norm = [
    [[{"time":"hourly"}, {"time":"daily"}], {"method":"none"}],
    [[{"variable":"ftemp"}], {
        "method":"uint16",
        "nmin":-30,
        "nmax":60,
        "nres":norm_resolution,
        "nmask":norm_mask
        }],
    [[{"variable":"gsi"}], {
        "method":"uint16",
        "nmin":0,
        "nmax":1,
        "nres":norm_resolution,
        "nmask":norm_mask
        }],
    [[{"variable":"kbdi"}], {
        "method":"uint16",
        "nmin":0,
        "nmax":400,
        "nres":norm_resolution,
        "nmask":norm_mask
        }],
    [[{"variable":"ic"}], {
        "method":"uint16",
        "nmin":0,
        "nmax":100,
        "nres":norm_resolution,
        "nmask":norm_mask
        }],
    [[{"variable":"bi"}], {
        "method":"uint16",
        "nmin":0,
        "nmax":100,
        "nres":norm_resolution,
        "nmask":norm_mask
        }],
    [[{"variable":"erc"}], {
        "method":"uint16",
        "nmin":0,
        "nmax":100,
        "nres":norm_resolution,
        "nmask":norm_mask
        }],
    [[{"variable":"sc"}], {
        "method":"uint16",
        "nmin":0,
        "nmax":50,
        "nres":norm_resolution,
        "nmask":norm_mask
        }],
    [[{"variable":"dfm"}], {
        "method":"uint16",
        "nmin":0,
        "nmax":50,
        "nres":norm_resolution,
        "nmask":norm_mask
        }],
    [[{"variable":"mc", "mtype":"herb"}], {
        "method":"uint16",
        "nmin":30,
        "nmax":250,
        "nres":norm_resolution,
        "nmask":norm_mask
        }],
    [[{"variable":"mc", "mtype":"wood"}], {
        "method":"uint16",
        "nmin":60,
        "nmax":200,
        "nres":norm_resolution,
        "nmask":norm_mask
        }],
    ]

menu_triggers = {
    "itime":[],
    "feat":["itime"],
    "timelag":["feat"],
    "model":["feat"],
    "mtype":["feat"],
    }

menu_args = {
    "itime":[],
    "variable":["itime"],
    "timelag":["itime", "variable"],
    "model":["itime", "variable"],
    "mtype":["itime", "variable"],
    }

frontend = {
    "labels":{
        ## all feature and feature group labels must be mutually unique.
        "feat":{
            "dfm":["dfm-1", "dfm-10", "dfm-100", "dfm-1000"],
            #"kbdi":[f"kbdi-m{i}" for i in range(num_fuel_models)],
            "sc":[f"sc-m{i}" for i in range(num_fuel_models)],
            "erc":[f"erc-m{i}" for i in range(num_fuel_models)],
            "bi":[f"bi-m{i}" for i in range(num_fuel_models)],
            "ic":[f"ic-m{i}" for i in range(num_fuel_models)],
            "mc":["mc-herb", "mc-wood"],
            "gsi":None,
            "kbdi":None,
            "ftemp":None,
            },
        "metric_spatial":None,
        "pgroup":["counties"],
        "itime":None, ## set dynamically by prep_nfdrs.py
        },
    "long_labels":{
        ## single-level dict mapping feature or feature group labels to
        ## their component of the label. features nested in a group should
        ## only label the unqiue information for that variable since its
        ## parent group labels should be prepended.
        "feat":{
            "ftemp":"Fuel Temperature",
            "dfm":"Dead Fuel Moisture",
            "dfm-1":"1-Hour",
            "dfm-10":"10-Hour",
            "dfm-100":"100-Hour",
            "dfm-1000":"1000-Hour",
            "sc":"Spread Component",
            **{f"sc-m{i}":"Model {i}" for i in range(num_fuel_models)},
            "erc":"Energy Release Component",
            **{f"erc-m{i}":"Model {i}" for i in range(num_fuel_models)},
            "bi":"Burning Index",
            **{f"bi-m{i}":"Model {i}" for i in range(num_fuel_models)},
            "ic":"Ignition Component",
            **{f"ic-m{i}":"Model {i}" for i in range(num_fuel_models)},
            "mc-herb":"Herb Moisture Content",
            "mc-wood":"Wood Moisture Content",
            "gsi":"",
            "kbdi":"kbdi",
            },
        "metric_spatial":{
            "min":"Minimum",
            "max":"Maximum",
            "mean":"Average",
            "stddev":"Std Dev",
            "p10":"10th Pctl",
            "p25":"25th Pctl",
            "p50":"Median",
            "p75":"75th Pctl",
            "p90":"90th Pctl",
            "max-min":"Max-Min",
            "p95-05":"95-5 Pctl",
            "p90-10":"90-10 Pctl",
            "p75-25":"75-25 Pctl"
            },
        },
    }

backend = {
    "num_fuel_models":num_fuel_models,
    "crs_out":"EPSG:3857",
    "mask_oversample_factor":16,
    "mask_coverage_cutoff":.3,
    ## netCDF features to extract
    "extract_feats":[
        "mc1", "mc10", "mc100", "mc1000",
        "fuel_temp_c", "sc", "erc", "bi", "ic",
        "mc_herb", "mc_wood", "gsi", "kbdi",
        "time", "time_daily",
        ],

    ## map netCDF array variable keys to zarr store keys.
    ## If a netCDF array splits into multiple variables, provide a list of
    ## 3-tuples: (group_key:str, split_axis:int, labels:list)
    ## ordered hierarchically such that the last-split axis labels the arrays.
    "zarr_array_mapping":{
        "mc1":"1h",
        "mc10":"10h",
        "mc100":"100h",
        "mc1000":"1000h",
        "fuel_temp_c":"ftemp",
        "mc_herb":"herb",
        "mc_wood":"wood",
        "time":"hourly",
        "time_daily":"daily",
        "sc":(
            "sc",
            [("model", 1, [str(i) for i in range(num_fuel_models)])]
            ),
        "erc":(
            "erc",
            [("model", 1, [str(i) for i in range(num_fuel_models)])]
            ),
        "bi":(
            "bi",
            [("model", 1, [str(i) for i in range(num_fuel_models)])],
            ),
        "ic":(
            "ic",
            [("model", 1, [str(i) for i in range(num_fuel_models)])],
            ),
        },

    ## map source netCDF variable names to the key directory where they will
    "zarr_array_subpaths":{
        "mc1":["variable", "dfm", "timelag"],
        "mc10":["variable", "dfm", "timelag"],
        "mc100":["variable", "dfm", "timelag"],
        "mc1000":["variable", "dfm", "timelag"],
        "fuel_temp_c":["variable"],
        "mc_herb":["variable", "mc", "mtype"],
        "mc_wood":["variable", "mc", "mtype"],
        "sc":["variable"],
        "erc":["variable"],
        "bi":["variable"],
        "ic":["variable"],
        "gsi":["variable"],
        "kbdi":["variable"],
        "time":["time"],
        "time_daily":["time"],
        },
    }

cmap = {
    "options":[
        "viridis",
        "jet",
        "coolwarm",
        "cmr.chroma",
        "cmr.pride",
        "nipy_spectral",
        "afmhot",
        ],
    "resolution":256,
    }

custom_cmaps = {}

src_keys = []
for k,v in backend["zarr_array_subpaths"].items():
    assert len(v)%2 == 1, "subpath must map to a menu key directory"
    src_keys.append(k)
assert len(src_keys) == len(list(set(src_keys))), "source keys must be unique"
src_keys = []
for k,v in backend["zarr_array_mapping"].items():
    src_keys.append(k)
    if isinstance(v, str):
        continue
    assert len(v) == 2, "expanded arrays must be a 2-tuple like: " + \
        "(parent_val:str, expanded_axes:list)"
    assert isinstance(v[0], str), "expanded arrays must be a 2-tuple like:" + \
        " (parent_val:str, expanded_axes:list)"
    for ea in v[1]:
        assert len(ea) == 3 and isinstance(ea[0], str), \
            "expanded axes must be a 3-tuple like: " + \
            "(child_key:str, axis:int, child_vals:list[str])"
        assert isinstance(ea[1], int) and isinstance(ea[2], (tuple,list)), \
            "expanded axes must be a 3-tuple like: " + \
            "(child_key:str, axis:int, child_vals:list[str])"

