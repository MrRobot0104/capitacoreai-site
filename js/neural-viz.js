// Neural Network Visualization for MerakiPilot
// Renders a living network topology that reacts to agent activity

(function() {
  var canvas = document.getElementById('neuralCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  var nodes = [];
  var connections = [];
  var particles = [];
  var pulses = [];
  var scanLines = [];
  var dataStreams = [];
  var state = 'idle'; // idle, connected, analyzing, acting
  var statusEl = document.getElementById('neuralStatus');
  var deviceData = [];
  var W, H;
  var animFrame;
  var centerNode = null;
  var time = 0;

  // ─── Resize ──────────────────────────────────────────────
  function resize() {
    W = canvas.parentElement.clientWidth;
    H = canvas.parentElement.clientHeight;
    canvas.width = W * window.devicePixelRatio;
    canvas.height = H * window.devicePixelRatio;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ─── Node class ──────────────────────────────────────────
  var networkScale = 'small';

  function createNode(x, y, type, label, status, meta) {
    var r;
    if (type === 'brain') r = networkScale === 'large' ? 22 : 28;
    else if (type === 'network') r = networkScale === 'large' ? 10 : networkScale === 'medium' ? 12 : 14;
    else r = networkScale === 'large' ? 3 : networkScale === 'medium' ? 5 : 8;
    return {
      x: x, y: y, targetX: x, targetY: y, vx: 0, vy: 0,
      radius: r, type: type, label: label || '',
      sublabel: (meta && meta.model) || '',
      clients: (meta && meta.clients) || 0,
      status: status || 'online',
      pulse: 0, glow: 0, activity: 0,
    };
  }

  // ─── Build topology from device data ─────────────────────
  window.neuralVizUpdate = function(data) {
    if (!data || !data.devices) return;
    deviceData = data.devices;
    nodes = [];
    connections = [];

    var totalDevices = data.devices.length;
    networkScale = totalDevices > 60 ? 'large' : totalDevices > 30 ? 'medium' : 'small';

    centerNode = createNode(W / 2, H / 2, 'brain', 'N', 'online');
    nodes.push(centerNode);

    var networks = {};
    data.devices.forEach(function(d) {
      var nid = d.networkId || 'unknown';
      if (!networks[nid]) networks[nid] = [];
      networks[nid].push(d);
    });

    var netKeys = Object.keys(networks);
    var netCount = netKeys.length;
    var netAngle = (Math.PI * 2) / Math.max(netCount, 1);
    var baseDist = networkScale === 'large' ? Math.min(W, H) * 0.38 :
                   networkScale === 'medium' ? Math.min(W, H) * 0.33 :
                   Math.min(W, H) * 0.28;

    netKeys.forEach(function(nid, ni) {
      var netInfo = (data.networks || []).find(function(n) { return n.id === nid; });
      var netName = netInfo ? netInfo.name : 'Network';
      var devs = networks[nid];

      var ringOffset = (netCount > 10 && ni % 2 === 1) ? baseDist * 0.7 : baseDist;
      var angle = netAngle * ni - Math.PI / 2;
      var nx = W / 2 + Math.cos(angle) * ringOffset;
      var ny = H / 2 + Math.sin(angle) * ringOffset;

      var netLabel = networkScale === 'large' ? netName.substring(0, 15) : netName;
      var netNode = createNode(nx, ny, 'network', netLabel, 'online');
      nodes.push(netNode);
      var netIdx = nodes.length - 1;
      connections.push({ from: 0, to: netIdx, active: true });

      var devAngle = (Math.PI * 2) / Math.max(devs.length, 1);
      var devDist = networkScale === 'large' ? 20 + Math.min(devs.length * 3, 40) :
                    networkScale === 'medium' ? 30 + devs.length * 5 :
                    50 + devs.length * 8;

      devs.forEach(function(d, di) {
        var da = devAngle * di - Math.PI / 2 + angle * 0.3;
        var dx = nx + Math.cos(da) * devDist;
        var dy = ny + Math.sin(da) * devDist;
        dx = Math.max(20, Math.min(W - 20, dx));
        dy = Math.max(20, Math.min(H - 20, dy));

        var devNode = createNode(dx, dy, 'device', d.name || d.model, d.status, { model: d.model, clients: d.clients || 0 });
        nodes.push(devNode);
        connections.push({ from: netIdx, to: nodes.length - 1, active: d.status === 'online' });
      });
    });

    setState('connected');
    document.getElementById('neuralStats').style.display = 'flex';
  };

  // ─── State management ────────────────────────────────────
  function setState(s) {
    state = s;
    if (statusEl) {
      statusEl.className = 'neural-status-text';
      if (s === 'idle') statusEl.textContent = 'Awaiting connection...';
      else if (s === 'connected') statusEl.textContent = 'Network mapped. All systems monitored.';
      else if (s === 'analyzing') statusEl.className = 'neural-status-text analyzing';
      else if (s === 'acting') statusEl.className = 'neural-status-text acting';
    }
  }

  window.neuralVizAnalyzing = function(msg) {
    setState('analyzing');
    if (statusEl) statusEl.textContent = msg || 'Analyzing network...';
    if (centerNode) { centerNode.glow = 1; spawnPulseWave(); }
    // Spawn scan lines across the network
    for (var i = 0; i < 3; i++) {
      setTimeout(function() { spawnScanLine(); }, i * 400);
    }
  };

  window.neuralVizDone = function(msg) {
    setState('connected');
    if (statusEl) statusEl.textContent = msg || 'Analysis complete.';
    setTimeout(function() {
      if (state === 'connected' && statusEl) statusEl.textContent = 'Network mapped. All systems monitored.';
    }, 3000);
  };

  window.neuralVizAction = function(msg) {
    setState('acting');
    if (statusEl) statusEl.textContent = msg || 'Executing changes...';
    if (centerNode) centerNode.glow = 1.5;
    spawnPulseWave(); spawnPulseWave();
    for (var i = 0; i < 5; i++) {
      setTimeout(function() { spawnScanLine(); }, i * 200);
    }
  };

  // ─── Particle system ─────────────────────────────────────
  function spawnParticle(fromNode, toNode, color) {
    particles.push({
      x: fromNode.x, y: fromNode.y,
      targetX: toNode.x, targetY: toNode.y,
      progress: 0,
      speed: 0.008 + Math.random() * 0.012,
      color: color || 'rgba(255,106,0,0.8)',
      size: 2 + Math.random() * 2,
      life: 1,
    });
  }

  function spawnPulseWave() {
    pulses.push({ x: W / 2, y: H / 2, radius: 0, maxRadius: Math.max(W, H) * 0.7, life: 1, speed: 4 });
  }

  // ─── Scan lines — horizontal sweeps across the viz ───────
  function spawnScanLine() {
    scanLines.push({
      y: Math.random() * H,
      speed: 1.5 + Math.random() * 2,
      life: 1,
      width: W,
      direction: Math.random() > 0.5 ? 1 : -1,
    });
  }

  // ─── Data streams — vertical falling hex data ────────────
  function spawnDataStream() {
    dataStreams.push({
      x: 20 + Math.random() * (W - 40),
      y: -20,
      speed: 1 + Math.random() * 2,
      chars: [],
      maxChars: 8 + Math.floor(Math.random() * 12),
      life: 1,
      hue: state === 'acting' ? 30 : 20, // orange tint
    });
  }

  // ─── Background data flow ────────────────────────────────
  function ambientParticles() {
    if (state === 'idle' || connections.length === 0) return;
    var rate = state === 'analyzing' ? 0.4 : state === 'acting' ? 0.6 : 0.12;
    if (Math.random() < rate) {
      var c = connections[Math.floor(Math.random() * connections.length)];
      if (!c.active && Math.random() > 0.1) return;
      var from = nodes[c.from];
      var to = nodes[c.to];
      var color;
      if (state === 'analyzing') color = 'rgba(255,140,51,0.9)';
      else if (state === 'acting') color = 'rgba(255,179,102,1)';
      else color = to.status === 'offline' ? 'rgba(239,68,68,0.6)' : 'rgba(255,106,0,0.7)';
      if (Math.random() > 0.5) spawnParticle(from, to, color);
      else spawnParticle(to, from, color);
    }
    // Spawn data streams during analysis/action
    if ((state === 'analyzing' || state === 'acting') && Math.random() < 0.15) {
      spawnDataStream();
    }
    // Ambient data streams when connected (slower)
    if (state === 'connected' && Math.random() < 0.02) {
      spawnDataStream();
    }
  }

  // ─── Draw ────────────────────────────────────────────────
  var hexChars = '0123456789ABCDEF:./>{}[]|=';

  function draw() {
    time += 0.016;
    ctx.clearRect(0, 0, W, H);

    // Background gradient
    var bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    bg.addColorStop(0, '#0f1520');
    bg.addColorStop(1, '#080b12');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,106,0,0.03)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx < W; gx += 40) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (var gy = 0; gy < H; gy += 40) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    // ─── Scan lines ────────────────────────────────────────
    for (var si = scanLines.length - 1; si >= 0; si--) {
      var sl = scanLines[si];
      sl.y += sl.speed * sl.direction;
      sl.life -= 0.008;
      if (sl.life <= 0 || sl.y > H + 20 || sl.y < -20) { scanLines.splice(si, 1); continue; }
      // Horizontal glow line
      var slGrad = ctx.createLinearGradient(0, sl.y - 2, 0, sl.y + 2);
      slGrad.addColorStop(0, 'rgba(255,106,0,0)');
      slGrad.addColorStop(0.5, 'rgba(255,106,0,' + (sl.life * 0.3) + ')');
      slGrad.addColorStop(1, 'rgba(255,106,0,0)');
      ctx.fillStyle = slGrad;
      ctx.fillRect(0, sl.y - 8, W, 16);
      // Sharp center line
      ctx.strokeStyle = 'rgba(255,106,0,' + (sl.life * 0.5) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, sl.y); ctx.lineTo(W, sl.y); ctx.stroke();
    }

    // ─── Data streams (falling hex characters) ─────────────
    for (var di = dataStreams.length - 1; di >= 0; di--) {
      var ds = dataStreams[di];
      ds.y += ds.speed;
      ds.life -= 0.003;
      // Add new character at the head
      if (ds.chars.length < ds.maxChars && Math.random() < 0.4) {
        ds.chars.push({ ch: hexChars[Math.floor(Math.random() * hexChars.length)], alpha: 1 });
      }
      if (ds.life <= 0 || ds.y > H + ds.maxChars * 14) { dataStreams.splice(di, 1); continue; }
      // Draw characters top to bottom
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      for (var ci = 0; ci < ds.chars.length; ci++) {
        var ch = ds.chars[ci];
        ch.alpha *= 0.995;
        var cy = ds.y - ci * 14;
        if (cy < 0 || cy > H) continue;
        var brightness = ci === 0 ? 1 : Math.max(0.1, 1 - ci * 0.08);
        ctx.fillStyle = 'rgba(255,' + (106 + ds.hue) + ',0,' + (ch.alpha * brightness * ds.life * 0.7) + ')';
        ctx.fillText(ch.ch, ds.x, cy);
        // Randomize characters occasionally for the "running" effect
        if (Math.random() < 0.05) ch.ch = hexChars[Math.floor(Math.random() * hexChars.length)];
      }
    }

    // ─── Pulses ────────────────────────────────────────────
    for (var pi = pulses.length - 1; pi >= 0; pi--) {
      var p = pulses[pi];
      p.radius += p.speed;
      p.life -= 0.008;
      if (p.life <= 0) { pulses.splice(pi, 1); continue; }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,106,0,' + (p.life * 0.2) + ')';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // ─── Connections ───────────────────────────────────────
    connections.forEach(function(c) {
      var from = nodes[c.from];
      var to = nodes[c.to];
      var alpha = c.active ? 0.15 : 0.05;
      if (state === 'analyzing') alpha = c.active ? 0.35 : 0.1;
      if (state === 'acting') alpha = c.active ? 0.4 : 0.1;
      // Pulsing connection brightness when connected
      if (state === 'connected' && c.active) alpha += Math.sin(time * 1.5 + c.from) * 0.05;

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = c.active ? 'rgba(255,106,0,' + alpha + ')' : 'rgba(239,68,68,' + alpha + ')';
      ctx.lineWidth = networkScale === 'large' ? (c.active ? 0.5 : 0.3) : networkScale === 'medium' ? (c.active ? 0.8 : 0.5) : (c.active ? 1.5 : 0.8);
      ctx.stroke();
    });

    // ─── Particles ─────────────────────────────────────────
    for (var i = particles.length - 1; i >= 0; i--) {
      var pt = particles[i];
      pt.progress += pt.speed;
      pt.life -= 0.005;
      if (pt.progress >= 1 || pt.life <= 0) { particles.splice(i, 1); continue; }
      pt.x = pt.x + (pt.targetX - pt.x) * pt.speed * 3;
      pt.y = pt.y + (pt.targetY - pt.y) * pt.speed * 3;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fillStyle = pt.color;
      ctx.fill();
      // Glow trail
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * 4, 0, Math.PI * 2);
      ctx.fillStyle = pt.color.replace(/[\d.]+\)$/, (pt.life * 0.25) + ')');
      ctx.fill();
    }

    // ─── Nodes ─────────────────────────────────────────────
    nodes.forEach(function(n) {
      n.glow *= 0.97;

      // Glow ring
      if (n.type === 'brain' || n.glow > 0.05) {
        var gr = ctx.createRadialGradient(n.x, n.y, n.radius, n.x, n.y, n.radius * 3.5 + n.glow * 25);
        gr.addColorStop(0, 'rgba(255,106,0,' + (0.2 + n.glow * 0.5) + ')');
        gr.addColorStop(1, 'rgba(255,106,0,0)');
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius * 3.5 + n.glow * 25, 0, Math.PI * 2);
        ctx.fillStyle = gr;
        ctx.fill();
      }

      // Subtle breathing glow for online devices when connected
      if (state !== 'idle' && n.type === 'device' && n.status === 'online') {
        var breathe = 0.05 + Math.sin(time * 1.2 + n.x * 0.01) * 0.03;
        var br = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius * 3);
        br.addColorStop(0, 'rgba(255,106,0,' + breathe + ')');
        br.addColorStop(1, 'rgba(255,106,0,0)');
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius * 3, 0, Math.PI * 2);
        ctx.fillStyle = br;
        ctx.fill();
      }

      // Offline device warning pulse
      if (n.type === 'device' && n.status === 'offline' && state !== 'idle') {
        var warn = 0.15 + Math.sin(time * 3) * 0.1;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(239,68,68,' + warn + ')';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Node body
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);

      if (n.type === 'brain') {
        var pulse = 0.7 + Math.sin(time * 2) * 0.3;
        var brainGrad = ctx.createRadialGradient(n.x - 4, n.y - 4, 0, n.x, n.y, n.radius);
        brainGrad.addColorStop(0, 'rgba(255,140,51,' + pulse + ')');
        brainGrad.addColorStop(1, 'rgba(102,42,0,0.9)');
        ctx.fillStyle = brainGrad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,106,0,0.7)';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Rotating ring around brain
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + 6, time * 0.8, time * 0.8 + Math.PI * 1.2);
        ctx.strokeStyle = 'rgba(255,106,0,' + (0.2 + Math.sin(time) * 0.1) + ')';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Inner symbol
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.font = '700 14px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('N', n.x, n.y);
      } else if (n.type === 'network') {
        ctx.fillStyle = n.status === 'online' ? 'rgba(255,106,0,0.25)' : 'rgba(239,68,68,0.15)';
        ctx.fill();
        ctx.strokeStyle = n.status === 'online' ? 'rgba(255,106,0,0.5)' : 'rgba(239,68,68,0.3)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.fillStyle = n.status === 'online' ? 'rgba(255,106,0,0.7)' : n.status === 'dormant' ? 'rgba(255,179,102,0.4)' : 'rgba(239,68,68,0.6)';
        ctx.fill();
        if (n.status !== 'online') {
          ctx.strokeStyle = n.status === 'dormant' ? 'rgba(255,179,102,0.3)' : 'rgba(239,68,68,0.3)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // Labels
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      if (n.type === 'network') {
        ctx.fillStyle = 'rgba(255,255,255,' + (networkScale === 'large' ? '0.6' : '0.75') + ')';
        ctx.font = (networkScale === 'large' ? '500 9px' : '500 11px') + ' Inter';
        ctx.fillText(n.label, n.x, n.y + n.radius + 4);
      } else if (n.type === 'device' && networkScale === 'small') {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = '400 9px Inter';
        ctx.fillText(n.label, n.x, n.y + n.radius + 5);
        if (n.sublabel) {
          ctx.fillStyle = 'rgba(255,106,0,0.45)';
          ctx.font = '400 8px Inter';
          ctx.fillText(n.sublabel, n.x, n.y + n.radius + 16);
        }
        if (n.clients > 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.font = '400 8px Inter';
          ctx.fillText(n.clients + ' client' + (n.clients !== 1 ? 's' : ''), n.x, n.y + n.radius + (n.sublabel ? 26 : 16));
        }
      } else if (n.type === 'device' && networkScale === 'medium') {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '400 8px Inter';
        ctx.fillText(n.label, n.x, n.y + n.radius + 4);
      }
    });

    // ─── Edge status indicators ────────────────────────────
    // Ambient hex readout at bottom-left when connected
    if (state !== 'idle' && nodes.length > 0) {
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,106,0,0.15)';
      var readout = 'SYS:OK  NODES:' + nodes.length + '  T+' + Math.floor(time) + 's';
      ctx.fillText(readout, 12, H - 40);
      // Blinking cursor
      if (Math.floor(time * 2) % 2 === 0) {
        ctx.fillStyle = 'rgba(255,106,0,0.3)';
        ctx.fillRect(12 + ctx.measureText(readout).width + 4, H - 49, 6, 12);
      }
    }

    ambientParticles();
    animFrame = requestAnimationFrame(draw);
  }

  // ─── Idle animation — ambient hex rain ───────────────────
  setInterval(function() {
    if (state === 'idle') {
      // Light ambient data streams even when idle
      if (Math.random() < 0.3) spawnDataStream();
    }
  }, 800);

  draw();
})();
