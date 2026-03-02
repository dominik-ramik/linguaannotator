export function setupRegionDOM(region, attachDrag) {
  const el = region.element;
  region.drag = false;
  region.resize = false;
  el.innerHTML = "";
  el.style.overflow = "visible";

  // Top handle (move single)
  const top = document.createElement("div");
  top.className = "handle-top";
  attachDrag(top, region, "move-single");

  // Content area with input
  const content = document.createElement("div");
  content.className = "region-content";
  const input = document.createElement("input");
  input.className = "region-input";
  let labelText = "";
  if (region.data && typeof region.data.label === "string") labelText = region.data.label;
  else if (typeof region.content === "string") labelText = region.content;
  else if (region.content && region.content.innerText) labelText = region.content.innerText;
  input.value = labelText;
  input.addEventListener("change", (e) => {
    const v = e.target.value;
    try {
      region.setOptions({ content: v });
    } catch (err) {
      /* ignore */
    }
    region.data = Object.assign({}, region.data, { label: v });
  });
  input.addEventListener("mousedown", (e) => e.stopPropagation());
  // Prevent spacebar from bubbling up when typing in the input
  input.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.key === " ") {
      e.stopPropagation();
    }
  });
  content.appendChild(input);

  // Bottom handle (ripple)
  const bottom = document.createElement("div");
  bottom.className = "handle-bottom";
  attachDrag(bottom, region, "move-ripple");

  // Resize handles (left and right)
  const resL = document.createElement("div");
  resL.className = "resize-handle resize-l";
  attachDrag(resL, region, "resize-l");

  const resR = document.createElement("div");
  resR.className = "resize-handle resize-r";
  attachDrag(resR, region, "resize-r");

  el.appendChild(top);
  el.appendChild(content);
  el.appendChild(bottom);
  el.appendChild(resL);
  el.appendChild(resR);
}
