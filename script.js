

function guid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
    s4() + '-' + s4() + s4() + s4();
}

function decimalToHex(d, padding) {
    var hex = Number(d).toString(16);
    padding = typeof (padding) === "undefined" || padding === null ? padding = 2 : padding;
    while (hex.length < padding) {
        hex = "0" + hex;
    }
    return hex;
}

var Base64 = {
    _keyStr: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
    decode: function(e) {
        var outputLength = Math.trunc(e.length * 3 / 4);
        var output = new Uint8Array(outputLength);
        var outputPos = 0;
        var n, r, i;
        var s, o, u, a;
        var f = 0;
        e = e.replace(/[^A-Za-z0-9+/=]/g, "");
        while (f < e.length) {
            s = this._keyStr.indexOf(e.charAt(f++));
            o = this._keyStr.indexOf(e.charAt(f++));
            u = this._keyStr.indexOf(e.charAt(f++));
            a = this._keyStr.indexOf(e.charAt(f++));
            n = s << 2 | o >> 4;
            r = (o & 15) << 4 | u >> 2;
            i = (u & 3) << 6 | a;
            output[outputPos++] = n;
            if (u != 64) {
                output[outputPos++] = r;
            }
            if (a != 64) {
                output[outputPos++] = i;
            }
        }
        if (outputPos < output.length) {
            return output.subarray(0, outputPos);
        }
        return output;
    },
}





var config = {
//    apiKey: "apiKey",
    authDomain: "nanoshare.firebaseapp.com",
    databaseURL: "https://nanoshare-56e5b.firebaseio.com/",
    storageBucket: "gs://nanoshare-56e5b.appspot.com"
};
firebase.initializeApp(config);

// Get a reference to the database service
var remoteDatabase = firebase.database();


var StreamBlockCount = 8;
var StreamSampleBitDepth = 8;
var StreamSampleScale = 1.0 / (1 << (StreamSampleBitDepth - 1));
var StreamClientRegisterPeriodMillis = 1000;

var ready = false;
var metadata;
var deviceId;
var paramDefs;
var params;
var clientId = guid();
var editNumber = 0;
var streamActive = false;
var streamNextBlock = 0;
var streamBlockSamples = [];
var streamHandlers = [];
var streamAwaitingPrebuffer = false;
var streamClientRegisterScheduled = false;
var streamClientRegisterEpoch = 0;
var dsp = new DSP();

remoteDatabase.ref('/metadata').once('value').then(function(snapshot) {
    console.log("Fetched metadata.");
    metadata = snapshot.val();
    deviceId = metadata.deviceId;
    remoteDatabase.ref('/devices/' + deviceId + "/paramDefs").once('value').then(function(snapshot) {
        console.log("Fetched parameter definitions.");
        paramDefs = snapshot.val();
        onReady();
    });
});

function onReady() {
    // Observe parameters.
    var priorityParameters = [
      "^Filter1Cutoff$",
      "^Filter1Resonance$",
      "^Filter1EnvelopeAmount$",
      "^FilterDrive$",
      "^OscPitch$",
      "^Osc1Shape$",
      "^Osc1Voices$",
      "^Osc1LocalDetune$",
      "^Osc1Pitch$",
      "^Osc2Shape$",
      "^Osc2Voices$",
      "^Osc2LocalDetune$",
      "^Osc2Pitch$",
      "^MasterVolume$",
      "^Filter",
      "^Osc",
    ];
    params = {};
    var visitedParameters = {};
    for (var pattern in priorityParameters) {
        var regexp = new RegExp(priorityParameters[pattern]);
        for (var parameterName in paramDefs) {
            if (visitedParameters[parameterName] || !parameterName.match(regexp)) {
                continue;
            }
            createSlider(parameterName);
            visitedParameters[parameterName] = true;
        }
    }

    var muteButtonElement = document.getElementById('muteButton');
    muteButtonElement.addEventListener("click", function(e) {
        if (streamActive) {
            stopAudioStream();
        } else {
            startAudioStream();
        }
        updateMuteButton();
    });
    updateMuteButton();

    ready = true;
    console.log("Ready");
}

function updateMuteButton() {
    var muteButtonIconElement = document.getElementById('muteButtonIcon');
    var unmuteButtonIconElement = document.getElementById('unmuteButtonIcon');
    unmuteButtonIconElement.style.display = streamActive ? "" : "none";
    muteButtonIconElement.style.display = streamActive ? "none" : "";
}

function createSlider(parameterName) {
    var paramDef = paramDefs[parameterName];
    if (!paramDef) {
        return;
    }

    var paramContainerElement = document.getElementById('paramContainer');

    var sliderOuterElement = document.createElement('tr');
    paramContainerElement.appendChild(sliderOuterElement);
    var rightCellElement = document.createElement('td');
    var midCellElement = document.createElement('td');
    var leftCellElement = document.createElement('td');
    sliderOuterElement.appendChild(rightCellElement);
    sliderOuterElement.appendChild(midCellElement);
    sliderOuterElement.appendChild(leftCellElement);

    var labelElement = document.createElement('span');
    labelElement.innerHTML = parameterName;
    rightCellElement.appendChild(labelElement);
    var sliderElement = document.createElement('input');
    sliderElement.type = 'range';
    sliderElement.style.width = "200px";
    sliderElement.style.height = "40px";
    midCellElement.appendChild(sliderElement);
    var valueTextElement = document.createElement('span');
    leftCellElement.appendChild(valueTextElement);

    var param = {
        value: 0.0,
        remoteValue: 0.0,
        isEdit: false,
        editStart: 0.0,
        editValue: 0.0,
        editId: "",
        isDrag: false,
        editScheduled: false,
        updatePromise: Promise.resolve(null),
        sliderElement: sliderElement,
        valueTextElement: valueTextElement,
    };
    params[parameterName] = param;

    sliderElement.addEventListener("mousedown", function(e) {
        param.isDrag = true;
    });
    sliderElement.addEventListener("mouseup", function(e) {
        param.isDrag = false;
        if (param.isEdit) {
            var value = fromNormalizedParameterValue(param.sliderElement.value / 100, paramDef);
            endLocalEditParameter(parameterName, value);
        }
    });
    sliderElement.addEventListener("touchstart", function(e) {
        param.isDrag = true;
    });

    sliderElement.addEventListener("touchend", function(e) {
        param.isDrag = false;
        if (param.isEdit) {
            var value = fromNormalizedParameterValue(param.sliderElement.value / 100, paramDef);
            endLocalEditParameter(parameterName, value);
        }
    });

    sliderElement.addEventListener("touchcancel", function(e) {
        param.isDrag = false;
        if (param.isEdit) {
            var value = fromNormalizedParameterValue(param.sliderElement.value / 100, paramDef);
            endLocalEditParameter(parameterName, value);
        }
    });

//    sliderElement.addEventListener("touchmove", this.touchMove.bind(this), false);

    sliderElement.addEventListener("input", function(e) {
        var value = fromNormalizedParameterValue(param.sliderElement.value / 100, paramDef);
        if (!param.isDrag) {
            param.valueTextElement.innerHTML = "" + value;
            completeLocalEditParameter(parameterName, value);
        } else {
            if (!param.isEdit) {
                beginLocalEditParameter(parameterName, value);
            } else {
                param.valueTextElement.innerHTML = "" + value;
                if (!param.editScheduled) {
                    param.editScheduled = true;
                    param.updatePromise.then(function() {
                        param.editScheduled = false;
                        if (!param.isEdit) {
                            return;
                        }
                        var nextValue = fromNormalizedParameterValue(param.sliderElement.value / 100, paramDef);
                        param.valueTextElement.innerHTML = "" + nextValue;
                        localEditParameter(parameterName, nextValue);
                    });
                }
            }
        }
    });

    var jsonPath = '/devices/' + deviceId + "/params/" + parameterName;
    console.log("Observing " + jsonPath);
    remoteDatabase.ref(jsonPath).on('value', function(snapshot) {
        updateParameterRemoteValue(parameterName, snapshot.val().editValue);
    });
}

function updateParameterValue(param) {
    if (param.isEdit) {
        param.value = param.editValue;
    } else {
        param.value = param.remoteValue;
    }
}

function updateParameterRemoteValue(parameterName, value) {
    var param = params[parameterName];
    var paramDef = paramDefs[parameterName];
    if (!param || !paramDef) {
        return;
    }
    console.log(parameterName + ": RemoteValue to " + value);
    param.remoteValue = value;
    updateParameterValue(param);
    if (!param.isEdit) {
        param.sliderElement.value = Math.max(0.0, Math.min(1.0, toNormalizedParameterValue(value, paramDef))) * 100;
        param.valueTextElement.innerHTML = "" + value;
    }
}

function toNormalizedParameterValue(value, paramDef) {
    var interval = paramDef.maxValue - paramDef.minValue;
    if (interval == 0.0) {
        return 0.0;
    }
    return (value - paramDef.minValue) / interval;
}

function fromNormalizedParameterValue(value, paramDef) {
    var interval = paramDef.maxValue - paramDef.minValue;
    if (interval == 0.0) {
        return param.minValue;
    }
    return (1.0 - value) * paramDef.minValue + value * paramDef.maxValue;
}

function beginLocalEditParameter(parameterName, value) {
    var param = params[parameterName];
    var paramDef = paramDefs[parameterName];
    if (!param || !paramDef) {
        return;
    }
    if (param.isEdit) {
        return;
    }
    var newEditNumber = editNumber++;
    var editId = clientId + "_" + decimalToHex(newEditNumber, 16);
    param.isEdit = true;
    param.editStart = param.value;
    param.editValue = value;
    param.editId = editId;
    updateParameterValue(param);

    var editNode = {
        "device": deviceId,
        "param": parameterName,
        "precommit": false,
        "committed": false,
        "editValue": value,
    };
    var jsonPath = "/edits/" + editId;
    // __PUT
    param.updatePromise = putRemoteData(jsonPath, editNode);
}

function localEditParameter(parameterName, value) {
    var param = params[parameterName];
    var paramDef = paramDefs[parameterName];
    if (!param || !paramDef) {
        return;
    }
    if (!param.isEdit) {
        return;
    }
    param.editValue = value;

    var editNode = {
        "editValue": value,
    };
    var jsonPath = "/edits/" + param.editId;
    // __PATCH
    param.updatePromise = patchRemoteData(jsonPath, editNode);
}

function endLocalEditParameter(parameterName, value) {
    var param = params[parameterName];
    var paramDef = paramDefs[parameterName];
    if (!param || !paramDef) {
        return;
    }
    if (!param.isEdit) {
        return;
    }
    param.isEdit = false;
    updateParameterValue(param);

    var editNode = {
        "editValue": value,
        "precommit": true,
    };
    var jsonPath = "/edits/" + param.editId;
    // __PATCH
    param.updatePromise.then(function() {
        param.updatePromise = patchRemoteData(jsonPath, editNode);
    });
}

function completeLocalEditParameter(parameterName, value) {
    var param = params[parameterName];
    var paramDef = paramDefs[parameterName];
    if (!param || !paramDef) {
        return;
    }
    if (param.isEdit) {
        return;
    }
    var newEditNumber = editNumber++;
    var editId = clientId + "_" + decimalToHex(newEditNumber, 16);
    param.editValue = value;
    param.editId = "";
    updateParameterValue(param);

    var editNode = {
        "device": deviceId,
        "param": parameterName,
        "precommit": true,
        "committed": false,
        "editValue": value,
    };
    var jsonPath = "/edits/" + editId;
    // __PUT
    param.updatePromise = putRemoteData(jsonPath, editNode);
}


function patchRemoteData(jsonPath, jsonObject) {
    console.log("PATCH: %s: %s", jsonPath, JSON.stringify(jsonObject));
    return remoteDatabase.ref(jsonPath).update(jsonObject);
}

function putRemoteData(jsonPath, jsonObject) {
    console.log("PUT: %s: %s", jsonPath, JSON.stringify(jsonObject));
    return remoteDatabase.ref(jsonPath).set(jsonObject);
}

function deleteRemoteData(jsonPath, jsonObject) {
    console.log("DELETE: %s", jsonPath);
    return remoteDatabase.ref(jsonPath).remove();
}


function startAudioStream() {
    if (streamActive) {
        return;
    }
    streamActive = true;
    dsp.start();
    streamBlockSamples = [];
    streamHandlers = [];
    streamClientRegisterEpoch = 0;
    for (var i = 0; i < StreamBlockCount; i++) {
        streamBlockSamples.push(null);
        streamHandlers.push({});
        observeAudioStreamBlock(i);
    }
    scheduleStreamClientRegistration(true);
}

function pushAudioSamplesFromBlocks() {
    while (streamBlockSamples[streamNextBlock]) {
        dsp.writeSamples(streamBlockSamples[streamNextBlock].samples, metadata.sampleRate);
        streamBlockSamples[streamNextBlock] = null;
        streamNextBlock = (streamNextBlock + 1) % streamBlockSamples.length;
    }
}

function observeAudioStreamBlock(index) {
    var started = false;
    var jsonPath = "/soundBuffer/block" + index;
    console.log("Observing " + jsonPath);
    streamHandlers[index].valueHandler = remoteDatabase.ref(jsonPath).on('value', function(snapshot) {
        if (!started) {
            // Ignore first update. It downloads the existing block.
            started = true;
            return;
        }
        // Decode samples.
        var block = snapshot.val();
        if (!block || !block.samples || block.number === undefined) {
            return;
        }
        var blockNumber = block.number;
        var byteArray = Base64.decode(block.samples);
        var intArray = new Int8Array(byteArray);
        var samplesArray = new Float64Array(intArray.length);
        for (var i = 0; i < samplesArray.length; i++) {
            samplesArray[i] = intArray[i] * StreamSampleScale;
        }
        streamBlockSamples[index] = {
            number: blockNumber,
            samples: samplesArray,
        };

        // Flush stale blocks.
        if (dsp.isPrebuffering()) {
            if (!streamAwaitingPrebuffer) {
                streamAwaitingPrebuffer = true;
                for (var i = 0; i < streamBlockSamples.length; i++) {
                    if (streamBlockSamples[i] && ((streamBlockSamples[i].number - blockNumber + 0xFFFFFFFF) % 0xFFFFFFFF) >= streamBlockSamples.length) {
                        streamBlockSamples[i] = null;
                    }
                }
            }
        } else {
            streamAwaitingPrebuffer = false;
        }

        pushAudioSamplesFromBlocks();
    });
    streamHandlers[index].removedHandler = remoteDatabase.ref(jsonPath).on('child_removed', function(snapshot) {
        streamBlockSamples[index] = null;
    });
}

function stopAudioStream() {
    if (!streamActive) {
        return;
    }
    streamActive = false;
    dsp.stop();
    for (var index = 0; index < streamHandlers.length; index++) {
        var jsonPath = "/soundBuffer/block" + index;
        console.log("Stop observing " + jsonPath);
        remoteDatabase.ref(jsonPath).off('value', streamHandlers[index].valueHandler);
        remoteDatabase.ref(jsonPath).off('child_removed', streamHandlers[index].removedHandler);
    }
    streamHandlers = [];
    streamBlockSamples = [];
}

function scheduleStreamClientRegistration(now) {
    if (!streamActive || streamClientRegisterScheduled) {
        return;
    }
    streamClientRegisterScheduled = true;
    setTimeout(function() {
        streamClientRegisterScheduled = false;
        var jsonPath = "/soundBufferClients/" + clientId;
        if (!streamActive) {
            // __DELETE
            deleteRemoteData(jsonPath);
            return;
        }
        var epoch = streamClientRegisterEpoch++;
        var clientNode = {
            "epoch": epoch,
        };
        // __PUT
        putRemoteData(jsonPath, clientNode);
        scheduleStreamClientRegistration();
    }, now ? 0 : StreamClientRegisterPeriodMillis);
}

