function renderDashboard(config) {
  const c = config;
  const colors = ['#111111','#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316'];
  const bgColors = colors.map(c => c + '22');

  function fmt(v) {
    if (typeof v !== 'number') return v;
    if (Math.abs(v) >= 1e6) return '$' + (v/1e6).toFixed(2) + 'M';
    if (Math.abs(v) >= 1e3) return '$' + (v/1e3).toFixed(1) + 'K';
    if (v % 1 !== 0 && Math.abs(v) < 100) return v.toFixed(1) + '%';
    return v.toLocaleString();
  }

  let kpiHtml = '';
  if (c.kpis && c.kpis.length) {
    kpiHtml = '<div class="kpi-row">' + c.kpis.map(k =>
      '<div class="kpi-card"><div class="kpi-label">' + esc(k.label) + '</div><div class="kpi-value">' + esc(k.value) + '</div>' +
      (k.change ? '<div class="kpi-change ' + (k.change.startsWith('+') || k.change.startsWith('↑') ? 'positive' : k.change.startsWith('-') || k.change.startsWith('↓') ? 'negative' : '') + '">' + esc(k.change) + '</div>' : '') +
      '</div>'
    ).join('') + '</div>';
  }

  let chartsHtml = '';
  if (c.charts && c.charts.length) {
    chartsHtml = '<div class="charts-grid charts-' + Math.min(c.charts.length, 3) + '">' + c.charts.map((ch, i) =>
      '<div class="chart-card"><div class="chart-title">' + esc(ch.title || 'Chart') + '</div>' +
      (ch.subtitle ? '<div class="chart-subtitle">' + esc(ch.subtitle) + '</div>' : '') +
      '<div class="chart-container"><canvas id="chart' + i + '"></canvas></div></div>'
    ).join('') + '</div>';
  }

  let tableHtml = '';
  if (c.table && c.table.headers && c.table.rows && c.table.rows.length) {
    tableHtml = '<div class="table-card">' +
      (c.table.title ? '<div class="table-title">' + esc(c.table.title) + '</div>' : '') +
      '<div class="table-wrap"><table><thead><tr>' +
      c.table.headers.map(h => '<th>' + esc(h) + '</th>').join('') +
      '</tr></thead><tbody>' +
      c.table.rows.map((row, ri) => '<tr class="' + (ri % 2 ? 'alt' : '') + '">' + row.map(cell => '<td>' + esc(String(cell)) + '</td>').join('') + '</tr>').join('') +
      '</tbody></table></div></div>';
  }

  let chartScript = '';
  if (c.charts && c.charts.length) {
    chartScript = '<script>window.addEventListener("load",function(){' +
      c.charts.map((ch, i) => {
        const type = ch.type || 'bar';
        const ds = (ch.datasets || []).map((d, di) => {
          let obj = '{label:"' + esc(d.label || 'Series ' + (di+1)) + '",data:[' + (d.data || []).join(',') + ']';
          if (type === 'doughnut' || type === 'pie') {
            obj += ',backgroundColor:[' + (d.data || []).map((_, ci) => '"' + colors[ci % colors.length] + '"').join(',') + ']';
          } else if (type === 'line') {
            obj += ',borderColor:"' + colors[di % colors.length] + '",backgroundColor:"' + colors[di % colors.length] + '22",fill:true,tension:0.3';
          } else {
            obj += ',backgroundColor:"' + colors[di % colors.length] + '"';
          }
          return obj + '}';
        }).join(',');
        const indexAxis = type === 'horizontalBar' ? ',indexAxis:"y"' : '';
        const realType = type === 'horizontalBar' ? 'bar' : type;
        return 'new Chart(document.getElementById("chart' + i + '"),{type:"' + realType + '",data:{labels:[' +
          (ch.labels || []).map(l => '"' + esc(String(l)) + '"').join(',') + '],datasets:[' + ds + ']},options:{responsive:true,maintainAspectRatio:false' + indexAxis +
          ',plugins:{legend:{position:"bottom",labels:{font:{family:"Inter",size:12}}},tooltip:{backgroundColor:"#111",titleFont:{family:"Inter"},bodyFont:{family:"Inter"}}},scales:' +
          (type === 'doughnut' || type === 'pie' ? '{}' : '{x:{grid:{display:false},ticks:{font:{family:"Inter",size:11}}},y:{grid:{color:"#f0f0f0"},ticks:{font:{family:"Inter",size:11}}}}') +
          '}});';
      }).join('') +
    '});</script>';
  }

  function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">' +
    '<script src="https://cdn.jsdelivr.net/npm/chart.js@4"><\/script>' +
    '<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Inter",system-ui,sans-serif;background:#f5f5f5;color:#111;-webkit-font-smoothing:antialiased}' +
    '.dash{max-width:1200px;margin:0 auto;padding:32px}' +
    '.dash-header{margin-bottom:32px}.dash-header h1{font-size:28px;font-weight:700;letter-spacing:-0.03em;margin-bottom:4px}.dash-header p{font-size:14px;color:#999}' +
    '.kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:28px}' +
    '.kpi-card{background:#fff;border-radius:12px;padding:20px 24px;border:1px solid #e0e0e0}' +
    '.kpi-label{font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#999;font-weight:500;margin-bottom:6px}' +
    '.kpi-value{font-size:28px;font-weight:700;color:#111;letter-spacing:-0.02em}' +
    '.kpi-change{font-size:12px;font-weight:500;margin-top:4px;color:#999}.kpi-change.positive{color:#10b981}.kpi-change.negative{color:#ef4444}' +
    '.charts-grid{display:grid;gap:16px;margin-bottom:28px}.charts-1{grid-template-columns:1fr}.charts-2{grid-template-columns:1fr 1fr}.charts-3{grid-template-columns:1fr 1fr 1fr}' +
    '.chart-card{background:#fff;border-radius:12px;padding:24px;border:1px solid #e0e0e0}' +
    '.chart-title{font-size:15px;font-weight:600;margin-bottom:2px}.chart-subtitle{font-size:12px;color:#999;margin-bottom:16px}' +
    '.chart-container{position:relative;height:300px}' +
    '.table-card{background:#fff;border-radius:12px;border:1px solid #e0e0e0;overflow:hidden;margin-bottom:28px}' +
    '.table-title{font-size:15px;font-weight:600;padding:20px 24px 12px}' +
    '.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse}' +
    'th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#999;font-weight:500;padding:12px 16px;border-bottom:1px solid #e0e0e0;background:#fafafa}' +
    'td{font-size:13px;color:#555;padding:10px 16px;border-bottom:1px solid #f0f0f0}tr.alt td{background:#fafafa}tr:hover td{background:#f5f5f5}' +
    '.footer{text-align:center;padding:24px;font-size:11px;color:#ccc}' +
    '@media(max-width:768px){.charts-2,.charts-3{grid-template-columns:1fr}.kpi-row{grid-template-columns:1fr 1fr}}</style></head>' +
    '<body><div class="dash"><div class="dash-header"><h1>' + esc(c.title || 'Dashboard') + '</h1>' +
    (c.subtitle ? '<p>' + esc(c.subtitle) + '</p>' : '') + '</div>' +
    kpiHtml + chartsHtml + tableHtml +
    '<div class="footer">Built with znak by CapitaCoreAI</div></div>' +
    chartScript + '</body></html>';
}

if (typeof module !== 'undefined') module.exports = { renderDashboard };
