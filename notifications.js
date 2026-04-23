// ── Notification system ────────────────────────────────────────────────────
// Each notification: { id, label, message, action }
//   label   — short text shown on the chip (e.g. "!!!" or "Staff")
//   message — full tooltip shown on hover
//   action  — optional callback fired when the player clicks to dismiss

const Notifications = {
  _queue: [],
  _idSeq: 0,

  push({ label, message, action = null }) {
    this._queue.push({ id: ++this._idSeq, label, message, action });
    this._render();
  },

  dismiss(id) {
    const idx = this._queue.findIndex(n => n.id === id);
    if (idx === -1) return;
    const [notif] = this._queue.splice(idx, 1);
    if (notif.action) notif.action();
    this._render();
  },

  _render() {
    const stack = document.getElementById('notification-stack');
    if (!stack) return;
    stack.innerHTML = this._queue.map(n => `
      <div class="notif-chip" data-id="${n.id}" data-message="${n.message.replace(/"/g, '&quot;')}">
        ${n.label}
      </div>
    `).join('');
    stack.querySelectorAll('.notif-chip').forEach(chip => {
      chip.addEventListener('click', () => this.dismiss(Number(chip.dataset.id)));
    });
  },
};
