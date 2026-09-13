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

## map partial signatures to normalization method kwargs, plus an extra
## "methods" key indicating which normalization function to run.
norm_resolution = 2048
norm_mask = 65535
norm = [
    ## don't normalize hourly and daily valid time labels
    [[{"time":"hourly"}, {"time":"daily"}], {"method":"none"}],
    ## normalize data variables to uint16
    #[[{"variable":"ftemp"}], {
    #    "method":"uint16",
    #    "nmin":-30,
    #    "nmax":60,
    #    "nres":norm_resolution,
    #    "nmask":norm_mask
    #    }],
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
    [[{"variable":vk} for vk in ["ic", "bi", "erc"]], {
        "method":"uint16",
        "nmin":0,
        "nmax":100,
        "nres":norm_resolution,
        "nmask":norm_mask
        }],
    [[{"variable":vk} for vk in ["sc", "dfm"]], {
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

## menu keys that trigger updates to each dependent menu
menu_triggers = {
    "itime":[],
    "variable":[],
    "timelag":["variable"],
    "model":["variable"],
    "mtype":["variable"],
    }

## menu keys that are used to determine value options for each menu
menu_args = {
    "itime":[],
    "variable":[],
    "timelag":["variable"],
    "model":["variable"],
    "mtype":["variable"],
    #"variable":["itime"],
    #"timelag":["itime", "variable"],
    #"model":["itime", "variable"],
    #"mtype":["itime", "variable"],
    }

menu_defaults = {
    "variable":[[{}, "dfm"]],
    "timelag":[[{"variable":"dfm"}, "1h"]],
    "model":[[{"variable":vk}, "grass"] for vk in ["ic", "bi", "erc", "sc"]],
    "mtype":[[{"variable":"mc"}, "herb"]],
    }

## frontend configuration consists of all l
fuel_models = ["grass", "shrub", "brush", "timber", "slash"]
labels = {
    "long_labels":{
        ## single-level dict mapping any key or value name to its descriptive
        ## their component of the label. features nested in a group should
        ## only label the unqiue information for that key or value since its
        ## parent labels should be prepended.
            #"ftemp":"Fuel Temperature",
            "dfm":"Dead Fuel Moisture",
            "dfm-1":"1-Hour",
            "dfm-10":"10-Hour",
            "dfm-100":"100-Hour",
            "dfm-1000":"1000-Hour",
            "sc":"Spread Component",
            "erc":"Energy Release Component",
            "bi":"Burning Index",
            "ic":"Ignition Component",
            "grass":"Grass Model",
            "shrub":"Shrub Model",
            "brush":"Brush Model",
            "timber":"Timber Model",
            "slash":"Slash Model",
            "mc":"Moisture Content",
            "herb":"Herbaceous",
            "wood":"Woody",
            "gsi":"Growing Season Index",
            "kbdi":"Keetch-Byram Drought Index",
        },
    "short_labels":{},
    }

## color map options and resolution
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
    "defaults":{
        "bounds":[
            #[[{"variable":"ftemp"}], [-30, 60]],
            [[{"variable":"gsi"}], [0,1]],
            [[{"variable":"kbdi"}], [0,400]],
            [[{"variable":vk} for vk in ["ic", "bi", "erc"]], [0,100]],
            [[{"variable":vk} for vk in ["sc", "dfm"]], [0,50]],
            [[{"variable":"mc", "mtype":"herb"}], [30,250]],
            [[{"variable":"mc", "mtype":"wood"}], [60,200]],
            ],
        "name":[[{}], "cmr.pride"],
        },
    }

custom_cmaps = {
    "classic-9":{
        "type":"listed",
        "colors":[
            "#cc0000", "#ff6600", "#ffa000", "#ebeb50", "#8ce48c",
            "#00ff00", "#00c800", "#00af00", "#009600",
            ],
        },
    "classic-5":{
        "type":"listed",
        "colors":[
            "#cc0000", "#ffa000", "#8ce48c", "#00c800", "#009600",
            ],
        },
    "beach-9":{
        "type":"listed",
        "colors":[
            "#8c510a", "#bf812d", "#dfc27d", "#f6e8c3", "#f5f5f5",
            "#c7eae5", "#80cdc1", "#35978f", "#01665e",
            ],
        },
    "heat-5":{
        "type":"listed",
        "colors":[
            "#d7191c", "#fdae61", "#ffffbf", "#abd9e9", "#2c7bb6",
            ],
        },
    }

## settings for how data is extracted and stored, not explicitly passed to user
backend = {
    "crs_out":"EPSG:3857",

    ## rules for determining fractional inclusion of pixels in polygons
    "mask_oversample_factor":16,
    "mask_coverage_cutoff":.3,

    ## netCDF features to extract
    "extract_feats":[
        "DFM1hr", "DFM10hr", "DFM100hr", "DFM1000hr",
        "SC", "ERC", "BI", "IC",
        "LFM_Herb", "LFM_Wood", "GSI", "KBDI",
        "time", "time_daily",
        ],

    ## map netCDF array variable keys to zarr store keys.
    ## If a netCDF array splits into multiple variables, provide a list of
    ## 3-tuples: (group_key:str, split_axis:int, labels:list)
    ## ordered hierarchically such that the last-split axis labels the arrays.
    "zarr_array_mapping":{
        "DFM1hr":"1h",
        "DFM10hr":"10h",
        "DFM100hr":"100h",
        "DFM1000hr":"1000h",
        #"fuel_temp_c":"ftemp",
        "LFM_Herb":"herb",
        "LFM_Wood":"wood",
        "time":"hourly",
        "time_daily":"daily",
        "SC":("sc", [("model", 1, fuel_models)]),
        "ERC":("erc", [("model", 1, fuel_models)]),
        "BI":("bi", [("model", 1, fuel_models)]),
        "IC":("ic", [("model", 1, fuel_models)]),
        "GSI":"gsi",
        "KBDI":"kbdi",
        },

    ## map source netCDF variable names to the key under which they're stored.
    ## This ultimately determines the structure of the zarr store.
    "zarr_array_subpaths":{
        "DFM1hr":"variable/dfm/timelag",
        "DFM10hr":"variable/dfm/timelag",
        "DFM100hr":"variable/dfm/timelag",
        "DFM1000hr":"variable/dfm/timelag",
        #"fuel_temp_c":"variable",
        "LFM_Herb":"variable/mc/mtype",
        "LFM_Wood":"variable/mc/mtype",
        "SC":"variable",
        "ERC":"variable",
        "BI":"variable",
        "IC":"variable",
        "GSI":"variable",
        "KBDI":"variable",
        "time":"time",
        "time_daily":"time",
        },

    ## provide the (y, x) resampling axis numbers for each spatial array
    ## *after* they have perhaps been split along some of their axes
    "resample_axes":[
        [
            [{"variable":k} for k in [
                "dfm", "sc", "erc", "bi", "ic" "mc", "gsi", "kbdi" ]],
            [(1,2), (1,2)],
            ],
        ],

    ## using a relational mapping to identify arrays, define keyword arguments
    ## to zarr's create_array method to use when each array is stored.
    "zarr_kwargs":[
        ## valid times
        [
            [{"time":"hourly"}],
            {
                "attributes":{"dims":["hour"]},
                "dimension_names":["hour"],
                "dtype":"u4",
                },
            ],
        [
            [{"time":"daily"}],
            {
                "attributes":{"dims":["day"]},
                "dimension_names":["day"],
                "dtype":"u4",
                },
            ],
        ## hourly variables
        [
            [{"variable":k} for k in [
                "dfm", "sc", "erc", "bi", "ic"
                ]],
            {
                "attributes":{
                    "dims":["hour", "y", "x"],
                    },
                "dimension_names":["hour", "y", "x"],
                "chunks":(6,180,220), ## ~475 KB per chunk
                "shards":(24,1080,2200), ## (8, 7, 10) chunk grid; ~226 MB
                "fill_value":norm_mask,
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

        ## daily variables
        [
            [{"variable":fk} for fk in [
                "mc", "gsi", "kbdi"
                ]],
            {
                "attributes":{
                    "dims":["day", "y", "x"],
                    },
                "dimension_names":["day", "y", "x"],
                "chunks":(2, 180, 220),
                "shards":(2, 1080, 2200),
                "fill_value":norm_mask,
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
        ],
        ## specify the sorted order of some or all possible menu values by
        ## providing a list or sorting function applied to the list of value
        ## strings. Unspecified menus or menu values are sorted alphabetically,
        ## and unspecified values are appended after specified values.
        "menu_order":{
            "timelag":lambda ts:list(sorted(ts))[::-1],
            "model":["grass", "shrub", "brush", "timber", "slash"],
            "variable":["kbdi", "gsi", "dfm", "mc", "ic", "sc", "erc", "bi"],
            },
    }


## validate backend array configuration

## make sure array storage locations are under key directories, since the array
## names should be the ultimate value name.
src_keys = []
for k,v in backend["zarr_array_subpaths"].items():
    sp = [str(v) for v in v.replace(" ", "").split("/") if v]
    assert len(sp)%2 == 1, "subpath must map to a menu key directory"
    src_keys.append(k)
## make sure all source array value names are unique
assert len(src_keys) == len(list(set(src_keys))), "source keys must be unique"
## validate the stored array name configuration structure, including rules for
## arrays that are split along an axis into multiple stored arrays
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

