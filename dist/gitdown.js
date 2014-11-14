/**
 * @version 1.0.0
 * @link https://github.com/gajus/gitdown for the canonical source repository
 * @license https://github.com/gajus/gitdown/blob/master/LICENSE BSD 3-Clause
 */
var Gitdown = {},
    Promise = require('bluebird'),
    fs = require('fs');

/**
 * @param {String} GFM Gitdown favored markdown.
 */
Gitdown = function Gitdown (GFM) {
    var gitdown;

    if (!(this instanceof Gitdown)) {
        return new Gitdown(input);
    }

    gitdown = this;

    /**
     * Parse and process input.
     * 
     * @return {Promise}
     */
    gitdown.get = function () {
        var parser;

        parser = Gitdown.Parser();

        return parser
            .play(GFM)
            .then(function (state) {
                return state.markdown;
            });
    };

    /**
     * Write processed input to a file.
     *
     * @param {String} fileName
     */
    gitdown.write = function (fileName) {
        return gitdown
            .get()
            .then(function (outputString) {
                return fs.writeFileSync(fileName, outputString);
            });
    };
};

/**
 * Read input from a file.
 * 
 * @param {String} fileName
 * @return {Gitdown}
 */
Gitdown.read = function (fileName) {
    var input = fs.readFileSync(fileName, {
        encoding: 'utf8'
    });

    return Gitdown(input);
};

/**
 * Returns path to the .git directory.
 * 
 * @return {String}
 */
Gitdown._pathGit = function () {
    var gitpath;

    dirname = __dirname;

    do {
        if (fs.existsSync(dirname + '/.git')) {
            gitpath = dirname + '/.git';

            break;
        }

        dirname = fs.realpathSync(dirname + '/..');
    } while (fs.existsSync(dirname) && dirname != '/');

    if (!gitpath) {
        throw new Error('.git path cannot be located.');
    }

    return gitpath;
};

/**
 * Returns the parent path of the .git path.
 * 
 * @return {String} Path to the repository.
 */
Gitdown._pathRepository = function () {
    return fs.realpathSync(Gitdown._pathGit() + '/..');
};

/**
 * Parser is responsible for matching all of the instances of the Gitdown JSON and invoking
 * the associated operator functions. Operator functions are invoked in the order of the weight
 * associated with each function. Each operator function is passed the markdown document in
 * its present state (with alterations as a result of the preceding operator functions) and the
 * parameters from the JSON. This process is repeated until all commands have been executed and
 * parsing the document does not result in alteration of its state, i.e. there are no more Gitdown
 * JSON hooks that could have been generated by either of the preceding operator functions.
 *
 * @return {Parser}
 */
Gitdown.Parser = function Parser () {
    var parser,
        bindingIndex = 0;

    if (!(this instanceof Parser)) {
        return new Parser();
    }

    parser = this;

    /**
     * Iterates markdown parsing and execution of the parsed commands until all of the
     * commands have been executed and the document does not no longer change after parsing it.
     * 
     * @param {String} markdown
     * @param {Array} commands
     * @return {Promise} Promise is resolved with the state object.
     */
    parser.play = function (markdown, commands) {
        var state;

        commands = commands || [];

        state = parser.parse(markdown, commands);

        act = parser.execute(state);

        return act.then(function (state) {
            var notExecutedCommands;

            notExecutedCommands = state.commands
                .filter(function (command) {
                    return !command.executed;
                });

            if (!state.change && !notExecutedCommands.length) {
                return state;
            } else {
                return parser.play(state.markdown, state.commands);
            }
        });
    };

    /**
     * Parses the markdown for Gitdown JSON. Replaces the said JSON with placeholders for
     * the output of the command defined in the JSON.
     * 
     * @see http://stackoverflow.com/questions/26910402/regex-to-match-json-in-a-document/26910403
     * @param {String} markdown
     * @param {Array} commands
     */
    parser.parse = function (markdown, commands) {
        var bindingIndexStart = bindingIndex;
        // console.log('parser.parse', 'inputMarkdown', inputMarkdown);

        markdown = markdown.replace(/<<({"gitdown"(?:[^}]+}))>>/g, function (match) {
            var command = JSON.parse(match.slice(2, -2)),
                name = command.gitdown,
                parameters = command;

            delete parameters.gitdown;

            bindingIndex++;

            commands.push({
                bindingIndex: bindingIndex,
                name: name,
                parameters: parameters,
                helper: Gitdown.helpers[name],
                executed: false
            });

            return '⊂⊂' + (bindingIndex) + '⊃⊃';
        });

        return {
            markdown: markdown,
            commands: commands,
            change: bindingIndexStart != bindingIndex,
        };
    };

    /**
     * Execute all of the commands sharing the lowest common weight against
     * the current state of the markdown document.
     * 
     * @param {Object} state
     * @return {Promise} Promise resolves to a state after all of the commands have been resolved.
     */
    parser.execute = function (state) {
        var lowestWeight,
            lowestWeightCommands,
            notExecutedCommands,
            act = [];

        notExecutedCommands = state.commands.filter(function (command) {
            return !command.executed;
        });

        if (!notExecutedCommands.length) {
            return Promise.resolve(state);
        }

        // Find the lowest weight among all of the not executed commands.
        lowestWeight = notExecutedCommands.map(function (command) {
            return command.helper.weight();
        }).sort()[0];

        // Find all commands with the lowest weight.
        lowestWeightCommands = notExecutedCommands.filter(function (command) {
            var commandWeight = command.helper.weight();

            return commandWeight == lowestWeight;
        });

        // Execute each command and update markdown binding.
        lowestWeightCommands.forEach(function (command) {
            var promise = Promise.resolve(command.helper(state.markdown, command.parameters));

            promise.then(function (value) {
                state.markdown = state.markdown.replace('⊂⊂' + command.bindingIndex + '⊃⊃', value);

                command.executed = true;
            });

            act.push(promise);
        });

        return Promise
            .all(act)
            .then(function () {
                return state;
            });
    };
};

Gitdown.helpers = {};
Gitdown.helpers.test = require('./helpers/test.js');
Gitdown.helpers.include = require('./helpers/include.js');
Gitdown.helpers.filesize = require('./helpers/filesize.js');

module.exports = Gitdown;