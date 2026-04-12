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
  function createNode(x, y, type, label, status) {
    return {
      x: x, y: y,
      targetX: x, targetY: y,
      vx: 0, vy: 0,
      radius: type === 'brain' ? 28 : type === 'network' ? 14 : 8,
      type: type, // brain, network, device
      label: label || '',
      status: status || 'online',
      pulse: 0,
      glow: 0,
      activity: 0,
    };
  }

  // ─── Build topology from device data ─────────────────────
  window.neuralVizUpdate = function(data) {
    if (!data || !data.devices) return;
    deviceData = data.devices;

    nodes = [];
    connections = [];

    // Center brain node
    centerNode = createNode(W / 2, H / 2, 'brain', 'Noko', 'online');
    nodes.push(centerNode);

    // Group devices by network
    var networks = {};
    data.devices.forEach(function(d) {
      var nid = d.networkId || 'unknown';
      if (!networks[nid]) networks[nid] = [];
      networks[nid].push(d);
    });

    var netKeys = Object.keys(networks);
    var netAngle = (Math.PI * 2) / Math.max(netKeys.length, 1);

    netKeys.forEach(function(nid, ni) {
      // Find network name from data.networks
      var netInfo = (data.networks || []).find(function(n) { return n.id === nid; });
      var netName = netInfo ? netInfo.name : 'Network';

      var angle = netAngle * ni - Math.PI / 2;
      var dist = Math.min(W, H) * 0.28;
      var nx = W / 2 + Math.cos(angle) * dist;
      var ny = H / 2 + Math.sin(angle) * dist;

      var netNode = createNode(nx, ny, 'network', netName, 'online');
      var netIdx = nodes.length;
      nodes.push(netNode);
      connections.push({ from: 0, to: netIdx, active: true });

      // Devices around this network
      var devs = networks[nid];
      var devAngle = (Math.PI * 2) / Math.max(devs.length, 1);
      var devDist = 50 + devs.length * 8;

      devs.forEach(function(d, di) {
        var da = devAngle * di - Math.PI / 2 + angle * 0.3;
        var dx = nx + Math.cos(da) * devDist;
        var dy = ny + Math.sin(da) * devDist;
        // Keep in bounds
        dx = Math.max(60, Math.min(W - 60, dx));
        dy = Math.max(60, Math.min(H - 60, dy));

        var devNode = createNode(dx, dy, 'device', d.name || d.model, d.status);
        var devIdx = nodes.length;
        nodes.push(devNode);
        connections.push({ from: netIdx, to: devIdx, active: d.status === 'online' });
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
      if (s === 'idle') { statusEl.textContent = 'Awaiting connection...'; }
      else if (s === 'connected') { statusEl.textContent = 'Network mapped. All systems monitored.'; }
      else if (s === 'analyzing') { statusEl.className = 'neural-status-text analyzing'; }
      else if (s === 'acting') { statusEl.className = 'neural-status-text acting'; }
    }
  }

  // Called by merakipilot-app.js when Claude is thinking
  window.neuralVizAnalyzing = function(msg) {
    setState('analyzing');
    if (statusEl) statusEl.textContent = msg || 'Analyzing network...';
    // Pulse from center
    if (centerNode) {
      centerNode.glow = 1;
      spawnPulseWave();
    }
  };

  window.neuralVizDone = function(msg) {
    setState('connected');
    if (statusEl) statusEl.textContent = msg || 'Analysis complete.';
    // Fade back
    setTimeout(function() {
      if (state === 'connected' && statusEl) statusEl.textContent = 'Network mapped. All systems monitored.';
    }, 3000);
  };

  window.neuralVizAction = function(msg) {
    setState('acting');
    if (statusEl) statusEl.textContent = msg || 'Executing changes...';
    // Intense pulse
    if (centerNode) centerNode.glow = 1.5;
    spawnPulseWave();
    spawnPulseWave();
  };

  // ─── Particle system ─────────────────────────────────────
  function spawnParticle(fromNode, toNode, color) {
    particles.push({
      x: fromNode.x, y: fromNode.y,
      targetX: toNode.x, targetY: toNode.y,
      progress: 0,
      speed: 0.008 + Math.random() * 0.012,
      color: color || 'rgba(16,185,129,0.8)',
      size: 2 + Math.random() * 2,
      life: 1,
    });
  }

  function spawnPulseWave() {
    pulses.push({ x: W / 2, y: H / 2, radius: 0, maxRadius: Math.max(W, H) * 0.6, life: 1, speed: 3 });
  }

  // ─── Background data flow ────────────────────────────────
  function ambientParticles() {
    if (state === 'idle' || connections.length === 0) return;
    // Random particle along a random connection
    if (Math.random() < (state === 'analyzing' ? 0.3 : state === 'acting' ? 0.5 : 0.06)) {
      var c = connections[Math.floor(Math.random() * connections.length)];
      if (!c.active && Math.random() > 0.1) return;
      var from = nodes[c.from];
      var to = nodes[c.to];
      var color;
      if (state === 'analyzing') color = 'rgba(59,130,246,0.8)';
      else if (state === 'acting') color = 'rgba(245,158,11,0.9)';
      else color = to.status === 'offline' ? 'rgba(239,68,68,0.5)' : 'rgba(16,185,129,0.6)';
      // Randomly pick direction
      if (Math.random() > 0.5) spawnParticle(from, to, color);
      else spawnParticle(to, from, color);
    }
  }

  // ─── Draw ────────────────────────────────────────────────
  function draw() {
    time += 0.016;
    ctx.clearRect(0, 0, W, H);

    // Background gradient
    var bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    bg.addColorStop(0, '#0f1520');
    bg.addColorStop(1, '#080b12');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Grid lines (subtle)
    ctx.strokeStyle = 'rgba(255,255,255,0.02)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx < W; gx += 40) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (var gy = 0; gy < H; gy += 40) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    // Pulses
    for (var pi = pulses.length - 1; pi >= 0; pi--) {
      var p = pulses[pi];
      p.radius += p.speed;
      p.life -= 0.008;
      if (p.life <= 0) { pulses.splice(pi, 1); continue; }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      var pColor = state === 'analyzing' ? '59,130,246' : state === 'acting' ? '245,158,11' : '16,185,129';
      ctx.strokeStyle = 'rgba(' + pColor + ',' + (p.life * 0.15) + ')';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Connections
    connections.forEach(function(c) {
      var from = nodes[c.from];
      var to = nodes[c.to];
      var alpha = c.active ? 0.15 : 0.05;
      if (state === 'analyzing') alpha = c.active ? 0.3 : 0.08;

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = c.active ? 'rgba(16,185,129,' + alpha + ')' : 'rgba(239,68,68,' + alpha + ')';
      ctx.lineWidth = c.active ? 1.5 : 0.8;
      ctx.stroke();
    });

    // Particles
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
      // Trail
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * 3, 0, Math.PI * 2);
      ctx.fillStyle = pt.color.replace(/[\d.]+\)$/, (pt.life * 0.2) + ')');
      ctx.fill();
    }

    // Nodes
    nodes.forEach(function(n) {
      // Glow decay
      n.glow *= 0.97;

      var baseAlpha = n.status === 'online' ? 1 : 0.4;
      var glowExtra = n.glow * 0.5;

      // Glow ring
      if (n.type === 'brain' || n.glow > 0.05) {
        var glowColor = state === 'analyzing' ? '59,130,246' : state === 'acting' ? '245,158,11' : '16,185,129';
        var gr = ctx.createRadialGradient(n.x, n.y, n.radius, n.x, n.y, n.radius * 3 + n.glow * 20);
        gr.addColorStop(0, 'rgba(' + glowColor + ',' + (0.15 + glowExtra) + ')');
        gr.addColorStop(1, 'rgba(' + glowColor + ',0)');
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius * 3 + n.glow * 20, 0, Math.PI * 2);
        ctx.fillStyle = gr;
        ctx.fill();
      }

      // Node body
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);

      if (n.type === 'brain') {
        // Brain: pulsing core
        var pulse = 0.7 + Math.sin(time * 2) * 0.3;
        var brainGrad = ctx.createRadialGradient(n.x - 4, n.y - 4, 0, n.x, n.y, n.radius);
        brainGrad.addColorStop(0, 'rgba(16,185,129,' + pulse + ')');
        brainGrad.addColorStop(1, 'rgba(6,78,59,0.9)');
        ctx.fillStyle = brainGrad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(16,185,129,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Inner symbol
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = '600 14px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('N', n.x, n.y);
      } else if (n.type === 'network') {
        ctx.fillStyle = n.status === 'online' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.15)';
        ctx.fill();
        ctx.strokeStyle = n.status === 'online' ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.3)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        // Device
        ctx.fillStyle = n.status === 'online' ? 'rgba(16,185,129,0.6)' : n.status === 'dormant' ? 'rgba(245,158,11,0.4)' : 'rgba(239,68,68,0.5)';
        ctx.fill();
        if (n.status !== 'online') {
          ctx.strokeStyle = n.status === 'dormant' ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // Labels
      if (n.type !== 'device' || n.radius > 6) {
        ctx.fillStyle = 'rgba(255,255,255,' + (n.type === 'brain' ? 0 : n.type === 'network' ? 0.7 : 0.45) + ')';
        ctx.font = (n.type === 'network' ? '500 11px' : '400 9px') + ' Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        if (n.type !== 'brain') ctx.fillText(n.label, n.x, n.y + n.radius + 6);
      }
    });

    // Matrix-style falling data on analyzing
    if (state === 'analyzing' || state === 'acting') {
      ctx.font = '10px monospace';
      ctx.fillStyle = state === 'analyzing' ? 'rgba(59,130,246,0.12)' : 'rgba(245,158,11,0.12)';
      var chars = '01ABCDEF.:>/{}[]';
      for (var mi = 0; mi < 8; mi++) {
        var mx = Math.random() * W;
        var my = (time * 80 + mi * 90) % H;
        var str = '';
        for (var mc = 0; mc < 6; mc++) str += chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(str, mx, my);
      }
    }

    ambientParticles();
    animFrame = requestAnimationFrame(draw);
  }

  // Start
  draw();

  // Idle animation — subtle breathing
  setInterval(function() {
    if (state !== 'idle' || nodes.length === 0) return;
  }, 2000);
})();
