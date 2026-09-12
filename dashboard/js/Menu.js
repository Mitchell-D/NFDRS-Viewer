/*
class for managing a button menu with contents that depend on an arbitrary
number of conditions.

labels and defaults are expected to be instances of ConfigManager.

update provides a new set of conditions (as a key-value object) to the menu
and changes it accordingly.
*/
export class Menu {
    // save the state as a private property so it's individual to instances
    #state = {
        subscriptions:[],
        sel:null,
    }

    // store settings and launch the default version of the menu
    // button_template is expected to have elements with css classes:
    // menu-button containing a single button element.
    constructor({
        container_id, // container where buttons will be generated
        button_template_id, // dom template that will be copied for buttons
        labels, // ConfigManager instance returning arrays of labels
        defaults, // ConfigManager instance returning default selections
        initial_conditions={}, // object of starting conditions
        long_labels={}, // mapping from label strings to long label strings
        class_active="btn-primary",
        class_inactive="btn-secondary",
    }){
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

        this.labels = labels;
        this.defaults = defaults;
        this.long_labels = long_labels;
        this.buttons = {};

        // set the menu according to the default conditions
        this.current_conditions = initial_conditions;
        this.current_value = this.defaults.get(this.current_conditions);
        this.update(this.current_conditions);
    }

    // update the defaults property with the most recent selection
    _set_default(conditions, default_value) {
        this.defaults.set(conditions, default_value);
    }

    update(conditions={}) {
        this.current_conditions = conditions;
        this._set_menu(
            this.labels.get(conditions),
            this.defaults.get(conditions),
        );
    }

    _set_menu(label_array, selected) {
        // remove buttons if their value is no longer in the label array
        if (!this.conditional_container) {
            for (const c of Array.from(this.container.children)) {
                const tmp_btn = c.querySelector("button");
                if (!label_array.includes(tmp_btn.value)) {
                    delete this.buttons[tmp_btn.value];
                    c.remove();
                }
            }
        } else {
            for (const k in this.container) {
                for (const c of Array.from(this.container[k].children)) {
                    const tmp_btn = c.querySelector("button");
                    if (!label_array.includes(tmp_btn.value)) {
                        delete this.buttons[tmp_btn.value];
                        c.remove();
                    }
                }
            }
        }

        for (const k of label_array) {
            if (this.buttons.hasOwnProperty(k)) continue;
            // grab the button template
            const tbc = this.button_template.content.querySelector(
                ".menu-button-container").cloneNode(true);
            const tb = tbc.querySelector("button");

            // set the button text and key
            if (this.long_labels.hasOwnProperty(k)) {
                tb.textContent = this.long_labels[k];
            } else {
                tb.textContent = k;
            }
            tb.value = k;
            this.buttons[k] = tb;

            // add a click callback to swap the state and notify subscribers
            const class_scope = this;
            tb.addEventListener("click", function() {
                for (const bix in class_scope.buttons) {
                    const btn = class_scope.buttons[bix];
                    // swap button to active if its feature value matches
                    if (this.value == btn.value) {
                        this.classList.remove(class_scope.class_inactive);
                        this.classList.add(class_scope.class_active);
                    }
                    // if this is the currently-selected, deactivate it.
                    else if (class_scope.current_value == btn.value) {
                        btn.classList.remove(class_scope.class_active);
                        btn.classList.add(class_scope.class_inactive);
                    }
                }
                class_scope.current_value = this.value;
                // update the default so when conditions change and change
                // back, the same button is selected.
                class_scope._set_default(
                    class_scope.current_conditions,
                    this.value,
                );
                class_scope._notify_subscribers();
            });

            // add the button to its container
            const tmp_cont = this.conditional_container
                ? this.container[k] : this.container;
            tmp_cont.append(tbc);
        }
        // simulate clicking this button if it is the selected one,
        // thereby notifying any subscribers of the new value
        this.buttons[selected].click();
    }

    select(key) {
        this.buttons[key].click();
    }

    subscribe(callback) {
        if (typeof callback !== "function") {
            throw new Error("Must provide a callback function not "+callback);
        }
        this.#state.subscriptions.push(callback);
    }

    _notify_subscribers() {
        this.#state.subscriptions.forEach(f=>f(this.current_value));
    }
}
