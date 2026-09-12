import { Map } from "./Map.js";
//import { ColorBar } from "./ColorBar.js";
import { Menu } from "./Menu.js";
//import { DualRangeSlider } from "./DualRangeSlider.js";
//import { EToRasterBuffer } from "./EToRasterBuffer.js";
import { BufferSlider } from "./BufferSlider.js";
import { ConfigManager } from "./ConfigManager.js";

//import {
//    vector_anchors, vector_styles, map_anchors,
//    highlight_anchors, highlight_styles,
//} from "./map_styles.js";

//import { TimeSeries } from "./TimeSeries.js";

const state = {
    dom:{
        c_menu_itime:"menu_container_itime",
        c_buffer_slider:"main_container_buffer_slider",
        c_data_modules:"data_module_container",
        b_new_data_module:"btn_new_data_module",
        t_menu_button:"menu_button_temp"

        /*
        text_main_feat:"main_header_text",
        text_main_date:"main_date_text",
        chiclets_container:"chiclets_container",
        chiclets_template:"time_series_chiclet_template",
        main_map_container:"main_map_container",
        region_map_canvas_container:"region_map_canvas_container",
        region_menu_container:"dd_region_name",
        region_menu_button:"dd_button_region_name",
        itime_menu_container:"menu_container_itime",
        feat_menu_container:"menu_container_feat",
        pgroup_menu_container:"menu_container_pgroup",
        metric_menu_value:"menu_container_metric_value",
        metric_menu_spread:"menu_container_metric_spread",
        cmap_dropdown:"dd_cmap_name",
        cmap_dropdown_button:"dd_button_cmap",
        cbar_container:"cbar_container",
        vector_toggle_container:"main_container_vector_toggle",
        fig_stats_container:"fig_stats_container",
        fig_stats_label_variable:"fig_stats_label_variable",
        fig_stats_label_location:"fig_stats_label_location",

        cmap_slider_container_id:"cmap_slider_row",

        tpl_cbar:"vertical_cbar_template",
        tpl_menu_flex_button:"menu_flex_button_temp",
        tpl_menu_button:"menu_button_temp",
        tpl_menu_dropdown:"dropdown_temp",
        tpl_buffer_slider:"buffer_slider_template",
        tpl_toggle_button:"toggle_button_template",
        */
        //pgroup_menu:"menu_container_pgroup",
        //date_picker:"buffer_date_range",
    },

    norm:null,
    labels:null,
    cmaps:null,
    menus:null,
    configs:{},
    urls:{
        meta:"api/meta",
    },
    /*
    sel:{
        region:"southeast",
        feat:"eto",
        metric_raster:"mean",
        pgroup:"pixel",
        itime:null,
        vtime:null,
        vix:null,
        cmin:null, // minimum value bound for color map
        cmax:null, // minimum value bound for color map
        cmap:null,
    },
    */
    // promises for current array and mask loaded in WASM
    /*
    cur:{
        array:null,
    },
    */
    /*
    labels:{
        regions:null,
        feats:null,
        metrics_raster:null,
        metrics_pgroup:null,
        metrics_spread:null,
        itimes:null,
        vtimes:null,
        pgroups:null,
    },
    long_labels:{
        regions:null,
        feats:null,
        metrics:null,
        units:null,
    },
    short_labels:{
        regions:null,
        feats:null,
        metrics:null,
        units:null,
    },
    */
    //regions:null, // maps region numbers to dimensions and coord bounds
    //nvtimes:null, // number of valid times per forecast run

    /*
    region_map_form: {
        width:null,
        height:null,
        raster:null,
        borders:null,
    },
    */

    /*
    main_cbar:{
        orientation:"vertical",
        nticks:8,
        tick_size:5,
        tick_padding:2,
    },
    */

    //cur_chiclet_data:{},
    //cur_stats_data:[],

    vector_toggle_state:null,
    vectors:null,

    // degree bounds around selected domain within which to allow panning
    //map_bounds_buffer:[6, 6],

    // keep track of whether the feature or metric is in the process of
    // changing so that the subsequent color map and slider updates don't
    // trigger a redundant array request.
    //feat_or_metric_changing:false,

    // maximum number of arrays to allow in the buffer at once
    max_num_arrays:15,

    // milliseconds between rendering updates to chill rapid buffering
    render_cooldown_ms:50,

    dows:["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
}

// make a promise for when the DOM is loaded
const dom_ready = new Promise(resolve => {
  if (document.readyState === "loading") {
    document.addEventListener('DOMContentLoaded', resolve);
  } else {
    resolve();
  }
});

/*
let MAP = null; // main map
let MENU_REGION = null; // init time menu
let MAP_REGION = null;
let MENU_ITIME = null; // init time menu
let MENU_FEAT = null; // feature button menu
let MENU_PGROUP = null; // feature button menu
let MENU_METRIC = null; // metric button menu
let MENU_CSLIDER = null; // color map slider forms
let MENU_CMAP = null; // color map name forms
let MAIN_CBAR = null;
let PLOT_STATS = null;
let CHICLETS = null;
*/
let RASTER_BUFFER = null;
let BUFFER_SLIDER = null;

function fmt_date_string(dstr) {
    const s = `${dstr.slice(0,4)}-${dstr.slice(4,6)}-${dstr.slice(6,8)}`;
    if (dstr.length > 8) {
        return s + ` ${dstr.slice(8,10)}z`;
    }
    return s;
}

/*
function update_main_labels() {
    const tmf = document.getElementById(state.dom.text_main_feat);
    const tmd = document.getElementById(state.dom.text_main_date);

    tmf.innerHTML = state.long_labels.feats[state.sel.feat]
        + " " + state.short_labels.metrics[state.sel.metric_raster]
        + `<br/>(${state.long_labels.units[state.sel.feat]})`;
    if (state.sel.vtime !== null) {
        tmd.textContent = fmt_date_string(state.sel.vtime);
    }
}
*/

// explicitly unpack metadata so there's no ambiguity
const meta_loaded = fetch(state.urls.meta)
    .then(r => r.json())
    .then(r => {
        state.norm = r["norm"];
        state.labels = r["labels"];
        state.cmaps = r["cmaps"];
        state.menus = r["menu"];
        console.log(state.norm);
        console.log(state.labels);
        console.log(state.cmaps);
        console.log(state.menus);

        // convert cmap arrays to Uint8ClampedArray objects
        const cmarrs = {};
        for (const i in state.cmaps["slices"]) {
            const [ix0,ixf] = state.cmaps["slices"][i];
            const ck = state.cmaps["options"][i];
            cmarrs[ck] = new Uint8ClampedArray(
                state.cmaps["arrs"].slice(ix0,ixf));
        }
        state.cmaps["arrs"] = cmarrs;
    });

const menus_ready = meta_loaded
    .then(() => {
        for (const mk in state.menus.options) {
            state.configs[mk] = new ConfigManager(state.menus[mk]);
        }
        console.log(state.configs);
        /*
        MENU_ITIME = new Menu({
            container_id:state.dom.c_menu_itime,
            button_template_id:state.dom.t_menu_button,
            labels:state.labels.regions,
            defaults:state.sel.region,
            initial_conditions:[],
            long_labels:state.long_labels.regions,
            class_active:"btn-primary",
            class_inactive:"btn-secondary",
        });
        */
    });

/*
const plots_loaded = fetch(state.urls.plots)
    .then(r => r.json())
    .then(r => {
        console.log(r);
        PLOT_STATS = new TimeSeries({
            container_id:state.dom.fig_stats_container,
            layout:r["stats"]["layout"],
            legends:r["stats"]["legends"],
            //legends:[],
            elements:r["stats"]["elements"],
            time_template:"%Y%m%d",
        });
    });
*/

/*
const cmaps_loaded = fetch(state.urls.cmaps)
    .then(r => r.json())
    .then(r => {
        //state.cmap.arrays = r["cmaps"];
        state.cmap.default_bounds = r["default_bounds"];
        state.cmap.default_name = r["default_name"];
        //state.cmap.slices = r["slices"];
        state.cmap.options = r["options"];
        state.cmap.resolution = r["resolution"];

        state.cmap.arrays = {};
        for (const i in r["slices"]) {
            const [ix0,ixf] = r["slices"][i];
            const ck = r["options"][i];
            state.cmap.arrays[ck] = new Uint8ClampedArray(
                r["cmaps"].slice(ix0,ixf));
        }
    });
*/

/*
const vtimes_loaded = meta_loaded
    .then(async () => {
        BUFFER_SLIDER = new BufferSlider({
            container_id:state.dom.buffer_slider_container,
            template_id:state.dom.tpl_buffer_slider,
            subscription_cooldown:state.render_cooldown_ms,
        });
        BUFFER_SLIDER.update(state.labels.vtimes[state.sel.itime]);
    });
*/

// initialize the map
/*
const map_started = Promise.all([dom_ready, meta_loaded])
    .then(() => {
        const mcon = document.getElementById(state.dom.main_map_container)
        MAP = new Map({
            map_container:mcon,
            map_anchors:map_anchors,
            glyphs_url:state.urls.map_glyphs,
            pixel_marker_anchor:highlight_anchors["pixel"],
            pixel_marker_layers:highlight_styles["pixel"],
        });
        MAP.set_region({
            bbox:[
                state.regions[state.sel.region]["lon_bounds"][0],
                state.regions[state.sel.region]["lat_bounds"][0],
                state.regions[state.sel.region]["lon_bounds"][1],
                state.regions[state.sel.region]["lat_bounds"][1],
            ],
            bounds_buffer:state.map_bounds_buffer,
            raster_width:state.regions[state.sel.region]["width"],
            raster_height:state.regions[state.sel.region]["height"],
        });
    });
*/

/*
const menu_forms_initialized = Promise.all([dom_ready, meta_loaded])
    .then(r => {
        // initialize region menu
        MENU_REGION = new Menu({
            container_id:state.dom.region_menu_container,
            button_template_id:state.dom.tpl_menu_dropdown,
            labels:state.labels.regions,
            defaults:state.sel.region,
            initial_conditions:[],
            long_labels:state.long_labels.regions,
            class_active:"btn-primary",
            class_inactive:"btn-secondary",
        });
        const mrbtn = document.getElementById(state.dom.region_menu_button);
        mrbtn.textContent = state.long_labels.regions[state.sel.region];

        const itdef = {};
        for (const r of state.labels.regions) {
            itdef[r] = {};
            for (const f of state.labels.feats) {
                const last_ix = state.labels.itimes[r][f].length - 1
                itdef[r][f] = state.labels.itimes[r][f][last_ix];
            }
        }
        MENU_ITIME = new Menu({
            container_id:state.dom.itime_menu_container,
            button_template_id:state.dom.tpl_menu_flex_button,
            labels:state.labels.itimes,
            defaults:itdef,
            initial_conditions:[state.sel.region, state.sel.feat],
            class_active:"btn-primary",
            class_inactive:"btn-secondary",
        })

        // initialize feature menu
        MENU_FEAT = new Menu({
            container_id:state.dom.feat_menu_container,
            button_template_id:state.dom.tpl_menu_button,
            labels:state.labels.feats,
            defaults:state.sel.feat,
            initial_conditions:[],
            long_labels:state.long_labels.feats,
            class_active:"btn-primary",
            class_inactive:"btn-secondary",
        });

        // initialize metric menu
        // for now, assume all feats have all metrics, though the menu
        // class is general enough to handle complex nesting
        const metric_menu_labels = {}
        for (const l of state.labels.feats) {
            metric_menu_labels[l] = state.labels.metrics_raster;
        }
        // condition the container for buttons on whether or not they
        // are spread metrics
        const metric_container_ids = {}
        for (const l of state.labels.metrics_raster) {
            metric_container_ids[l] = state.labels.metrics_spread.includes(l)
                ? state.dom.metric_menu_spread : state.dom.metric_menu_value;
        }

        MENU_METRIC = new Menu({
            container_id:metric_container_ids,
            button_template_id:state.dom.tpl_menu_button,
            labels:metric_menu_labels,
            defaults:state.sel.metric_raster,
            initial_conditions:[state.sel.feat],
            long_labels:state.long_labels.metrics,
            class_active:"btn-primary",
            class_inactive:"btn-secondary",
        });

        MENU_PGROUP = new Menu({
            container_id:state.dom.pgroup_menu_container,
            button_template_id:state.dom.tpl_menu_button,
            labels:state.labels.pgroups,
            defaults:state.sel.pgroup,
            initial_conditions:[],
            long_labels:state.long_labels.pgroups,
            class_active:"btn-primary",
            class_inactive:"btn-secondary",
        });

        MENU_PGROUP.subscribe((new_pgroup) => {
            //console.log("new pgroup:", new_pgroup);
            state.sel.pgroup = new_pgroup;
        })

        MENU_REGION.subscribe((new_region) => {
            // awkward way of handling loading new selected vector groups
            // when the region changes
            if (MAP !== null) {
                MAP.set_vector_visibility({
                    substring:`region-${state.sel.region}`,
                    visible:false,
                });
            }
            state.sel.region = new_region;
            if (MAP !== null) {
                MAP.set_vector_visibility({
                    substring:`region-${state.sel.region}`,
                    visible:true,
                });
            }
            const mrbtn = document.getElementById(
                state.dom.region_menu_button);
            mrbtn.textContent = state.long_labels.regions[state.sel.region];
            //console.log("new region:", new_region);
        });

        // subscribe the metric menu to update based on the feat menu
        MENU_FEAT.subscribe((new_feat) => {
            // main state needs to be the first to update so that subscribers
            // to the metric menu can be provided an up-to-date feat state
            state.sel.feat = new_feat;
            //console.log("new feat:", new_feat);
            MENU_METRIC.update([new_feat]);
        });
        // set subscriptions to menu (and by extension feat) changes
        MENU_METRIC.subscribe((new_metric) => {
            state.sel.metric_raster = new_metric;
            state.feat_or_metric_changing = true;
            update_main_labels();
            //console.log("new metric:", new_metric);
        });
        MENU_ITIME.subscribe((new_itime) => {
            state.sel.itime = new_itime;
            //console.log("new itime", new_itime);
        });
    });
*/

/*
const region_map_forms_ready = Promise.all([
    fetch(state.urls.region_map_raster).then(r => r.arrayBuffer()),
    fetch(state.urls.region_map_borders).then(r => r.arrayBuffer()),
    menu_forms_initialized,
]).then(r => {
    state.region_map_form.raster = new Uint8Array(r[0]);
    state.region_map_form.borders = new Uint8Array(r[1]);
    const mborders = r[1];
    MAP_REGION = new RegionMapForm({
        canvas_container:state.dom.region_map_canvas_container,
        width:state.region_map_form.width,
        height:state.region_map_form.height,
        pixel_ids:state.region_map_form.raster,
        display_array:state.region_map_form.borders,
        default_id:state.labels.regions.indexOf(state.sel.region),
        mask_val:state.region_map_form.mask_val,
    });

    // no circular dependency here since MAP_REGION terminates when the
    // same value is selected again.
    MAP_REGION.subscribe(new_region => {
        MENU_REGION.select(state.labels.regions[new_region]);
    });

    MENU_REGION.subscribe(new_region => {
        MAP_REGION.set_id(state.labels.regions.indexOf(state.sel.region));
    });
});
*/

/*
const sliders_initialized = Promise.all([
    dom_ready, menu_forms_initialized, cmaps_loaded])
    .then(() => {
        // initialize the color map slider menu
        MENU_CSLIDER = new DualRangeSlider({
            target_container_id:state.dom.cmap_slider_container_id,
            extrema:state.norm.bounds,
            defaults:state.cmap.default_bounds,
            initial_conditions:[state.sel.feat, state.sel.metric_raster],
        });
        state.sel.cmin = MENU_CSLIDER.min_val_bnd;
        state.sel.cmax = MENU_CSLIDER.max_val_bnd;

        const cmap_options = {};
        for (const fk of state.labels.feats) {
            cmap_options[fk] = {};
            for (const mk of state.labels.metrics_raster) {
                cmap_options[fk][mk] = state.cmap.options;

            }
        }
        MENU_CMAP = new Menu({
            container_id:state.dom.cmap_dropdown,
            button_template_id:state.dom.tpl_menu_dropdown,
            labels:cmap_options,
            defaults:state.cmap.default_name,
            initial_conditions:[state.sel.feat, state.sel.metric_raster],
            long_labels:{},
            class_active:"btn-primary",
            class_inactive:"btn-secondary",
        });
        state.sel.cmap = MENU_CMAP.current_value;

        MAIN_CBAR = new ColorBar({
            container_id:state.dom.cbar_container,
            template_id:state.dom.tpl_cbar,
            orientation:state.main_cbar.orientation,
            nticks:state.main_cbar.nticks,
            tick_size:state.main_cbar.tick_size,
            tick_padding:state.main_cbar.tick_padding,
        });

        CHICLETS = new TimeSeriesChiclets({
            container_id:state.dom.chiclets_container,
            template_id:state.dom.chiclets_template,
            style_fn:(el, data) => {
                const curf = state.sel.feat;
                const curm = state.sel.metric_raster;
                const cmname = MENU_CMAP.defaults[curf][curm];
                const cm = state.cmap.arrays[cmname].slice(0, -4);
                const bnd = MENU_CSLIDER.bounds[curf][curm];
                const frac = (data.data-bnd[0])/(bnd[1]-bnd[0]);
                const ix = Math.round(frac * cm.length / 4);
                const carr = cm.slice(ix*4, (ix+1)*4);
                const color = `rgb(${carr[0]}, ${carr[1]}, ${carr[2]})`;
                const y = data.date.slice(0,4);
                const m = data.date.slice(4,6);
                const d = data.date.slice(6,8);
                const date = new Date(Date.UTC(
                    data.date.slice(0,4),
                    data.date.slice(4,6)-1,
                    data.date.slice(6,8),
                ));
                const dow = state.dows[date.getDay()];
                const md = String(date.getUTCMonth()+1)
                    + "/" + String(date.getUTCDate());
                //console.log(el);
                el.querySelector(".time-series-chiclet-dow").textContent = dow;
                el.querySelector(".time-series-chiclet-date").textContent = md;
                el.querySelector(".time-series-chiclet-data")
                    .textContent = String(data.data).slice(0, 5);
                el.querySelector(".time-series-chiclet-data-container")
                    .style.backgroundColor = color;
                el.querySelector(".time-series-chiclet-data-container")
                    .style.setProperty("--chiclet-color", color);
            }
        });

        // set subscriptions to menu (and by extension feat) changes
        MENU_METRIC.subscribe((new_metric) => {
            // new metric runs any time a new feature is selected too since
            // it is conditioned on the feat menu.
            MENU_CSLIDER.set_new_conditions([
                state.sel.feat,
                state.sel.metric_raster,
            ]);
        });

        // set subscriptions to color map bounds changes
        MENU_CSLIDER.subscribe((cmin,cmax) => {
            state.sel.cmin = cmin;
            state.sel.cmax = cmax;
            //console.log("new cslider settings");
            MAIN_CBAR.draw({
                cbar:state.cmap.arrays[state.sel.cmap].slice(0,-4),
                vmin:state.sel.cmin,
                vmax:state.sel.cmax,
                nticks:state.main_cbar,
                new_image:false,
            });
            // refresh chiclets with new colors.
            //if (state.sel.metric_raster === "mean") {
            CHICLETS.set_data(state.cur_chiclet_data);
            //}
        });

        MENU_METRIC.subscribe((new_metric) => {
            //console.log("new metric");
            MENU_CMAP.update([state.sel.feat, state.sel.metric_raster]);
        });
        const cmap_btn = document.getElementById(
            state.dom.cmap_dropdown_button);
        cmap_btn.textContent = MENU_CMAP.current_value;
        MENU_CMAP.subscribe((new_cmap) => {
            state.sel.cmap = new_cmap;
            //console.log("new cmap");
            cmap_btn.textContent = new_cmap;
            MAIN_CBAR.draw({
                cbar:state.cmap.arrays[state.sel.cmap].slice(0,-4),
                vmin:state.sel.cmin,
                vmax:state.sel.cmax,
                nticks:state.main_cbar.nticks,
                new_image:true,
            });
            // refresh chiclets with new colors.
            //if (state.sel.metric_raster === "mean") {
            CHICLETS.set_data(state.cur_chiclet_data);
            //}
        });

        MAIN_CBAR.draw({
            cbar:state.cmap.arrays[state.sel.cmap].slice(0,-4),
            vmin:state.sel.cmin,
            vmax:state.sel.cmax,
            nticks:state.main_cbar.nticks,
            new_image:true,
        });

    });
*/

/*
const plot_bounds_set = Promise.all([sliders_initialized, plots_loaded])
    .then(() => {
        MENU_CSLIDER.subscribe((cmin, cmax) => {
            PLOT_STATS.set_y_bounds(cmin, cmax);
        });
        PLOT_STATS.set_y_bounds(state.sel.cmin, state.sel.cmax);
    })
*/

/*
const map_regions_bound = Promise.all([map_started, menu_forms_initialized])
    .then(() => {
        MENU_REGION.subscribe((new_region) => {
            MAP.set_region({
                bbox:[
                    state.regions[state.sel.region]["lon_bounds"][0],
                    state.regions[state.sel.region]["lat_bounds"][0],
                    state.regions[state.sel.region]["lon_bounds"][1],
                    state.regions[state.sel.region]["lat_bounds"][1],
                ],
                bounds_buffer:state.map_bounds_buffer,
                raster_width:state.regions[state.sel.region]["width"],
                raster_height:state.regions[state.sel.region]["height"],
            });
            MENU_ITIME.update([state.sel.region, state.sel.feat]);
        });
    });
*/

/*
function add_region_pgroups(region) {
    const proms = [];
    for (const pg of state.labels.pgroups) {
        if (pg === "pixel") continue;
        if (state.pgroups[pg][region] === null) {
            const u = state.urls.pgroup + `/${pg}/${region}`;
            state.pgroups[pg][region] = fetch(u)
                .then(r => r.json())
                .then(r => {
                    MAP.add_geojson({
                        name:`region-${region}_pgroup-${pg}`,
                        data:r,
                        layers:vector_styles[pg],
                        anchor:vector_anchors[pg],
                        click_scope:`pgroup-${pg}`,
                        highlight_anchor:highlight_anchors[pg],
                        highlight_layers:highlight_styles[pg],
                    });
                });
        }
        proms.push(state.pgroups[pg][region]);
    }
    return Promise.all(proms);
}
*/

// resolves when all pgroups are loaded and active for this region
/*
const pgroups_active = Promise.all([map_regions_bound, sliders_initialized])
    .then(() => {
        MENU_REGION.subscribe(new_region => {
            add_region_pgroups(new_region);
        });
        MENU_PGROUP.subscribe(new_pgroup => {
            if (new_pgroup === "pixel") {
                MAP.set_click_scope("pixel");
            } else {
                MAP.set_click_scope(`pgroup-${new_pgroup}`);
            }
        });
        if (state.sel.pgroup === "pixel") {
            MAP.set_click_scope("pixel");
        } else {
            MAP.set_click_scope(`pgroup-${state.sel.pgroup}`);
        }
        MAP.subscribe(click => {
            //console.log("map click:", click);
            let u = `/${state.sel.region}/${state.sel.feat}/`+state.sel.itime;
            let p = null;
            const lv = document.getElementById(
                state.dom.fig_stats_label_variable);
            const ll = document.getElementById(
                state.dom.fig_stats_label_location);
            lv.innerHTML = state.short_labels.feats[state.sel.feat]
                + ` (${state.short_labels.units[state.sel.feat]})`;
            if (click.type === "vector") {
                u += `/${state.sel.pgroup}/${click.UID}`;
                p = fetch(state.urls.polygon + u).then(r => r.json());
                if (state.sel.pgroup === "states") {
                    ll.innerHTML = click.props.STATE
                        .replace(/\b\w/g, c => c.toUpperCase());
                } else if (state.sel.pgroup === "counties") {
                    const cty_str = click.props.NAME
                    const state_str = click.props.STATE
                        .replace(/\b\w/g, c => c.toUpperCase());
                    ll.innerHTML = `${cty_str}, ${state_str}`;
                }
            } else if (click.type === "pixel") {
                u += `/${click.pxy}/${click.pxx}`;
                p = fetch(state.urls.pixel + u).then(r => r.json());
                const short_lat = `${click.lat}`.slice(0, 6);
                const short_lon = `${click.lon}`.slice(0, 7);
                ll.innerHTML = `(${short_lat}, ${short_lon})`;
            }
            Promise.all([p, plots_loaded]).then(r => {
                state.cur_stats_data = r[0];
                // if an empty list is returned, the request was invalid.
                if (state.cur_stats_data.length === 0) return;
                const new_lines = {}
                for (const i in state.cur_stats_data) {
                    new_lines[state.labels.metrics_pgroup[i]]
                        = state.cur_stats_data[i];
                }
                PLOT_STATS.set_new_buffer({
                    dates:state.labels.vtimes[state.sel.itime],
                    data:new_lines,
                });
                if (!Object.hasOwn(new_lines, state.sel.metric_raster)) {
                    console.log(
                        `selected raster metric ${state.sel.metric_raster}` +
                        "not supported by pgroup metrics"
                    );
                } else {
                    state.cur_chiclet_data = {
                        date:state.labels.vtimes[state.sel.itime],
                        data:new_lines[state.sel.metric_raster],
                    };
                }
                CHICLETS.set_data(state.cur_chiclet_data);
            });

        });
    })
    .then(() => {
        return add_region_pgroups(state.sel.region);
    });
*/

/*
const vector_toggles_active = map_regions_bound
    .then(() => {
        const tbc = document.getElementById(state.dom.vector_toggle_container);
        console.log(tbc);
        for (const v of state.labels.vgroups) {
            const tb = document.getElementById(state.dom.tpl_toggle_button)
                .content.querySelector(".toggle-button").cloneNode(true);
            const def_state = state.vector_toggle_state[v];
            tb.addEventListener("click", async () => {
                const now_active = tb.classList.contains("btn-secondary");
                tb.classList.toggle("btn-primary");
                tb.classList.toggle("btn-secondary");
                state.vector_toggle_state[v] = !state.vector_toggle_state[v];
                if (now_active) {
                    if (state.vectors[v][state.sel.region] === null) {
                        const u = state.urls.vectors
                            + `/${v}/${state.sel.region}`;
                        state.vectors[v][state.sel.region] = fetch(u)
                            .then(r => r.json())
                        const gj = await state.vectors[v][state.sel.region];
                        await MAP.add_geojson({
                            name:`region-${state.sel.region}_${v}`,
                            data:gj,
                            layers:vector_styles[v],
                        });
                    }
                }
                await MAP.set_vector_visibility({
                    substring:`region-${state.sel.region}_${v}`,
                    visible:now_active,
                });
            });
            tb.innerText = v;
            tbc.appendChild(tb);
            //console.log(v, state.sel.region, def_state);
            if (def_state) tb.click();
            //tb.classList.toggle("btn-primary", def_state);
            //tb.classList.toggle("btn-secondary", !def_state);
        }
    });
*/

/*
function update_active_array() {
    // de-activate BUFFER_SLIDER as long as array requests are ongoing so that
    // its subscriptions are only notified when the required arrays are
    // present in the RASTER_BUFFER
    if (BUFFER_SLIDER !== null) {
        BUFFER_SLIDER.set_active(false);
        BUFFER_SLIDER.update(state.labels.vtimes[state.sel.itime]);
    }
    const array = RASTER_BUFFER.update_array({
        region:state.sel.region,
        feat:state.sel.feat,
        metric:state.sel.metric_raster,
        itime:state.sel.itime,
    });
    state.cur.array = array;
    return Promise.all([ state.cur.array, vtimes_loaded ]).then(() => {
        //console.log("setting buffer active");
        BUFFER_SLIDER.set_active(true);

        // re-request the array from the map
        MAP.reclick();

        // update chiclet chart
        if (state.cur_stats_data.length === 0) return;
        const new_lines = {}
        for (const i in state.cur_stats_data) {
            new_lines[state.labels.metrics_pgroup[i]]
                = state.cur_stats_data[i];
        }
        if (!Object.hasOwn(new_lines, state.sel.metric_raster)) {
            console.log(
                `selected raster metric ${state.sel.metric_raster}` +
                "not supported by pgroup metrics"
            );
        } else {
            state.cur_chiclet_data = {
                date:state.labels.vtimes[state.sel.itime],
                data:new_lines[state.sel.metric_raster],
            };
        }
        CHICLETS.set_data(state.cur_chiclet_data);
    });

}
*/

/*
const buffer_initialized = meta_loaded.then(async ()=> {
    const rdims = {};
    for (const r in state.regions) {
        const {width, height} = state.regions[r];
        rdims[r] = {width:width, height:height, ntimes:state.nvtimes};
    }
    RASTER_BUFFER = new EToRasterBuffer({
        url_formatter:(a) => {
            return state.urls.raster
                + `/${a.region}/${a.feat}/${a.metric}/${a.itime}`;
        },
        max_num_arrays:state.max_num_arrays,
        region_dimensions:rdims,
        norm_bounds:state.norm.bounds,
        data_resolution:state.norm.resolution,
        mask_value:state.norm.mask,
    });
    await update_active_array()
});
*/

/*
const bind_array_requests = Promise.all([
    buffer_initialized, map_regions_bound, sliders_initialized,
]).then(() => {
    MENU_METRIC.subscribe(async () => {
        await update_active_array();
        state.feat_or_metric_changing = false;
    });
    MENU_ITIME.subscribe(update_active_array);
    MENU_REGION.subscribe(update_active_array);
});
*/

/*
async function new_active_rgb() {
    await state.cur.array;
    const arr = await RASTER_BUFFER.get_rgb({
        itime:state.sel.itime,
        region:state.sel.region,
        feat:state.sel.feat,
        metric:state.sel.metric_raster,
        time_index:state.sel.vix,
        cmap:state.cmap.arrays[state.sel.cmap],
        cmap_bounds:{
            min:state.sel.cmin,
            max:state.sel.cmax,
        },
    });
    const rgb = new ImageData(
        new Uint8ClampedArray(arr.buffer),
        state.regions[state.sel.region]["width"],
        state.regions[state.sel.region]["height"],
    );
    return rgb;
}
*/

/*
const render_ready = Promise.all([
    bind_array_requests, vtimes_loaded, map_regions_bound, plots_loaded,
])
    .then(() => {
        BUFFER_SLIDER.subscribe(async v => {
            state.sel.vtime = v.time;
            state.sel.vix = v.index;
            //console.log(v.index, v.time);
            //console.log("rendering from buffer slider");
            const rgb = new_active_rgb();
            update_main_labels();
            MAP.render(await rgb);
            PLOT_STATS.set_active_index(state.sel.vix);
        });
        // relies on state being updated by previous subscription
        MENU_CSLIDER.subscribe(async v => {
            if (!state.feat_or_metric_changing) {
                const rgb = await new_active_rgb();
                MAP.render(rgb);
            }
        });
        // relies on state being updated by previous subscription
        MENU_CMAP.subscribe(async v => {
            if (!state.feat_or_metric_changing) {
                const rgb = await new_active_rgb();
                MAP.render(rgb);
            }
        });
    });
*/
