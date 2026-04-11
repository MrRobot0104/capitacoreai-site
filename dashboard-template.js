function renderDashboard(c) {
  const colors = ['#2563eb','#0891b2','#7c3aed','#059669','#dc2626','#ea580c','#4f46e5','#0d9488','#c026d3','#65a30d'];
  const gradients = [
    'linear-gradient(135deg,#2563eb,#3b82f6)','linear-gradient(135deg,#059669,#10b981)',
    'linear-gradient(135deg,#7c3aed,#8b5cf6)','linear-gradient(135deg,#ea580c,#f97316)',
    'linear-gradient(135deg,#dc2626,#ef4444)'
  ];
  const icons = ['💰','📊','💵','📦','📈','🎯','⚡','🔄','✅','📉'];

  function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

  // KPIs
  let kpiHtml='';
  if(c.kpis&&c.kpis.length){
    kpiHtml='<div class="section-label">KEY PERFORMANCE INDICATORS</div><div class="kpi-row">'+c.kpis.map((k,i)=>
      '<div class="kpi anim" style="animation-delay:'+(i*80)+'ms"><div class="kpi-top" style="background:'+gradients[i%gradients.length]+'"></div>'+
      '<div class="kpi-icon">'+icons[i%icons.length]+'</div>'+
      '<div class="kpi-val">'+esc(k.value)+'</div>'+
      '<div class="kpi-label">'+esc(k.label)+'</div>'+
      (k.change?'<div class="kpi-change '+(String(k.change).match(/^\+|↑|up|above|below/i)?String(k.change).match(/below|↓|-/)?'neg':'pos':'')+'">'+
      (String(k.change).match(/^\+|↑|up|above/i)&&!String(k.change).match(/below/)? '↑ ':'')+
      (String(k.change).match(/^-|↓|down|below/i)? '↓ ':'')+esc(k.change)+'</div>':'')+
      '<div class="kpi-sub">'+(k.subtitle?esc(k.subtitle):'')+'</div></div>'
    ).join('')+'</div>';
  }

  // Charts
  let chartsHtml='';
  if(c.charts&&c.charts.length){
    const n=Math.min(c.charts.length,3);
    chartsHtml='<div class="section-label">DATA ANALYSIS</div><div class="charts-row c'+n+'">'+c.charts.map((ch,i)=>
      '<div class="chart-card anim" style="animation-delay:'+(300+i*100)+'ms">'+
      '<div class="chart-head"><div><div class="chart-title">'+esc(ch.title||'Chart')+'</div>'+
      (ch.subtitle?'<div class="chart-sub">'+esc(ch.subtitle)+'</div>':'')+
      '</div><div class="chart-tag">'+esc((ch.type||'bar').replace('horizontalBar','Horizontal Bar'))+'</div></div>'+
      '<div class="chart-box"><canvas id="c'+i+'"></canvas></div></div>'
    ).join('')+'</div>';
  }

  // Table
  let tableHtml='';
  if(c.table&&c.table.headers&&c.table.rows&&c.table.rows.length){
    tableHtml='<div class="section-label">DETAILED DATA</div><div class="tbl-card anim" style="animation-delay:600ms">'+
      '<div class="tbl-head"><span class="tbl-title">'+(c.table.title?esc(c.table.title):'Data Table')+'</span>'+
      '<span class="tbl-count">'+c.table.rows.length+' records</span></div>'+
      '<div class="tbl-wrap"><table><thead><tr>'+
      c.table.headers.map(h=>'<th>'+esc(h)+'</th>').join('')+
      '</tr></thead><tbody>'+
      c.table.rows.map(row=>'<tr>'+row.map(cell=>{
        const v=String(cell);const m=v.match(/^\$[\d,.]+/);const p=v.match(/[\d.]+%/);
        return '<td'+(m?' class="money"':'')+(p?' class="pct"':'')+'>'+esc(v)+'</td>';
      }).join('')+'</tr>').join('')+
      '</tbody></table></div></div>';
  }

  // Chart.js script
  let chartJs='';
  if(c.charts&&c.charts.length){
    chartJs='<script>window.addEventListener("load",function(){Chart.defaults.font.family="Inter";'+
    c.charts.map((ch,i)=>{
      const t=ch.type||'bar';const rt=t==='horizontalBar'?'bar':t;const ix=t==='horizontalBar'?',indexAxis:"y"':'';
      const isPie=t==='doughnut'||t==='pie';
      const ds=(ch.datasets||[]).map((d,di)=>{
        let o='{label:"'+esc(d.label||'')+'",data:['+((d.data||[]).join(','))+']';
        if(isPie)o+=',backgroundColor:['+((d.data||[]).map((_,ci)=>'"'+colors[ci%colors.length]+'"').join(','))+'],borderWidth:2,borderColor:"#fff",hoverOffset:8';
        else if(t==='line')o+=',borderColor:"'+colors[di%colors.length]+'",backgroundColor:"'+colors[di%colors.length]+'18",fill:true,tension:0.4,pointRadius:4,pointBackgroundColor:"#fff",pointBorderColor:"'+colors[di%colors.length]+'",pointBorderWidth:2';
        else o+=',backgroundColor:"'+colors[di%colors.length]+'",borderRadius:8,maxBarThickness:48';
        return o+'}';
      }).join(',');
      return 'new Chart(document.getElementById("c'+i+'"),{type:"'+rt+'",data:{labels:['+
        (ch.labels||[]).map(l=>'"'+esc(String(l)).substring(0,25)+'"').join(',')+'],datasets:['+ds+']},options:{responsive:true,maintainAspectRatio:false'+ix+
        ',animation:{duration:1000,easing:"easeOutQuart"}'+
        ',plugins:{legend:{position:"bottom",labels:{padding:16,usePointStyle:true,pointStyle:"circle",font:{size:11,weight:"500"}}},tooltip:{backgroundColor:"rgba(0,0,0,0.85)",padding:12,cornerRadius:8,titleFont:{size:13,weight:"700"},bodyFont:{size:12}}}'+
        ',scales:'+(isPie?'{}':'{x:{grid:{display:false},ticks:{font:{size:10},color:"#999",maxRotation:45}},y:{grid:{color:"#f0f0f0",drawBorder:false},ticks:{font:{size:11},color:"#999"}}}')+
        '}});';
    }).join('')+'});<\/script>';
  }

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;background:#f0f2f5;color:#111;-webkit-font-smoothing:antialiased}
.dash{max-width:1280px;margin:0 auto;padding:32px}

/* Header */
.header{background:#fff;border-radius:16px;padding:28px 32px;margin-bottom:24px;box-shadow:0 1px 3px rgba(0,0,0,0.06);position:relative;overflow:hidden}
.header::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#2563eb,#0891b2,#7c3aed,#059669)}
.header h1{font-size:24px;font-weight:800;letter-spacing:-0.03em;margin-bottom:4px}
.header p{font-size:13px;color:#888}
.header-badges{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.badge{font-size:11px;font-weight:600;padding:4px 12px;border-radius:20px;background:#f0f2f5;color:#555}
.badge.green{background:#ecfdf5;color:#059669}.badge.blue{background:#eff6ff;color:#2563eb}.badge.amber{background:#fffbeb;color:#d97706}

/* Sections */
.section-label{font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#999;margin:28px 0 14px;padding-left:4px}

/* KPIs */
.kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px}
.kpi{background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04),0 6px 16px rgba(0,0,0,0.03);transition:transform 0.2s,box-shadow 0.2s}
.kpi:hover{transform:translateY(-3px);box-shadow:0 4px 20px rgba(0,0,0,0.1)}
.kpi-top{height:4px}
.kpi-icon{font-size:20px;padding:16px 20px 0}
.kpi-val{font-size:28px;font-weight:800;padding:4px 20px 0;letter-spacing:-0.02em;color:#111}
.kpi-label{font-size:12px;font-weight:600;color:#555;padding:2px 20px 0;text-transform:uppercase;letter-spacing:0.04em}
.kpi-change{font-size:11px;font-weight:600;padding:6px 20px 0}
.kpi-change.pos{color:#059669}.kpi-change.neg{color:#dc2626}
.kpi-sub{font-size:10px;color:#aaa;padding:4px 20px 16px}

/* Charts */
.charts-row{display:grid;gap:14px}.c1{grid-template-columns:1fr}.c2{grid-template-columns:1fr 1fr}.c3{grid-template-columns:1fr 1fr 1fr}
.chart-card{background:#fff;border-radius:14px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.04),0 6px 16px rgba(0,0,0,0.03);transition:transform 0.2s,box-shadow 0.2s}
.chart-card:hover{transform:translateY(-2px);box-shadow:0 4px 20px rgba(0,0,0,0.1)}
.chart-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}
.chart-title{font-size:15px;font-weight:700}.chart-sub{font-size:11px;color:#999;margin-top:2px}
.chart-tag{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#2563eb;background:#eff6ff;padding:4px 10px;border-radius:6px;white-space:nowrap}
.chart-box{position:relative;height:280px}

/* Table */
.tbl-card{background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04),0 6px 16px rgba(0,0,0,0.03)}
.tbl-head{display:flex;justify-content:space-between;align-items:center;padding:18px 24px;border-bottom:1px solid #f0f0f0}
.tbl-title{font-size:15px;font-weight:700}.tbl-count{font-size:11px;font-weight:600;color:#888;background:#f5f5f5;padding:4px 12px;border-radius:8px}
.tbl-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#888;font-weight:700;padding:10px 16px;background:#fafbfc;border-bottom:2px solid #eee;position:sticky;top:0}
td{font-size:12px;color:#444;padding:10px 16px;border-bottom:1px solid #f5f5f5}
tr:hover td{background:#f8f9fb}
td.money{font-weight:700;font-variant-numeric:tabular-nums;color:#111;font-family:'Inter',monospace}
td.pct{font-weight:600;color:#2563eb;background:#eff6ff;border-radius:4px;text-align:center;display:inline-block;padding:2px 8px;margin:2px 0}

/* Footer */
.footer{text-align:center;padding:32px;font-size:11px;color:#ccc}
.footer b{background:linear-gradient(135deg,#2563eb,#0891b2);-webkit-background-clip:text;-webkit-text-fill-color:transparent}

/* Animations */
.anim{opacity:0;transform:translateY(12px);animation:up 0.5s ease forwards}
@keyframes up{to{opacity:1;transform:translateY(0)}}

@media(max-width:768px){.c2,.c3{grid-template-columns:1fr}.kpi-row{grid-template-columns:1fr 1fr}.dash{padding:16px}}
</style></head><body>
<div class="dash">
<div class="header anim"><h1>${esc(c.title||'Dashboard')}</h1>${c.subtitle?'<p>'+esc(c.subtitle)+'</p>':''}${c.badges&&c.badges.length?'<div class="header-badges">'+c.badges.map(b=>'<span class="badge '+(b.color||'')+'">'+esc(b.text)+'</span>').join('')+'</div>':''}</div>
${kpiHtml}${chartsHtml}${tableHtml}
<div class="footer">Built with <b>DashPilot</b> by CapitaCoreAI</div>
</div>${chartJs}</body></html>`;
}
if(typeof module!=='undefined')module.exports={renderDashboard};
