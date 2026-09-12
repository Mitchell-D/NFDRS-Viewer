/*
class for storing and querying k/v configurations based on shared properties.
*/
export class ConfigManager {
    constructor(store=null) {
        this.store = [];
        if (store !== null) {
            for (const [sig,opts] in store) {
                this.set(sig, opts);
            }
        }
    }

    // add, update, or overwrite a configuration mapping
    set(sig, value) {
        const existing = this.store.find(entry => {
            const keysA = Object.keys(entry.key);
            const keysB = Object.keys(sig);
            if (keysA.length !== keysB.length) return false;
            return keysA.every(k => {
                sig.hasOwnProperty(k) && entry.key[k] === sig[k]
            });
        });

        if (existing) {
            existing.value = value;
        } else {
            this.store.push({ key: sig, value });
        }
    }

    // retrieve a value based on the highest number of matching k/v pairs.
    get(query_sig) {
        let max_score = 0;
        let best_value = undefined;
        let is_tie = false;

        if (this.store.length == 0 && query_sig == {}) {
            return this.store[0][1];
        }

        for (const entry of this.store) {
            let score = 0;

            for (const [key, val] of Object.entries(entry.key)) {
                if (query_sig[key] === val) {
                    score++;
                }
            }

            if (score > max_score) {
                max_score = score;
                best_value = entry.value;
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
