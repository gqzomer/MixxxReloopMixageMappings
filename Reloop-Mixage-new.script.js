// Name: Reloop Mixage
// Author: HorstBaerbel
// Version: 1.0.5 needs Mixxx 2.1+

var Mixage = {};

// ----- User-configurable settings -----
Mixage.scratchByWheelTouch = false; // Set to true to scratch by touching the jog wheel instead of having to toggle the disc button. Default is false
Mixage.scratchTicksPerRevolution = 620; // Number of jog wheel ticks that make a full revolution when scratching. Reduce to "scratch more" of the track, increase to "scratch less". Default is 620 (measured)
Mixage.jogWheelScrollSpeed = 2.0; // Scroll speed when the jog wheel is used to scroll through the track. The higher, the faster. Default is 1.0

// ----- Internal variables (don't touch) -----
var ON = 0x7F, OFF = 0x00, DOWN = 0x7F, UP = 0x00;
var QUICK_PRESS = 1, DOUBLE_PRESS = 2;

Mixage.vuMeterConnection = [];
Mixage.beatConnection = [];
Mixage.loopConnection = [];
Mixage.doublePressTimer = 0;
Mixage.beatTimer = 0;
Mixage.beat = false;

Mixage.focusEffect = {
	'[Channel1]': 0,
	'[Channel2]': 0
};

Mixage.scratchToggleState = {
	'[Channel1]': false,
	'[Channel2]': false
};

Mixage.scrollToggleState = {
	'[Channel1]': false,
	'[Channel2]': false
};

Mixage.scratching = {
	'[Channel1]': false,
	'[Channel2]': false
};

Mixage.isBeatMovePressed = {
	'[Channel1]': false,
	'[Channel2]': false
};


Mixage.init = function (id, debugging) {
	// all button LEDs off
	for (var i = 0; i < 255; i++) {
		midi.sendShortMsg(0x90, i, 0);
	}

	Mixage.connectControlsToFunctions("[Channel1]");
	Mixage.connectControlsToFunctions("[Channel2]");

	// make connection for updating the VU meters
	Mixage.vuMeterConnection[0] = engine.makeConnection("[Channel1]", "VuMeter", function (val) {
		midi.sendShortMsg(0x90, 29, val * 7);
	});
	Mixage.vuMeterConnection[1] = engine.makeConnection("[Channel2]", "VuMeter", function (val) {
		midi.sendShortMsg(0x90, 30, val * 7);
	});

	// make connection for showing the beats on the sync button
	Mixage.beatConnection[0] = engine.makeConnection("[Channel1]", "beat_active", function (value) {
		Mixage.toggleLED(value, "[Channel1]", "sync_enabled");
	});
	Mixage.beatConnection[1] = engine.makeConnection("[Channel2]", "beat_active", function (value) {
		Mixage.toggleLED(value, "[Channel2]", "sync_enabled");
	});
	
	// Mixage.beatConnection[2] = engine.makeConnection("[Channel1]", "loop_enabled", function (value) {
	// 	if (value === 1) {
	// 		Mixage.loopConnection[0] = engine.makeConnection("[Channel1]", "beat_active", function (value) {
	// 			if (value === 1) {
	// 				Mixage.beat = !Mixage.beat
	// 				Mixage.toggleLED(Mixage.beat, "[Channel1]", "loop");
	// 			}
	// 		});
	// 	} else {
	// 		Mixage.loopConnection[0].disconnect();
	// 		Mixage.toggleLED(OFF, "[Channel1]", "loop");
	// 	}
	// });

	var numEffectSlots = engine.getValue("[EffectRack1_EffectUnit1]", "num_effects");

	engine.softTakeover("[EffectRack1_EffectUnit1]", "super1", true);
	engine.softTakeover("[EffectRack1_EffectUnit2]", "super1", true);

	for (var i = 1; i < numEffectSlots; i++) {
		var groupString = "[EffectRack1_EffectUnit1_Effect" + i + "]";
		engine.softTakeover(groupString, "meta", true);
	}

	for (var i = 1; i < numEffectSlots; i++) {
		var groupString = "[EffectRack1_EffectUnit2_Effect" + i + "]";
		engine.softTakeover(groupString, "meta", true);
	}
};

Mixage.shutdown = function () {
	Mixage.vuMeterConnection[0].disconnect();
	Mixage.vuMeterConnection[1].disconnect();
	Mixage.beatConnection[0].disconnect();
	Mixage.beatConnection[1].disconnect();
	Mixage.beatConnection[2].disconnect();
	Mixage.connectControlsToFunctions("[Channel1]", true);
	Mixage.connectControlsToFunctions("[Channel2]", true);
	// all button LEDs off
	for (var i = 0; i < 255; i++) {
		midi.sendShortMsg(0x90, i, 0);
	}
};

// Maps channels and their controls to a MIDI control number to toggle their LEDs
Mixage.ledMap = {
	"[Channel1]": {
		"cue_indicator": 0x0A,
		"cue_default": 0x0B,
		"play_indicator": 0x0C,
		"load_indicator": 0x0D,
		"pfl": 0x0E,
		"loop": 0x05,
		"loop_enabled": 0x06,
		"sync_enabled": 0x09,
		"sync_master": 0x07,
		"fx_on": 0x08,
		"fx_sel": 0x07,
		"scratch_active": 0x04,
		"scroll_active": 0x03,
		'rate_temp_up': 0x02,
		'rate_temp_down': 0x01
	},
	"[Channel2]": {
		"cue_indicator": 0x18,
		"cue_default": 0x19,
		"play_indicator": 0x1A,
		"load_indicator": 0x1B,
		"pfl": 0x1C,
		"loop": 0x13,
		"loop_enabled": 0x14,
		"sync_enabled": 0x17,
		"sync_master": 0x15,
		"fx_on": 0x16,
		"fx_sel": 0x15,
		"scratch_active": 0x12,
		"scroll_active": 0x11,
		'rate_temp_up': 0x10,
		'rate_temp_down': 0x0f
	}
};

// Maps mixxx controls to a function that toggles their LEDs
Mixage.connectionMap = {
	"cue_indicator": [function (v, g, c) { Mixage.toggleLED(v, g, c); }, null],
	"cue_default": [function (v, g, c) { Mixage.toggleLED(v, g, c); }, null],
	"play_indicator": [function (v, g, c) { Mixage.handlePlay(v, g, c); }, null],
	"pfl": [function (v, g, c) { Mixage.toggleLED(v, g, c); }, null],
	"loop_enabled": [function (v, g, c) { Mixage.toggleLED(v, g, c); }, null]
};

// Set or remove functions to call when the state of a mixxx control changes
Mixage.connectControlsToFunctions = function (group, remove) {
	remove = (remove !== undefined) ? remove : false;
	for (var control in Mixage.connectionMap) {
		if (remove) {
			Mixage.connectionMap[control][1].disconnect();
		} else {
			Mixage.connectionMap[control][1] = engine.makeConnection(group, control, Mixage.connectionMap[control][0]);
		}
	}
};

// Toggle the LED on the MIDI controller by sending a MIDI message
Mixage.toggleLED = function (value, group, control) {
	midi.sendShortMsg(0x90, Mixage.ledMap[group][control], (value === 1 || value) ? 0x7F : 0);
};

// Toggle the LED on play button and make sure the preview deck stops when starting to play in a deck
Mixage.handlePlay = function (value, group, control) {
	// toggle the play indicator LED
	Mixage.toggleLED(value, group, control);
	// make sure to stop preview deck
	engine.setValue("[PreviewDeck1]", "stop", true);
	// toggle the LOAD button LED for the deck
	Mixage.toggleLED(value, group, "load_indicator");
};

Mixage.handleTraxPress = function (channel, control, value, status, group) {
	if (value == DOWN) {
		if (Mixage.doublePressTimer === 0) { // first press
			Mixage.doublePressTimer = engine.beginTimer(400, function () {
				Mixage.TraxPressCallback(channel, control, value, status, group, QUICK_PRESS);
			}, true);
		} else { // 2nd press (before timer's out)
			engine.stopTimer(Mixage.doublePressTimer);
			Mixage.TraxPressCallback(channel, control, value, status, group, DOUBLE_PRESS);
		}
	}
};

Mixage.handleTraxTurn = function (channel, control, value, status, group) {
	var newValue = value - 64;
	if (control === 0x5E) { // was shift pressed?
		engine.setValue("[Playlist]", "SelectPlaylist", newValue);
	} else {
		engine.setValue("[Playlist]", "SelectTrackKnob", newValue);
	}
};

Mixage.handleTrackLoading = function (channel, control, value, status, group) {
	if (value === DOWN) {
		engine.setValue("[PreviewDeck1]", "stop", true);
		engine.setValue(group, control > 0x1B ? "LoadSelectedTrackAndPlay" : "LoadSelectedTrack", true);
		Mixage.libraryRemainingTime = Mixage.libraryReducedHideTimeout;
	}
};

Mixage.TraxPressCallback = function (channel, control, value, status, group, event) {
	if (event === QUICK_PRESS) {
		if (engine.getValue("[PreviewDeck1]", "play")) {
			engine.setValue("[PreviewDeck1]", "stop", true);
		} else {
			engine.setValue("[PreviewDeck1]", "LoadSelectedTrackAndPlay", true);
		}
	}
	if (event === DOUBLE_PRESS) {
		engine.setValue(group, "maximize_library", !engine.getValue(group, "maximize_library"));
	}
	Mixage.doublePressTimer = 0
};

Mixage.nextEffect = function (channel, control, value, status, group) {
	var unitNr = script.deckFromGroup(group);
	var numEffectSlots = engine.getValue("[EffectRack1_EffectUnit" + unitNr + "]", "num_effects");
	if (value === DOWN) {
		if (Mixage.focusEffect[group] === (numEffectSlots - 1)) {
			Mixage.focusEffect[group] = 0;
			Mixage.toggleLED(0, group, "fx_sel");
			for (var i = 1; i < numEffectSlots; i++) {
				var groupString = "[EffectRack1_EffectUnit" + unitNr + "_Effect" + i + "]";
				engine.softTakeoverIgnoreNextValue(groupString, "meta");
			}
			engine.softTakeoverIgnoreNextValue("[EffectRack1_EffectUnit" + unitNr + "]", "super1");
		} else {
			Mixage.focusEffect[group] += 1;
			Mixage.toggleLED(1, group, "fx_sel");
		}
		engine.setValue("[EffectRack1_EffectUnit" + unitNr + "]", "focused_effect", Mixage.focusEffect[group]);
		engine.setValue("[EffectRack1_EffectUnit" + unitNr + "]", "show_focus", 1);
	}
};

Mixage.handleEffectDryWet = function (channel, control, value, status, group) {
	var unitNr = script.deckFromGroup(group);
	var controlString = "[EffectRack1_EffectUnit" + unitNr + "]";
	var diff = (value - 64) // 16.0;
	if (engine.getValue(controlString, "focused_effect") === 0) {
		var dryWetValue = engine.getValue(controlString, "mix");
		engine.setValue(controlString, "mix", dryWetValue + (diff / 16.0));
	} else {
		engine.setValue("[EffectRack1_EffectUnit" + unitNr + "_Effect" + Mixage.focusEffect[group] + "]", "effect_selector", diff);
	}
};

Mixage.handleDryWetPressed = function (channel, control, value, status, group) {
	var unitNr = script.deckFromGroup(group);
	var effectNum = Mixage.focusEffect[group]
	var numEffectSlots = engine.getValue("[EffectRack1_EffectUnit" + unitNr + "]", "num_effects");
	if (value === DOWN && effectNum != 0) {
		var status = engine.getValue("[EffectRack1_EffectUnit" + unitNr + "_Effect" + effectNum + "]", "enabled");
		engine.setValue("[EffectRack1_EffectUnit" + unitNr + "_Effect" + effectNum + "]", "enabled", !status);
	}
	if (value === DOWN && effectNum === 0) {
		for (var i = 1; i < numEffectSlots; i++) {
			engine.setValue("[EffectRack1_EffectUnit" + unitNr + "_Effect" + i + "]", "enabled", false);
		}
	}
};

Mixage.handleFxAmount = function (channel, control, value, status, group) {
	var unitNr = script.deckFromGroup(group);
	var controlString = "[EffectRack1_EffectUnit" + unitNr + "]";
	if (engine.getValue(controlString, "focused_effect") === 0) {
		engine.setValue("[EffectRack1_EffectUnit" + unitNr + "]", "super1", value / 127);
	} else {
		engine.setValue("[EffectRack1_EffectUnit" + unitNr + "_Effect" + Mixage.focusEffect[group] + "]", "meta", value / 127);
	}
};

// The "disc" button that enables/disables scratching
Mixage.scratchToggle = function (channel, control, value, status, group) {
	// check for pressed->release or released->press
	if (value === DOWN) {
		Mixage.scratchToggleState[group] = !Mixage.scratchToggleState[group];
		Mixage.toggleLED(Mixage.scratchToggleState[group], group, "scratch_active");
		if (Mixage.scrollToggleState[group]) {
			Mixage.scrollToggleState[group] = !Mixage.scrollToggleState[group];
			Mixage.toggleLED(Mixage.scrollToggleState[group], group, "scroll_active");
		}
	}
};

// The "loupe" button that enables/disables track scrolling
Mixage.scrollToggle = function (channel, control, value, status, group) {
	// check for pressed->release or released->press
	if (value === DOWN) {
		Mixage.scrollToggleState[group] = !Mixage.scrollToggleState[group];
		Mixage.toggleLED(Mixage.scrollToggleState[group], group, "scroll_active");
		if (Mixage.scratchToggleState[group]) {
			Mixage.scratchToggleState[group] = !Mixage.scratchToggleState[group];
			Mixage.toggleLED(Mixage.scratchToggleState[group], group, "scratch_active");
		}
	}
};

// The touch function on the wheels that enables/disables scratching
Mixage.wheelTouch = function (channel, control, value, status, group) {
	var unitNr = script.deckFromGroup(group);
	// check if scratching should be enabled
	if (Mixage.scratchByWheelTouch || Mixage.scratchToggleState[group]) {
		if (value === DOWN) {
			// turn on scratching on this deck
			var alpha = 1.0 / 8.0;
			var beta = alpha / 32.0;
			engine.scratchEnable(unitNr, Mixage.scratchTicksPerRevolution, 33.33, alpha, beta);
			Mixage.scratching[group] = true
		} else {
			engine.scratchDisable(unitNr);
			Mixage.scratching[group] = false
		}
	}
};

// The wheel that controls the scratching / jogging
Mixage.wheelTurn = function (channel, control, value, status, group) {
	// calculate deck number from MIDI control. 0x24 controls deck 1, 0x25 deck 2
	var deckNr = script.deckFromGroup(group);
	// only enable wheel if functionality has been enabled
	if (Mixage.scratchByWheelTouch || Mixage.scratchToggleState[group] || Mixage.scrollToggleState[group]) {
		// control centers on 0x40 (64), calculate difference to that value
		var newValue = value - 64;
		if (Mixage.scrollToggleState[group]) { // scroll deck
			var currentPosition = engine.getValue(group, "playposition");
			var speedFactor = 0.00005;
			engine.setValue(group, "playposition", currentPosition + speedFactor * newValue * Mixage.jogWheelScrollSpeed);
		} else if (Mixage.scratching[group]) {
			engine.scratchTick(deckNr, newValue); // scratch deck
		} else {
			engine.setValue(group, "jog", newValue); // pitch bend deck
		}
	}
};

Mixage.handleBeatMove = function (channel, control, value, status, group) {
	// control centers on 0x40 (64), calculate difference to that
	var diff = (value - 64);
	var position = diff > 0 ? "beatjump_forward" : "beatjump_backward";
	engine.setValue(group, position, true);
};

Mixage.handleBeatMovePressed = function (channel, control, value, status, group) {
	Mixage.isBeatMovePressed[group] = value === DOWN ? true : false;
};

Mixage.handleLoopLength = function (channel, control, value, status, group) {
	// control centers on 0x40 (64), calculate difference to that
	var diff = (value - 64);
	if (Mixage.isBeatMovePressed[group]) {
		var beatjumpSize = engine.getParameter(group, "beatjump_size");
		var newBeatJumpSize = diff > 0 ? 2 * beatjumpSize : beatjumpSize / 2;
		engine.setParameter(group, "beatjump_size", newBeatJumpSize);
	} else {
		var loopScale = diff > 0 ? "loop_double" : "loop_halve";
		engine.setValue(group, loopScale, true);
	}
};

// The PAN rotary control used here for panning the master
Mixage.handlePan = function (channel, control, value, status, group) {
	// control centers on 0x40 (64), calculate difference to that value and scale down
	var diff = (value - 64) / 16.0;
	var mixValue = engine.getValue("[Master]", "balance");
	engine.setValue("[Master]", "balance", mixValue + diff);
};