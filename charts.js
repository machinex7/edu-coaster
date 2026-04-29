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
  // items: [{ label, value }] — bars scale relative to the max value (or pass max to fix it).
  // formatValue: optional fn(value) → string for the right-hand label; defaults to String(value).
  // sentimentAxis: if true, renders 😡/😊 endpoints below the bars.
  // coloredBars:   if true, colors bars red/amber/green based on 0–100 value.
  barChart({ title, subtitle, items, formatValue, emptyMessage, max: maxOverride, sentimentAxis, coloredBars } = {}) {
    if (!items || items.length === 0)
      return emptyMessage ? `<p class="empty-note">${emptyMessage}</p>` : '';
    const max = maxOverride ?? Math.max(...items.map(d => d.value), 1);
    const fmt = formatValue ?? (v => String(v));

    const titleHtml    = title    ? `<div class="panel-section-header">${title}</div>`  : '';
    const subtitleHtml = subtitle ? `<div class="chart-subtitle">${subtitle}</div>` : '';

    const barStyle = coloredBars
      ? v => { const c = v < 40 ? '#ef4444' : v < 70 ? '#f59e0b' : '#22c55e'; return `background:${c}`; }
      : () => '';

    const bars = items.map(d => {
      const widthPct = Math.round(d.value / max * 100);
      const style    = barStyle(d.value);
      return `
        <div class="chart-row">
          <span class="chart-row-label">${d.label}</span>
          <div class="chart-bar-wrap">
            <div class="chart-bar" style="width:${widthPct}%;${style}"></div>
          </div>
          <span class="chart-row-value">${fmt(d.value)}</span>
        </div>`;
    }).join('');

    const axisHtml = sentimentAxis
      ? `<div class="chart-row chart-sentiment-axis">
           <span></span>
           <div class="chart-sentiment-labels"><span>😡</span><span>😊</span></div>
           <span></span>
         </div>`
      : '';

    return `${titleHtml}${subtitleHtml}<div class="chart-bars">${bars}${axisHtml}</div>`;
  },

};
