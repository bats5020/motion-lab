/* Shared editor number fields. Model writes remain owned by each tool's adapter. */
(function (global) {
  'use strict';
  const doc = global.document;
  const bindings = new Set(), byElement = new WeakMap();
  let status, serial = 0;
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const normalized = value => String(value ?? '').normalize('NFKC').trim().replace(/[−﹣]/g, '-');
  function parse(value) {
    const text = normalized(value);
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return null;
    const number = Number(text);
    return finite(number) ? number : null;
  }
  function decimals(value) {
    if (!finite(Number(value))) return 0;
    const parts = String(Number(Number(value).toPrecision(14))).toLowerCase().split('e');
    return Math.min(12, Math.max(0, (parts[0].split('.')[1] || '').length - Number(parts[1] || 0)));
  }
  const round = (value, places = 12) => Number(value.toFixed(Math.min(12, Math.max(0, places))));
  const nearly = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(a), Math.abs(b)) * 1e-12;
  function formatNumber(value, step = 1) {
    if (!finite(value)) return '';
    const clean = Number(value.toPrecision(14));
    return clean.toFixed(Math.max(decimals(clean), decimals(step)));
  }
  function validate(raw, config) {
    if (!finite(raw)) return '数値を入力してください。';
    if (config.integer && !Number.isInteger(raw)) return '整数で入力してください。';
    if (raw < config.min || raw > config.max) {
      const low = finite(config.min) ? formatNumber(config.min * config.scale, config.keyboardStep * config.scale) : '制限なし';
      const high = finite(config.max) ? formatNumber(config.max * config.scale, config.keyboardStep * config.scale) : '制限なし';
      return low + ' ～ ' + high + ' の範囲で入力してください。';
    }
    return '';
  }
  function nudge(value, direction, multiplier, config) {
    const amount = config.keyboardStep * multiplier;
    const next = round(value + direction * amount, Math.max(decimals(value), decimals(amount)));
    return Math.min(config.max, Math.max(config.min, next));
  }
  function element(value) { return typeof value === 'string' ? doc.querySelector(value) : value; }
  function optionValue(value) { return typeof value === 'function' ? value() : value; }
  function numericOption(value, fallback) {
    const raw = optionValue(value), result = raw === '' || raw == null ? null : Number(raw);
    return finite(result) ? result : fallback;
  }
  function announce(message) {
    if (!doc || !doc.body) return;
    if (!status || !status.isConnected) {
      status = doc.createElement('div');
      status.className = 'ml-number-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.setAttribute('aria-atomic', 'true');
      doc.body.append(status);
    }
    status.textContent = message;
  }
  function bind(options) {
    if (!doc) throw new Error('MLNumberInputs.bind requires a document');
    const opts = options || {}, range = element(opts.range), suppliedNumber = element(opts.number), readout = element(opts.readout);
    if (!range && !suppliedNumber) throw new Error('A range or number element is required');
    const existing = byElement.get(range) || byElement.get(suppliedNumber);
    if (existing) return existing;
    const input = suppliedNumber || doc.createElement('input');
    const source = range || input;
    const original = {
      type: input.getAttribute('type'), title: input.getAttribute('title'), role: input.getAttribute('role'),
      inputmode: input.getAttribute('inputmode'), readoutHidden: readout?.hidden,
      readoutLabel: readout?.getAttribute('aria-hidden')
    };
    let wrapper = null;
    // Original number inputs may be read through valueAsNumber by export modules.
    // Only newly generated readout fields become text inputs; retained nodes keep
    // native numeric semantics unless an adapter explicitly opts out.
    input.type = suppliedNumber && original.type === 'number' && opts.preserveType !== false ? 'number' : 'text';
    input.setAttribute('inputmode', 'decimal');
    input.setAttribute('role', 'spinbutton');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('data-ml-number', '');
    input.classList.add('ml-number-input');
    if (range) range.setAttribute('data-ml-number-range', '');
    const label = opts.label || input.getAttribute('aria-label') || range?.getAttribute('aria-label') ||
      input.labels?.[0]?.textContent?.trim() || range?.labels?.[0]?.textContent?.trim() || '値';
    if (!input.getAttribute('aria-label') && !input.getAttribute('aria-labelledby')) input.setAttribute('aria-label', label);
    if (!suppliedNumber) {
      wrapper = doc.createElement('span'); wrapper.className = 'ml-number-wrap';
      if (!input.id) input.id = 'ml-number-' + (++serial);
      wrapper.append(input);
      if (opts.suffix) {
        const unit = doc.createElement('span'); unit.className = 'ml-number-unit'; unit.textContent = opts.suffix;
        unit.setAttribute('aria-hidden', 'true'); wrapper.append(unit);
      }
      (readout || range).insertAdjacentElement('afterend', wrapper);
    }
    if (readout) { readout.hidden = true; readout.classList.add('ml-number-readout'); readout.setAttribute('aria-hidden', 'true'); }
    const state = { editing: false, composing: false, pendingBlur: false, dispatching: false, gesture: null, arrows: new Set(), pointer: null, last: 0, destroyed: false, wasConnected: input.isConnected };
    const listeners = [];
    const listen = (target, type, handler, capture = false) => { target?.addEventListener(type, handler, capture); listeners.push([target, type, handler, capture]); };
    function config() {
      const scale = numericOption(opts.scale, 1);
      const validScale = scale > 0 ? scale : 1;
      const min = numericOption(opts.min ?? source.getAttribute('min'), range ? 0 : -Infinity);
      const max = numericOption(opts.max ?? source.getAttribute('max'), range ? 100 : Infinity);
      const attrStep = optionValue(opts.step) ?? source.getAttribute('step');
      const step = attrStep === 'any' ? null : numericOption(attrStep, 1);
      const keyboardStep = numericOption(opts.keyboardStep, step > 0 ? step : 1);
      return { min, max, scale: validScale, step, keyboardStep: keyboardStep > 0 ? keyboardStep : 1, integer: !!optionValue(opts.integer) };
    }
    function getRaw() {
      if (typeof opts.getValue === 'function') {
        const result = Number(opts.getValue()); if (finite(result)) return result;
      }
      if (range) { const result = Number(range.value); if (finite(result)) return result; }
      if (!state.editing && !state.dispatching) {
        const result = parse(input.value); if (result != null) return result / config().scale;
      }
      return state.last;
    }
    state.last = getRaw();
    function display(raw, cfg) {
      const value = raw * cfg.scale;
      const result = typeof opts.format === 'function' ? String(opts.format(value, raw)) : formatNumber(value, cfg.keyboardStep * cfg.scale);
      return parse(result) != null ? result : formatNumber(value, cfg.keyboardStep * cfg.scale);
    }
    function clearError() { input.removeAttribute('aria-invalid'); input.removeAttribute('data-ml-number-error'); }
    function reject(message) {
      input.setAttribute('aria-invalid', 'true'); input.setAttribute('data-ml-number-error', message);
      input.title = message; announce(label + '：' + message + ' 変更は適用していません。');
      return false;
    }
    function refresh(force = false) {
      if (state.destroyed) return;
      if (input.isConnected) state.wasConnected = true;
      const cfg = config(), raw = getRaw();
      if (range) input.disabled = range.disabled;
      if (wrapper && range) wrapper.hidden = range.hidden || range.style?.display === 'none';
      if (finite(cfg.min)) input.setAttribute('aria-valuemin', String(cfg.min * cfg.scale)); else input.removeAttribute('aria-valuemin');
      if (finite(cfg.max)) input.setAttribute('aria-valuemax', String(cfg.max * cfg.scale)); else input.removeAttribute('aria-valuemax');
      input.setAttribute('aria-valuenow', String(raw * cfg.scale));
      input.setAttribute('aria-valuetext', display(raw, cfg) + (opts.suffix || ''));
      if (!state.editing && !state.composing || force) {
        state.last = raw;
        input.value = display(raw, cfg);
      }
      if (!input.hasAttribute('aria-invalid')) input.title = (original.title ? original.title + ' / ' : '') + '↑↓: ' + formatNumber(cfg.keyboardStep * cfg.scale, cfg.keyboardStep * cfg.scale) + '、Shift: 10倍 / Enterで確定、Escで取消';
    }
    function history() { return opts.history || global.MLEditorHistory?.getCurrent?.(); }
    function busy(h) { return h && (typeof h.isBusy === 'function' ? h.isBusy() : h.isBusy); }
    function ownsTransaction(gesture) {
      return !gesture.tracksActive || gesture.history.active === gesture.transaction;
    }
    function begin(kind) {
      const h = history();
      if (busy(h)) return reject('書き出しが終わってから変更してください。');
      if (h && (typeof h.isRestoring === 'function' ? h.isRestoring() : h.isRestoring)) return false;
      if (state.gesture) {
        if (state.gesture.history === h && ownsTransaction(state.gesture)) return true;
        // Undo/redo may finish a held-key or pointer transaction before keyup.
        // A later repeat starts a new gesture from the restored model, not the
        // stale pre-undo snapshot. Never commit an unrelated replacement entry.
        state.gesture = null; state.arrows.clear();
      }
      const result = typeof opts.onBegin === 'function' ? opts.onBegin(kind, binding) : h?.begin?.(label);
      if (result === false) return false;
      state.gesture = { kind, history: h, tracksActive: typeof opts.onBegin !== 'function' && !!h && 'active' in h, transaction: h?.active }; return true;
    }
    function finish(cancelled = false) {
      if (!state.gesture) return;
      const gesture = state.gesture; state.gesture = null;
      if (!ownsTransaction(gesture)) return;
      const callback = cancelled ? opts.onCancel : opts.onCommit;
      if (typeof callback === 'function') callback(gesture.kind, binding);
      else gesture.history?.[cancelled ? 'cancel' : 'commit']?.();
    }
    function emit(target, type) {
      const event = new global.Event(type, { bubbles: true });
      event.mlNumericCommit = true;
      target.dispatchEvent(event);
    }
    function write(raw) {
      const previous = state.last, cfg = config();
      const error = validate(raw, cfg); if (error) return reject(error);
      state.dispatching = true;
      try {
        if (typeof opts.setValue === 'function') {
          // A custom setter may intentionally call an existing number's
          // canonical input/change listener. Do not mistake that for a draft.
          opts.setValue(raw, binding);
        } else {
          const target = range || input, previousValue = target.value;
          target.value = String(range ? raw : raw * cfg.scale);
          if (range && !nearly(Number(range.value), raw)) {
            target.value = previousValue;
            return reject(formatNumber(cfg.keyboardStep * cfg.scale, cfg.keyboardStep * cfg.scale) + ' 刻みで入力してください。');
          }
        }
        state.last = raw;
        input.value = display(raw, cfg);
        const events = opts.commitEvents ?? (typeof opts.setValue === 'function' ? [] : ['input']);
        events.forEach(type => emit(range || input, type));
      }
      catch (error) { state.last = previous; throw error; }
      finally { state.dispatching = false; }
      clearError(); refresh(true);
      return true;
    }
    function commit() {
      if (state.composing || input.disabled || range?.disabled) return false;
      const cfg = config(), parsed = parse(input.value), raw = parsed == null ? NaN : parsed / cfg.scale;
      const error = validate(raw, cfg); if (error) return reject(error);
      const current = getRaw();
      if (nearly(current, raw)) { state.editing = false; state.last = current; clearError(); refresh(true); return true; }
      if (!begin('text')) return false;
      const ok = write(raw); state.editing = !ok;
      finish(!ok); if (ok) refresh(true);
      return ok;
    }
    function cancel() {
      state.editing = false; state.composing = false; state.pendingBlur = false;
      state.arrows.clear(); state.pointer = null;
      finish(state.gesture?.kind === 'text'); clearError(); refresh(true);
    }
    function finishArrows() { if (state.arrows.size) { state.arrows.clear(); finish(); } }
    function keydown(event, fromRange = false) {
      if (event.isComposing || state.composing || event.keyCode === 229) return;
      const up = event.key === 'ArrowUp' || fromRange && event.key === 'ArrowRight';
      const down = event.key === 'ArrowDown' || fromRange && event.key === 'ArrowLeft';
      const rangeSpecial = fromRange && ['Home', 'End', 'PageUp', 'PageDown'].includes(event.key);
      if (up || down || rangeSpecial) {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        event.preventDefault(); event.stopImmediatePropagation();
        if (input.disabled || range?.disabled) return;
        if (state.editing && !commit()) return;
        const cfg = config(), current = getRaw();
        let value = nudge(current, up || event.key === 'PageUp' ? 1 : -1, (event.shiftKey ? 10 : 1) * (event.key.startsWith('Page') ? 10 : 1), cfg);
        if (event.key === 'Home') value = finite(cfg.min) ? cfg.min : current;
        if (event.key === 'End') value = finite(cfg.max) ? cfg.max : current;
        if (nearly(current, value)) return;
        if (!begin('nudge')) return;
        state.arrows.add(event.key);
        if (!write(value)) { state.arrows.clear(); finish(true); }
        return;
      }
      if (fromRange) return;
      if (event.key === 'Enter') { event.preventDefault(); event.stopImmediatePropagation(); finishArrows(); commit(); }
      if (event.key === 'Escape' && (state.editing || input.hasAttribute('aria-invalid'))) { event.preventDefault(); event.stopImmediatePropagation(); cancel(); }
    }
    function keyup(event) {
      if (!state.arrows.has(event.key)) return;
      state.arrows.delete(event.key); if (!state.arrows.size) finish();
    }
    function blur() {
      finishArrows();
      if (state.composing) { state.pendingBlur = true; return; }
      if (state.editing && !commit()) { state.editing = false; refresh(true); }
    }
    function draft(event) {
      if (state.dispatching || event.mlNumericCommit) return;
      event.stopImmediatePropagation();
      if (event.type === 'input') { state.editing = true; clearError(); }
    }
    listen(input, 'beforeinput', () => { if (!state.dispatching) state.editing = true; }, true);
    listen(input, 'input', draft, true); listen(input, 'change', draft, true);
    listen(input, 'keydown', event => keydown(event), true); listen(input, 'keyup', keyup, true);
    listen(input, 'focus', () => { if (!state.editing) { clearError(); refresh(); } });
    listen(input, 'blur', blur, true);
    listen(input, 'compositionstart', () => { state.composing = true; state.editing = true; }, true);
    listen(input, 'compositionend', () => { state.composing = false; if (state.pendingBlur) { state.pendingBlur = false; blur(); } }, true);
    if (range) {
      // Capture before legacy model listeners, including accessibility/native
      // changes which did not start with a pointer or an arrow key.
      const beforeRangeChange = event => {
        if (state.dispatching) return;
        if (range.disabled || busy(history())) {
          range.value = String(state.last);
          event.preventDefault(); event.stopImmediatePropagation(); refresh();
          return;
        }
        if (!begin('range')) { event.preventDefault(); event.stopImmediatePropagation(); }
      };
      listen(range, 'input', beforeRangeChange, true);
      listen(range, 'change', beforeRangeChange, true);
      listen(range, 'input', () => { if (!state.dispatching) { state.editing = false; refresh(); } });
      listen(range, 'change', () => { if (state.pointer == null && !state.arrows.size) finish(); refresh(); });
      listen(range, 'keydown', event => keydown(event, true), true); listen(range, 'keyup', keyup, true);
      listen(range, 'blur', () => { finishArrows(); if (state.pointer == null) finish(); }, true);
      listen(range, 'pointerdown', event => {
        if (range.disabled) return;
        if (begin('range')) state.pointer = event.pointerId ?? 'pointer';
        else { event.preventDefault(); event.stopImmediatePropagation(); }
      }, true);
      const pointerEnd = event => {
        if (state.pointer == null || event.pointerId != null && state.pointer !== event.pointerId) return;
        state.pointer = null; finish(); refresh();
      };
      listen(global, 'pointerup', pointerEnd); listen(global, 'pointercancel', pointerEnd);
    }
    listen(global, 'blur', () => { finishArrows(); if (state.pointer != null) { state.pointer = null; finish(); } });
    let observer = null;
    if (global.MutationObserver) {
      observer = new global.MutationObserver(() => refresh());
      if (readout) observer.observe(readout, { childList: true, characterData: true, subtree: true });
      observer.observe(source, { attributes: true, attributeFilter: ['min', 'max', 'step', 'disabled', 'hidden', 'style'] });
    }
    function destroy() {
      if (state.destroyed) return;
      finishArrows(); finish(); state.destroyed = true;
      listeners.forEach(([target, type, handler, capture]) => target?.removeEventListener(type, handler, capture));
      observer?.disconnect(); bindings.delete(binding); byElement.delete(input); if (range) byElement.delete(range);
      input.removeAttribute('data-ml-number'); input.classList.remove('ml-number-input'); range?.removeAttribute('data-ml-number-range');
      if (wrapper) wrapper.remove();
      else for (const [name, value] of [['type',original.type],['title',original.title],['role',original.role],['inputmode',original.inputmode]]) { if (value == null) input.removeAttribute(name); else input.setAttribute(name, value); }
      if (readout) { readout.hidden = original.readoutHidden; readout.classList.remove('ml-number-readout'); if (original.readoutLabel == null) readout.removeAttribute('aria-hidden'); else readout.setAttribute('aria-hidden', original.readoutLabel); }
    }
    const binding = { input, range, readout, refresh, commit, cancel, destroy, get isEditing() { return state.editing || state.composing; }, get isComposing() { return state.composing; }, get wasConnected() { return state.wasConnected; }, getValue: getRaw };
    bindings.add(binding); byElement.set(input, binding); if (range) byElement.set(range, binding);
    refresh(); return binding;
  }
  function getBinding(target) { return target && byElement.get(target) || null; }
  const api = {
    bind, getBinding, isBoundTarget: target => !!getBinding(target),
    isEditingTarget: target => !!getBinding(target)?.isEditing,
    refresh(root = doc) { bindings.forEach(binding => {
      if (binding.wasConnected && !binding.input.isConnected) { binding.destroy(); return; }
      if (!root || root === doc || root.contains(binding.input) || root.contains(binding.range)) binding.refresh();
    }); },
    _test: { parse, decimals, formatNumber, validate, nudge, nearly }
  };
  global.MLNumberInputs = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
