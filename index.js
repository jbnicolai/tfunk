var chalk = require("chalk");

/**
 * Get the indexes of matches
 * @param string
 * @returns {{starts: Array, ends: Array}}
 */
function getIndexes(string) {

    var starts = [];
    var ends = [];

    string.replace(/%C/g, function () {
        starts.push(arguments[1]);
    });

    string.replace(/%R/g, function () {
        ends.push(arguments[1]);
    });

    return {
        starts: starts,
        ends: ends
    }
}

/**
 * Remove any sections that are NOT nested, but were caught in the match
 * @param {Array} starts
 * @param {Array} ends
 */
function dropNoneNested(starts, ends) {

    var newStarts = [starts[0]];
    var newEnds = [ends[0]];

    for (var i = 0, n = starts.length; i < n; i += 1) {
        if (i) {
            if (starts[i] < ends[i - 1]) {
                newStarts.push(starts[i]);
                newEnds.push(ends[i]);
            }
        }
    }

    return {
        starts: newStarts,
        ends: newEnds
    }
}

/**
 * Add the missing colour starts
 * @param string
 */
function fixNested(string) {

    var indexes = getIndexes(string);
    var starts = indexes.starts;
    var ends = indexes.ends;

    if (!isNested(string)) {
        return string;
    }

    var newIndexes = dropNoneNested(starts, ends);

    var sectionEnd = newIndexes.ends[(newIndexes.ends.length - 1)] + 2;
    var stringSubSection = string.slice(newIndexes.starts[0], sectionEnd);
    var oldStart = string.slice(0, newIndexes.starts[0]);
    var oldEnd = string.slice(sectionEnd);

    var colors = [];

    stringSubSection.replace(/%C([a-z]+?):/g, function () {
        colors.push(arguments[1]);
    });

    var count = 0;

    var replaced = stringSubSection.replace(/%R/g, function () {
        var string = "%R%C" + colors[count] + ":";
        count += 1;
        return string;
    });

    return oldStart + replaced + oldEnd;
}

/**
 * Check if there's a nested group
 * @param string
 * @returns {boolean}
 */
function isNested(string) {

    var indexes = getIndexes(string);
    var starts = indexes.starts;
    var ends = indexes.ends;

    var nested = false;

    for (var i = 0, n = starts.length; i < n; i += 1) {

        var nextStart;
        var nextEnd;
        var currentEnd = ends[i];

        if (i !== (starts.length - 1)) {

            nextStart = starts[i + 1];
            nextEnd = ends[i + 1];

            if (nextStart < currentEnd) {
                nested = true;
                return true;
            }
        }
    }

    return nested;
}

/**
 * String splice
 * @param {string} str
 * @param {number} index
 * @param {string} add
 * @returns {string}
 */
function spliceSlice(str, index, add) {
    var before = str.slice(0, index);
    var after = str.slice(index);
    return [before, add, after].join("");
}

/**
 * Specifically for use with NESTED items
 * @param string
 * @returns {*}
 */
function fixIndexes(string) {

    if (!isNested(string)) {

        return string;

    } else {

        var indexes = getIndexes(string);
        var sectionEnd = indexes.ends[(indexes.ends.length - 1)] + 2;
        var stringSubSection = string.slice(indexes.starts[0], sectionEnd);

        var context = "";
        var old = "";
        var initial = "";

        if (indexes.starts[0] > 0) {
            initial = string.slice(0, indexes.starts[0]);
        }

        return initial + stringSubSection.replace(/^(%C([a-zA-Z]+?):)([\s\S]+?)%R(?!.*%R)/g, function () {
            context = arguments[2];
            old = arguments[0];
            var content = arguments[3];
            return  trim(content, context, arguments[1]);
        });
    }
}

/**
 * @param content
 * @param context
 * @param start
 * @returns {string}
 */
function trim(content, context, start) {

    var indexes = getIndexes(content);

    if (indexes.ends[indexes.ends.length - 1] < content.length) {

        // Match that needs fixing
        var add = "%C" + context + ":";

        var fixed;
        var count = 0;

        indexes.ends.forEach(function (item, i) {
            if (!fixed) {
                fixed = spliceSlice(content, indexes.ends[i] + 2 + count, add);
            } else {
                fixed = spliceSlice(fixed, indexes.ends[i] + 2 + count, add);
            }
            count += add.length;
        });

        return start + (fixed || "") + "%R";

    } else {

        return start + content + "%R";
    }
}

/**
 * Run each match through chalk
 * @param string
 * @returns {XML|string}
 */
function addColors(string, custom) {

    var regex = /%C([a-zA-Z]+?):([\s\S]+?)(?=%C|%R)/g;

    var newstring = string.replace(regex, function () {

        var color = arguments[1];

        if (custom && custom[color]) {
            var func = eval(custom[color]);
            return func(arguments[2]);
        }

        return chalk[color](arguments[2]);

    });

    return newstring.replace(/%R/g, "");
}

/**
 * Remove any instances with no content %Cred:%R
 * @param string
 * @returns {string}
 */
function removeDupes(string) {
    return string.replace(/%C([a-z]+?):%R/g, "");
}

/**
 * Ensure all colours are closed
 * @param string
 * @returns {*}
 */
function fixEnding(string) {

    var indexes = getIndexes(string);

    var diff = indexes.starts.length - indexes.ends.length;

    var append = "";

    if (diff > 0) {
        for (var i = 0, n = diff; i < n; i += 1) {
            append += "%R";
        }
        return string + append;
    }

    return string;
}

/**
 * Stateless compiler.
 * @param string
 * @returns {string}
 */
function compile(string, custom) {
    var error = "'%s' not supported. See https://github.com/sindresorhus/chalk#styles for supported styles.";
    var res;
    try {
        res = addColors(removeDupes(fixIndexes(fixEnding(string))), custom);
    } catch (e) {
        var color = /Property '(.+?)'/.exec(e.message);
        throw Error(error.replace("%s", color[1]));
    }
    return res;
}

/**
 * @param {Object} opts
 * @returns {Compiler}
 */
function Compiler(opts) {

    opts = opts || {};

    if (opts.prefix) {
        this.prefix = compile(opts.prefix, opts.custom);
    }

    this.compile = function (string) {

        return this.prefix + compile(string, opts.custom);

    }.bind(this);

    return this;
}

module.exports.isNested = isNested;
module.exports.fixNested = fixNested;
module.exports.dropNoneNested = dropNoneNested;
module.exports.getIndexes = getIndexes;
module.exports.fixIndexes = fixIndexes;
module.exports.addColors = addColors;
module.exports.fixEnding = fixEnding;
module.exports.Compiler = Compiler;
module.exports.compile = compile;