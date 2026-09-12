/**
generate multiple types of svg paths from arrays, supporting:
- normal lines
- lines surrounded by equal-sized ranges on both sides
- fields defined by arbitrary lines on both sides
*/
class PathBuilder {
    // declare with d3js axis scale generators
    constructor(scale_x, scale_y) {
        this.xscale = scale_x;
        this.yscale = scale_y;
    }

    // Generate an svg line that may be discontinuous given values
    line(xvals, values=[]) {
        let d = "";
        let drawing = false;
        for (let i = 0; i < values.length; i++) {
            const v = values[i];
            // indicate the previous path was stopped if a value is undefined
            if (!Number.isFinite(v)) {
                drawing = false;
                continue;
            }

            // use the sacle to determine the new svg coordinates
            const x = this.xscale(xvals[i]);
            const y = this.yscale(v);
            if (!drawing) {
                // move to the missing point but don't draw a line to it
                d += `M${x},${y}`;
                drawing = true;
            } else {
                // draw a line to the current point
                d += `L${x},${y}`;
            }
        }

        return d;
    }

    // render a filled polygon path for the provided data arrays or generators
    band(xvals, upper, lower) {
        const ntimes = xvals.length;

        let d = "";
        let start = -1;

        const f_upper = typeof upper === "function" ? upper : i => upper[i];
        const f_lower = typeof lower === "function" ? lower : i => lower[i];

        // iterate over all the date indices, collecting and rendering all
        // contiguous strings of valid upper and lower bound values
        for (let i = 0; i <= ntimes; i++) {

            let valid = false;

            // both upper and lower have to be valid to draw
            if (i < ntimes) {
                valid = Number.isFinite(f_upper(i))
                    && Number.isFinite(f_lower(i));
            }

            // reset valid and just increment the counter as long as still good
            if (valid) {
                if (start < 0) start = i;
                continue;
            }

            // here, the current value must be invalid. Take the current string
            // of contiguous valid data points and make a segment for it.
            if (start >= 0) {
                d += this._segment(xvals, start, i, f_upper, f_lower);
                start = -1;
            }
        }
        return d;
    }

    // given a date range and upper and lower data point generators, build
    // a closed polygon for the field between f_upper and f_lower
    _segment(xvals, begin, end, f_upper, f_lower) {

        let d = "";

        // iterate over upper data points first
        for (let i = begin; i < end; i++) {
            const x = this.xscale(xvals[i]);
            const y = this.yscale(f_upper(i));
            // move to the first data point, then draw lines connecting
            // the subsequent valid data points
            d += (i === begin) ? `M${x},${y}` : `L${x},${y}`;
        }

        // drop down and
        for (let i = end - 1; i >= begin; i--) {
            const x = this.xscale(xvals[i]);
            const y = this.yscale(f_lower(i));
            d += `L${x},${y}`;
        }

        // close the path at the end
        return d + "Z";
    }

    // vertical whiskers with a horizontal cap centered on each timestep
    whiskers(xvals, origin, extent, capWidth = 8) {
        const f_origin = typeof origin === "function" ? origin : i=>origin[i];
        const f_extent = typeof extent === "function" ? extent : i=>extent[i];
        const halfCap = capWidth / 2;
        let d = "";

        for (let i = 0; i < xvals.length; i++) {
            const vo = f_origin(i);
            const ve = f_extent(i);

            if (!Number.isFinite(vo) || !Number.isFinite(ve)) {
                continue;
            }

            const x = this.xscale(xvals[i]);
            const yOrigin = this.yscale(vo);
            const yExtent = this.yscale(ve);

            // vertical line stem
            d += `M${x},${yOrigin}L${x},${yExtent}`;
            // horizontal cap line
            if (capWidth > 0) {
                d += `M${x - halfCap},${yExtent}H${x + halfCap}`;
            }
        }

        return d;
    }

    // generate centered rectangles spanning lower to upper at each timestep
    boxes(xvals, lower, upper, boxWidth = 10) {
        const f_lower = typeof lower === "function" ? lower : i => lower[i];
        const f_upper = typeof upper === "function" ? upper : i => upper[i];
        const halfBox = boxWidth / 2;
        let d = "";

        for (let i = 0; i < xvals.length; i++) {
            const vl = f_lower(i);
            const vu = f_upper(i);

            if (!Number.isFinite(vl) || !Number.isFinite(vu)) continue;

            const x = this.xscale(xvals[i]);
            const ylow = this.yscale(vl);
            const yhigh = this.yscale(vu);

            const x1 = x - halfBox;
            const x2 = x + halfBox;

            // closed rectangular path
            d += `M${x1},${ylow}L${x2},${ylow}L${x2},${yhigh}L${x1},${yhigh}Z`;
        }

        return d;
    }
}

/**
given a PathBuilder and a d3js svg root group, plot arbitrary d3js lines
that are configurable by the provided PathBuilder.
*/
class LineRenderer {

    constructor(root, path_builder) {
        this.root = root;
        this.pb = path_builder;
    }

    /**
    given the

    buffer: object containing properties "dates" and "data"
    */
    render(elements, buffer=null) {
        if (buffer === null) {
            return;
        }
        // bind the line config to the current lines with ekey as the hash
        const els = this.root.selectAll("path.line")
            .data(elements, d => d.element_key);

        // remove all old lines
        els.exit().remove();

        // generate a new class containing all the line elements
        const enter = els.enter()
            .append("path")
            .attr("class", "line")
            .attr("fill", "none");

        // merge the lines with the data, using ekey to track each individually
        const merged = enter.merge(els).attr("ekey", d => d.element_key);

        // generate a path for all the line elements
        merged.each((d, i, nodes) => {
            const el = d3.select(nodes[i]);
            const dates = buffer.dates;

            // choose
            switch (d.plot_type) {
                // data:str
                case "line": {
                    if (!typeof d.data === "string") {
                        throw new Error("line plots must have data:str")
                    }
                    const vals = buffer.data[d.data]; // assumed to be str key
                    el.attr("stroke", d.color)
                        .attr("stroke-width", d.width ?? 2)
                        .attr("stroke-dasharray", d.dashes ?? null)
                        .attr("stroke-opacity", d.show ? d.opacity : 0)
                        .attr("d", this.pb.line(dates, vals));
                    break;
                }

                // data:{lower:str,upper:str}
                case "field": {
                    const req_props = ["lower", "upper"];
                    if (!req_props.every(p => Object.hasOwn(d.data, p))) {
                        throw new Error(
                            `field plots must have data: ${req_props}`);
                    }
                    const lo = buffer.data[d.data.lower];
                    const hi = buffer.data[d.data.upper];
                    el.attr("fill", d.color)
                        .attr("stroke", d.color ?? "none")
                        .attr("stroke-width", d.width ?? 2)
                        .attr("stroke-dasharray", d.dashes ?? null)
                        .attr("stroke-opacity", d.show ? d.opacity : 0)
                        .attr("fill-opacity", d.show ? d.area_opacity : 0)
                        .attr("d", this.pb.band(dates, hi, lo));
                    break;
                }

                // data:{center:str, spread:str}
                case "surround": {
                    const req_props = ["center", "spread"];
                    if (!req_props.every(p => Object.hasOwn(d.data, p))) {
                        throw new Error(
                            `surround plots must have data: ${req_props}`);
                    }
                    const c = buffer.data[d.data.center];
                    const s = buffer.data[d.data.spread];
                    el.attr("fill", d.color)
                        .attr("stroke", d.color ?? "none")
                        .attr("stroke-width", d.width ?? 2)
                        .attr("stroke-dasharray", d.dashes ?? null)
                        .attr("stroke-opacity", d.show ? d.opacity : 0)
                        .attr("fill-opacity", d.show ? d.area_opacity : 0)
                        .attr( "d", this.pb.band(
                            dates, i => { c[i] + s[i], i => c[i] - s[i] }
                        ));
                    break;
                }

                // data:{origin:str, extent:str}
                case "whisker": {
                    const req_props = ["origin", "extent"];
                    if (
                        !d.data ||
                        !req_props.every(p => Object.hasOwn(d.data, p))
                    ) {
                        throw new Error(
                            `whisker plots must have data: ${req_props}`);
                    }
                    const orig = buffer.data[d.data.origin];
                    const ext = buffer.data[d.data.extent];
                    const cw = d.cap_width ?? 8;

                    el.attr("fill", "none")
                        .attr("stroke", d.color)
                        .attr("stroke-width", d.width ?? 2)
                        .attr("stroke-dasharray", d.dashes ?? null)
                        .attr("stroke-opacity", d.show ? (d.opacity ?? 1) : 0)
                        .attr("d", this.pb.whiskers(dates, orig, ext, cw));
                    break;
                }

                // data:{lower:str, upper:str}
                case "box": {
                    const req_props = ["lower", "upper"];
                    if (
                        !d.data ||
                        !req_props.every(p => Object.hasOwn(d.data, p))
                    ) {
                        throw new Error(
                            `box plots must have data: ${req_props}`);
                    }
                    const lo = buffer.data[d.data.lower];
                    const hi = buffer.data[d.data.upper];
                    const bw = d.box_width ?? 10;

                    el.attr("fill", d.color)
                        .attr("stroke", d.color ?? "none")
                        .attr("stroke-width", d.width ?? 2)
                        .attr("stroke-dasharray", d.dashes ?? null)
                        .attr("stroke-opacity", d.show ? (d.opacity ?? 1) : 0)
                        .attr("fill-opacity",
                            d.show ? (d.area_opacity ?? 0.25) : 0)
                        .attr("d", this.pb.boxes(dates, lo, hi, bw));
                    break;
                }
            }
        });
    }

    set_opacity(id, value) {
        this.root
            .select(`path[ekey="${id}"]`)
            .attr("opacity", value);
    }
}

/**

*/
class LegendRenderer {
    /*
    root: svg object to dump the legend into
    fig: Timeseries figure object to update and refresh with the figure
    item_width: svg coordinate width of legend element text boxes
    item_height: svg coordinate height of legend element text boxes
    */
    constructor({root, figure, item_width, item_height, ncol=1}) {
        this.root = root;
        this.fig = figure;
        this.w = item_width;
        this.h = item_height;
        this.ncol = ncol;
    }

    /*
    data:
    legend_key: identifying hash of the legend to re-render
    */
    render({elements, legend_key, title, x_offset, y_offset}) {
        //console.log(this.fig.height-y_offset, x_offset)
        this.root.attr(
            "transform",
            `translate(${x_offset},${this.fig.height-y_offset})`
        );

        // update the title text
        let title_text = this.root.select("text.title");
        if (title_text.empty()) {
            title_text = this.root.append("text").attr("class", "title");
        }
        title_text.attr("x", 0).attr("y", -10).text(title);

        // only re-render items with the provided legend category
        const join = this.root.selectAll("g.item").data(
            elements.filter(d => (d.legend === legend_key)),
            d => {d.legend_key}
        );

        // remove old lines in the provided category
        join.exit().remove();

        // Add a new group for the updated data
        const enter = join.enter().append("g").attr("class", "item");

        // make a sample line with the default cosmetics. Eventually config
        enter.append("line")
            .attr("x1", 0)
            .attr("x2", 18)
            .attr("y1", 9)
            .attr("y2", 9)
            .attr("stroke-width", 3);
        // Add a text field to the right of the sample line
        enter.append("text")
            .attr("x", 24)
            .attr("y", 9)
            .attr("dy", ".35em");
        // merge the new data binding to the new line elements
        const merged = enter.merge(join);

        // use each element's index within the group to determine its
        // column and position in the column
        merged.attr("transform", (_, i) => {
            const col = i % this.ncol;
            const row = Math.floor(i / this.ncol);
            const x = col * this.w;
            const y = row * this.h;
            return `translate(${x},${y})`;
        });
        // apply the stroke and opacity configuration per line independently
        merged.select("line")
            .attr("stroke", d => d.color)
            .attr("opacity", d => d.show ? 1 : 0.3);
        // add the line text per the provided objects
        merged.select("text").text(d => d.name);
        // when a line is clicked, refresh the parent figure
        merged.on("click", (e, d) => {
            d.show = !d.show;
            this.fig.refresh();
        });
        // emphasize the lines on hover
        merged.on("mouseenter", function () {
            d3.select(this).style("font-weight", "bold");
        });
        // de-emphasize the lines on hover
        merged.on("mouseleave", function () {
            d3.select(this).style("font-weight", null);
        });
    }
}

/**
object representing a generalized d3js time series figure supporting multiple
lines and fields and an interactable legend.
*/
export class TimeSeries {
    //
    constructor({
        container_id,
        layout,
        elements,
        legends=[],
        time_template="%Y%m%d",
    }) {
        this.container = document.getElementById(container_id)
        this.time_template = time_template
        this.cfg = {
            layout:layout,
            legends:legends,
            elements:elements,
        };

        this.buf = {dates: [], data: {}};
        this.ix_active = null;

        this._init();
    }

    _init() {
        // create the svg and append the root group
        this.svg = d3.select(this.container).append("svg");
        this.root = this.svg.append("g");

        // Generate a unique ID for this instance's clip path
        const cid = this.container.id
            || Math.random().toString(36).substr(2, 9);
        this.clip_id = `clip-${cid}`;

        // Append SVG defs and a clipPath containing a bounding rectangle
        const defs = this.svg.append("defs");
        this.clip_rect = defs.append("clipPath")
            .attr("id", this.clip_id)
            .append("rect")
            .attr("x", 0)
            .attr("y", 0);

        // declare scale generators
        this.scale_x = d3.scaleTime();
        this.scale_y = d3.scaleLinear();

        // declare axis objects and grid lines
        this.axis_x = d3.axisBottom(this.scale_x);
        this.axis_y = d3.axisLeft(this.scale_y);
        this.spine_y = d3.axisLeft(this.scale_y).tickSize(0).tickFormat("");


        // make top-level groups for time series plot components
        this.grp = {
            x: this.root.append("g"),
            y: this.root.append("g"),
            grid: this.root.append("g"),
            elements: this.root.append("g"),
            cur: this.root.append("g"),
        };
        /*
        this.grp.x.classed("plot-axis-x", true),
        this.grp.y.classed("plot-axis-y", true),
        this.grp.grid.classed("plot-grid", true),
        this.grp.elements.classed("plot-elements", true),
        this.grp.cur.classed("plot-cur-line", true),
        */

        // Apply the clipping path mask to the plot elements group
        this.grp.elements.attr("clip-path", `url(#${this.clip_id})`);
        this.grp.cur.append("line")
            .classed("cur-line", true)
            .attr("y1", this.scale_y.range()[0])
            .attr("y2", this.scale_y.range()[1])
            .attr("stroke-width", 1.5);

        // declare a PathBuilder that can generate arbitrary lines and bands
        this.pb = new PathBuilder(this.scale_x, this.scale_y);

        // declare a line renderer that handles updating all the data lines
        this.lr = new LineRenderer(this.grp.elements, this.pb);

        // initialize all the configured legends
        this.legends = [];
        for (const l of this.cfg.legends) {
            // add a new group for this legend
            this.grp["legend_"+l.legend_key] = this.root.append("g");
            this.grp["legend_"+l.legend_key].classed("plot-legend", true);
            //
            this.legends.push(
                new LegendRenderer({
                    root:this.grp["legend_"+l.legend_key],
                    figure:this,
                    item_width:l.item_width,
                    item_height:l.item_height,
                    ncol:l.num_columns,
                })
            );
        }

        this._resize();
        this._track_resize();
    }

    // update the buffer with new dates and data
    set_new_buffer({dates, data}) {
        //console.log(dates);
        //console.log(data);

        const parse = d3.timeParse(this.time_template);

        this.buf.dates = dates.map(parse);
        this.buf.data = data;

        this._calc_domain_bounds();
        this.refresh();
    }

    // move the active line to the new index
    set_active_index(i) {
        this.ix_active = i;
        const x = this.scale_x(this.buf.dates[i]);
        this.grp.cur.select(".cur-line")
            .attr("x1", x)
            .attr("x2", x)
    }

    // re-render the lines, legend, and axes
    refresh() {
        //console.log("refreshing");
        // re-draw the lines
        this.lr.render(this.cfg.elements, this.buf);

        // reset the legends
        for (const i in this.legends) {
            this.legends[i].render({
                elements:this.cfg.elements,
                ...this.cfg.legends[i],
            });
        }

        //
        this._draw_axes();
    }

    set_y_bounds(ymin, ymax) {
        this.y_bounds = [ymin, ymax];
        this.scale_y.domain([ymin, ymax]).nice();
        this.refresh();
    }

    clear_y_bounds() {
        this.y_bounds = null;
        this._calc_domain_bounds();
        this.refresh();
    }

    /**
    modify the x and y data scales after a buffer update
    */
    _calc_domain_bounds() {
        if (!this.buf.dates || this.buf.dates.length === 0) return;

        // set the x domain according to the dates
        const [dmin, dmax] = d3.extent(this.buf.dates);
        const xpad = this.cfg.layout.x_padding
        const tmin = dmin.getTime();
        const tmax = dmax.getTime();
        const timeSpan = tmax - tmin;

        // expand time domain so dmin -> xpad and dmax -> (width - xpad)
        if (xpad > 0 && this.width > 2 * xpad && timeSpan > 0) {
            const tpad = (xpad * timeSpan) / (this.width - 2 * xpad);
            this.scale_x.domain([new Date(tmin-tpad), new Date(tmax+tpad)]);
        } else {
            this.scale_x.domain([dmin, dmax]);
        }

        if (this.y_bounds !== null) {
            return;
        }

        if (this.cfg.layout.y_range) {
            this.scale_y.domain(this.cfg.layout.y_range).nice();
            return
        }

        // determine extreme y axis minimum and maximum given the data
        let min = Infinity;
        let max = -Infinity;
        for (const el of this.cfg.elements) {
            const scan = arr => {
                if (!arr) return;
                for (let i = 0; i < arr.length; i++) {
                    const v = arr[i];
                    if (Number.isFinite(v)) {
                        min = Math.min(min, v);
                        max = Math.max(max, v);
                    }
                }
            };

            // determine which arrays to evaluate based on the plot type
            if (el.plot_type === "line") {
                scan(this.buf.data[el.data]);
            } else if (el.plot_type === "field") {
                scan(this.buf.data[el.data.lower]);
                scan(this.buf.data[el.data.upper]);
            } else if (el.plot_type === "surround") {
                scan(this.buf.data[el.data.center].map((cv,ix) => {
                    cv - this.buf.data[el.data.spread][ix]
                }));
                scan(this.buf.data[el.data.center].map((cv,ix) => {
                    cv + this.buf.data[el.data.spread][ix]
                }));
                //scan(this.buf.data[el.data.spread]);
            } else if (el.plot_type === "whisker") {
                scan(this.buf.data[el.data.origin]);
                scan(this.buf.data[el.data.extent]);
            } else if (el.plot_type === "box") {
                scan(this.buf.data[el.data.lower]);
                scan(this.buf.data[el.data.upper]);
            } else {
                throw new Error("unrecognized plot type:", el.plot_type)
            }
        }

        // fit the y scale with a nice buffer
        this.scale_y.domain([min, max]).nice();
    }

    // render the axes and the vertical grid lines
    _draw_axes() {
        this.grp.x
            .attr("transform", `translate(0, ${this.height})`)
            .call(this.axis_x)
            .selectAll("text")
            // Anchor the end of the text string to the tick mark
            .style("text-anchor", "end")
            // shift the text slightly horizontally to clear the tick line
            .attr("dx", "-.8em")
            .attr("dy", ".15em")
            .attr("transform", "rotate(-45)");
        this.grp.y.call(this.axis_y);
        this.grp.grid.call(this.spine_y);
        this.grp.cur.select(".cur-line")
            .attr("y1", this.scale_y.range()[0])
            .attr("y2", this.scale_y.range()[1]);

    }

    /**
    resize the figure by modifying the svg view box, resetting the scale
    baseline with the new dimensions, and re-drawing everything.
    */
    _resize() {
        const r = this.container.getBoundingClientRect();

        const mgn = this.cfg.layout.margin
        // width and height of the plot frame
        this.width = r.width - mgn.left - mgn.right;
        this.height = r.height - mgn.top - mgn.bottom;

        this.svg.attr("viewBox", `0 0 ${r.width} ${r.height}`);
        this.root.attr("transform", `translate(${mgn.left},${mgn.top})`);

        // Update clipping area to strictly match the inner plot dimensions
        this.clip_rect.attr("width", this.width).attr("height", this.height);

        this.scale_x.range([0, this.width]);
        this.scale_y.range([this.height, 0]);

        this.refresh();
    }

    // watch the container element for changes in dimensions
    _track_resize() {
        if (typeof ResizeObserver !== "undefined") {
            new ResizeObserver(() => this._resize()).observe(this.container);
        }
    }
}
