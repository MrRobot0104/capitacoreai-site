function renderDashboard(c) {
  const accentPalettes = [
    { accent: '#6366f1', accent2: '#8b5cf6', rgb: '99,102,241', rgb2: '139,92,246' },
    { accent: '#06b6d4', accent2: '#0891b2', rgb: '6,182,212',  rgb2: '8,145,178'  },
    { accent: '#10b981', accent2: '#059669', rgb: '16,185,129', rgb2: '5,150,105'  },
    { accent: '#f59e0b', accent2: '#d97706', rgb: '245,158,11', rgb2: '217,119,6'  },
    { accent: '#f43f5e', accent2: '#e11d48', rgb: '244,63,94',  rgb2: '225,29,72'  },
  ];
  const titleHash = (c.title || '').split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const p = accentPalettes[titleHash % accentPalettes.length];
  const seriesColors = ['#6366f1','#06b6d4','#10b981','#f59e0b','#f43f5e','#8b5cf6','#0ea5e9','#14b8a6'];
  const kpiIcons = ['dollar-sign','bar-chart-2','package','percent','trending-up','zap','target','users','activity','arrow-up-right'];

  function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // KPI Cards
  let kpiHtml = '';
  if (c.kpis && c.kpis.length) {
    const cards = c.kpis.map((k, i) => {
      const ch = String(k.change || '');
      const isPos = /^\+|up|above/i.test(ch) && !/below|-/i.test(ch);
      const isNeg = /^-|down|below/i.test(ch);
      const cls = isPos ? 'pos' : isNeg ? 'neg' : 'neu';
      const icon = kpiIcons[i % kpiIcons.length];
      return '<div class="kpi anim" style="--delay:' + (i * 80) + 'ms">' +
        '<div class="kpi-bar"></div><div class="kpi-inner">' +
        '<div class="kpi-icon-wrap"><i data-lucide="' + icon + '"></i></div>' +
        '<div class="kpi-val">' + esc(k.value) + '</div>' +
        '<div class="kpi-label">' + esc(k.label) + '</div>' +
        (k.change ? '<div class="kpi-badge ' + cls + '"><i data-lucide="' + (isPos ? 'trending-up' : isNeg ? 'trending-down' : 'minus') + '"></i><span>' + esc(ch) + '</span></div>' : '') +
        (k.subtitle ? '<div class="kpi-sub">' + esc(k.subtitle) + '</div>' : '') +
        '</div></div>';
    }).join('');
    kpiHtml = '<section class="section"><div class="section-label"><i data-lucide="layout-dashboard"></i>Key Performance Indicators</div><div class="kpi-row">' + cards + '</div></section>';
  }

  // Charts
  let chartsHtml = '';
  let chartsJs = '';
  if (c.charts && c.charts.length) {
    const n = Math.min(c.charts.length, 4);
    chartsHtml = '<section class="section"><div class="section-label"><i data-lucide="bar-chart-2"></i>Data Analysis</div><div class="charts-row c' + n + '">' +
      c.charts.map((ch, i) =>
        '<div class="chart-card anim" style="--delay:' + (300 + i * 100) + 'ms">' +
        '<div class="chart-head"><div><div class="chart-title">' + esc(ch.title || 'Chart') + '</div>' +
        (ch.subtitle ? '<div class="chart-sub">' + esc(ch.subtitle) + '</div>' : '') +
        '</div><div class="chart-tag">' + esc((ch.type || 'bar').replace('horizontalBar', 'Horizontal Bar')) + '</div></div>' +
        '<div class="chart-box" id="apex-' + i + '"></div></div>'
      ).join('') + '</div></section>';

    // Build ApexCharts init code
    const chartInits = c.charts.map((ch, i) => {
      const t = ch.type || 'bar';
      const labels = (ch.labels || []).map(l => '"' + esc(String(l)).substring(0, 30) + '"').join(',');
      const datasets = ch.datasets || [];

      if (t === 'doughnut' || t === 'pie') {
        const data = datasets[0] ? datasets[0].data.join(',') : '';
        const colors = datasets[0] ? datasets[0].data.map((_, ci) => '"' + seriesColors[ci % seriesColors.length] + '"').join(',') : '';
        return 'new ApexCharts(document.getElementById("apex-' + i + '"),{chart:{type:"' + (t === 'doughnut' ? 'donut' : 'pie') + '",height:300,background:"transparent",fontFamily:"Inter"},theme:{mode:"dark"},series:[' + data + '],labels:[' + labels + '],colors:[' + colors + '],' +
          (t === 'doughnut' ? 'plotOptions:{pie:{donut:{size:"68%"}}},' : '') +
          'legend:{position:"bottom",labels:{colors:"#94a3b8"}},stroke:{width:2,colors:["#0a0a0f"]},tooltip:{theme:"dark"}}).render();';
      }

      const isHoriz = t === 'horizontalBar';
      const isLine = t === 'line';
      const apexType = isLine ? 'area' : 'bar';
      const series = datasets.map((d, di) =>
        '{name:"' + esc(d.label || '') + '",data:[' + (d.data || []).join(',') + ']}'
      ).join(',');
      const colors = datasets.map((_, di) => '"' + seriesColors[di % seriesColors.length] + '"').join(',');

      let opts = 'chart:{type:"' + apexType + '",height:300,background:"transparent",toolbar:{show:false},fontFamily:"Inter"},theme:{mode:"dark"},series:[' + series + '],xaxis:{categories:[' + labels + '],labels:{style:{colors:"#64748b",fontSize:"11px"}},axisBorder:{show:false},axisTicks:{show:false}},yaxis:{labels:{style:{colors:"#64748b",fontSize:"11px"}}},colors:[' + colors + '],grid:{borderColor:"rgba(255,255,255,0.06)",strokeDashArray:4},tooltip:{theme:"dark"},legend:{position:"bottom",labels:{colors:"#94a3b8"}}';

      if (isLine) {
        opts += ',stroke:{curve:"smooth",width:3},fill:{type:"gradient",gradient:{opacityFrom:0.4,opacityTo:0.05}},markers:{size:4,strokeWidth:0}';
      } else if (isHoriz) {
        opts += ',plotOptions:{bar:{horizontal:true,borderRadius:4,barHeight:"60%"}}';
      } else {
        opts += ',plotOptions:{bar:{borderRadius:6,columnWidth:"60%"}}';
      }

      return 'new ApexCharts(document.getElementById("apex-' + i + '"),{' + opts + '}).render();';
    }).join('\n');

    chartsJs = '<script>document.addEventListener("DOMContentLoaded",function(){' + chartInits + '});<\/script>';
  }

  // Table
  let tableHtml = '';
  if (c.table && c.table.headers && c.table.rows && c.table.rows.length) {
    tableHtml = '<section class="section"><div class="section-label"><i data-lucide="table-2"></i>Detailed Data</div>' +
      '<div class="tbl-card anim" style="--delay:600ms">' +
      '<div class="tbl-head"><span class="tbl-title">' + (c.table.title ? esc(c.table.title) : 'Data Table') + '</span>' +
      '<span class="tbl-count">' + c.table.rows.length + ' records</span></div>' +
      '<div class="tbl-wrap"><table><thead><tr>' +
      c.table.headers.map(h => '<th>' + esc(h) + '</th>').join('') +
      '</tr></thead><tbody>' +
      c.table.rows.map((row, ri) => '<tr class="' + (ri % 2 ? 'alt' : '') + '">' + row.map(cell => {
        const v = String(cell);
        const isMoney = /^\$[\d,.]+/.test(v);
        const isPct = /[\d.]+%/.test(v);
        const isPos = /^\+/.test(v) || parseFloat(v) > 0;
        return '<td' + (isMoney ? ' class="money"' : '') + '>' + (isPct ? '<span class="pct-badge ' + (isPos ? 'pos' : 'neg') + '">' + esc(v) + '</span>' : esc(v)) + '</td>';
      }).join('') + '</tr>').join('') +
      '</tbody></table></div></div></section>';
  }

  // Badges
  let badgesHtml = '';
  if (c.badges && c.badges.length) {
    badgesHtml = '<div class="header-badges">' + c.badges.map(b =>
      '<span class="badge ' + (b.color || '') + '">' + esc(b.text) + '</span>'
    ).join('') + '</div>';
  }

  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">' +
    '<script src="https://cdn.jsdelivr.net/npm/apexcharts"><\/script>' +
    '<script src="https://unpkg.com/lucide@latest"><\/script>' +
    '<style>' +
    ':root{--accent:' + p.accent + ';--accent-2:' + p.accent2 + ';--accent-rgb:' + p.rgb + ';--accent-2-rgb:' + p.rgb2 + ';--bg:#0a0a0f;--bg-card:rgba(255,255,255,0.04);--border:rgba(255,255,255,0.08);--text-primary:#f1f5f9;--text-secondary:#94a3b8;--text-muted:#475569;--positive:#10b981;--negative:#f43f5e;--radius:16px;--shadow-card:0 0 0 1px var(--border),0 4px 24px rgba(0,0,0,0.4)}' +
    '*{margin:0;padding:0;box-sizing:border-box}' +
    'body{font-family:"Inter",system-ui,sans-serif;background:var(--bg);color:var(--text-primary);-webkit-font-smoothing:antialiased;' +
    'background-image:radial-gradient(ellipse 80% 50% at 20% -10%,rgba(var(--accent-rgb),0.12) 0%,transparent 60%),radial-gradient(ellipse 60% 40% at 80% 110%,rgba(var(--accent-2-rgb),0.08) 0%,transparent 60%)}' +
    'body::before{content:"";position:fixed;inset:0;background-image:radial-gradient(rgba(255,255,255,0.03) 1px,transparent 1px);background-size:24px 24px;pointer-events:none;z-index:0}' +
    '.dash{max-width:1400px;margin:0 auto;padding:40px 32px;position:relative;z-index:1}' +
    '.section{margin-bottom:48px}' +
    '.section-label{font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-muted);margin-bottom:16px;display:flex;align-items:center;gap:8px}' +
    '.section-label i{width:14px;height:14px;color:var(--accent)}' +
    '.header{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:32px 36px;margin-bottom:48px;backdrop-filter:blur(20px) saturate(180%);position:relative;overflow:hidden}' +
    '.header::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--accent),var(--accent-2))}' +
    '.header h1{font-size:28px;font-weight:900;letter-spacing:-0.03em;background:linear-gradient(135deg,var(--text-primary),var(--accent));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}' +
    '.header p{font-size:13px;color:var(--text-secondary);margin-top:4px}' +
    '.header-badges{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}' +
    '.badge{font-size:10px;font-weight:600;padding:4px 12px;border-radius:20px;background:rgba(255,255,255,0.06);color:var(--text-secondary);border:1px solid var(--border)}' +
    '.badge.green{background:rgba(16,185,129,0.1);color:#10b981;border-color:rgba(16,185,129,0.2)}' +
    '.badge.blue{background:rgba(99,102,241,0.1);color:#818cf8;border-color:rgba(99,102,241,0.2)}' +
    '.badge.amber{background:rgba(245,158,11,0.1);color:#fbbf24;border-color:rgba(245,158,11,0.2)}' +
    '.kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}' +
    '.kpi{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;backdrop-filter:blur(20px) saturate(180%);transition:transform 0.3s ease,box-shadow 0.3s ease}' +
    '.kpi:hover{transform:translateY(-2px);box-shadow:var(--shadow-card),0 0 40px rgba(var(--accent-rgb),0.1)}' +
    '.kpi-bar{height:3px;background:linear-gradient(90deg,var(--accent),var(--accent-2))}' +
    '.kpi-inner{padding:20px 24px}' +
    '.kpi-icon-wrap{width:36px;height:36px;border-radius:10px;background:rgba(var(--accent-rgb),0.12);display:flex;align-items:center;justify-content:center;margin-bottom:14px}' +
    '.kpi-icon-wrap i{width:18px;height:18px;color:var(--accent)}' +
    '.kpi-val{font-size:30px;font-weight:900;letter-spacing:-0.02em;line-height:1.1;margin-bottom:4px}' +
    '.kpi-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:8px}' +
    '.kpi-badge{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px}' +
    '.kpi-badge i{width:12px;height:12px}' +
    '.kpi-badge.pos{background:rgba(16,185,129,0.12);color:#10b981}' +
    '.kpi-badge.neg{background:rgba(244,63,94,0.12);color:#f43f5e}' +
    '.kpi-badge.neu{background:rgba(255,255,255,0.06);color:var(--text-secondary)}' +
    '.kpi-sub{font-size:10px;color:var(--text-muted);margin-top:6px}' +
    '.charts-row{display:grid;gap:16px}.c1{grid-template-columns:1fr}.c2{grid-template-columns:1fr 1fr}.c3{grid-template-columns:1fr 1fr 1fr}.c4{grid-template-columns:1fr 1fr}' +
    '.chart-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:24px;backdrop-filter:blur(20px) saturate(180%);transition:transform 0.3s ease,box-shadow 0.3s ease}' +
    '.chart-card:hover{transform:translateY(-2px);box-shadow:var(--shadow-card)}' +
    '.chart-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}' +
    '.chart-title{font-size:15px;font-weight:700;color:var(--text-primary)}.chart-sub{font-size:11px;color:var(--text-muted);margin-top:2px}' +
    '.chart-tag{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--accent);background:rgba(var(--accent-rgb),0.1);padding:4px 10px;border-radius:6px;white-space:nowrap}' +
    '.chart-box{height:300px}' +
    '.tbl-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;backdrop-filter:blur(20px) saturate(180%)}' +
    '.tbl-head{display:flex;justify-content:space-between;align-items:center;padding:18px 24px;border-bottom:1px solid var(--border)}' +
    '.tbl-title{font-size:15px;font-weight:700;color:var(--text-primary)}.tbl-count{font-size:11px;font-weight:600;color:var(--text-muted);background:rgba(255,255,255,0.06);padding:4px 12px;border-radius:8px}' +
    '.tbl-wrap{overflow-x:auto}' +
    'table{width:100%;border-collapse:collapse}' +
    'th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);font-weight:700;padding:12px 16px;background:rgba(255,255,255,0.03);border-bottom:1px solid var(--border);position:sticky;top:0}' +
    'td{font-size:12px;color:var(--text-secondary);padding:11px 16px;border-bottom:1px solid rgba(255,255,255,0.04)}' +
    'tr.alt td{background:rgba(255,255,255,0.015)}' +
    'tr:hover td{background:rgba(var(--accent-rgb),0.04)}' +
    'td.money{font-weight:700;font-variant-numeric:tabular-nums;color:var(--text-primary)}' +
    '.pct-badge{font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;display:inline-block}' +
    '.pct-badge.pos{background:rgba(16,185,129,0.12);color:#10b981}' +
    '.pct-badge.neg{background:rgba(244,63,94,0.12);color:#f43f5e}' +
    '.footer{text-align:center;padding:40px;font-size:11px;color:var(--text-muted)}' +
    '.footer b{background:linear-gradient(135deg,var(--accent),var(--accent-2));-webkit-background-clip:text;-webkit-text-fill-color:transparent}' +
    '.anim{opacity:0;transform:translateY(20px);animation:fadeUp 0.6s ease-out forwards;animation-delay:var(--delay,0ms)}' +
    '@keyframes fadeUp{to{opacity:1;transform:translateY(0)}}' +
    '@media(max-width:900px){.c2,.c3,.c4{grid-template-columns:1fr}.kpi-row{grid-template-columns:1fr 1fr}}' +
    '@media(max-width:600px){.kpi-row{grid-template-columns:1fr}.dash{padding:20px 16px}}' +
    '</style></head><body>' +
    '<div class="dash">' +
    '<div class="header anim"><h1>' + esc(c.title || 'Dashboard') + '</h1>' +
    (c.subtitle ? '<p>' + esc(c.subtitle) + '</p>' : '') + badgesHtml + '</div>' +
    kpiHtml + chartsHtml + tableHtml +
    '<div class="footer">Built with <b>DashPilot</b> by CapitaCoreAI</div></div>' +
    chartsJs +
    '<script>if(typeof lucide!=="undefined")lucide.createIcons();<\/script>' +
    '</body></html>';
}
if(typeof module!=='undefined')module.exports={renderDashboard};
