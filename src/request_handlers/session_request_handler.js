/*
This file is part of the GhostDriver project from Neustar inc.

Copyright (c) 2012, Ivan De Marino <ivan.de.marino@gmail.com> - Neustar inc.
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright notice,
      this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright notice,
      this list of conditions and the following disclaimer in the documentation
      and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

var ghostdriver = ghostdriver || {};

ghostdriver.SessionReqHand = function(session) {
    // private:
    var
    _protoParent = ghostdriver.SessionReqHand.prototype,
    _session = session,
    _locator = new ghostdriver.WebElementLocator(_session),
    _const = {
        URL             : "url",
        ELEMENT         : "element",
        ELEMENTS        : "elements",
        ELEMENT_DIR     : "/element/",
        TITLE           : "title",
        WINDOW          : "window",
        FORWARD         : "forward",
        BACK            : "back",
        REFRESH         : "refresh",
        EXECUTE         : "execute",
        EXECUTE_ASYNC   : "execute_async"
    },
    _errors = require("./errors.js"),

    _handle = function(req, res) {
        var element;

        _protoParent.handle.call(this, req, res);

        // Handle "/url" GET and POST
        if (req.urlParsed.file === _const.URL) {                                         //< ".../url"
            if (req.method === "GET") {
                _getUrlCommand(req, res);
            } else if (req.method === "POST") {
                _postUrlCommand(req, res);
            }
            return;
        } else if (req.urlParsed.file === _const.TITLE && req.method === "GET") {       //< ".../title"
            // Get the current Page title
            _titleCommand(req, res);
            return;
        } else if (req.urlParsed.file === _const.WINDOW) {                              //< ".../window"
            if (req.method === "DELETE") {
                _windowCloseCommand(req, res);
            } else if (req.method === "POST") {
                _windowChangeFocusToCommand(req, res);
            }
            return;
        } else if (req.urlParsed.file === _const.ELEMENT && req.method === "POST") {    //< ".../element"
            _elementCommand(req, res);
            return;
        } else if (req.urlParsed.directory === _const.ELEMENT_DIR) {                    //< ".../element/:elementId" or ".../element/active"
            // TODO
        } else if (req.urlParsed.path.indexOf(_const.ELEMENT_DIR) === 0) {              //< ".../element/:elementId/COMMAND"
            // Get the WebElementRH and, if found, re-route request to it
            element = _locator.getElement(decodeURIComponent(req.urlParsed.chunks[1]));
            if (element !== null) {
                _protoParent.reroute.call(element, req, res, _const.ELEMENT_DIR + req.urlParsed.chunks[1]);
            } else {
                throw _errors.createInvalidReqVariableResourceNotFoundEH(req);
            }
            return;
        } else if (req.urlParsed.file === _const.FORWARD && req.method === "POST") {
            _forwardCommand(req, res);
            return;
        } else if (req.urlParsed.file === _const.BACK && req.method === "POST") {
            _backCommand(req, res);
            return;
        } else if (req.urlParsed.file === _const.REFRESH && req.method === "POST") {
            _refreshCommand(req, res);
            return;
        } else if (req.urlParsed.file === _const.EXECUTE && req.method === "POST") {
            _executeCommand(req, res);
            return;
        }

        throw _errors.createInvalidReqInvalidCommandMethodEH(req);
    },

    _createOnSuccessHandler = function(res) {
        return function (status) {
            res.statusCode = 200;
            res.writeJSON(_protoParent.buildSuccessResponseBody.call(res, _session.getId()));
            res.closeGracefully();
        };
    },

    _respondBasedOnResult = function(req, res, result) {
        // Convert string to JSON
        if (typeof(result) === "string") {
            try {
                result = JSON.parse(result);
            } catch (e) {
                // In case the conversion fails, report and "Invalid Command Method" error
                throw _erros.createInvalidReqInvalidCommandMethodEH(req);
            }
        }

        // In case the JSON doesn't contain the expected fields
        if (typeof(result) !== "object" ||
            typeof(result.status) === "undefined" ||
            typeof(result.value) === "undefined") {
            throw _errors.createFailedCommandEH(
                _errors.FAILED_CMD_STATUS.UNKNOWN_ERROR,
                "Command failed without producing the expected error report",
                req,
                _session,
                "SessionReqHand");
        }

        // An error occurred but we got an error report to use
        if (result.status !== 0) {
            throw _errors.createFailedCommandEH(
                _errors.FAILED_CMD_STATUS_CODES_NAMES[result.status],
                result.value.message,
                req,
                _session,
                "SessionReqHand");
        }

        // If we arrive here, everything should be fine, birds are singing, the sky is blue
        res.statusCode = 200;
        res.writeJSON(_protoParent.buildSuccessResponseBody.call(this, _session.getId(), result.value));
        res.close();
    },

    _refreshCommand = function(req, res) {
        var successHand = _createOnSuccessHandler(res);

        _session.getCurrentWindow().evaluateAndWaitForLoad(
            function() { window.location.reload(true); }, //< 'reload(true)' force reload from the server
            successHand,
            successHand); //< We don't care if 'forward' fails
    },

    _backCommand = function(req, res) {
        var successHand = _createOnSuccessHandler(res);

        _session.getCurrentWindow().evaluateAndWaitForLoad(
            require("./webdriver_atoms.js").get("back"),
            successHand,
            successHand); //< We don't care if 'forward' fails
    },

    _forwardCommand = function(req, res) {
        var successHand = _createOnSuccessHandler(res);

        _session.getCurrentWindow().evaluateAndWaitForLoad(
            require("./webdriver_atoms.js").get("forward"),
            successHand,
            successHand); //< We don't care if 'forward' fails
    },

    _executeCommand = function(req, res) {
        var postObj = JSON.parse(req.post),
            result;

        if (typeof(postObj) === "object" && postObj.script && postObj.args) {
            result = _session.getCurrentWindow().evaluate(
                require("./webdriver_atoms.js").get("execute_script"),
                postObj.script,
                postObj.args);

            _respondBasedOnResult(req, res, result);
        } else {
            throw _errors.createInvalidReqMissingCommandParameterEH(req);
        }
    },

    _getUrlCommand = function(req, res) {
        // Get the URL at which the Page currently is
        var result = _session.getCurrentWindow().evaluate(
            require("./webdriver_atoms.js").get("execute_script"),
            "return location.toString()",
            []);

        _respondBasedOnResult(req, res, result);
    },

    _postUrlCommand = function(req, res) {
        // Load the given URL in the Page
        var postObj = JSON.parse(req.post),
            maxWaitForOpen = 1000 * 60,     //< a website should take less than 1m to open
            timer;

        if (typeof(postObj) === "object" && postObj.url) {
            // Open the given URL and, when done, return "HTTP 200 OK"
            _session.getCurrentWindow().open(postObj.url, function(status) {
                // Callback received: don't need the timer anymore
                clearTimeout(timer);

                if (status === "success") {
                    res.statusCode = 200;
                    res.closeGracefully();
                } else {
                    _errors.handleInvalidReqInvalidCommandMethodEH(req, res);
                }
            });
            timer = setTimeout(function() {
                // Command Failed (Timed-out)
                _errors.handleFailedCommandEH(
                    _errors.FAILED_CMD_STATUS.TIMEOUT,
                    "URL '"+postObj.url+"' didn't load within "+maxWaitForOpen+"ms",
                    req,
                    res,
                    _session,
                    "SessionReqHand");
            }, 1000 * 60);
        } else {
            throw _errors.createInvalidReqMissingCommandParameterEH(req);
        }
    },

    _windowCloseCommand = function(req, res) {
        // TODO An optional JSON parameter "name" might be given
        _session.closeCurrentWindow();
        res.statusCode = 200;
        res.closeGracefully();
    },

    _windowChangeFocusToCommand = function(req, res) {
        // TODO
        // TODO An optional JSON parameter "name" might be given
    },

    _titleCommand = function(req, res) {
        var result = _session.getCurrentWindow().evaluate(function() { return document.title; });
        res.statusCode = 200;
        res.writeJSON(_protoParent.buildSuccessResponseBody.call(this, _session.getId(), result));
        res.close();
    },

    _elementCommand = function(req, res) {
        // Search for a WebElement on the Page
        var element = _locator.locateElement(JSON.parse(req.post));
        if (element) {
            res.statusCode = 200;
            res.writeJSON(_protoParent.buildSuccessResponseBody.call(this, _session.getId(), element.getJSON()));
            res.close();
            return;
        }

        throw _errors.createInvalidReqVariableResourceNotFoundEH(req);
    };

    // public:
    return {
        handle : _handle,
        setSession : function(s) { _session = s; },
        getSessionId : function() { return _session.getId(); }
    };
};
// prototype inheritance:
ghostdriver.SessionReqHand.prototype = new ghostdriver.RequestHandler();
