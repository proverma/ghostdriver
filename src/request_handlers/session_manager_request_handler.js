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

ghostdriver.SessionManagerReqHand = function() {
    // private:
    var
    _protoParent = ghostdriver.SessionManagerReqHand.prototype,
    _sessions = {}, //< will store key/value pairs like 'SESSION_ID : SESSION_OBJECT'
    _sessionRHs = {},
    _errors = require("./errors.js"),

    _handle = function(req, res) {
        _protoParent.handle.call(this, req, res);

        if (req.urlParsed.file === "session" && req.method === "POST") {
            _createAndRedirectToNewSessionCommand(req, res);
            return;
        } else if (req.urlParsed.file === "sessions" && req.method === "GET") {
            _listActiveSessionsCommand(req, res);
            return;
        } else if (req.urlParsed.directory === "/session/") {
            if (req.method === "GET") {
                _getSessionCapabilitiesCommand(req, res);
            } else if (req.method === "DELETE") {
                _deleteSessionCommand(req, res);
            }
            return;
        }

        throw _errors.createInvalidReqInvalidCommandMethodEH(req);
    },

    _createAndRedirectToNewSessionCommand = function(req, res) {
        var desiredCapabilities = req.post || {},
            newSession;

        if (typeof(desiredCapabilities) !== "object") {
            desiredCapabilities = JSON.parse(desiredCapabilities);
        }

        // Create and store a new Session
        newSession = new ghostdriver.Session(desiredCapabilities);
        _sessions[newSession.getId()] = newSession;

        // Redirect to the newly created Session
        res.statusCode = 303; //< "303 See Other"
        res.setHeader("Location", "/session/"+newSession.getId());
        res.closeGracefully();

        // TODO Capabilities not provided - Handle error case
    },

    _listActiveSessionsCommand = function(req, res) {
        var activeSessions = [],
            sessionId;

        res.statusCode = 200;

        // Create array of format '[{ "id" : SESSION_ID, "capabilities" : SESSION_CAPABILITIES_OBJECT }]'
        for (sessionId in _sessions) {
            activeSessions.push({
                "id" : sessionId,
                "capabilities" : _sessions[sessionId].getCapabilities()
            });
        }

        res.writeJSON(_protoParent.buildSuccessResponseBody.call(this, null, activeSessions));
        res.close();
    },

    _deleteSession = function(sessionId) {
        if (typeof(_sessions[sessionId]) !== "undefined") {
            // Prepare the session to be deleted
            _sessions[sessionId].aboutToDelete();
            // Delete the session and the handler
            delete _sessions[sessionId];
            delete _sessionRHs[sessionId];
        }
    },

    _deleteSessionCommand = function(req, res) {
        var sId = req.urlParsed.file;

        if (sId === "")
            throw _errors.createInvalidReqMissingCommandParameterEH(req);

        if (typeof(_sessions[sId]) !== "undefined") {
            _deleteSession(sId);
            res.statusCode = 200;
            res.closeGracefully();
        } else {
            throw _errors.createInvalidReqVariableResourceNotFoundEH(req);
        }
    },

    _getSessionCapabilitiesCommand = function(req, res) {
        var sId = req.urlParsed.file,
            session;

        if (sId === "")
            throw _errors.createInvalidReqMissingCommandParameterEH(req);

        session = _getSession(sId);
        if (session !== null) {
            res.statusCode = 200;
            res.writeJSON(_protoParent.buildSuccessResponseBody.call(this, sId, _sessions[sId].getCapabilities()));
            res.close();
        } else {
            throw _errors.createInvalidReqVariableResourceNotFoundEH(req);
        }
    },

    _getSession = function(sessionId) {
        if (typeof(_sessions[sessionId]) !== "undefined") {
            return _sessions[sessionId];
        }
        return null;
    },

    _getSessionReqHand = function(sessionId) {
        if (_getSession(sessionId) !== null) {
            // The session exists: what about the relative Session Request Handler?
            if (typeof(_sessionRHs[sessionId]) === "undefined") {
                _sessionRHs[sessionId] = new ghostdriver.SessionReqHand(_getSession(sessionId));
            }
            return _sessionRHs[sessionId];
        }
        return null;
    },

    _cleanupWindowlessSessions = function() {
        var sId;

        // Do this cleanup only if there are sessions
        if (Object.keys(_sessions).length > 0) {
            console.log("Asynchronous Sessions cleanup phase starting NOW");
            for (sId in _sessions) {
                if (_sessions[sId].getWindowsCount() === 0) {
                    console.log("About to delete Session '"+sId+"', because windowless...");
                    _deleteSession(sId);
                    console.log("... deleted!");
                }
            }
        }
    };

    // Regularly cleanup un-used sessions
    setInterval(_cleanupWindowlessSessions, 60000); //< every 60s

    // public:
    return {
        handle : _handle,
        getSession : _getSession,
        getSessionReqHand : _getSessionReqHand
    };
};
// prototype inheritance:
ghostdriver.SessionManagerReqHand.prototype = new ghostdriver.RequestHandler();
