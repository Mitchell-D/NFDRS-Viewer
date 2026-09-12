/*
class for managing a button menu with contents that depend on an arbitrary
number of conditions.

start_menu saves the nesting settings, and populates the container with the
    default button configuration.

update provides a new set of conditions to the menu and changes it accordingly.
*/

import { sync_object_trees, object_depth, unpack } from "./utils.js";

export class Menu {
    // save the state as a private property so it's individual to instances
    #state = {
        subscriptions: [],
        sel: null,
        menu_depth: null,
        is_enabled: false,
        is_initialized: false,
    }

    // store settings and launch the default version of the menu
    // button_template is expected to have elements with css classes:
    // menu-button containing a single button element.
    constructor({
        container_id, // container where buttons will be generated
        button_template_id, // dom template that will be copied for buttons
        labels, // array or mapping from conditions to label arrays
        defaults, // string or nested matchin conditions to default selection
        initial_conditions = [], // array of string starting conditions
        long_labels = {}, // mapping from label strings to long label strings
        class_active = "btn-primary",
        class_inactive = "btn-secondary",
        start_enabled = false,
        on_disable = null,
        on_enable = null,
    }) {
        if (typeof container_id === "string") {
            this.container = document.getElementById(container_id);
            this.conditional_container = false;
        } else {
            this.container = {};
            for (const k in container_id) {
                this.container[k] = document.getElementById(container_id[k]);
            }
            this.conditional_container = true;
        }
        this.button_template = document.getElementById(button_template_id);
        this.class_active = class_active;
        this.class_inactive = class_inactive;
        this.on_disable = on_disable;
        this.on_enable = on_enable;

        this.#state.menu_depth = object_depth(labels);
        this.labels = labels;
        this.long_labels = long_labels;
        this.buttons = {};

        if (!(initial_conditions.length == this.#state.menu_depth)) {
            throw new Error("Menu depth doesn't match initial_conditions");
        }

        // make sure the defaults tree matches the labels nesting
        this.defaults = sync_object_trees(this.labels, defaults);
        // set the menu according to the default conditions
        this.current_conditions = initial_conditions;
        this.current_value = unpack(this.defaults, this.current_conditions);

        if (start_enabled) {
            this.update(this.current_conditions);
            this.is_enabled = true;
            if (typeof this.on_enable === "function") {
                this.on_enable()
            }
        } else {
            this.is_enabled = false;
            if (typeof this.on_disable === "function") {
                this.on_disable();
            }
        }
    }

    // update the defaults property with the most recent selection
    _set_default(conditions, default_value) {
        if (!(conditions.length == this.#state.menu_depth)) {
            throw new Error("Menu depth doesn't match conditions",
                conditions, this.#state.menu_depth);
        }
        return conditions.reduce(
            (cl, k, ix) => {
                if (ix === conditions.length - 1) {
                    cl[k] = default_value;
                    return;
                } else {
                    return cl[k];
                }
            },
            this.defaults
        );
    }

    // remove all the children nodes
    _clear_menu() {
        if (!this.conditional_container) {
            if (this.container) this.container.innerHTML = "";
        } else {
            for (const k in this.container) {
                if (this.container[k]) this.container[k].innerHTML = "";
            }
        }
        this.buttons = {};
    }

    // set menu based on a set of conditions
    update(conditions = []) {
        if (!(conditions.length == this.#state.menu_depth)) {
            throw new Error("Menu depth doesn't match conditions",
                conditions, this.#state.menu_depth);
        }
        this.current_conditions = conditions;

        // determine the options and the currently selected one
        const label_array = unpack(this.labels, conditions);
        const selected = unpack(this.defaults, conditions);

        // if label_array is undefined, that's probably because the conditions
        // didn't resolve; disable the menu until valid conditions are given.
        if (!label_array || !Array.isArray(label_array)) {
            this._clear_menu();
            if (this.#state.is_enabled) {
                this.#state.is_enabled = false;
                this.current_value = null;
                if (typeof this.on_disable === "function") {
                    this.on_disable();
                }
            }
            return;
        }

        // set the menu to its defaults given the new label array
        const was_disabled = !this.#state.is_enabled;
        this.#state.is_enabled = true;
        this._set_menu(label_array, selected);

        // fire the enable callback if the menu was previously disabled.
        if (
            this.#state.is_initialized
            && was_disabled
            && typeof this.on_enable === "function"
        ) {
            this.on_enable();
        }
    }

    _set_menu(label_array, selected) {
        // remove buttons if their value is no longer in the label array
        if (!this.conditional_container) {
            for (const c of Array.from(this.container.children)) {
                const tmp_btn = c.querySelector("button");
                if (tmp_btn && !label_array.includes(tmp_btn.value)) {
                    delete this.buttons[tmp_btn.value];
                    c.remove();
                }
            }
        } else {
            for (const k in this.container) {
                for (const c of Array.from(this.container[k].children)) {
                    const tmp_btn = c.querySelector("button");
                    if (tmp_btn && !label_array.includes(tmp_btn.value)) {
                        delete this.buttons[tmp_btn.value];
                        c.remove();
                    }
                }
            }
        }

        for (const k of label_array) {
            if (Object.prototype.hasOwnProperty.call(this.buttons, k)) continue;
            // grab the button template
            const tbc = this.button_template.content.querySelector(
                ".menu-button-container").cloneNode(true);
            const tb = tbc.querySelector("button");

            // set the button text and key
            if (Object.prototype.hasOwnProperty.call(this.long_labels, k)) {
                tb.textContent = this.long_labels[k];
            } else {
                tb.textContent = k;
            }
            tb.value = k;
            this.buttons[k] = tb;

            // add a click callback to swap the state and notify subscribers
            tb.addEventListener("click", () => {
                //if (this.classList.contains(class_scope.class_active)) return;
                for (const bix in this.buttons) {
                    const btn = this.buttons[bix];
                    //const btn = el.querySelector(":scope > button");
                    //const btn = el.querySelector(":scope > button");
                    // swap button to active if its feature value matches
                    if (tb.value == btn.value) {
                        tb.classList.remove(this.class_inactive);
                        tb.classList.add(this.class_active);
                    }
                    // if this is the currently-selected, deactivate it.
                    else if (this.current_value == btn.value) {
                        btn.classList.remove(this.class_active);
                        btn.classList.add(this.class_inactive);
                    }
                }
                this.current_value = tb.value;
                // update the default so when conditions change and change
                // back, the same button is selected.
                this._set_default(
                    this.current_conditions,
                    tb.value,
                );
                this._notify_subscribers();
            });

            // add the button to its container
            const tmp_cont = this.conditional_container
                ? this.container[k] : this.container;
            if (tmp_cont) tmp_cont.append(tbc);

            //if (k==selected) { tb.click(); }
        }
        // simulate clicking this button if it is the selected one,
        // thereby notifying any subscribers of the new value
        if (selected && this.buttons[selected]) {
            this.buttons[selected].click();
        }
    }

    select(key) {
        if (this.buttons[key]) {
            this.buttons[key].click();
        }
    }

    subscribe(callback) {
        if (typeof callback !== "function") {
            throw new Error("Must provide a callback function not " + callback);
        }
        this.#state.subscriptions.push(callback);
    }

    _notify_subscribers() {
        this.#state.subscriptions.forEach(f => f(this.current_value));
    }
}

export class MenuManager {
    menus = {};
    #triggers = {};
    #args = {};
    #dependents = {};
    #is_updating = false;

    constructor() {}

    add_menu({ menu_key, menu, triggers = [], args = [] }) {
        if (this.menus[menu_key]) {
            throw new Error(`Menu with key "${menu_key}" is already registered.`);
        }

        for (const trig_key of triggers) {
            if (!this.menus[trig_key]) {
                throw new Error(`Dependency menu "${trig_key}" has not been added yet.`);
            }
        }

        for (const arg_key of args) {
            if (!this.menus[arg_key]) {
                throw new Error(`Argument menu "${arg_key}" has not been added yet.`);
            }
        }

        this.#triggers[menu_key] = triggers;
        this.#args[menu_key] = args;

        for (const trig_key of triggers) {
            if (!this.#dependents[trig_key]) {
                this.#dependents[trig_key] = [];
            }
            this.#dependents[trig_key].push(menu_key);
        }

        this.menus[menu_key] = menu;

        // Subscribe menu changes to trigger graph traversal updates
        menu.subscribe(() => {
            this._handle_menu_change(menu_key);
        });

        if (args.length > 0) {
            this._update_single_menu(menu_key);
        }
    }

    _handle_menu_change(source_key) {
        // Prevent recursive re-entry while an update cascade is actively running
        if (this.#is_updating) return;

        this.#is_updating = true;

        try {
            // Get all downstream dependents sorted topologically (Parents -> Children)
            const update_order = this._get_topological_dependent_order(source_key);

            for (const key of update_order) {
                this._update_single_menu(key);
            }
        } finally {
            this.#is_updating = false;
        }
    }

    _update_single_menu(menu_key) {
        const arg_keys = this.#args[menu_key] || [];
        const conditions = arg_keys.map(key => {
            const target_menu = this.menus[key];
            if (target_menu === undefined) {
                throw new Error(`undefined menu: ${key}`);
            }
            return target_menu ? target_menu.current_value : undefined;
        });
        // return if some of the conditions are undefined. This probably means
        // the required menu is currently disabled.
        if (conditions.some(v => v == null)) {
            console.log("ignoring update for undefined conditions");
            return;
        }
        this.menus[menu_key].update(conditions);
    }

    /**
     * Performs a Depth-First Search to return downstream dependents in Topological Order.
     * Guarantees all parents in the cascade update before their children.
     */
    _get_topological_dependent_order(start_key) {
        const visited = new Set();
        const post_order = [];

        const dfs = (node_key) => {
            visited.add(node_key);
            const children = this.#dependents[node_key] || [];
            for (const child of children) {
                if (!visited.has(child)) {
                    dfs(child);
                }
            }
            post_order.push(node_key);
        };

        dfs(start_key);

        // Reverse post-order yields topological ordering; exclude the trigger menu itself
        return post_order.reverse().filter(key => key !== start_key);
    }
}
