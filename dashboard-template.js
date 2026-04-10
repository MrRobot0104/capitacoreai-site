function renderDashboard(config) {
  const c = config;
  const colors = ['#2563eb','#0891b2','#7c3aed','#059669','#dc2626','#ea580c','#4f46e5','#0d9488','#c026d3','#65a30d'];
  const softColors = ['rgba(37,99,235,0.12)','rgba(8,145,178,0.12)','rgba(124,58,237,0.12)','rgba(5,150,105,0.12)','rgba(220,38,38,0.12)','rgba(234,88,12,0.12)'];
  const gradients = ['linear-gradient(135deg,#2563eb,#0891b2)','linear-gradient(135deg,#7c3aed,#2563eb)','linear-gradient(135deg,#059669,#0891b2)','linear-gradient(135deg,#dc2626,#ea580c)'];

  function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  let kpiHtml = '';
  if (c.kpis && c.kpis.length) {
    kpiHtml = '<div class="kpi-row">' + c.kpis.map((k, i) =>
      '<div class="kpi-card anim" style="animation-delay:' + (i * 80) + 'ms"><div class="kpi-accent" style="background:' + gradients[i % gradients.length] + '"></div><div class="kpi-body"><div class="kpi-label">' + esc(k.label) + '</div><div class="kpi-value">' + esc(k.value) + '</div>' +
      (k.change ? '<div class="kpi-change ' + (String(k.change).match(/^\+|↑|up/i) ? 'positive' : String(k.change).match(/^-|↓|down/i) ? 'negative' : '') + '">' +
      (String(k.change).match(/^\+|↑|up/i) ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg> ' : '') +
      (String(k.change).match(/^-|↓|down/i) ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg> ' : '') +
      esc(k.change) + '</div>' : '') +
      '</div></div>'
    ).join('') + '</div>';
  }

  let chartsHtml = '';
  if (c.charts && c.charts.length) {
    const cols = Math.min(c.charts.length, 3);
    chartsHtml = '<div class="charts-grid charts-' + cols + '">' + c.charts.map((ch, i) =>
      '<div class="chart-card anim" style="animation-delay:' + (300 + i * 100) + 'ms"><div class="chart-header"><div><div class="chart-title">' + esc(ch.title || 'Chart') + '</div>' +
      (ch.subtitle ? '<div class="chart-subtitle">' + esc(ch.subtitle) + '</div>' : '') +
      '</div><div class="chart-badge">' + esc((ch.type || 'bar').toUpperCase()) + '</div></div>' +
      '<div class="chart-container"><canvas id="chart' + i + '"></canvas></div></div>'
    ).join('') + '</div>';
  }

  let tableHtml = '';
  if (c.table && c.table.headers && c.table.rows && c.table.rows.length) {
    tableHtml = '<div class="table-card anim" style="animation-delay:600ms">' +
      '<div class="table-header">' +
      (c.table.title ? '<div class="table-title">' + esc(c.table.title) + '</div>' : '') +
      '<div class="table-count">' + c.table.rows.length + ' records</div></div>' +
      '<div class="table-wrap"><table><thead><tr>' +
      c.table.headers.map(h => '<th>' + esc(h) + '</th>').join('') +
      '</tr></thead><tbody>' +
      c.table.rows.map((row, ri) => '<tr>' + row.map((cell, ci) => {
        const val = String(cell);
        const isMoney = val.match(/^\$[\d,.]+/);
        const isPct = val.match(/[\d.]+%$/);
        return '<td' + (isMoney ? ' class="money"' : '') + (isPct ? ' class="pct"' : '') + '>' + esc(val) + '</td>';
      }).join('') + '</tr>').join('') +
      '</tbody></table></div></div>';
  }

  let chartScript = '';
  if (c.charts && c.charts.length) {
    chartScript = '<script>window.addEventListener("load",function(){Chart.defaults.font.family="Inter";' +
      c.charts.map((ch, i) => {
        const type = ch.type || 'bar';
        const ds = (ch.datasets || []).map((d, di) => {
          let obj = '{label:"' + esc(d.label || 'Series ' + (di+1)) + '",data:[' + (d.data || []).join(',') + ']';
          if (type === 'doughnut' || type === 'pie') {
            obj += ',backgroundColor:[' + (d.data || []).map((_, ci) => '"' + colors[ci % colors.length] + '"').join(',') + '],borderWidth:0,hoverOffset:8';
          } else if (type === 'line') {
            obj += ',borderColor:"' + colors[di % colors.length] + '",backgroundColor:"' + colors[di % colors.length] + '15",fill:true,tension:0.4,pointRadius:4,pointBackgroundColor:"#fff",pointBorderColor:"' + colors[di % colors.length] + '",pointBorderWidth:2,pointHoverRadius:6';
          } else {
            obj += ',backgroundColor:"' + colors[di % colors.length] + '",borderRadius:6,maxBarThickness:40';
          }
          return obj + '}';
        }).join(',');
        const indexAxis = type === 'horizontalBar' ? ',indexAxis:"y"' : '';
        const realType = type === 'horizontalBar' ? 'bar' : type;
        const isPie = type === 'doughnut' || type === 'pie';
        return 'new Chart(document.getElementById("chart' + i + '"),{type:"' + realType + '",data:{labels:[' +
          (ch.labels || []).map(l => '"' + esc(String(l)) + '"').join(',') + '],datasets:[' + ds + ']},options:{responsive:true,maintainAspectRatio:false' + indexAxis +
          ',animation:{duration:800,easing:"easeOutQuart"}' +
          ',plugins:{legend:{position:"bottom",labels:{padding:16,usePointStyle:true,pointStyle:"circle",font:{size:11,weight:"500"}}},tooltip:{backgroundColor:"rgba(0,0,0,0.8)",padding:12,cornerRadius:8,titleFont:{size:13,weight:"600"},bodyFont:{size:12}}}' +
          ',scales:' + (isPie ? '{}' : '{x:{grid:{display:false},ticks:{font:{size:11},color:"#999"}},y:{grid:{color:"#f0f0f0",drawBorder:false},ticks:{font:{size:11},color:"#999"}}}') +
          '}});';
      }).join('') +
    '});<\/script>';
  }

  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">' +
    '<script src="https://cdn.jsdelivr.net/npm/chart.js@4"><\/script>' +
    '<style>' +
    '*{margin:0;padding:0;box-sizing:border-box}' +
    'body{font-family:"Inter",system-ui,sans-serif;background:#f8f9fb;color:#111;-webkit-font-smoothing:antialiased}' +
    '.dash{max-width:1240px;margin:0 auto;padding:40px 32px 60px}' +

    // Header
    '.dash-header{margin-bottom:36px;padding-bottom:24px;border-bottom:1px solid #e5e7eb}' +
    '.dash-header h1{font-size:26px;font-weight:800;letter-spacing:-0.03em;color:#111;margin-bottom:6px}' +
    '.dash-header p{font-size:13px;color:#888;letter-spacing:0.01em}' +

    // Animations
    '.anim{opacity:0;transform:translateY(16px);animation:fadeUp 0.5s ease forwards}' +
    '@keyframes fadeUp{to{opacity:1;transform:translateY(0)}}' +

    // KPIs
    '.kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:24px}' +
    '.kpi-card{background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02);transition:transform 0.2s,box-shadow 0.2s}' +
    '.kpi-card:hover{transform:translateY(-2px);box-shadow:0 4px 16px rgba(0,0,0,0.08)}' +
    '.kpi-accent{height:4px}' +
    '.kpi-body{padding:20px 24px}' +
    '.kpi-label{font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#888;font-weight:600;margin-bottom:8px}' +
    '.kpi-value{font-size:32px;font-weight:800;color:#111;letter-spacing:-0.03em;line-height:1.1}' +
    '.kpi-change{font-size:12px;font-weight:600;margin-top:8px;color:#888;display:flex;align-items:center;gap:2px}' +
    '.kpi-change.positive{color:#059669}.kpi-change.negative{color:#dc2626}' +

    // Charts
    '.charts-grid{display:grid;gap:16px;margin-bottom:24px}.charts-1{grid-template-columns:1fr}.charts-2{grid-template-columns:1fr 1fr}.charts-3{grid-template-columns:1fr 1fr 1fr}' +
    '.chart-card{background:#fff;border-radius:14px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02);transition:transform 0.2s,box-shadow 0.2s}' +
    '.chart-card:hover{transform:translateY(-2px);box-shadow:0 4px 16px rgba(0,0,0,0.08)}' +
    '.chart-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}' +
    '.chart-title{font-size:15px;font-weight:700;color:#111;margin-bottom:2px}' +
    '.chart-subtitle{font-size:12px;color:#888}' +
    '.chart-badge{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#888;background:#f3f4f6;padding:4px 10px;border-radius:6px}' +
    '.chart-container{position:relative;height:300px}' +

    // Table
    '.table-card{background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)}' +
    '.table-header{display:flex;justify-content:space-between;align-items:center;padding:20px 24px 16px}' +
    '.table-title{font-size:15px;font-weight:700;color:#111}' +
    '.table-count{font-size:12px;color:#888;background:#f3f4f6;padding:4px 12px;border-radius:6px;font-weight:500}' +
    '.table-wrap{overflow-x:auto}' +
    'table{width:100%;border-collapse:collapse}' +
    'th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#888;font-weight:600;padding:10px 16px;border-bottom:2px solid #f0f0f0;background:#fafbfc}' +
    'td{font-size:13px;color:#444;padding:11px 16px;border-bottom:1px solid #f5f5f5;transition:background 0.15s}' +
    'tr:hover td{background:#f8f9fb}' +
    'td.money{font-weight:600;font-variant-numeric:tabular-nums;color:#111}' +
    'td.pct{font-weight:600;color:#2563eb}' +

    // Footer
    '.footer{text-align:center;padding:32px;font-size:11px;color:#ccc;letter-spacing:0.03em}' +
    '.footer span{background:linear-gradient(135deg,#2563eb,#0891b2);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:600}' +

    '@media(max-width:768px){.charts-2,.charts-3{grid-template-columns:1fr}.kpi-row{grid-template-columns:1fr 1fr}.dash{padding:24px 16px}}' +
    '</style></head>' +
    '<body><div class="dash">' +
    '<div class="dash-header"><h1>' + esc(c.title || 'Dashboard') + '</h1>' +
    (c.subtitle ? '<p>' + esc(c.subtitle) + '</p>' : '') + '</div>' +
    kpiHtml + chartsHtml + tableHtml +
    '<div class="footer">Built with <span>znak</span> by CapitaCoreAI</div></div>' +
    chartScript + '</body></html>';
}

if (typeof module !== 'undefined') module.exports = { renderDashboard };
