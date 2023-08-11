// Name: Reloop Mixage
// Author: Bim Overbohm
// Version: 1.0.1, needs Mixxx 2.1+

var Mixage = {};

Mixage.init = function (id, debugging) {
	// all buttons off
	for (var i = 0; i < 255; i++) {
		midi.sendShortMsg(0x90, i, 0);
	}
}

Mixage.shutdown = function () {
	for (var i = 0; i < 255; i++) {
		midi.sendShortMsg(0x90, i, 0);
	}
}