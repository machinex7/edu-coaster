// ── Notification system ────────────────────────────────────────────────────
// Each notification: { id, label, message, action }
//   label   — short text shown on the chip (e.g. "!!!" or "Staff")
//   message — full tooltip shown on hover
//   action  — optional callback fired on left-click dismiss
//             right-click silently discards without firing the action

const Notifications = {
  _queue: [],
  _idSeq: 0,

  // Adds a notification chip to the stack and re-renders. label is the short
  // text shown on the chip; message is the full tooltip on hover; action is an
  // optional callback invoked only on left-click dismiss (not on discard).
  push({ label, message, action = null }) {
    this._queue.push({ id: ++this._idSeq, label, message, action });
    this._render();
  },

  // Removes the notification and fires its action callback. Triggered by a
  // left-click — intended to acknowledge the event and navigate to it.
  dismiss(id) {
    const idx = this._queue.findIndex(n => n.id === id);
    if (idx === -1) return;
    const [notif] = this._queue.splice(idx, 1);
    if (notif.action) notif.action();
    this._render();
  },

  // Removes the notification silently without firing its action. Triggered by
  // right-click — lets the player acknowledge and ignore without being redirected.
  discard(id) {
    const idx = this._queue.findIndex(n => n.id === id);
    if (idx === -1) return;
    this._queue.splice(idx, 1);
    this._render();
  },

  // Rebuilds the transient chip list from the current queue. Chips are ordered
  // newest-at-bottom via flex-direction:column-reverse on #notif-chips. The
  // persistent #incident-slot sibling is managed separately by Incidents.
  _render() {
    const chips = document.getElementById('notif-chips');
    if (!chips) return;
    chips.innerHTML = this._queue.map(n => `
      <div class="notif-chip" data-id="${n.id}" data-message="${n.message.replace(/"/g, '&quot;')}">
        ${n.label}
      </div>
    `).join('');
    chips.querySelectorAll('.notif-chip').forEach(chip => {
      const id = Number(chip.dataset.id);
      chip.addEventListener('click', () => this.dismiss(id));
      chip.addEventListener('contextmenu', e => { e.preventDefault(); this.discard(id); });
    });
  },
};
