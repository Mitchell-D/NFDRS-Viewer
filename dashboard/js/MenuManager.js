/*
Class wrapping multiple Menu or DualRangeSlider objects so that they are
safely triggered by other menu objects and provided their dependencies.
*/
export class MenuManager {
    menus = {};
    #dependencies = {};
    #args = {};
    #dependents = {};
    #is_updating = false;

    constructor() {}

    // register a new menu
    add_menu({
        menu_key, // unique identifier for this menu and the property it gives
        menu, // Menu or DualRangeSlider instance
        triggers=[], // menu keys that trigger updates to this menu
        args=[], // array of menu keys or arrays of alternate keys
    }) {
        if (this.menus[menu_key]) {
            throw new Error(
                `menu with key "${menu_key}" is already registered.`);
        }

        for (const dep_key of triggers) {
            if (!this.menus[dep_key]) {
                throw new Error(
                    `trigger "${dep_key}" of "${menu_key}" not added.`);
            }
        }

        // collect all alternate sub-arrays into one array of argument keys
        const arg_menu_keys = args.flat(Infinity);

        // all of the menu's arguments must have been already added
        for (const arg_key of arg_menu_keys) {
            if (!this.menus[arg_key]) {
                throw new Error(
                    `argument "${arg_key}" of "${menu_key}" not added.`);
            }
        }

        this.#dependencies[menu_key] = triggers;
        this.#args[menu_key] = args;

        // add this menu to the dependents list of its triggers
        for (const dep_key of triggers) {
            if (!this.#dependents[dep_key]) {
                this.#dependents[dep_key] = [];
            }
            this.#dependents[dep_key].push(menu_key);
        }

        this.menus[menu_key] = menu;

        menu.subscribe(() => {
            this._handle_menu_change(menu_key);
        });

        // if the new menu is dependent, set its state based on its
        // already-established triggers
        if (arg_menu_keys.length > 0) {
            this._update_single_menu(menu_key);
        }
    }

    // when a menu button is clicked, resolve its dependencies
    _handle_menu_change(source_key) {
        if (this.#is_updating) return;

        this.#is_updating = true;

        try {
            // get the menus dependent on this update in order of precedence
            const {order,trigger_map} = this._get_dependent_order(source_key);

            // update the dependent menu with the new value of its trigger
            for (const key of order) {
                const immediate_trigger = trigger_map[key] || source_key;
                this._update_single_menu(key, immediate_trigger);
            }
        } finally {
            this.#is_updating = false;
        }
    }

    // update a menu by its key, optionally based on a specific trigger key
    _update_single_menu(menu_key, trigger_key = null) {
        const raw_args = this.#args[menu_key] || [];
        const conditions = {};

        // retrieve the current conditions for each of the arguments
        for (const arg of raw_args) {
            // resolve alternate argument sub-arrays
            if (Array.isArray(arg)) {
                let chosen_key = null;
                // prefer trigger_key if present and defined
                if (trigger_key && arg.includes(trigger_key)) {
                    const val = this.menus[trigger_key]?.current_value;
                    if (val !== undefined && val !== null) {
                        chosen_key = trigger_key;
                    }
                }

                // otherwise pick the first defined alternate argument
                if (!chosen_key) {
                    chosen_key = arg.find(k => {
                        const val = this.menus[k]?.current_value;
                        return val !== undefined && val !== null;
                    });
                }
                if (chosen_key) {
                    const val = this.menus[chosen_key].current_value;
                    if (val !== undefined && val !== null) {
                        conditions[chosen_key] = val;
                    }
                }
            } else if (typeof arg === "string") {
                const target_menu = this.menus[arg];
                if (target_menu) {
                    const val = target_menu.current_value;
                    if (val !== undefined && val !== null) {
                        conditions[arg] = val;
                    }
                } else {
                    throw new Error(menu_key, "argument menu not found:", arg);
                }
            } else {
                throw new Error("argument must be string or array, not:", arg);
            }
        }

        // update the menu with the new conditions
        if (this.menus[menu_key]) {
            this.menus[menu_key].update(conditions);
        }
    }

    _get_dependent_order(start_key) {
        const visited = new Set();
        const post_order = [];
        const trigger_map = {};

        const dfs = (node_key) => {
            visited.add(node_key);
            const children = this.#dependents[node_key] || [];
            for (const child of children) {
                if (!trigger_map[child]) {
                    trigger_map[child] = node_key;
                }
                if (!visited.has(child)) {
                    dfs(child);
                }
            }
            post_order.push(node_key);
        };

        dfs(start_key);

        const order = post_order.reverse().filter(key => key !== start_key);
        return { order, trigger_map };
    }
    // set the state of multiple menus simultaneously
    update(state_object) {
        // validate all menu keys exist before making changes
        for (const key of Object.keys(state_object)) {
            if (!this.menus[key]) {
                throw new Error(`unknown menu key "${key}".`);
            }
        }

        // lock individual update cascades while updating components
        this.#is_updating = true;

        // update all specified menus independently
        try {
            for (const [key, value] of Object.entries(state_object)) {
                const component = this.menus[key];
                if (typeof component.select === "function") {
                    // Menu selection
                    component.select(value);
                } else if (
                    typeof component._update_slider === "function"
                    && Array.isArray(value)
                ) {
                    // DualRangeSlider selection
                    component._update_slider({
                        min_sel:value[0],
                        max_sel:value[1],
                    });
                } else {
                    // fallback state assignment
                    //component.current_value = value;
                    throw new Error("Unrecognized menu component:",
                        key, this.menus[key]);
                }
            }
        } finally {
            this.#is_updating = false;
        }

        // re-lock to perform a unified downstream update sweep
        this.#is_updating = true;

        try {
            // gather downstream dependents across all modified keys
            const downstream_keys = new Set();
            const trigger_map = {};

            for (const key of Object.keys(state_object)) {
                const {order, trigger_map:sub_triggers}
                    = this._get_dependent_order(key);
                Object.assign(trigger_map, sub_triggers);
                for (const dep_key of order) {
                    // don't re-update menus explicitly specified by the caller
                    if (!state_object.hasOwnProperty(dep_key)) {
                        downstream_keys.add(dep_key);
                    }
                }
            }

            // perform single update sweep for all affected downstream menus
            for (const dep_key of downstream_keys) {
                const trigger_key = trigger_map[dep_key] || null;
                this._update_single_menu(dep_key, trigger_key);
            }
        } finally {
            this.#is_updating = false;
        }
    }

    get_state() {
        const out = {};
        for (const [k,v] of Object.entries(this.menus)) {
            if (v.current_value !== undefined) {
                out[k] = v.current_value;
            }
        }
        return out;
    }
}
