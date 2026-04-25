// charts.js — Reusable chart rendering utilities.
// All functions return HTML strings for insertion via innerHTML.
// Charts.showModal() renders a bar chart inside the shared #chart-modal overlay.

const Charts = {

  initModal() {
    document.getElementById('chart-modal-close').addEventListener('click', () => {
      document.getElementById('chart-modal').classList.add('hidden');
    });
  },

  // Populate and show the shared chart modal with a bar chart.
  showModal({ title, ...barChartOptions }) {
    document.getElementById('chart-modal-title').textContent = title ?? '';
    document.getElementById('chart-modal-body').innerHTML = this.barChart(barChartOptions);
    document.getElementById('chart-modal').classList.remove('hidden');
  },

  // Horizontal bar chart.
  // items: [{ label, value }] — bars scale relative to the max value.
  // title and subtitle are optional.
  // formatValue: optional fn(value) → string for the right-hand label; defaults to String(value).
  barChart({ title, subtitle, items, formatValue, emptyMessage } = {}) {
    if (!items || items.length === 0)
      return emptyMessage ? `<p class="empty-note">${emptyMessage}</p>` : '';
    const max = Math.max(...items.map(d => d.value), 1);
    const fmt = formatValue ?? (v => String(v));

    const titleHtml    = title    ? `<div class="panel-section-header">${title}</div>`  : '';
    const subtitleHtml = subtitle ? `<div class="chart-subtitle">${subtitle}</div>` : '';

    const bars = items.map(d => {
      const widthPct = Math.round(d.value / max * 100);
      return `
        <div class="chart-row">
          <span class="chart-row-label">${d.label}</span>
          <div class="chart-bar-wrap">
            <div class="chart-bar" style="width:${widthPct}%"></div>
          </div>
          <span class="chart-row-value">${fmt(d.value)}</span>
        </div>`;
    }).join('');

    return `${titleHtml}${subtitleHtml}<div class="chart-bars">${bars}</div>`;
  },

};
