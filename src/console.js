import * as utils from './utils.js';

const _defaultSettings = {
    echo: true,
    promptPrefix: '> ',
    template: '<div class="cmdr-console"><div class="output"></div><div class="input"><span class="prefix"></span><div class="prompt" spellcheck="false" contenteditable="true" /></div></div>',
    predefinedCommands: true
};

const _promptIndentPadding = typeof InstallTrigger !== 'undefined'; // Firefox - misplaced cursor when using 'text-indent'

class Console {
    constructor(containerNode, settings) {
        this._settings = utils.extend({}, _defaultSettings, settings);
        this._containerNode = containerNode;
        this._consoleNode = null;
        this._inputNode = null;
        this._prefixNode = null;
        this._promptNode = null;
        this._outputNode = null;
        this._outputLineNode = null;
        this._definitions = {};
        this._current = null;
        this._queue = [];
        this._history = [];
        this._historyIndex = -1;
        this._initialized = false;
        
        this.init();
    }
    
    get settings() {
        return this._settings;
    }

    get definitions() {
        return this._definitions;
    }
    
    get initialized() {
        return this._initialized;
    }

    init() {
        if (this._initialized) return;
        
        this._consoleNode = utils.createElement(this._settings.template);

        this._containerNode.appendChild(this._consoleNode);

        this._outputNode = this._consoleNode.querySelector('.output');
        this._inputNode = this._consoleNode.querySelector('.input');
        this._prefixNode = this._consoleNode.querySelector('.prefix');
        this._promptNode = this._consoleNode.querySelector('.prompt');

        this._promptNode.addEventListener('keydown', (function (event) {
            if (!this._current) {
                switch (event.keyCode) {
                    case 13:
                        var value = this._promptNode.textContent;
                        if (value) {
                            this.execute(value);
                        }
                        event.preventDefault();
                        return false;
                    case 38:
                        this._historyBack();
                        event.preventDefault();
                        return false;
                    case 40:
                        this._historyForward();
                        event.preventDefault();
                        return false;
                    case 9:
                        event.preventDefault();
                        return false;
                }
            } else if (this._current.readLine && event.keyCode === 13) {
                this._current.readLine.resolve(this._promptNode.textContent);
                return false;
            }
            return true;
        }).bind(this));

        this._promptNode.addEventListener('keypress', (function (event) {
            if (this._current && this._current.read) {
                if (event.charCode !== 0) {
                    this._current.read.char = String.fromCharCode(event.charCode);
                    if (this._current.read.capture) {
                        return false;
                    }
                } else {
                    return false;
                }
            }
            return true;
        }).bind(this));

        this._promptNode.addEventListener('keyup', (function () {
            if (this._current && this._current.read && this._current.read.char) {
                this._current.read.resolve(this._current.read.char);
            }
        }).bind(this));

        this._promptNode.addEventListener('paste', (function () {
            setTimeout((function () {
                var value = this._promptNode.textContent;
                var lines = value.split(/\r\n|\r|\n/g);
                var length = lines.length;
                if (length > 1) {
                    for (var i = 1; i < length; i++) {
                        if (lines[i].length > 0) {
                            this._queue.get(this).push(lines[i]);
                        }
                    }
                    if (this._current && this._current.readLine) {
                        this._current.readLine.resolve(lines[0]);
                    } else if (this._current && this._current.read) {
                        this._current.read.resolve(lines[0][0]);
                    } else {
                        this._current(lines[0]);
                    }
                }
            }).bind(this), 0);
        }).bind(this));

        if (_promptIndentPadding) {
            this._promptNode.addEventListener('input', (function () {
                prompt.css(this._getPromptIndent());
            }).bind(this));
        }

        this._consoleNode.addEventListener('click', (function (event) {
            if (event.target !== this._inputNode && !this._inputNode.contains(event.target) &&
                event.target !== this._outputNode && !this._outputNode.contains(event.target)) {
                this._promptNode.focus();
            }
        }).bind(this));

        if (this._settings.predefinedCommands) {
            this.predefine();
        }

        this._activateInput();
        
        this._initialized = true;
    }

    dispose() {
        if (!this._initialized) return;
        
        this._containerNode.removeChild(this._consoleNode);
        this._consoleNode = null;
        this._outputNode = null;
        this._inputNode = null;
        this._prefixNode = null;
        this._promptNode = null;
        this._definitions = {};
        this._current = null;
        this._queue = [];
        this._history = [];
        this._historyIndex = -1;  
        
        this._initialized = false;      
    }
        
    reset() {
        this.dispose();
        this.init();
    }

    read(callback, capture) {
        if (!this._current) return;

        this._activateInput(true);

        this._current.read = utils.defer();
        this._current.read.then((function (value) {
            this._current.read = null;
            if (!capture) {
                this._promptNode.textContent = value;
            }
            this._deactivateInput();
            if (callback.call(this._current, value) === true) {
                this._read(callback, capture);
            } else {
                this._flushInput();
            }
        }).bind(this));
        this._current.read.capture = capture;

        if (this._queue.length > 0) {
            this._current.read.resolve(this._queue.shift()[0]);
        }
    }

    readLine(callback) {
        if (!this._current) return;

        this._activateInput(true);

        this._current.readLine = utils.defer();
        this._current.readLine.then((function (value) {
            this._current.readLine = null;
            this._promptNode.textContent = value;
            this._deactivateInput();
            this._flushInput();
            if (callback.call(this._current, value) === true) {
                this.readLine(callback);
            }
        }).bind(this));

        if (this._queue.length > 0) {
            this._current.readLine.resolve(this._queue.shift());
        }
    }

    write(value, cssClass) {
        value = value || '';
        var outputValue = utils.createElement(`<span class="${cssClass}">${value}</span>`);
        if (!this._outputLineNode) {
            this._outputLineNode = utils.createElement('<div></div>');
            this._outputNode.appendChild(this._outputLineNode);
        }
        this._outputLineNode.appendChild(outputValue);
    }

    writeLine(value, cssClass) {
        value = (value || '') + '\n';
        this.write(value, cssClass);
        this._outputLineNode = null;
    }

    writePad(value, padding, length, cssClass) {
        this.write(utils.pad(value, padding, length), cssClass);
    }

    clear() {
        this._outputNode.innerHTML = '';
    }
    
    focus() {
        this._promptNode.focus();
    }
    
    blur() {
        utils.blur(this._promptNode);
    }

    execute(command) {
        if (this._current) {
            this._queue.push(command);
            return;
        }

        if (typeof command !== 'string' || command.length === 0) {
            throw 'Invalid command';
        }

        this._promptNode.textContent = command;
        this._flushInput(!this._settings.echo);
        this._historyAdd(command);
        this._deactivateInput();

        command = command.trim();

        var parsed = this._parseCommand(command);

        var definitions = this._getDefinitions(parsed.name);
        if (!definitions || definitions.length < 1) {
            this.writeLine('Invalid command', 'error');
            this._activateInput();
            return;
        } else if (definitions.length > 1) {
            this.writeLine('Ambiguous command', 'error');
            this.writeLine();
            for (var i = 0; i < definitions.length; i++) {
                this.writePad(definitions[i].name, ' ', 10);
                this.writeLine(definitions[i].description);
            }
            this.writeLine();
            this._activateInput();
            return;
        }

        var definition = definitions[0];

        this._current = {
            command: command,
            definition: definition,
            console: this
        };

        var args = parsed.args;
        if (!definition.parse) {
            args = [parsed.arg];
        }

        var result;
        try {
            result = definition.callback.apply(this._current, args);
        } catch (error) {
            this.writeLine('Unhandled exception. See consoleNode log for details.', 'error');
            console.error(error);
        }

        Promise.all([result]).then((function () {
            setTimeout((function () {
                this._current = null;
                this._activateInput();
                if (this._queue.length > 0) {
                    this.execute(this._queue.shift());
                }
            }).bind(this), 0);
        }).bind(this));
    }

    define(names, callback, settings) {
        var definitions = this._createDefinitions(names, callback, settings);
        for (var i = 0, l = definitions.length; i < l; i++) {
            this._definitions[definitions[i].name] = definitions[i];
        }
    }
    
    predefine() {
        this.define(['HELP', '?'], function () {
            this.console.writeLine('The following commands are available:');
            this.console.writeLine();
            for (var key in this.console.definitions) {
                var definition = this.console.definitions[key];
                if (!!utils.unwrap(definition.available)) {
                    this.console.writePad(key, ' ', 10);
                    this.console.writeLine(definition.description);
                }
            }
            this.console.writeLine();
        }, {
                description: 'Lists the available commands'
            });

        this.define('ECHO', function (arg) {
            var toggle = arg.toUpperCase();
            if (toggle === 'ON') {
                this.console.settings.echo = true;
            } else if (toggle === 'OFF') {
                this.console.settings.echo = false;
            } else {
                this.console.writeLine(arg);
            }
        }, {
                parse: false,
                description: 'Displays provided text or toggles command echoing'
            });

        this.define(['CLS'], function () {
            this.console.clear();
        }, {
                description: 'Clears the command prompt'
            });
    }

    _activateInput(inline) {
        if (inline) {
            if (this._outputLineNode) {
                this._prefixNode.textContent = this._outputLineNode.textContent;
                this._outputNode.removeChild(this._outputLineNode);
                this._outputLineNode = null;
            }
        } else {
            this._prefixNode.textContent = this._settings.promptPrefix;
        }
        this._inputNode.style.display = '';
        setTimeout((function () {
            this._promptNode.setAttribute('disabled', false);
            this._setPromptIndent();
            this._promptNode.focus();
            utils.smoothScroll(this._consoleNode, this._consoleNode.scrollHeight, 1000);
        }).bind(this), 0);
    }

    _deactivateInput() {
        this._promptNode.setAttribute('disabled', true);
        this._inputNode.style.display = 'none';
    }

    _flushInput(preventWrite) {
        if (!preventWrite) {
            this.write(this._prefixNode.textContent);
            this.writeLine(this._promptNode.textContent);
        }
        this._prefixNode.textContent = '';
        this._promptNode.textContent = '';
    }

    _historyAdd(command) {
        this._history.unshift(command);
        this._historyIndex = -1;
    }

    _historyBack() {
        if (this._history.length > this._historyIndex + 1) {
            this._historyIndex++;
            this._promptNode.textContent = history[this._historyIndex];
            var event = document.createEvent('HTMLEvents');
            event.initEvent('change', true, false);
            this._promptNode.dispatchEvent(event);
        }
    }

    _historyForward() {
        if (this._historyIndex > 0) {
            this._historyIndex--;
            this._promptNode.textContent = history[this._historyIndex];
            var event = document.createEvent('HTMLEvents');
            event.initEvent('change', true, false);
            this._promptNode.dispatchEvent(event);
        }
    }

    _parseCommand(command) {
        var exp = /[^\s"]+|"([^"]*)"/gi,
            name = null,
            arg = null,
            args = [],
            match = null;

        do {
            match = exp.exec(command);
            if (match !== null) {
                var value = match[1] ? match[1] : match[0];
                if (match.index === 0) {
                    name = value;
                    arg = command.substr(value.length + (match[1] ? 3 : 1));
                } else {
                    args.push(value);
                }
            }
        } while (match !== null);

        return {
            name: name,
            arg: arg,
            args: args
        };
    }

    _createDefinitions(names, callback, settings) {
        if (typeof names !== 'string' && !Array.isArray(names)) {
            settings = callback;
            callback = names;
            names = null;
        }
        if (typeof callback !== 'function') {
            settings = callback;
            callback = null;
        }

        if (typeof names === 'string') {
            names = [names];
        } else if (Array.isArray(names)) {
            names = names.filter(function (value) {
                return typeof value === 'string';
            });
        }

        if (!Array.isArray(names) ||
            names.length === 0 ||
            typeof callback !== 'function') {
            throw 'Invalid command definition';
        }

        var definitions = [];

        for (var i = 0, l = names.length; i < l; i++) {
            var definition = {
                name: names[i].toUpperCase(),
                callback: callback,
                parse: true,
                available: true
            };

            utils.extend(definition, settings);

            definitions.push(definition);
        }

        return definitions;
    }

    _getDefinitions(name) {
        name = name.toUpperCase();

        var definition = this._definitions[name];

        if (definition) {
            return [definition];
        }

        var definitions = [];

        for (var key in this._definitions) {
            if (key.indexOf(name, 0) === 0 && utils.unwrap(this._definitions[key].available)) {
                definitions.push(this._definitions[key]);
            }
        }

        return definitions;
    }

    _getPrefixWidth() {
        var width = this._prefixNode.getBoundingClientRect().width;
        var text = this._prefixNode.textContent;
        var spacePadding = text.length - text.trim().length;

        if (!this._prefixNode._spaceWidth) {
            var elem1 = utils.createElement('<span style="visibility: hidden">| |</span>');
            this._prefixNode.appendChild(elem1);
            var elem2 = utils.createElement('<span style="visibility: hidden">||</span>')
            this._prefixNode.appendChild(elem2);
            this._prefixNode._spaceWidth = elem1.offsetWidth - elem2.offsetWidth;
            this._prefixNode.removeChild(elem1);
            this._prefixNode.removeChild(elem2);
        }

        width += spacePadding * this._prefixNode._spaceWidth;
        return width;
    }

    _setPromptIndent() {
        var prefixWidth = this._getPrefixWidth() + 'px';
        if (_promptIndentPadding) {
            if (this._promptNode.textContent) {
                this._promptNode.style.textIndent = prefixWidth;
                this._promptNode.style.paddingLeft = '';
            } else {
                this._promptNode.style.textIndent = '';
                this._promptNode.style.paddingLeft = prefixWidth;
            }
        }
        else {
            this._promptNode.style.textIndent = prefixWidth;
        }
    }
}

export default Console;