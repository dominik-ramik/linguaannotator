export function createAttachDrag(wavesurferRef, regionsPluginRef, onRegionChanged) {
  // Returns a function attachDrag(domEl, region, mode)
  return function attachDrag(domEl, region, mode) {
    domEl.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();

      // If this region has been marked as removed, ignore the drag entirely
      if (region._removed) return;

      const startX = e.clientX;
      const origStart = region.start;
      const origEnd = region.end;
      const duration = origEnd - origStart;

      const wavesurfer = wavesurferRef.value;
      const regionsPlugin = regionsPluginRef.value;

      // Filter out removed/destroyed regions from the list
      const allRegions = regionsPlugin
        .getRegions()
        .filter((r) => !r._removed)
        .sort((a, b) => a.start - b.start);
      const idx = allRegions.findIndex((r) => r.id === region.id);
      const prev = idx > 0 ? allRegions[idx - 1] : null;
      const next = idx < allRegions.length - 1 ? allRegions[idx + 1] : null;

      let limitLeft = prev ? prev.end : 0;
      let limitRight = next ? next.start : wavesurfer.getDuration();

      let rightRegions = [];
      if (mode === "move-ripple" || mode === "resize-r") {
        for (let i = idx + 1; i < allRegions.length; i++) {
          rightRegions.push({
            region: allRegions[i],
            oStart: allRegions[i].start,
            oEnd: allRegions[i].end,
          });
        }
      }

      const onMove = (ev) => {
        const pxDelta = ev.clientX - startX;
        const secondsDelta = pxDelta / wavesurfer.options.minPxPerSec;

        if (mode === "move-single") {
          let newStart = origStart + secondsDelta;
          let newEnd = origEnd + secondsDelta;

          if (newStart < limitLeft) {
            newStart = limitLeft;
            newEnd = newStart + duration;
          }
          if (newEnd > limitRight) {
            newEnd = limitRight;
            newStart = newEnd - duration;
          }

          region.setOptions({ start: newStart, end: newEnd });
        } else if (mode === "move-ripple") {
          let newStart = origStart + secondsDelta;
          let newEnd = origEnd + secondsDelta;

          if (newStart < limitLeft) {
            const diff = limitLeft - newStart;
            newStart += diff;
            newEnd += diff;
          }

          const finalDelta = newStart - origStart;
          region.setOptions({ start: newStart, end: newEnd });

          rightRegions.forEach((item) => {
            item.region.setOptions({
              start: item.oStart + finalDelta,
              end: item.oEnd + finalDelta,
            });
          });
        } else if (mode === "resize-l") {
          let newStart = origStart + secondsDelta;
          if (newStart < limitLeft) newStart = limitLeft;
          if (newStart > origEnd - 0.1) newStart = origEnd - 0.1;
          region.setOptions({ start: newStart, end: origEnd });
        } else if (mode === "resize-r") {
          let newEnd = origEnd + secondsDelta;
          if (newEnd < origStart + 0.1) newEnd = origStart + 0.1;

          if (rightRegions.length > 0) {
            const firstRightOrigStart = rightRegions[0].oStart;
            if (newEnd > firstRightOrigStart) {
              const rippleDelta = newEnd - firstRightOrigStart;
              rightRegions.forEach((item) => {
                item.region.setOptions({
                  start: item.oStart + rippleDelta,
                  end: item.oEnd + rippleDelta,
                });
              });
            }
          }

          region.setOptions({ start: origStart, end: newEnd });
        }
      };

      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        // Notify caller that regions changed so external state (groundTruth) can be synced.
        try {
          if (typeof onRegionChanged === 'function') {
            // Primary region
            onRegionChanged(region);
            // Any right-side regions (ripple) that were moved
            rightRegions.forEach((item) => onRegionChanged(item.region));
          }
        } catch (err) {
          // ignore callback errors
        }
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  };
}
