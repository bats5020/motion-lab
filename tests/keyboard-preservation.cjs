// Strip only the bounded integration regions introduced by the keyboard feature.
exports.stripOwnedHooks=source=>source
 .replace(/^\/\* ML_KEYBOARD_BEGIN:[^\n]+\*\/\n[\s\S]*?^\/\* ML_KEYBOARD_END:[^\n]+\*\/\n/gm,'')
 .replace(/ \/\* ML_KEYBOARD_BEGIN:revision \*\/[\s\S]*?\/\* ML_KEYBOARD_END:revision \*\//g,'')
 .replace(/ \/\* ML_KEYBOARD_BEGIN:asset-boundary \*\/[\s\S]*?\/\* ML_KEYBOARD_END:asset-boundary \*\//g,'')
 .replace(/\/\* ML_KEYBOARD_BEGIN:range-filter \*\/[\s\S]*?\/\* ML_KEYBOARD_END:range-filter \*\//g,'"input"');
