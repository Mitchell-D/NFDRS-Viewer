import numpy as np
import pyproj
import rasterio as rio
import shapely

import icechunk
import pystac
import geopandas as gpd
import xarray as xr

from affine import Affine
from rasterio.enums import Resampling
from rasterio.features import rasterize

from datetime import date
from pathlib import Path

def get_hrrr_forecast_48h(variables, date, y_range=[None], x_range=[None],
        lead_times_limit=None):
    """
    Downloads and returns the GEFS forecast ensemble for a list of variables
    on a single day within provided latitude and longitude bounds as an
    xarray Dataset
    """
    cat = pystac.Catalog.from_file("https://stac.dynamical.org/catalog.json")
    col = cat.get_child("noaa-hrrr-forecast-48-hour")
    asset = col.assets["icechunk-https"]
    repo = icechunk.Repository.open(icechunk.http_storage(asset.href))
    ses = repo.readonly_session("main")
    ds = xr.open_zarr(ses.store, chunks=None)
    sub = ds[variables].sel(
        init_time=date.strftime(f"%Y-%m-%dT00"),
        y=slice(*y_range[::-1]),
        x=slice(*x_range),
        ).isel(lead_time=slice(0, lead_times_limit))
    return sub


def get_region_mapping(
    crs_src, crs_out, x, y, transform_src=None, m_valid=None,
    domain_polygon=None, domain_polygon_crs=None,
    buffer=0.0, mask_oversample_factor=16, mask_coverage_cutoff=0.3,
    ):
    """
    develop a source->destination pixel index mapping for a rectilinear
    source array.

    :@param crs_src: source grid coordinate reference
    :@param crs_out: destination grid coordinate reference
    :@param x: 1d array of horizontal coordinate values.
    :@param y: 1d array of vertical coordinate values.
    :@param transform_src: Optionally provide the source transform so it
        doesn't need to be calculated with from_bounds.
    :@param m_valid: optional source valid pixel map shaped (y, x)
    :@param domain_polygon: shapely polygon defining the subgrid domain.
    :@param domain_polygon_crs: coordinate reference for provided polygon
    :@param buffer: source-crs buffer in each direction to include in subset
    """
    crs_src = pyproj.CRS.from_user_input(crs_src)
    crs_out = pyproj.CRS.from_user_input(crs_out)

    if domain_polygon_crs is None:
        domain_polygon_crs = crs_src
    else:
        domain_polygon_crs = pyproj.CRS.from_user_input(domain_polygon_crs)

    ## proceed if transform_src is provided
    if not transform_src is None:
        if not isinstance(transform_src, affine):
            transform_src = Affine(*transform_src)
        x = np.asarray(x)
        y = np.asarray(y)
    ## otherwise calculate the source transform
    else:
        x = np.asarray(x)
        y = np.asarray(y)

        if x.ndim != 1 or y.ndim != 1:
            raise ValueError(
                "x and y must be 1-D for a rectilinear source grid. "
                "For a curvilinear grid, 2-D coordinates are required."
                )

        if x.size < 2 or y.size < 2:
            raise ValueError("x,y must each contain at least two coordinates")

        dx = np.diff(x)
        dy = np.diff(y)

        ## a single affine transform cannot represent non-uniform spacing.
        if not np.allclose(dx, dx[0]):
            raise ValueError(
                "x coordinates are not uniformly spaced; a single affine "
                "transform cannot represent this source grid."
                )

        if not np.allclose(dy, dy[0]):
            raise ValueError(
                "y coordinates are not uniformly spaced; a single affine "
                "transform cannot represent this source grid."
                )

        transform_src = rio.transform.from_bounds(
            x.min() - abs(dx[0]) / 2,
            y.min() - abs(dy[0]) / 2,
            x.max() + abs(dx[0]) / 2,
            y.max() + abs(dy[0]) / 2,
            x.size,
            y.size,
            )

    width_src = x.size
    height_src = y.size

    ## declare default valid mask if one was not provided
    if m_valid is None:
        m_valid = np.full((height_src, width_src), True)
    else:
        m_valid = np.asarray(m_valid, dtype=bool)

        if m_valid.shape != (height_src, width_src):
            raise ValueError(
                f"shapes don't match: x.shape={x.shape}, y.shape={y.shape}, "
                f"m_valid.shape={m_valid.shape}"
                )

    ## default to full domain bounds
    if domain_polygon is None:
        ## full source domain, including the complete outer pixel edges.
        xmin, ymin, xmax, ymax = rio.transform.array_bounds(
            height_src,
            width_src,
            transform_src,
            )
        domain_polygon_src = shapely.geometry.box(xmin, ymin, xmax, ymax)

    ## transform the domain polygon if it doesn't have the input
    else:
        if domain_polygon_crs != crs_src:
            polygon_transformer = pyproj.Transformer.from_crs(
                domain_polygon_crs,
                crs_src,
                always_xy=True,
                ).transform

            domain_polygon_src = shapely.ops.transform(
                polygon_transformer,
                domain_polygon,
                )
        else:
            domain_polygon_src = domain_polygon

    ## use the domain polygon's bounds to determine the subgrid extent
    xmin, ymin, xmax, ymax = domain_polygon_src.bounds
    xmin -= buffer
    ymin -= buffer
    xmax += buffer
    ymax += buffer

    ## subgrid is wrt pixel center coordinates after buffering
    x0 = int(np.argmin(np.abs(x - xmin)))
    xf = int(np.argmin(np.abs(x - xmax)))
    y0 = int(np.argmin(np.abs(y - ymax)))
    yf = int(np.argmin(np.abs(y - ymin)))

    x_start, x_stop = sorted((x0, xf))
    y_start, y_stop = sorted((y0, yf))
    x_stop += 1
    y_stop += 1

    x_sub = x[x_start:x_stop]
    y_sub = y[y_start:y_stop]
    m_valid_sub = m_valid[y_start:y_stop, x_start:x_stop]

    src_slice = ((y_start, y_stop), (x_start, x_stop))

    if x_sub.size < 2 or y_sub.size < 2:
        raise ValueError(
            f"polygon does not overlap enough of source grid: "
            f"x range={x_sub.min()}..{x_sub.max()}, "
            f"y range={y_sub.min()}..{y_sub.max()}"
            )

    ## determine the transform of the source array subset
    if not transform_src is None:
        transform_sub = transform_src * Affine.translation(x_start, y_start)
    else:
        dx = x_sub[1] - x_sub[0]
        dy = y_sub[1] - y_sub[0]

        transform_sub = rio.transform.from_bounds(
            x_sub.min() - abs(dx) / 2,
            y_sub.min() - abs(dy) / 2,
            x_sub.max() + abs(dx) / 2,
            y_sub.max() + abs(dy) / 2,
            x_sub.size,
            y_sub.size,
            )

    geo_ref_src = {
        "crs": crs_src,
        "height": y_sub.size,
        "width": x_sub.size,
        "transform": transform_sub,
        }

    ## calculate destination bounds, transform, and shape
    bounds_src = rio.transform.array_bounds(
        geo_ref_src["height"],
        geo_ref_src["width"],
        geo_ref_src["transform"],
        )
    t_out, w_out, h_out = rio.warp.calculate_default_transform(
        crs_src,
        crs_out,
        geo_ref_src["width"],
        geo_ref_src["height"],
        *bounds_src,
        )

    geo_ref_out = {
        "crs": crs_out,
        "width": w_out,
        "height": h_out,
        "transform": t_out,
        }

    ## determine pixel center locations for the output array
    j_out, i_out = np.meshgrid(
        np.arange(h_out),
        np.arange(w_out),
        indexing="ij",
        )
    x_out, y_out = map(np.asarray, rio.transform.xy(t_out, j_out, i_out))

    ## determine source array coordinates for each destination array point
    x_src,y_src = rio.warp.transform(crs_out, crs_src, x_out, y_out)

    ## deterine source array indices for each destination array point
    j_src,i_src = rio.transform.rowcol(transform_sub, x_src, y_src)
    j_src = np.asarray(j_src).reshape(h_out, w_out)
    i_src = np.asarray(i_src).reshape(h_out, w_out)

    ## rule out pixels on the destination grid that map outside the source grid
    source_in_bounds = (
        (j_src >= 0)
        & (j_src < geo_ref_src["height"])
        & (i_src >= 0)
        & (i_src < geo_ref_src["width"])
        )

    ## clip for safe indexing, but anything clipped will be invalid
    j_src_safe = np.clip(j_src, 0, geo_ref_src["height"] - 1)
    i_src_safe = np.clip(i_src, 0, geo_ref_src["width"] - 1)

    ## calculate latitude and longitude coordinates for the destination
    lon_out, lat_out = rio.warp.transform(
        crs_out,
        "EPSG:4326",
        x_out.ravel(),
        y_out.ravel(),
        )
    lon_out = np.asarray(lon_out).reshape(h_out, w_out)
    lat_out = np.asarray(lat_out).reshape(h_out, w_out)

    coord_range_out = (
        (lat_out.min(), lat_out.max()),
        (lon_out.min(), lon_out.max()),
        )

    ## determine fractional coverage of the domain
    polygon_transformer = pyproj.Transformer.from_crs(
        domain_polygon_crs,
        crs_out,
        always_xy=True,
        ).transform

    polygon_out = shapely.ops.transform(
        polygon_transformer,
        domain_polygon if domain_polygon is not None
        else domain_polygon_src,
        )
    fine_transform = t_out * Affine.scale(
        1 / mask_oversample_factor,
        1 / mask_oversample_factor,
        )
    fine_mask = rasterize(
        [(polygon_out, 1)],
        out_shape=(
            h_out * mask_oversample_factor,
            w_out * mask_oversample_factor,
            ),
        transform=fine_transform,
        fill=0,
        default_value=1,
        dtype=np.uint8,
        )
    frac = fine_mask.reshape(
        h_out,
        mask_oversample_factor,
        w_out,
        mask_oversample_factor,
        ).mean(axis=(1, 3))

    m_inside = frac >= mask_coverage_cutoff

    ## combine polygon mask and valid source mask
    m_all_valid = (
        m_inside
        & source_in_bounds
        & m_valid_sub[j_src_safe, i_src_safe]
        )

    geo_ref_src["transform"] = geo_ref_src["transform"].to_gdal()
    geo_ref_out["transform"] = geo_ref_out["transform"].to_gdal()
    geo_ref_src["crs"] = geo_ref_src["crs"].to_wkt()
    geo_ref_out["crs"] = geo_ref_out["crs"].to_wkt()
    return (
        coord_range_out,
        (geo_ref_src, geo_ref_out),
        src_slice,
        np.stack((j_src, i_src), axis=0),
        (lat_out, lon_out),
        m_all_valid,
        )

def polygon_fraction_subgrids(geo_ref_src, m_valid, multipolygon,
        mask_oversample_factor=16):
    """
    Compute per-polygon fractional coverage of valid raster pixels.

    Fractional coverage is computed by supersampling each source pixel and
    rasterizing the polygon at the supersampled resolution. ``oversample``
    controls the approximation accuracy.

    :@param geo_ref_src: dict with source crs, width, and height
    :@param m_valid: bool array assigning invalid pixels to False
    :@param multipolygon: geopandas datafram of polygon features

    :@return: 2-tuple (fractions, slices) where fractions is a list of
        2d arrays corresponding to the multipolygon rows clipped to the
        smallest bounding rectangle containing all non-zero coverage pixels,
        and slices is a list of 2-tuples of int (start_ix, end_ix+1)
        indicating the boundaries of the corresponding fractions array with
        respect to the source domain
    """
    height = geo_ref_src["height"]
    width = geo_ref_src["width"]
    if m_valid.shape != (height, width):
        raise ValueError(
            f"m_valid must have shape {(height, width)}, got {m_valid.shape}"
            )

    if multipolygon.crs != geo_ref_src["crs"]:
        multipolygon = multipolygon.to_crs(geo_ref_src["crs"])

    src_t = Affine.from_gdal(*geo_ref_src["transform"])

    ## rasterize all features at once with unique integer feature ids starting
    ## with 1 since 0 is the fill value.
    shapes = [
        (shapely.geometry.mapping(geom), i + 1)
        for i, geom in enumerate(multipolygon.geometry)
        if geom is not None and not geom.is_empty
        ]

    if not shapes:
        raise ValueError("no non-empty features found")

    ## oversample the raster
    hi_height = height * mask_oversample_factor
    hi_width = width * mask_oversample_factor
    hi_t = src_t * Affine.scale(
        1.0 / mask_oversample_factor,
        1.0 / mask_oversample_factor,
        )
    labels = rasterize(
        shapes,
        out_shape=(hi_height, hi_width),
        transform=hi_t,
        fill=0,
        dtype=np.int32,
        )

    ## match m_valid to the high resolution array
    m_valid_hi = np.repeat(
        np.repeat(m_valid, mask_oversample_factor, axis=0),
        mask_oversample_factor,
        axis=1,
        )

    fractions = []
    slices = []
    for feature_id in range(1, len(multipolygon)+1):
        covered = (labels == feature_id) & m_valid_hi

        ## count covered supersamples in each source pixel
        coverage = covered.reshape(
            height, mask_oversample_factor,
            width, mask_oversample_factor,
            ).sum(axis=(1, 3))

        ## normalize to [0,1]
        coverage = coverage.astype(np.float32) / mask_oversample_factor**2
        coverage[~m_valid] = 0.0

        rows,cols = np.nonzero(coverage > 0)
        if rows.size == 0:
            print(f"zero coverage for {feature_id}")
            fractions.append(np.empty((0, 0), dtype=np.float16))
            slices.append(((0, 0), (0, 0)))
            continue

        ## determine the minimum bounding box of nonzero fraciton pixels
        yix0,yixf = int(rows.min()), int(rows.max() + 1)
        xix0,xixf = int(cols.min()), int(cols.max() + 1)
        fractions.append(
            coverage[yix0:yixf, xix0:xixf].astype(np.float16, copy=False)
            )
        slices.append(((yix0, yixf), (xix0, xixf)))

    return fractions, slices

class AmbiguousMatchError(Exception):
    pass

class RelationalConfig:
    def __init__(self):
        self.store = []

    def set(self, key_dict: dict, value: any) -> None:
        """ register a key dictionary mapping to an arbitrary value """
        for i,(sk,_) in enumerate(self.store):
            if sk == key_dict:
                self.store[i] = (key_dict, value)
                return
        self.store.append((key_dict, value))

    def get(self, query_dict: dict) -> any:
        """
        Retrieve a value based on the highest number of matchin
        key-value pairs.

        Raises KeyError if no matches exist, or ValueError if there is a tie.
        """
        max_score = 0
        best_value = None
        is_tie = False

        if query_dict == {} and len(self.store) == 1:
            return self.store[0][1]

        for key_dict, value in self.store:
            # Count exact key-value pair matches
            score = sum(
                1 for k,v in key_dict.items()
                if query_dict.get(k) == v
                )

            if score > max_score:
                max_score = score
                best_value = value
                is_tie = False
            elif score > 0 and score == max_score:
                is_tie = True

        if max_score == 0:
            raise KeyError(
                "No config found sharing query properties:", query_dict
                )

        if is_tie:
            raise AmbiguousMatchError(
                "Ambiguous match: Multiple configurations tied with " \
                    + f"{max_score} shared property/properties:", query_dict
                )

        return best_value

