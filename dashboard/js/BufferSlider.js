export class BufferSlider {
    constructor({
        container_id,
        template_id,
        subscription_cooldown, // ms between subscription updates
    }) {
        this.container = document.getElementById(container_id);
        this.template = document.getElementById(template_id);
        this.keys = [];
        this.subscriptions = [];
        this.sub_cooldown = subscription_cooldown;
        this._sub_timer = null;
        this._last_notification = 0;
        this.cur = null;
        this.cur_ix = null;
        this.track = null;
        this.thumb = null;
        this.fill = null;
        this.dragging = null;
        this.active = false;
        this._build();
    }

    _build() {
        this.track = this.template.cloneNode(true).content;
        this.track = this.track.querySelector(".buffer-slider-track")
            .cloneNode(true);
        this.thumb = this.track.querySelector(".buffer-slider-thumb");
        this.fill = this.track.querySelector(".buffer-slider-fill");
        this.container.appendChild(this.track);
        /*
        this._track_click = (event) => {
            if (!this.active || this.keys.length === 0) return;
            const rect = this.track.getBoundingClientRect();
            const frac = (event.clientX - rect.left) / rect.width;
            const ix = Math.round(frac * (this.keys.length - 1));
            this.set_position(this.keys[ix]);
        }
        this.track.addEventListener("click", this._track_click)
        */

        this.track.addEventListener("pointerdown", (e) => {
            if (!this.active || this.keys.length === 0) return;
            this.dragging  = true;
            this.track.setPointerCapture(e.pointerId);
            this._update_from_pointer(e);
        });
        this.track.addEventListener("pointermove", (e) => {
            if (!this.dragging) return;

            this._update_from_pointer(e);
        });
        this.track.addEventListener("pointerup", (e) => {
            this.dragging = false;
            if (this.track.hasPointerCapture(e.pointerId)) {
                this.track.releasePointerCapture(e.pointerId);
            }
        });
        this.track.addEventListener("pointercancel", (e) => {
            this.dragging = false;
            if (this.track.hasPointerCapture(e.pointerId)) {
                this.track.releasePointerCapture(e.pointerId);
            }
        });
    }

    _update_from_pointer(e) {
        const rect = this.track.getBoundingClientRect();
        let frac = (e.clientX - rect.left) / rect.width;
        frac = Math.max(0, Math.min(1, frac));
        const ix = Math.round(frac * (this.keys.length - 1));
        this.set_position(this.keys[ix]);
    }

    update(new_keys) {
        const prev = this.cur;
        this.keys = [...new_keys];

        if (this.keys.length === 0) {
            this.cur = null;
        } else if (prev && this.keys.includes(prev)) {
            this.cur = prev;
        } else {
            this.cur = this.keys[0];
        }

        //this._render();
        this._schedule_render();
    }

    set_position(key) {
        if (this.cur === key) return;
        //if (!this.keys.includes(key)) throw new Error(`invalid: ${key}`);
        this.cur = key;
        //this._render();
        this._schedule_render();
    }

    set_active(is_active) {
        this.active = is_active;
        if (!this.active) this.dragging = false;
        //this._render();
        this._schedule_render();
    }

    get_position() {
        return this.cur;
    }

    _schedule_render() {
        if (this.render_pending) return;
        this.render_pending = true;
        requestAnimationFrame(() => {
            this.render_pending = false;
            this._render();
        });
    }

    _render() {
        const enabled = this.active && this.keys.length > 0;
        this.track.classList.toggle("buffer-slider-track-inactive", !enabled);
        this.track.classList.toggle("buffer-slider-track-active", enabled);

        if (this.cur === null || this.keys.length <= 1) {
            this.thumb.style.left = "0%";
            this.fill.style.width = "0%";
            return;
        }

        const ix = this.keys.indexOf(this.cur);
        const pct = ix / (this.keys.length - 1) * 100;
        this.cur_ix = ix;
        this.thumb.style.left = `${pct}%`;
        this.fill.style.width = `${pct}%`;
        if (enabled) this._notify_subscribers();
    }

    subscribe(callback) {
        if (typeof callback !== "function") {
            throw new Error("Must provide a callback function not "+callback);
        }
        this.subscriptions.push(callback);
    }

    _notify_subscribers() {
        const now = performance.now();
        const elapsed = now - this._last_notification;

        // if the cooldown has expired, go ahead and notify subscribers
        if (elapsed >= this.sub_cooldown) {
            this.subscriptions.forEach(f => f({
                time:this.cur,
                index:this.cur_ix,
            }));
            return;
        }

        // currently inside the cooldown; schedule for on expiration
        if (this._sub_timer === null) {
            const delay = this.sub_cooldown - elapsed;
            this._sub_timer = setTimeout(() => {
                this._sub_timer = null;

                this._last_notification = performance.now();
                this.subscription.forEach(f => f({
                    time:this.cur,
                    index:this.cur_ix,
                }));
            }, delay);
        }
    }
}
