

function draw_color_bar({
    cbar_container_id,
    cbar_template_id,
}) {

    const cvs = raster_container_id.querySelector("canvas");
}

export class ColorBar {
    constructor({
        container_id,
        template_id,
        orientation,
        nticks=8,
        tick_size=4,
        tick_padding=2,
        margin_horizontal=0,
        margin_vertical=6,
    }) {
        this.container = document.getElementById(container_id);
        this.template = document.getElementById(template_id);
        this.container.appendChild(this.template.content.cloneNode(true));
        this.axis_container = this.container.querySelector(
            ".cbar-axis-container-inner");
        this.canvas_container = this.container.querySelector(
            ".cbar-canvas-container-inner");
        this.vertical = orientation == "horizontal" ? false : true;
        this.svg = d3.select(this.axis_container.querySelector("svg"));
        this.canvas = this.container.querySelector("canvas");
        this.canvas.style.imageRendering = "pixelated";
        this.ctx = this.canvas.getContext("2d");
        this.mgv = margin_vertical;
        this.mgh = margin_horizontal;
        this.canvas_container.style.setProperty("padding-top", this.mgv+"px")
        //this.canvas_container.style.setProperty("padding-bottom", this.mgv+"px")
        this.canvas_container.style.setProperty("padding-left", this.mgh+"px")
        this.container.style.setProperty("margin-top", -this.mgv/2+"px")
        this.container.style.setProperty("margin-left", -this.mgh/2+"px")
        //this.canvas_container.style.setProperty("padding-right", this.mgh+"px")

        this.nticks = nticks;
        this.tick_size = tick_size;
        this.tick_padding = tick_padding;
    }
    draw({
        cbar, // ImageData
        vmin, // float
        vmax, // float
        nticks=null,
        new_image=true,
    }) {
        if (new_image) {
            let image = null;
            if (this.vertical) {
                image = new ImageData(cbar, 1, cbar.length/4);
                this.canvas.height = image.height;
                this.canvas.width = 1;
                this.ctx.putImageData(image, 0, 0);
                this.ctx.save();
                this.ctx.scale(1,-1);
                this.ctx.drawImage(this.canvas, 0, -this.canvas.height)
                this.ctx.restore()
            } else {
                image = new ImageData(cbar, cbar.length/4, 1);
                this.canvas.height = 1;
                this.canvas.width = image.width;
                this.ctx.putImageData(image, 0, 0);
            }
        }
        const aw = this.axis_container.clientWidth;
        const ah = this.axis_container.clientHeight;
        this.svg.attr("width", aw - this.mgh).attr("height",ah );
        const ub = this.vertical ? ah : aw;
        const tv = this.vertical ? [aw-1,0] : [0,ah-1];
        tv[0] = tv[0] + this.mgh;
        tv[1] = tv[1] + this.mgv;
        const scale = d3.scaleLinear().domain([vmax, vmin]).range([0,ub]);
        const axis = this.vertical ? d3.axisLeft(scale) : d3.axisBottom(scale);
        const aref = axis.ticks(this.nticks)
            .tickSize(this.tick_size)
            .tickPadding(this.tick_padding);
        this.svg.selectAll("*").remove()
        this.svg.append("g")
            .attr("transform", `translate(${tv[0]},${tv[1]})`)
            .call(aref);
    }
}
