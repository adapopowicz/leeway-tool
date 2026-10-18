/* Boot */
(function (LW) {
  'use strict';
  // keep <output> next to every range in sync (modules may override the text via data-fmt functions)
  LW.bindRange = (input, fmt, onInput) => {
    const out = input.parentElement.querySelector('output');
    const upd = () => { if (out) out.textContent = fmt ? fmt(+input.value) : input.value; };
    input.addEventListener('input', () => { upd(); onInput && onInput(+input.value); });
    upd();
    return upd;
  };
  window.addEventListener('DOMContentLoaded', () => {
    LW.library.init();
    LW.mockup.init();
    LW.convert && LW.convert.init();
    LW.draw && LW.draw.init();
    LW.initTabs();
  });
})(window.LW);
