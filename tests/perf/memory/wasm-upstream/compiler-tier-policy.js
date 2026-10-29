// A compiled module keeps the ABI mode selected when its compile request was
// made, even if the embedding changes tiers or preferences later.
var Cu = Components.utils;
var Services = Cu.import('resource://gre/modules/Services.jsm', {}).Services;
var testing = Cu.getJSTestingFunctions();
var checks = 0;

function eq(actual, expected, message) {
    checks++;
    if (!Object.is(actual, expected))
        throw new Error(message + ': ' + actual + ' !== ' + expected);
}

function compile() {
    var bytes = testing.wasmTextToBinary(
        '(module (func (export "run") (result i32) (i32.const 42)))');
    return new WebAssembly.Module(bytes);
}

function sharedCode(module) {
    return testing.wasmExtractCode(module).sharedCode;
}

Services.prefs.setIntPref('browser.memoryTier', 0);
Services.prefs.setBoolPref('javascript.options.wasm_shared_code', true);
var lowTierModule = compile();
eq(sharedCode(lowTierModule), true, 'tier 0 with shared mode enabled');

Services.prefs.setBoolPref('javascript.options.wasm_shared_code', false);
eq(sharedCode(lowTierModule), true, 'existing low-tier module retains its mode');
var optedOutModule = compile();
eq(sharedCode(optedOutModule), false, 'tier 0 explicit opt-out selects private mode');

Services.prefs.setBoolPref('javascript.options.wasm_shared_code', true);
Services.prefs.setIntPref('browser.memoryTier', 3);
eq(sharedCode(lowTierModule), true, 'tier change does not mutate an existing module');
var highTierModule = compile();
eq(sharedCode(highTierModule), false, 'tier 3 always selects private mode');

Services.prefs.setIntPref('browser.memoryTier', 1);
var nextLowTierModule = compile();
eq(sharedCode(nextLowTierModule), true, 'new tier 1 module selects shared mode');

var lowInstance = new WebAssembly.Instance(lowTierModule);
eq(lowInstance.exports.run(), 42, 'shared-mode module remains executable after flips');
var classicInstance = new WebAssembly.Instance(highTierModule);
eq(classicInstance.exports.run(), 42, 'private-mode module remains executable after flips');

print('WASM_TIER_POLICY_RESULT ' + JSON.stringify({checks: checks}));
