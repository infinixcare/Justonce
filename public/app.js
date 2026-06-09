cat > /mnt/user-data/outputs/app.js << 'EOF'
var API = 'https://www.singlereveal.com';

// UI TOGGLES
document.querySelectorAll('input[name="expiry"]').forEach(function(r) {
  r.addEventListener('change', function() {
    var v = document.querySelector('input[name="expiry"]:checked').value;
    document.getElementById('timeWrap').classList.toggle('hidden', v === 'view');
  });
});

document.getElementById('passToggle').addEventListener('change', function() {
  document.getElementById('passwordRow').classList.toggle('show', this.checked);
});

// TAB SWITCHING
document.getElementById('tabText').addEventListener('click', function() {
  document.getElementById('tabText').classList.add('active');
  document.getElementById('tabFile').classList.remove('active');
  document.getElementById('textSection').style.display = 'block';
  document.getElementById('fileSection').style.display = 'none';
});

document.getElementById('tabFile').addEventListener('click', function() {
  document.getElementById('tabFile').classList.add('active');
  document.getElementById('tabText').classList.remove('active');
  document.getElementById('fileSection').style.display = 'block';
  document.getElementById('textSection').style.display = 'none';
});

// FILE DROP ZONE
var dropZone = document.getElementById('dropZone');
var fileInput = document.getElementById('fileInput');
var selectedFile = null;

dropZone.addEventListener('click', function() { fileInput.click(); });

dropZone.addEventListener('dragover', function(e) {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', function() {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', function(e) {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  var file = e.dataTransfer.files[0];
  if (file) setSelectedFile(file);
});

fileInput.addEventListener('change', function() {
  if (fileInput.files[0]) setSelectedFile(fileInput.files[0]);
});

function setSelectedFile(file) {
  selectedFile = file;
  document.getElementById('fileName').textContent = file.name;
  document.getElementById('fileSize').textContent = formatBytes(file.size);
  document.getElementById('fileInfo').style.display = 'flex';
  document.getElementById('dropText').style.display = 'none';
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// CREATE SECRET (text or file)
document.getElementById('createBtn').addEventListener('click', async function() {
  var mode = document.querySelector('input[name="expiry"]:checked').value;
  var ttlSeconds = parseInt(document.getElementById('timeLimit').value);
  var usePass = document.getElementById('passToggle').checked;
  var password = document.getElementById('passInput').value;
  var isFileTab = document.getElementById('tabFile').classList.contains('active');

  if (usePass && !password) { showToast('Please enter a password to protect it'); return; }

  var btn = document.getElementById('createBtn');
  btn.textContent = 'Creating...';
  btn.disabled = true;

  try {
    var res, data;

    if (isFileTab) {
      if (!selectedFile) { showToast('Please select a file first'); btn.textContent = 'Generate secret link ->'; btn.disabled = false; return; }
      if (selectedFile.size > 10 * 1024 * 1024) { showToast('File too large (max 10MB)'); btn.textContent = 'Generate secret link ->'; btn.disabled = false; return; }

      var formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('mode', mode);
      if (mode === 'time' || mode === 'both') formData.append('ttlSeconds', ttlSeconds);
      if (usePass) formData.append('password', password);

      res = await fetch(API + '/api/files', {
        method: 'POST',
        body: formData
      });

    } else {
      var text = document.getElementById('secretText').value.trim();
      if (!text) { showToast('Please enter a secret first'); btn.textContent = 'Generate secret link ->'; btn.disabled = false; return; }

      var body = { text: text, mode: mode };
      if (mode === 'time' || mode === 'both') body.ttlSeconds = ttlSeconds;
      if (usePass) body.password = password;

      res = await fetch(API + '/api/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    }

    data = await res.json();
    if (!res.ok) { showToast(data.error || 'Failed to create secret'); return; }

    var url = window.location.origin + window.location.pathname + '?s=' + data.id;
    document.getElementById('linkDisplay').textContent = url;

    var metaExpiry = document.getElementById('metaExpiry');
    if (mode === 'view') metaExpiry.textContent = 'Deletes after: first view';
    else if (mode === 'time') metaExpiry.textContent = 'Expires in: ' + formatTime(ttlSeconds);
    else metaExpiry.textContent = 'First view or ' + formatTime(ttlSeconds) + ', whichever first';

    document.getElementById('metaPass').textContent = usePass ? 'Password protected' : '';
    document.getElementById('resultBox').classList.add('show');
    document.getElementById('resultBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  } catch (err) {
    showToast('Network error - please try again');
  } finally {
    btn.textContent = 'Generate secret link ->';
    btn.disabled = false;
  }
});

document.getElementById('copyBtn').addEventListener('click', function() {
  var url = document.getElementById('linkDisplay').textContent;
  navigator.clipboard.writeText(url).then(function() { showToast('Link copied!'); });
});

function formatTime(secs) {
  if (secs < 60) return secs + 's';
  if (secs < 3600) return (secs / 60) + 'min';
  if (secs < 86400) return (secs / 3600) + 'h';
  return (secs / 86400) + 'd';
}

// VIEW SECRET
var viewTimer = null;
var secretMeta = null;
var revealed = false;
var currentId = null;

async function checkForSecret() {
  var params = new URLSearchParams(window.location.search);
  var id = params.get('s');
  if (!id) return;
  currentId = id;
  try {
    var res = await fetch(API + '/api/secrets/' + id + '/meta');
    if (!res.ok) { showViewPage(); showDestroyed(); return; }
    secretMeta = await res.json();
    showViewPage();

    if (secretMeta.type === 'file') {
      document.getElementById('fileRevealInfo').style.display = 'block';
      document.getElementById('fileRevealName').textContent = secretMeta.filename;
      document.getElementById('fileRevealSize').textContent = formatBytes(secretMeta.size);
      document.getElementById('revealOverlay').querySelector('.reveal-text').textContent = 'Click to download — file will self-destruct';
    }

    if (secretMeta.passwordProtected) {
      document.getElementById('passGate').classList.add('show');
      document.getElementById('secretReveal').style.display = 'none';
    }
    if (secretMeta.ttl) {
      document.getElementById('timerWrap').style.display = 'block';
      startTimer(secretMeta.ttl);
    }
  } catch (err) {
    showViewPage();
    showDestroyed();
  }
}

function showViewPage() {
  document.getElementById('createPage').style.display = 'none';
  document.getElementById('viewPage').classList.add('active');
}

function startTimer(ttlSeconds) {
  var bar = document.getElementById('timerBar');
  var label = document.getElementById('timerText');
  var endsAt = Date.now() + ttlSeconds * 1000;
  function tick() {
    var remaining = endsAt - Date.now();
    if (remaining <= 0) { showDestroyed(); return; }
    bar.style.width = ((remaining / (ttlSeconds * 1000)) * 100) + '%';
    var s = Math.ceil(remaining / 1000);
    label.textContent = s < 60 ? 'Expires in ' + s + 's' : 'Expires in ' + Math.ceil(s / 60) + 'min';
    viewTimer = setTimeout(tick, 1000);
  }
  tick();
}

document.getElementById('unlockBtn').addEventListener('click', async function() {
  var password = document.getElementById('gateInput').value;
  var errEl = document.getElementById('gateError');
  try {
    if (secretMeta && secretMeta.type === 'file') {
      await downloadFile(password);
    } else {
      var res = await fetch(API + '/api/secrets/' + currentId + '/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password })
      });
      var data = await res.json();
      if (res.status === 401) { errEl.style.display = 'block'; return; }
      if (!res.ok) { showDestroyed(); return; }
      errEl.style.display = 'none';
      document.getElementById('passGate').classList.remove('show');
      document.getElementById('secretReveal').style.display = '';
      document.getElementById('secretContent').textContent = data.text;
      document.getElementById('secretContent').classList.remove('secret-blur');
      document.getElementById('revealOverlay').style.display = 'none';
      revealed = true;
      showDestroyWarning(data.mode);
    }
  } catch (err) {
    showToast('Network error');
  }
});

document.getElementById('gateInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') document.getElementById('unlockBtn').click();
});

async function downloadFile(password) {
  var errEl = document.getElementById('gateError');
  try {
    var res = await fetch(API + '/api/secrets/' + currentId + '/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password || '' })
    });

    if (res.status === 401) {
      if (errEl) errEl.style.display = 'block';
      return;
    }
    if (!res.ok) { showDestroyed(); return; }

    var mode = res.headers.get('X-Secret-Mode');
    var blob = await res.blob();
    var filename = secretMeta.filename || 'secret-file';

    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);

    document.getElementById('passGate').classList.remove('show');
    document.getElementById('revealOverlay').style.display = 'none';
    revealed = true;

    if (mode === 'view' || mode === 'both') {
      showDestroyWarning('view');
    }

  } catch (err) {
    showToast('Download failed - please try again');
  }
}

async function revealSecret() {
  if (revealed) return;
  revealed = true;

  if (secretMeta && secretMeta.type === 'file') {
    await downloadFile('');
    return;
  }

  try {
    var res = await fetch(API + '/api/secrets/' + currentId + '/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    var data = await res.json();
    if (!res.ok) { showDestroyed(); return; }
    document.getElementById('revealOverlay').style.display = 'none';
    document.getElementById('secretContent').classList.remove('secret-blur');
    document.getElementById('secretContent').textContent = data.text;
    showDestroyWarning(data.mode);
  } catch (err) {
    showToast('Network error');
  }
}

function showDestroyWarning(mode) {
  if (mode === 'view' || mode === 'both') {
    document.getElementById('viewWarning').innerHTML = 'Secret has been revealed and <strong>permanently destroyed</strong>. Copy it now - it cannot be retrieved again.';
    document.getElementById('viewWarning').style.background = 'rgba(245,158,11,0.1)';
    document.getElementById('viewWarning').style.color = 'var(--warn)';
    document.getElementById('viewWarning').style.borderColor = 'rgba(245,158,11,0.25)';
  }
}

function showDestroyed() {
  clearTimeout(viewTimer);
  document.getElementById('secretReveal').style.display = 'none';
  document.getElementById('viewWarning').style.display = 'none';
  document.getElementById('timerWrap').style.display = 'none';
  document.getElementById('passGate').style.display = 'none';
  document.getElementById('destroyedState').classList.add('show');
}

function showCreate(e) {
  if (e) e.preventDefault();
  document.getElementById('viewPage').classList.remove('active');
  document.getElementById('createPage').style.display = '';
  history.pushState({}, '', window.location.pathname);
}

function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, 2500);
}

function toggleTheme() {
  var isLight = document.body.classList.toggle('light');
  document.getElementById('themeIcon').textContent = isLight ? '🌙' : '☀️';
  document.getElementById('themeLabel').textContent = isLight ? 'Dark' : 'Light';
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
}

document.getElementById('themeToggle').addEventListener('click', toggleTheme);

var saved = localStorage.getItem('theme');
if (saved === 'light') {
  document.body.classList.add('light');
  document.getElementById('themeIcon').textContent = '🌙';
  document.getElementById('themeLabel').textContent = 'Dark';
}

checkForSecret();
EOF
