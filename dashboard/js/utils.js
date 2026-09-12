/*
collection of methods used by multiple modules/objects, mostly for
traversing nested configurations and serializing/enumerating datetimes.
*/

export function trunc_float_string(str, prec=3) {
  // Matches the integer part and up to 'precision' decimal places
  const regex = new RegExp(`^-?\\d+(?:\\.\\d{0,${prec}})?`);
  const matched = str.match(regex);
  return matched ? matched[0] : "0";
}

// based on an array of nested property names (conditions), return the
// subtree or object in "tree" referenced by the conditions.
export function unpack(tree, conditions) {
    if (object_depth(tree) == 0) { return tree }
    let t = structuredClone(tree);
    for (const i in conditions) {
        if (t === undefined) return undefined;
        t = t[conditions[i]];
    }
    return t
}
// expand subtree to match the nesting structure of bigtree, such that
// terminal elements that are nested more deeply in bigtree default to the
// earier-terminated value.
export function sync_object_trees(bigtree, subtree) {
    // If the subtree value is terminal (primitive or array), propagate it
    // down through the full depth of bigtree.
    if (is_array_or_terminal(subtree)) {
        return propagate_terminal(bigtree, subtree);
    }

    // both sides are plain objects; recurse over each key of bigtree.
    const result = {};
    for (const k of Object.keys(bigtree)) {
        const vb = bigtree[k];
        const vs = subtree[k];

        if (vs === undefined) {
            // if key is absent from the subtree, add and propagate undefined
            result[k] = propagate_terminal(vb, undefined);
        } else {
            result[k] = sync_object_trees(vb, vs);
        }
    }
    return result;
}

// built an object matching the parent_tree with provided terminal values
function propagate_terminal(template, fill) {
    if (is_array_or_terminal(template)) {
        // template is itself a leaf; just return fill directly
        return fill;
    }

    // template is a plain object so keep descending
    const result = {};
    for (const k of Object.keys(template)) {
        result[k] = propagate_terminal(template[k], fill);
    }
    return result;
}

// Returns true only for plain (non-null, non-array) objects.
function is_array_or_terminal(val) {
  return val === null || typeof val !== 'object' || Array.isArray(val);
}

// recursive method for determining how deep the labels mapping is.
// Assumes that the depth is uniform among all sub-mappings
export function object_depth(val) {
    if (is_array_or_terminal(val)) {
        return 0;
    } else {
        return 1+Math.max(...Object.values(val).map(object_depth));
    }
}

// get array of YYYmmdd days between the provided bounds, inclusively
export function dates_between(init_day, final_day, as_datestring=false) {
    const dates = [];
    let cur_date = datestring_to_date(init_day)
    const end_date = new datestring_to_date(final_day);
    while (cur_date <= end_date) {
        if (as_datestring) {
            dates.push(date_to_datestring(new Date(cur_date)));
        } else {
            dates.push(new Date(cur_date));
        }
        cur_date.setUTCDate(cur_date.getUTCDate() + 1);
    }

    return dates;
}

/* convert YYYYmmdd to UTC Date object */
export function datestring_to_date(dstr) {
    let y = dstr.slice(0,4);
    let m = dstr.slice(4,6);
    let d = dstr.slice(6,8);
    return new Date(Date.UTC(y, m-1, d));
}

// convert
export function date_to_datestring(date, utc=true) {
    if (utc) {
        let y = date.getUTCFullYear();
        // add zero-padding
        let m = ("0" + (date.getUTCMonth()+1)).slice(-2);
        let d = ("0" + (date.getUTCDate())).slice(-2);
        return `${y}${m}${d}`
    } else {
        let y = date.getFullYear();
        // add zero-padding
        let m = ("0" + (date.getMonth()+1)).slice(-2);
        let d = ("0" + (date.getDate())).slice(-2);
        return `${y}${m}${d}`
    }
}

// convert Date object to day of year
export function date_to_doy(date, zero_pad=null, utc=true) {
    const start = new Date(
        utc?date.getUTCFullYear():date.getFullYear(), 0, 0);
    let diff = date-start;
    let doy = Math.floor(diff / (1000*60*60*24));
    if (zero_pad==null) { return doy; }
    return ("0".repeat(zero_pad)+(doy)).slice(-1*zero_pad)
}

// convert Date object to YYYYmmdd string
export function date_to_yyyymmdd(d, include_hours=true, sep="/") {
    let s = d.getFullYear() + "-" + (d.getMonth()+1) + "-" + d.getDate();
    s += include_hours ? " "+d.getHours()+":00" : "";
    return s
}

// adapt the date to a templated string supporting typical date formats
export function format_date(date, template, utc=true) {
    if (utc==true) {
        const parts = {
            "{yyyy}": date.getUTCFullYear(),
            "{mm}": String(date.getUTCMonth() + 1).padStart(2,"0"),
            "{dd}": String(date.getUTCDate()).padStart(2,"0"),
            "{HH}": String(date.getUTCHours()).padStart(2,"0"),
            "{MM}": String(date.getUTCMinutes()).padStart(2,"0"),
            "{doy}": String(date_to_doy(date, utc)).padStart(3,"0")
        }
        return template.replace(
            /{yyyy}|{mm}|{dd}|{HH}|{MM}|{doy}/g,
            match => parts[match]
        );
    } else {
        const parts = {
            "{yyyy}": date.getFullYear(),
            "{mm}": String(date.getMonth() + 1).padStart(2,"0"),
            "{dd}": String(date.getDate()).padStart(2,"0"),
            "{HH}": String(date.getHours()).padStart(2,"0"),
            "{MM}": String(date.getMinutes()).padStart(2,"0"),
            "{doy}": String(date_to_doy(date, utc)).padStart(3,"0")
        }
        return template.replace(
            /{yyyy}|{mm}|{dd}|{HH}|{MM}|{doy}/g,
            match => parts[match]
        );
    }
}
