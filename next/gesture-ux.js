(() => {
  const K = window.KRN;
  if (!K) return;

  const interactive =
    "input,textarea,select,button,a,[contenteditable=true],[data-no-swipe-close]";

  K.enableSwipeSheet = (sheet, close) => {
    if (!sheet || sheet.dataset.swipeCloseReady === "1") return;
    sheet.dataset.swipeCloseReady = "1";
    const grabber = sheet.querySelector(".sheetGrabber");
    let startX = 0,
      startY = 0,
      distance = 0,
      dragging = false;

    const reset = () => {
      dragging = false;
      distance = 0;
      sheet.classList.remove("swipeDragging");
      sheet.style.removeProperty("transform");
      sheet.style.removeProperty("transition");
    };
    const begin = (x, y, target, force = false) => {
      const scrolled = sheet.scrollTop > 2;
      if (!force && (scrolled || target.closest(interactive))) return false;
      startX = x;
      startY = y;
      distance = 0;
      dragging = true;
      sheet.style.transition = "none";
      return true;
    };
    const move = (x, y, event) => {
      if (!dragging) return;
      const dx = x - startX,
        raw = y - startY;
      if (raw <= 0 || Math.abs(dx) > Math.abs(raw) * 1.15) {
        if (Math.abs(dx) > 18) reset();
        return;
      }
      distance = Math.min(raw, 240);
      if (distance < 8) return;
      event?.preventDefault?.();
      sheet.classList.add("swipeDragging");
      sheet.style.transform = `translateY(${distance}px)`;
    };
    const end = () => {
      if (!dragging) return;
      const shouldClose = distance > 86;
      sheet.style.transition = "transform .2s ease";
      if (shouldClose) {
        sheet.style.transform = "translateY(105%)";
        window.setTimeout(() => {
          close();
          reset();
        }, 170);
      } else {
        sheet.style.transform = "translateY(0)";
        window.setTimeout(reset, 200);
      }
    };

    sheet.addEventListener(
      "touchstart",
      (event) => {
        if (event.touches.length !== 1) return;
        const touch = event.touches[0];
        begin(
          touch.clientX,
          touch.clientY,
          event.target,
          Boolean(event.target.closest(".sheetGrabber")),
        );
      },
      { passive: true },
    );
    sheet.addEventListener(
      "touchmove",
      (event) => {
        if (event.touches.length !== 1) return;
        const touch = event.touches[0];
        move(touch.clientX, touch.clientY, event);
      },
      { passive: false },
    );
    sheet.addEventListener("touchend", end, { passive: true });
    sheet.addEventListener("touchcancel", reset, { passive: true });

    if (grabber) {
      grabber.style.touchAction = "none";
      grabber.addEventListener("pointerdown", (event) => {
        if (begin(event.clientX, event.clientY, event.target, true))
          grabber.setPointerCapture?.(event.pointerId);
      });
      grabber.addEventListener("pointermove", (event) =>
        move(event.clientX, event.clientY, event),
      );
      grabber.addEventListener("pointerup", end);
      grabber.addEventListener("pointercancel", reset);
    }
  };
  K.$$('[data-swipe-dismiss]').forEach((sheet) => {
    const overlayId = sheet.dataset.swipeDismiss;
    K.enableSwipeSheet(sheet, () => K.overlay(overlayId)?.classList.remove("on"));
  });
})();
