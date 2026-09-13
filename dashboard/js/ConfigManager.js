/*
class for storing and querying k/v configurations based on shared properties.
*/
export class ConfigManager {
    constructor(store=null) {
        const sigs = [];
        if (store === null) {
            this.store = [];
        } else {
            for (const entry of store) {
                if (entry.length !== 2) {
                    throw new Error(
                        "Store entry must be 2-array [key_sig, value]");
                }
                const exists = sigs.some(s => {
                    if (
                        Object.keys(s).length
                        !== Object.keys(entry[0]).length
                    ) {
                        return false;
                    }
                    return Object.entries(s).every(kv => {
                        entry[0].hasOwnProperty(kv[0])
                            && (kv[1] == entry[0][kv[0]]);
                    });
                });
                if (exists) {
                    throw new Error("Already exists in config:", entry);
                }
                sigs.push(entry[0]);
            }
            // keep the actual reference to the object so it can be
            // modified externally... dangerous but useful.
            this.store = store;
        }
    }

    // add, update, or overwrite a configuration mapping
    set(sig, value) {
        const existing = this.store.find(entry => {
            const ka = Object.keys(entry[0]);
            const kb = Object.keys(sig);
            if (ka.length !== kb.length) return false;
            return ka.every(k => {
                return sig.hasOwnProperty(k) && entry[0][k] == sig[k]
            });
        });


        if (existing) {
            existing[1] = value;
        } else {
            this.store.push([sig, value]);
        }
    }

    // retrieve a value based on the highest number of matching k/v pairs.
    get(query_sig) {
        let max_score = 0;
        let best_value = undefined;
        let is_tie = false;

        // handle single configuration that applies to any conditions
        if (
            this.store.length === 1
            && Object.keys(this.store[0][0]).length == 0
            //&& Object.keys(query_sig).length == 0
        ) {
            return this.store[0][1];
        }

        for (const [sk,sv] of this.store) {
            let score = 0;

            for (const [key, val] of Object.entries(sk)) {
                if (query_sig[key] === val) {
                    score++;
                }
            }

            if (score > max_score) {
                max_score = score;
                best_value = sv;
                is_tie = false;
            } else if (score > 0 && score === max_score) {
                is_tie = true;
            }
        }

        if (max_score === 0) {
            throw new Error(
                "No configuration found sharing properties with the query."
            );
        }

        if (is_tie) {
            throw new Error(
                "Ambiguous match: Multiple configurations tied with "
                + `${max_score} shared property/properties.`
            );
        }

        return best_value;
    }
}
