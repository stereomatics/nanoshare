
var DSPSampleRate = 44100;
var DSPOutputBufferSize = 1024;
var DSPBufferSize = DSPSampleRate * 1.5;
var DSPPrebufferSize = DSPSampleRate * 0.5;

function DSP() {
  this.sampleRate = 44100;
  this.renderSamples = new Float64Array(DSPBufferSize);
  this.renderReadPos = 0;
  this.renderWritePos = 0;
  this.resampleStep = 0;
  this.resampleAcc = 0;
  this.resampleSample = 0;

  this.active = false;
  this.paintScheduled = false;
  this.prebuffering = false;

  this.brandLeft = document.getElementById('brand-left');
  this.brandRight = document.getElementById('brand-right');
  this.streamBufferLength = document.getElementById('streamBufferLength');

  this.canvas = document.getElementById('osc');
  this.WIDTH = this.canvas.width;
  this.HEIGHT = this.canvas.height;

  this.scopeSamples = new Float64Array(1024*16);
  this.reset();

  this.schedulePaint();
  {
    var check = false;
    (function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4)))check = true})(navigator.userAgent||navigator.vendor||window.opera);
    this.isMobileWeb = check;
  }
}

DSP.prototype.writeSamples = function(samples, inputSampleRate) {
  if (this.resampleInputRate != inputSampleRate) {
//     var inputBufferSize = Math.floor(DSPOutputBufferSize * inputSampleRate / this.context.sampleRate);
//     this.inputBuffer = new Float64Array(inputBufferSize);
//     this.resampler = new Resampler(inputSampleRate, this.context.sampleRate, 1, this.inputBuffer);
    this.resampleStep = inputSampleRate / this.context.sampleRate;
    this.resampleInputRate = inputSampleRate;
  }
  var inputLength = samples.length;
  for (var inputPos = 0; inputPos < inputLength; inputPos++) {
    var sampleB = samples[inputPos];
    var sampleA = this.resampleSample;
    while (this.resampleAcc < 1.0) {
      var resampledSample = (1.0 - this.resampleAcc) * sampleA + this.resampleAcc * sampleB;
      this.renderSamples[this.renderWritePos] = resampledSample;
      this.renderWritePos = (this.renderWritePos + 1) % DSPBufferSize;
      if (this.renderReadPos == this.renderWritePos) {
        this.renderReadPos = (this.renderWritePos - DSPPrebufferSize + DSPBufferSize) % DSPBufferSize;
      }

      this.resampleAcc += this.resampleStep;
    }
    this.resampleAcc -= 1.0;
    this.resampleSample = sampleB;
  }
  if (this.renderSamplesLeft() >= DSPPrebufferSize) {
    this.prebuffering = false;
  }
//   var inputPos = 0;
//   while (true) {
//     var inputBlockLength = Math.min(inputLength - inputPos, this.inputBuffer.length);
//     for (var i = 0; i < inputBlockLength; i++) {
//       this.inputBuffer[i] = samples[inputPos++];
//     }
//     var resampledSamplesLength = this.resampler.resampler(inputBlockLength);
//     var resampledSamples = this.resampler.outputBuffer;
//     for (var i = 0; i < resampledSamplesLength; i++) {
//       this.renderSamples[this.renderWritePos] = resampledSamples[i];
//       this.renderWritePos = (this.renderWritePos + 1) % DSPBufferSize;
//       if (this.renderReadPos == this.renderWritePos) {
//         this.renderReadPos = (this.renderWritePos - DSPPrebufferSize + DSPBufferSize) % DSPBufferSize;
//       }
//     }
//     if (this.renderSamplesLeft() >= DSPPrebufferSize) {
//       this.prebuffering = false;
//     }
//     if (inputPos >= inputLength) {
//       break;
//     }
//   }
  console.log("Recv Buffer: " + this.renderSamplesLeft());
}

DSP.prototype.renderSamplesLeft = function() {
  return (this.renderWritePos - this.renderReadPos + DSPBufferSize) % DSPBufferSize;
}

DSP.prototype.checkContext = function() {
  if (this.context) {
    return;
  }
  this.context = new (window.AudioContext || window.webkitAudioContext)();
  this.node = this.context.createScriptProcessor(DSPOutputBufferSize, 1, 2);
  this.node.onaudioprocess = this.process.bind(this);

  this.start();
}

DSP.prototype.start = function() {
  if (this.active) {
    return;
  }
  this.checkContext();
  this.active = true;
  this.prebuffering = true;
  this.node.connect(this.context.destination);
  this.schedulePaint();
}

DSP.prototype.stop = function() {
  if (!this.active) {
    return;
  }
  this.active = false;
  this.prebuffering = false;
  this.node.disconnect();
  this.reset();
}

DSP.prototype.isActive = function() {
  return this.active;
}

DSP.prototype.isPrebuffering = function() {
  return this.prebuffering;
}

DSP.prototype.reset = function() {
  for (var i = 0; i < this.renderSamples.length; i++) {
    this.renderSamples[i] = 0.0;
  }
  this.resampleInputRate = 0;
  this.resampler = null;
  this.renderReadPos = 0;
  this.renderWritePos = 0;
  for (var i = 0; i < this.scopeSamples.length; i++) {
    this.scopeSamples[i] = 0.0;
  }
  this.scopeWritePos = 0;
  this.scopeWritePos = 0;
  this.probeAcc = 0;
  this.probeA = 0;
  this.probeB = 0;
  this.bufferLogNumber = 0;
}

DSP.prototype.schedulePaint = function() {
  if (this.paintScheduled) {
    return;
  }
  this.paintScheduled = true;
  window.setTimeout(this.visualize.bind(this), 1000 / 60);
}

DSP.prototype.process = function(e) {
  if (!this.context) {
    return;
  }
  var L = e.outputBuffer.getChannelData(0);
  var R = e.outputBuffer.getChannelData(1);
  var sample = [0.0, 0.0];

  this.sampleRate = this.context.sampleRate;
  this.invSampleRate = 1.0 / this.sampleRate;
  this.probeSlope = 10.2 * this.invSampleRate;
  for (var i = 0; i < L.length; i++) {
    if (this.prebuffering) {
      L[i] = 0.0;
      R[i] = 0.0;
      continue;
    }
    if (this.renderReadPos == this.renderWritePos) {
      this.prebuffering = true;
      L[i] = 0.0;
      R[i] = 0.0;
      continue;
    }

    var renderSample = this.renderSamples[this.renderReadPos];
    sample[0] = renderSample;
    sample[1] = renderSample;
    this.renderReadPos = (this.renderReadPos + 1) % DSPBufferSize;

    L[i] = sample[0];
    R[i] = sample[1];

    var scopeSample = (sample[0] + sample[1]) * 0.5;
    var probeSample = Math.tanh(scopeSample * 20000.0) / 1.3;

    this.probeAcc += this.probeSlope;
    if (this.probeAcc >= 1.0) {
      this.probeAcc -= 1.0;
    }
    var probeFalloff = 0.001;
    this.probeA = this.probeA * (1.0 - probeFalloff) + Math.cos(this.probeAcc * Math.PI * 2) * probeSample * probeFalloff;
    this.probeB = this.probeB * (1.0 - probeFalloff) + Math.sin(this.probeAcc * Math.PI * 2) * probeSample * probeFalloff;

    this.scopeSamples[this.scopeWritePos] = scopeSample;
    this.scopeWritePos++;
    if (this.scopeWritePos >= this.scopeSamples.length) {
      this.scopeWritePos = 0;
    }
  }
};


DSP.prototype.visualize = function() {
  this.paintScheduled = false;
  this.canvas.width = this.WIDTH;
  this.canvas.height = this.HEIGHT;
  var c = this.canvas.getContext('2d');
  c.lineWidth = 2;
  c.beginPath();

  var step = this.isMobileWeb ? 4 : 1;
  var sx = 0.68;
  var viewportPeriod = this.WIDTH / sx;
  var oscPeriod = 0; // this.sampleRate / this.oscFreq;
  var oscOffset = -viewportPeriod / 2; // oscPeriod * (-0.0 - this.oscAcc);
  var ox = Math.floor(oscOffset + viewportPeriod * 0.5 - oscPeriod * 1.5);
  var pxWidth = Math.floor(this.WIDTH / sx);
  for (var i = 0; i < pxWidth; i+=step) {
    var value = this.scopeSamples[(this.scopeWritePos - i - 1 + ox + this.scopeSamples.length) % this.scopeSamples.length];
    var height = this.HEIGHT * (value * 0.5 + 0.5);
    var offset = this.HEIGHT - height - 1;
    if (i == 0) {
      c.moveTo(this.WIDTH - i * sx, offset);
    }
    c.lineTo(this.WIDTH - i * sx, offset);
  }
  c.stroke();

  this.brandLeft.style.left = -130 * 0.5 * this.probeA + "px";
  this.brandLeft.style.top = -200 * 0.5 * this.probeB + "px";
  this.brandRight.style.left = 130 * 0.5 * this.probeB + "px";
  this.brandRight.style.top = 200 * 0.5 * this.probeA + "px";
  this.bufferLogNumber = (this.bufferLogNumber + 1) % 6;
  if (this.bufferLogNumber == 0) {
    this.streamBufferLength.innerHTML = "" + this.renderSamplesLeft();
  }

  if (this.active) {
    this.schedulePaint();
  }
}


