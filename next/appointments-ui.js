(() => {
  const K = window.KRN;
  if (!K) return;
  let activeAppointment = null;
  function employeeNames(appt) {
    let ids = [];
    try {
      ids = JSON.parse(appt.assignedEmployeeIds || "[]");
    } catch {}
    const m = new Map(
      (K.snap.employees || []).map((e) => [e.employeeId, e.name]),
    );
    const names = ids.map((id) => m.get(id) || id).filter(Boolean);
    return names.length ? names : [];
  }
  function localState(id) {
    return K.localEventState ? K.localEventState()[id] || {} : {};
  }
  function mergedNote(appt) {
    const s = localState(appt.appointmentId);
    return s.note !== undefined ? s.note : appt.notes || "";
  }
  function typeClass(category) {
    const s = String(category || "");
    if (s.includes("買取")) return "purchase";
    if (s.includes("工事")) return "work";
    if (s.includes("配送")) return "delivery";
    if (s.includes("リサイクル") || s.includes("収集")) return "recycle";
    if (s.includes("見積")) return "estimate";
    if (s.includes("販売")) return "sale";
    return "other";
  }
  K.openAppointmentDetail = (appt) => {
    if (!appt) return;
    activeAppointment = appt;
    const names = employeeNames(appt),
      state = localState(appt.appointmentId);
    K.$("#appointmentDetailTitle").textContent =
      appt.customerName || appt.title || "予定詳細";
    K.$("#appointmentDetailSub").textContent = [
      appt.date,
      appt.startTime && appt.endTime
        ? appt.startTime + "〜" + appt.endTime
        : appt.startTime,
    ]
      .filter(Boolean)
      .join(" / ");
    const type = K.$("#appointmentDetailType");
    type.textContent = appt.category || "予定";
    type.className = "appointmentTypeBadge " + typeClass(appt.category);
    K.$("#appointmentDetailTime").textContent =
      [appt.startTime, appt.endTime].filter(Boolean).join("〜") || "未設定";
    K.$("#appointmentDetailStaff").textContent = names.join("・") || "未設定";
    K.$("#appointmentDetailPhone").textContent = appt.phone || "未登録";
    K.$("#appointmentDetailAddress").textContent = appt.address || "未登録";
    K.$("#appointmentDetailRef").textContent = [
      appt.caseId,
      appt.serviceOrderId,
      appt.sourceRef,
      appt.blueScheduleId,
    ]
      .filter(Boolean)
      .join(" / ");
    K.$("#appointmentDetailNote").value = mergedNote(appt);
    K.$("#appointmentNoteState").textContent = state.noteSavedAt
      ? "保存 " +
        new Date(state.noteSavedAt).toLocaleString("ja-JP", {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    const tel = K.digits(appt.phone),
      map = appt.address
        ? "https://www.google.com/maps/search/?api=1&query=" +
          encodeURIComponent(appt.address)
        : "";
    K.$("#appointmentDetailTel").disabled = !tel;
    K.$("#appointmentDetailMap").disabled = !map;
    K.$("#appointmentDetailTel").onclick = () => {
      if (tel) location.href = "tel:" + tel;
    };
    K.$("#appointmentDetailMap").onclick = () => {
      if (map) window.open(map, "_blank", "noopener");
    };
    K.$("#appointmentDetailSlip").onclick = () => {
      K.overlay("appointmentDetailModal").classList.remove("on");
      K.openSlip &&
        K.openSlip({
          caseId: appt.caseId,
          appointmentId: appt.appointmentId,
          name: appt.customerName,
          phone: appt.phone,
          address: appt.address,
          serviceOrderId: appt.serviceOrderId,
          notes: mergedNote(appt),
        });
    };
    K.overlay("appointmentDetailModal").classList.add("on");
  };
  async function saveNote() {
    if (!activeAppointment) return;
    const note = K.$("#appointmentDetailNote").value.trim(),
      at = new Date().toISOString(),
      all = K.localEventState ? K.localEventState() : {};
    all[activeAppointment.appointmentId] = {
      ...(all[activeAppointment.appointmentId] || {}),
      note,
      noteSavedAt: at,
    };
    K.saveLocalEventState && K.saveLocalEventState(all);
    activeAppointment.notes = note;
    if (activeAppointment.localOnly && window.KRDB?.putAppointment) {
      await KRDB.putAppointment({
        ...activeAppointment,
        notes: note,
        updatedAt: at,
      });
    }
    if (window.KRAPI)
      await KRAPI.run(
        "appointment-note-update",
        activeAppointment.appointmentId,
        {
          appointmentId: activeAppointment.appointmentId,
          notes: note,
          updatedAt: at,
        },
      );
    K.$("#appointmentNoteState").textContent = "保存しました";
    K.renderHome && K.renderHome();
    K.renderCalendar && K.renderCalendar();
  }
  K.$("#saveAppointmentNote").onclick = saveNote;
  K.openDaySchedulePopup = ({ key, date, events, staff, onAdd, onEdit }) => {
    const isToday = K.keyDate(date) === K.keyDate(new Date());
    K.$("#dayScheduleTitle").textContent = isToday
      ? "今日の予定"
      : date.getMonth() +
        1 +
        "月" +
        date.getDate() +
        "日（" +
        K.jpDay(date) +
        "）";
    K.$("#dayScheduleStaff").innerHTML = (staff || [])
      .map(
        (x) =>
          '<span class="staffChip ' +
          (x.state === "absent"
            ? "absent"
            : x.kind === "extra"
              ? "extra"
              : "working") +
          '">' +
          K.esc(
            (x.kind === "extra" ? "出 " : "") +
              x.name,
          ) +
          "</span>",
      )
      .join("");
    const list = K.$("#dayScheduleList");
    list.innerHTML = "";
    if (!events.length)
      list.innerHTML = '<div class="dayPopupEmpty">予定はありません</div>';
    else
      events.forEach((e) => {
        const wrap = document.createElement("div");
        wrap.className = "dayPopupItem";
        const card = K.apptCard(e);
        if(e.status==="tentative"){
          card.classList.add("tentative");
          const mark=document.createElement("small");mark.textContent="仮押さえ・お客様確認待ち";mark.className="tentativeLabel";card.prepend(mark);
        }
        if (e.localOnly && onEdit) {
          const edit = document.createElement("button");
          edit.type = "button";
          edit.className = "dayPopupEdit";
          edit.textContent = "予定編集";
          edit.onclick = (ev) => {
            ev.stopPropagation();
            onEdit(e);
          };
          card.querySelector(".cardmain")?.appendChild(edit);
        }
        wrap.appendChild(card);
        list.appendChild(wrap);
      });
    K.$("#dayScheduleAdd").onclick = () => {
      K.overlay("dayScheduleModal").classList.remove("on");
      onAdd && onAdd();
    };
    K.overlay("dayScheduleModal").classList.add("on");
  };
  function attachSwipeClose(modalId) {
    const overlay = K.$("#" + modalId),
      sheet = overlay?.querySelector("section"),
      grabber = sheet?.querySelector(".sheetGrabber");
    if (!overlay || !sheet) return;
    let startY = 0,
      startX = 0,
      dy = 0,
      drag = false;
    const interactive = (t) => !!t.closest("textarea,input,select,button,a");
    const reset = () => {
      drag = false;
      dy = 0;
      sheet.style.transition = "transform .18s ease";
      sheet.style.transform = "";
      overlay.style.background = "";
    };
    const close = () => {
      drag = false;
      sheet.style.transition = "transform .18s ease";
      sheet.style.transform = "translateY(100%)";
      setTimeout(() => {
        overlay.classList.remove("on");
        sheet.style.transform = "";
        sheet.style.transition = "";
        overlay.style.background = "";
      }, 180);
    };
    const begin = (x, y, target, force = false) => {
      if (interactive(target) && !force) return false;
      if (!force && sheet.scrollTop > 1) return false;
      startX = x;
      startY = y;
      dy = 0;
      drag = true;
      sheet.style.transition = "none";
      return true;
    };
    const move = (x, y, e) => {
      if (!drag) return;
      const dx = x - startX,
        raw = y - startY;
      if (raw <= 0 || Math.abs(dx) > Math.abs(raw) * 1.15) return;
      if (raw > 4 && e?.cancelable) e.preventDefault();
      dy = Math.max(0, raw);
      sheet.style.transform = "translateY(" + dy + "px)";
      overlay.style.background =
        "rgba(12,33,26," + Math.max(0.06, 0.52 - dy / 620) + ")";
    };
    const endDrag = () => {
      if (!drag) return;
      if (dy > 72) close();
      else reset();
    };
    sheet.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        begin(
          t.clientX,
          t.clientY,
          e.target,
          !!e.target.closest(".sheetGrabber"),
        );
      },
      { passive: true },
    );
    sheet.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        move(t.clientX, t.clientY, e);
      },
      { passive: false },
    );
    sheet.addEventListener("touchend", endDrag, { passive: true });
    sheet.addEventListener("touchcancel", reset, { passive: true });
    if (grabber) {
      grabber.style.touchAction = "none";
      grabber.addEventListener("pointerdown", (e) => {
        if (begin(e.clientX, e.clientY, e.target, true))
          grabber.setPointerCapture?.(e.pointerId);
      });
      grabber.addEventListener("pointermove", (e) =>
        move(e.clientX, e.clientY, e),
      );
      grabber.addEventListener("pointerup", endDrag);
      grabber.addEventListener("pointercancel", reset);
    }
  }
  attachSwipeClose("dayScheduleModal");
  attachSwipeClose("appointmentDetailModal");
})();
