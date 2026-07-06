(function () {
  "use strict";

  if (window.__securitiesCalculatorRestoreLoaded) {
    return;
  }
  window.__securitiesCalculatorRestoreLoaded = true;

  var TEXT = {
    title: "計算機",
    description: "可拖曳視窗位置，避免擋到題目。",
    close: "關閉計算機",
    clear: "清除",
    delete: "刪除",
    error: "算式格式不正確",
  };

  var functionKeys = [
    { label: "√", value: "sqrt(" },
    { label: "x²", value: "^2" },
    { label: "xʸ", value: "^" },
    { label: "(", value: "(" },
    { label: ")", value: ")" },
  ];
  var keyRows = [
    [TEXT.clear, TEXT.delete, "%", "÷"],
    ["7", "8", "9", "×"],
    ["4", "5", "6", "-"],
    ["1", "2", "3", "+"],
    ["0", ".", "="],
  ];
  var expression = "";
  var result = "";
  var error = "";
  var position = { x: 24, y: 92 };
  var dragStart = null;

  injectStyles();
  ensureButton();
  new MutationObserver(ensureButton).observe(document.documentElement, { childList: true, subtree: true });

  function ensureButton() {
    var navActions = document.querySelector(".glass-navbar .nav-actions");
    if (!navActions || navActions.querySelector("[data-calculator-restore-button]")) {
      return;
    }

    var button = document.createElement("button");
    button.type = "button";
    button.className = "nav-icon-button";
    button.setAttribute("aria-label", TEXT.title);
    button.title = TEXT.title;
    button.dataset.calculatorRestoreButton = "true";
    button.innerHTML = calculatorIconSvg();
    button.addEventListener("click", function () {
      openCalculator();
    });

    var settingsButton = navActions.querySelector('button[aria-label="設定"]');
    if (settingsButton) {
      navActions.insertBefore(button, settingsButton);
    } else {
      navActions.appendChild(button);
    }
  }

  function openCalculator() {
    var dialog = document.querySelector("[data-calculator-restore-dialog]");
    if (!dialog) {
      dialog = createCalculatorDialog();
      document.body.appendChild(dialog);
    }
    clampPosition();
    renderCalculator();
  }

  function closeCalculator() {
    var dialog = document.querySelector("[data-calculator-restore-dialog]");
    if (dialog) {
      dialog.remove();
    }
  }

  function createCalculatorDialog() {
    var dialog = document.createElement("section");
    dialog.className = "glass-card calculator-floating-dialog";
    dialog.dataset.calculatorRestoreDialog = "true";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-label", TEXT.title);
    dialog.innerHTML = [
      '<div class="calculator-drag-header" data-calculator-drag-handle="true">',
        '<div>',
          '<p class="eyebrow">Calculator</p>',
          '<h2>' + TEXT.title + '</h2>',
          '<p>' + TEXT.description + '</p>',
        '</div>',
        '<div class="calculator-header-actions">',
          gripIconSvg(),
          '<button type="button" class="nav-icon-button" aria-label="' + TEXT.close + '" title="' + TEXT.close + '" data-calculator-close="true">' + closeIconSvg() + '</button>',
        '</div>',
      '</div>',
      '<div class="calculator-display" aria-live="polite">',
        '<div class="calculator-expression" data-calculator-expression="true">0</div>',
        '<div class="calculator-output" data-calculator-output="true"> </div>',
      '</div>',
      '<div class="calculator-function-row" aria-label="進階功能"></div>',
      '<div class="calculator-keypad" aria-label="計算機鍵盤"></div>',
    ].join("");

    dialog.querySelector("[data-calculator-close]").addEventListener("click", closeCalculator);
    setupDrag(dialog);
    buildKeys(dialog);
    return dialog;
  }

  function buildKeys(dialog) {
    var functionRow = dialog.querySelector(".calculator-function-row");
    functionKeys.forEach(function (key) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = key.label;
      button.addEventListener("click", function () { appendValue(key.value); });
      functionRow.appendChild(button);
    });

    var keypad = dialog.querySelector(".calculator-keypad");
    keyRows.flat().forEach(function (key) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = key;

      if (key === TEXT.clear) {
        button.className = "calculator-command-key";
        button.addEventListener("click", clearExpression);
      } else if (key === TEXT.delete) {
        button.className = "calculator-command-key";
        button.addEventListener("click", deleteLast);
      } else if (key === "=") {
        button.className = "glass-button primary calculator-equals-key";
        button.addEventListener("click", calculateExpression);
      } else {
        button.addEventListener("click", function () { appendValue(normalizeKeyValue(key)); });
      }

      keypad.appendChild(button);
    });
  }

  function appendValue(value) {
    expression += value;
    error = "";
    renderCalculator();
  }

  function deleteLast() {
    expression = expression.slice(0, -1);
    error = "";
    renderCalculator();
  }

  function clearExpression() {
    expression = "";
    result = "";
    error = "";
    renderCalculator();
  }

  function calculateExpression() {
    if (!expression.trim()) {
      result = "";
      error = "";
      renderCalculator();
      return;
    }
    try {
      result = formatCalculatorResult(evaluateCalculatorExpression(expression));
      error = "";
    } catch (err) {
      result = "";
      error = TEXT.error;
    }
    renderCalculator();
  }

  function renderCalculator() {
    var dialog = document.querySelector("[data-calculator-restore-dialog]");
    if (!dialog) {
      return;
    }
    dialog.style.transform = "translate(" + position.x + "px, " + position.y + "px)";
    dialog.querySelector("[data-calculator-expression]").textContent = expression || "0";
    dialog.querySelector("[data-calculator-output]").textContent = error || (result ? "= " + result : " ");
  }

  function setupDrag(dialog) {
    var handle = dialog.querySelector("[data-calculator-drag-handle]");
    handle.addEventListener("pointerdown", function (event) {
      if (event.target.closest("button")) {
        return;
      }
      handle.setPointerCapture(event.pointerId);
      dragStart = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: position.x,
        originY: position.y,
      };
    });
    handle.addEventListener("pointermove", function (event) {
      if (!dragStart || dragStart.pointerId !== event.pointerId) {
        return;
      }
      position = {
        x: dragStart.originX + event.clientX - dragStart.startX,
        y: dragStart.originY + event.clientY - dragStart.startY,
      };
      clampPosition();
      renderCalculator();
    });
    ["pointerup", "pointercancel"].forEach(function (eventName) {
      handle.addEventListener(eventName, function (event) {
        if (!dragStart || dragStart.pointerId !== event.pointerId) {
          return;
        }
        dragStart = null;
        try {
          handle.releasePointerCapture(event.pointerId);
        } catch (err) {
          // The capture may already be released on some browsers.
        }
      });
    });
  }

  function clampPosition() {
    var maxX = Math.max(12, window.innerWidth - 360);
    var maxY = Math.max(72, window.innerHeight - 520);
    position = {
      x: Math.min(Math.max(12, position.x), maxX),
      y: Math.min(Math.max(72, position.y), maxY),
    };
  }

  window.addEventListener("resize", function () {
    clampPosition();
    renderCalculator();
  });

  function normalizeKeyValue(key) {
    if (key === "×") return "*";
    if (key === "÷") return "/";
    return key;
  }

  function evaluateCalculatorExpression(rawExpression) {
    var normalized = rawExpression
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      .replace(/％/g, "%")
      .replace(/√/g, "sqrt")
      .replace(/，/g, ",")
      .replace(/,/g, "")
      .replace(/\s+/g, "");

    if (!normalized || /[^0-9.+\-*/%^()sqrt]/.test(normalized)) {
      throw new Error("Invalid calculator expression");
    }

    var matchedTokens = normalized.match(/sqrt|\d*\.?\d+|[()+\-*/%^]/g);
    if (!matchedTokens || matchedTokens.join("") !== normalized) {
      throw new Error("Invalid calculator expression");
    }
    var tokens = matchedTokens;
    var tokenPosition = 0;

    function parseExpression() {
      var value = parseTerm();
      while (tokens[tokenPosition] === "+" || tokens[tokenPosition] === "-") {
        var operator = tokens[tokenPosition++];
        var right = parseTerm();
        value = operator === "+" ? value + right : value - right;
      }
      return value;
    }

    function parseTerm() {
      var value = parsePower();
      while (tokens[tokenPosition] === "*" || tokens[tokenPosition] === "/") {
        var operator = tokens[tokenPosition++];
        var right = parsePower();
        if (operator === "/" && right === 0) throw new Error("Invalid calculator expression");
        value = operator === "*" ? value * right : value / right;
      }
      return value;
    }

    function parsePower() {
      var value = parseFactor();
      if (tokens[tokenPosition] === "^") {
        tokenPosition += 1;
        value = Math.pow(value, parsePower());
      }
      if (!Number.isFinite(value)) throw new Error("Invalid calculator expression");
      return value;
    }

    function parseFactor() {
      var value;
      var token = tokens[tokenPosition];
      if (token === "+") {
        tokenPosition += 1;
        value = parseFactor();
      } else if (token === "-") {
        tokenPosition += 1;
        value = -parseFactor();
      } else if (token === "sqrt") {
        tokenPosition += 1;
        if (tokens[tokenPosition] !== "(") throw new Error("Invalid calculator expression");
        tokenPosition += 1;
        value = parseExpression();
        if (tokens[tokenPosition] !== ")" || value < 0) throw new Error("Invalid calculator expression");
        tokenPosition += 1;
        value = Math.sqrt(value);
      } else if (token === "(") {
        tokenPosition += 1;
        value = parseExpression();
        if (tokens[tokenPosition] !== ")") throw new Error("Invalid calculator expression");
        tokenPosition += 1;
      } else if (token && /\d/.test(token)) {
        tokenPosition += 1;
        value = Number(token);
      } else {
        throw new Error("Invalid calculator expression");
      }

      while (tokens[tokenPosition] === "%") {
        tokenPosition += 1;
        value /= 100;
      }
      if (!Number.isFinite(value)) throw new Error("Invalid calculator expression");
      return value;
    }

    var finalResult = parseExpression();
    if (tokenPosition !== tokens.length || !Number.isFinite(finalResult)) {
      throw new Error("Invalid calculator expression");
    }
    return finalResult;
  }

  function formatCalculatorResult(value) {
    return Number.isInteger(value) ? value.toString() : Number(value.toFixed(10)).toString();
  }

  function injectStyles() {
    if (document.querySelector("style[data-calculator-restore-styles]")) {
      return;
    }
    var style = document.createElement("style");
    style.dataset.calculatorRestoreStyles = "true";
    style.textContent = [
      ".calculator-floating-dialog{position:fixed;top:0;left:0;z-index:120;width:min(336px,calc(100vw - 24px));padding:16px;overflow:visible}",
      ".calculator-drag-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px;cursor:grab;touch-action:none}",
      ".calculator-drag-header:active{cursor:grabbing}",
      ".calculator-drag-header h2{margin-top:2px}",
      ".calculator-drag-header p:not(.eyebrow){margin-top:4px;font-size:.85rem}",
      ".calculator-header-actions{display:inline-flex;align-items:center;gap:6px;color:var(--muted,#606a78)}",
      ".calculator-display{min-height:82px;margin-bottom:12px;padding:14px;border:1px solid var(--glass-border-low,rgba(31,45,66,.1));border-radius:20px;background:rgba(255,255,255,.62);box-shadow:var(--inner-highlight,inset 0 1px 0 rgba(255,255,255,.78));text-align:right}",
      ".calculator-expression{min-height:28px;overflow-x:auto;color:var(--text,#172033);font-size:1.26rem;font-weight:800;white-space:nowrap}",
      ".calculator-output{min-height:24px;margin-top:6px;color:var(--primary-strong,#16546a);font-weight:800}",
      ".calculator-function-row,.calculator-keypad{display:grid;gap:8px}",
      ".calculator-function-row{grid-template-columns:repeat(5,minmax(0,1fr));margin-bottom:8px}",
      ".calculator-keypad{grid-template-columns:repeat(4,minmax(0,1fr))}",
      ".calculator-function-row button,.calculator-keypad button{min-height:44px;border:1px solid var(--glass-border-low,rgba(31,45,66,.1));border-radius:16px;background:rgba(255,255,255,.66);box-shadow:var(--inner-highlight,inset 0 1px 0 rgba(255,255,255,.78));color:var(--text,#172033);cursor:pointer;font:inherit;font-weight:800;transition:transform 160ms ease,background-color 160ms ease,border-color 160ms ease}",
      ".calculator-function-row button:active,.calculator-keypad button:active{transform:scale(.96)}",
      ".calculator-keypad .calculator-command-key{background:rgba(255,255,255,.9);color:var(--secondary,#405066)}",
      ".calculator-equals-key{grid-column:span 2}",
      "@media (max-width:560px){.calculator-floating-dialog{width:calc(100vw - 24px);padding:14px}.calculator-drag-header p:not(.eyebrow){display:none}.calculator-expression{font-size:1.14rem}}",
    ].join("\n");
    document.head.appendChild(style);
  }

  function calculatorIconSvg() {
    return '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg>';
  }

  function gripIconSvg() {
    return '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9h14"/><path d="M5 15h14"/></svg>';
  }

  function closeIconSvg() {
    return '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  }
})();
