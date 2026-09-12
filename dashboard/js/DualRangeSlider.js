/*
Slider form that lets the user independently select minimum and maximum values,
and tracks preferences (previous selection) independently for each
configuration described by a set of conditions.

Given an ID template to a slider form with the css classes below, generates
a new form in the element specified by the provided container ID.

Subscriber callbacks are notified with (min, max) any time a new value is
set on the form by the user.

Callbacks supporting text input and click-and-drag forms only operate on
the min/max selected bounds in terms of their bin position, ie conversion to
data coordinates only occurs on update(), at which point subscribers are
notified of the changes.
*/
import { sync_object_trees, object_depth,
    unpack, trunc_float_string } from "./utils.js";

export class DualRangeSlider {
    constructor({
        target_container_id, // id where new forms will be generated
        template_container_id, // id for element with forms to copy
        extrema, // 2-array [min,max] (or nested) mapping conditions to bounds
        defaults, // 2-array [min,max] (or nested) mapping conditions to sel
        initial_conditions=[], // array of string starting conditions
        resolution=128,
        float_string_precision=2,
    }) {

        this.menu_depth = object_depth(extrema);
        if (!initial_conditions.length == this.menu_depth) {
            throw new Error("extrema depth doesn't match initial_conditions");
        }

        // grab all theneeded DOM references
        this.container = document.getElementById(target_container_id);
        this.track = this.container.querySelector(".slider-track");
        this.range = this.container.querySelector(".slider-range");
        this.min_handle = this.container.querySelector(".slider-handle-min");
        this.max_handle = this.container.querySelector(".slider-handle-max");
        this.label_min = this.container.querySelector(".slider-label-min");
        this.label_max = this.container.querySelector(".slider-label-max");
        this.min_input = this.container.querySelector(".slider-input-min");
        this.max_input = this.container.querySelector(".slider-input-max");

        this.is_dragging = false;
        this.active_handle = null;
        this.subscriptions = [];

        this.resolution = resolution;
        this.float_string_precision = float_string_precision;

        this.extrema = extrema;

        // make sure defaults tree matches extrema object nesting
        this.bounds =  sync_object_trees(this.extrema, defaults);

        // handle click and drag events
        this.min_handle.addEventListener(
            "mousedown", e => this.start_drag(e, "min"));
        this.max_handle.addEventListener(
            "mousedown", e => this.start_drag(e, "max"));
        document.addEventListener("mousemove", (e) => this.drag(e));
        document.addEventListener("mouseup", () => this.stop_drag());

        // handle touch and drag events
        this.min_handle.addEventListener(
            "touchstart", (e) => this.start_drag(e, "min"));
        this.max_handle.addEventListener(
            "touchstart", (e) => this.start_drag(e, "max"));
        document.addEventListener("touchmove", (e) => this.drag(e));
        document.addEventListener("touchend", () => this.stop_drag());

        // handle text input events
        this.min_input.addEventListener(
            "change", (e) => this.new_min_text_input(e));
        this.max_input.addEventListener(
            "change", (e) => this.new_max_text_input(e));

        // handle track click events
        this.track.addEventListener("click", (e) => this.new_track_click(e));

        // set states for new extrema bounds and their default selected
        this.set_new_conditions(initial_conditions);
    }

    set_new_conditions(conditions) {
        this.current_conditions = conditions;

        // set the new extrema values
        const [min_val_ext,max_val_ext] = unpack(this.extrema, conditions);

        // set the new bounds values from the previous selection
        const [min_val_bnd,max_val_bnd] = unpack(this.bounds, conditions);

        this.update({
            min_sel:min_val_bnd,
            max_sel:max_val_bnd,
            min_ext:min_val_ext,
            max_ext:max_val_ext,
        });
    }

    bin_to_value(bin) {
        return this.min_val_ext +
            (bin / (this.resolution-1)) * (this.max_val_ext-this.min_val_ext);
    }

    value_to_bin(value) {
        if (value > this.max_val_ext) {
            value = this.max_val_ext;
        } else if (value < this.min_val_ext) {
            value = this.min_val_ext;
        }
        return Math.round(
            ((value-this.min_val_ext) / (this.max_val_ext-this.min_val_ext))
            * (this.resolution - 1)
        );
    }

    // If the user is dragging a handle, set the dragging state, identify
    // which handle it is, and change the class accordingly.
    start_drag(e, handle) {
        e.preventDefault();
        this.is_dragging = true;
        this.active_handle = handle;

        if (handle === "min") {
            this.min_handle.classList.add("dragging");
        } else {
            this.max_handle.classList.add("dragging");
        }
    }

    // each time touchmove updates,
    drag(e) {
        if (!this.is_dragging) return;

        // get the track dom element for reference wrt the cursor location
        const rect = this.track.getBoundingClientRect();
        let client_x = null;
        if (e.type.includes("touch")) {
            client_x = e.touches[0].clientX;
        }
        else {
            client_x = e.clientX;
        }

        // determine the closest bin to the cursor's x location
        const x = Math.max(0, Math.min(client_x - rect.left, rect.width));
        const v = Math.round(x / rect.width * (this.resolution - 1));

        // set the new selected bin based on the value
        let new_min = null;
        let new_max = null;
        if (this.active_handle === "min") {
            new_min = this.bin_to_value(Math.max(v, 0));
            if (new_min >= this.max_val_bnd) return;
        } else {
            new_max = this.bin_to_value(Math.min(v, this.resolution - 1));
            if (new_max <= this.min_val_bnd) return;
        }


        this.update({
            min_sel:new_min,
            max_sel:new_max,
        });
    }

    stop_drag() {
        this.is_dragging = false;
        this.active_handle = null;
        this.min_handle.classList.remove("dragging");
        this.max_handle.classList.remove("dragging");
    }

    // user clicks on the button track rather than the button itself
    // might want to remove this ability due to ambiguity on which button
    new_track_click(e) {
        if (e.target !== this.track && e.target !== this.range) return;

        const rect = this.track.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const v = Math.round(x / rect.width * (this.resolution - 1));

        // Move closest handle
        const dmin = Math.abs(v - this.min_bin_bnd);
        const dmax = Math.abs(v - this.max_bin_bnd);

        let new_min = null;
        let new_max = null;
        if (dmin < dmax) {
            new_min = this.bin_to_value(Math.max(v, 0));
        } else {
            new_max = this.bin_to_value(Math.min(v, this.resolution - 1));
        }

        this.update({
            min_sel:new_min,
            max_sel:new_max
        });
    }

    new_min_text_input(e) {
        let value = parseFloat(e.target.value);
        if (Number.isNaN(value)) {
            // invalid inputs just get cleared.
            this.update({ min_sel:this.min_val_bnd, round_to_bin:false });
            return;
        }

        this.update({ min_sel:value, round_to_bin:false });

        // make sure the threshold is in bounds
        if (value > this.max_val_ext) {
            value = this.max_val_ext
                - (this.max_val_ext-this.min_val_ext)/this.resolution;
        } else if (value < this.min_val_ext) {
            value = this.min_val_ext;
        }

        // if the manually-entered min threshold is above the previous max,
        // modify the previous max to fit the full valid range
        let new_max = null;
        if (value >= this.max_val_bnd) {
            new_max = this.max_val_ext;
        }

        this.update({
            min_sel:value,
            max_sel:new_max,
            round_to_bin:false
        });
    }

    new_max_text_input(e) {
        let value = parseFloat(e.target.value);
        if (Number.isNaN(value)) {
            // invalid inputs just get cleared.
            this.update({ max_sel:this.max_val_bnd, round_to_bin:false });
            return;
        }

        // make sure the threshold is in bounds
        if (value < this.min_val_ext) {
            value = this.min_val_ext
                + (this.max_val_ext-this.min_val_ext)/this.resolution;
        } else if (value > this.max_val_ext) {
            value = this.max_val_ext;
        }

        // if the manually-entered threshold
        let new_min = null;
        if (value <= this.min_val_bnd) {
            new_min = this.min_val_ext;
        }

        this.update({
            min_sel:new_min,
            max_sel:value,
            round_to_bin:false
        });
    }

    // given current selected bounds, update the form visuals
    // if not new_extrema, depends on min_bin_bnd and max_bin_bnd
    // if new_extrema, ALSO depends on min_val_ext, max_val_ext
    // min_val_bnd, max_val_bnd
    update({
        min_sel=null,
        max_sel=null,
        min_ext=null,
        max_ext=null,
        round_to_bin=false,
    }) {
        if (min_ext !== null) {
            // Set new input extrema
            this.min_val_ext = min_ext;
            this.min_input.min = this.min_val_ext;
            this.max_input.min = this.min_val_ext;
        }
        if (max_ext !== null) {
            this.max_val_ext = max_ext;
            this.min_input.max = this.max_val_ext;
            this.max_input.max = this.max_val_ext;
        }

        if (min_sel !== null) {
            if (round_to_bin) {
                this.min_bin_bnd = this.value_to_bin(min_sel);
                this.min_val_bnd = this.bin_to_value(this.min_bin_bnd);
            } else {
                this.min_val_bnd = min_sel;
                this.min_bin_bnd = this.value_to_bin(min_sel);
            }
        } else {
            this.min_bin_bnd = this.value_to_bin(this.min_val_bnd);
        }
        if (max_sel !== null) {
            if (round_to_bin) {
                this.max_bin_bnd = this.value_to_bin(max_sel);
                this.max_val_bnd = this.bin_to_value(this.max_bin_bnd);
            } else {
                this.max_val_bnd = max_sel;
                this.max_bin_bnd = this.value_to_bin(max_sel);
            }
        } else {
            this.max_bin_bnd = this.value_to_bin(this.max_val_bnd);
        }

        // update the bound settings for this conditions state
        this.set_bound(
            this.current_conditions,
            [this.min_val_bnd, this.max_val_bnd]
        );

        // update the forms visuals to reflect the new bins
        const min_pct = (this.min_bin_bnd / (this.resolution - 1)) * 100;
        const max_pct = (this.max_bin_bnd / (this.resolution - 1)) * 100;
        this.min_handle.style.left = `${min_pct}%`;
        this.max_handle.style.left = `${max_pct}%`;
        this.range.style.left = `${min_pct}%`;
        this.range.style.width = `${max_pct - min_pct}%`;

        // update the value displays and text input forms
        this.label_min.textContent = this.min_val_ext;
        this.label_max.textContent = this.max_val_ext;
        this.min_input.value = trunc_float_string(
            `${this.min_val_bnd}`, this.float_string_precision);
        this.max_input.value = trunc_float_string(
            `${this.max_val_bnd}`, this.float_string_precision);

        // update the subscribers with the new selected bounds
        this._notify_subscribers(this.min_val_bnd, this.max_val_bnd);
    }

    set_bound(conditions, bound_value){
        if (!(conditions.length == this.menu_depth)) {
            throw new Error("Menu depth doesn't match conditions",
                conditions, this.menu_depth);
        }
        return conditions.reduce(
            (cl, k, ix) => {
                if (ix === conditions.length - 1) {
                    cl[k] = bound_value;
                    return;
                } else {
                    return cl[k];
                }
            },
            this.bounds
        );
    }

    subscribe(callback)  {
        if (typeof callback !== "function") {
            throw new Error("Must provide a callback function not "+callback);
        }
        this.subscriptions.push(callback);
    }

    _notify_subscribers(min, max) {
        this.subscriptions.forEach(f=>f(min, max));
    }
}
