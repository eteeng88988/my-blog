(() => {
  const editableSelector = "input, textarea, select, [contenteditable='true'], [data-allow-copy]";
  const blockedKeys = new Set(["a", "c", "p", "s", "u", "x"]);

  function isEditable(target) {
    return target instanceof Element && Boolean(target.closest(editableSelector));
  }

  function blockUnlessEditable(event) {
    if (isEditable(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  }

  document.documentElement.classList.add("protect-content");
  document.addEventListener("contextmenu", blockUnlessEditable, true);
  document.addEventListener("selectstart", blockUnlessEditable, true);
  document.addEventListener("copy", blockUnlessEditable, true);
  document.addEventListener("cut", blockUnlessEditable, true);
  document.addEventListener("dragstart", blockUnlessEditable, true);

  document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (isEditable(event.target)) return;
    if (event.key === "F12") {
      event.preventDefault();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && blockedKeys.has(key)) {
      event.preventDefault();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && ["c", "i", "j"].includes(key)) {
      event.preventDefault();
    }
  }, true);
})();
