/**
 * Records a voice message through com.webos.service.mediarecorder.
 *
 * The service works in steps: open gives a recorderId, setOutputFile names the folder, start
 * records, stop returns the file path, close frees the recorder. It writes M4A (AAC) only, and only
 * under /media/internal/ or /tmp/.
 *
 * `call(method, params, done)` sends one request and calls done(error, response); the view passes a
 * Luna call, the tests a fake.
 */

var OUTPUT_DIR = "/media/internal/.im-attachments/";

function VoiceRecorder(call) {
    this.call = call;
    this.recorderId = null;
    this.state = "idle";        // idle | starting | recording | stopping
    this.cancelled = false;
}

function failed(response) {
    return !response || response.returnValue === false;
}

function errorOf(error, response) {
    return error || (response && (response.errorText || response.errorMessage)) || "recorder error";
}

VoiceRecorder.prototype.isBusy = function () {
    return this.state !== "idle";
};

/** done(error) once recording runs, or with the reason it could not start. */
VoiceRecorder.prototype.start = function (done) {
    var self = this;
    if (this.state !== "idle") {
        done("already recording");
        return;
    }
    this.state = "starting";
    this.cancelled = false;

    function fail(error, response) {
        self.release();
        done(errorOf(error, response));
    }

    this.call("open", { audio: true }, function (error, response) {
        if (error || failed(response) || response.recorderId === undefined) {
            fail(error, response);
            return;
        }
        self.recorderId = response.recorderId;
        // Cancelled while opening: give the recorder back without recording.
        if (self.cancelled) {
            fail("cancelled");
            return;
        }
        var id = { recorderId: self.recorderId };
        self.call("setOutputFile", { recorderId: self.recorderId, path: OUTPUT_DIR }, function (error, response) {
            if (error || failed(response) || self.cancelled) {
                fail(self.cancelled ? "cancelled" : error, response);
                return;
            }
            self.call("start", id, function (error, response) {
                if (error || failed(response)) {
                    fail(error, response);
                    return;
                }
                self.state = "recording";
                if (self.cancelled) {
                    self.cancel();
                    done("cancelled");
                    return;
                }
                done(null);
            });
        });
    });
};

/** done(error, path) with the recorded file. */
VoiceRecorder.prototype.stop = function (done) {
    var self = this;
    if (this.state !== "recording") {
        done("not recording");
        return;
    }
    this.state = "stopping";
    this.call("stop", { recorderId: this.recorderId }, function (error, response) {
        var path = response && response.path;
        self.release();
        if (error || failed(response) || !path) {
            done(errorOf(error, response));
            return;
        }
        done(null, path);
    });
};

/** Stops without keeping the result; safe to call in any state. */
VoiceRecorder.prototype.cancel = function () {
    if (this.state === "starting") {
        // start() sees the flag at its next step and closes the recorder itself.
        this.cancelled = true;
        return;
    }
    if (this.state === "recording") {
        var self = this;
        this.state = "stopping";
        this.call("stop", { recorderId: this.recorderId }, function () {
            self.release();
        });
    }
};

/** Closes the recorder, if one is open, and goes back to idle. */
VoiceRecorder.prototype.release = function () {
    if (this.recorderId !== null) {
        this.call("close", { recorderId: this.recorderId }, function () {});
    }
    this.recorderId = null;
    this.state = "idle";
};

VoiceRecorder.OUTPUT_DIR = OUTPUT_DIR;

module.exports = VoiceRecorder;
