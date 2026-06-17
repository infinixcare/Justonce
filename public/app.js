document.addEventListener('DOMContentLoaded', function() {

var API = 'https://www.singlereveal.com';
var selectedFile = null;
var viewTimer = null;
var secretMeta = null;
var revealed = false;
var currentId = null;

// THEME
var saved = localStorage.getItem('theme');
if (saved === 'light') {
  document.body.classList.add('light');
  document.getElementById('themeIcon').textContent = '🌙';
  document.getElementById('themeLabel').textContent = 'Dark';
}

document.getElementById('themeToggle').addEventListener('click', function() {
  var isLight = document.body.classList.toggle('light');
  document.getElementById('themeIcon').textContent = isLight ? '🌙' : '☀️';
  document.getElementById('themeLabel').textContent = isLight ? 'Dark' : 'Light';
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
});

// EXPIRY TOGGLE
document.querySelectorAll('input[name="expiry"]').forEach(function(r) {
  r.addEventListener('change', function() {
    var v = document.querySelector('input[name="expiry"]:checked').value;
    document.getElementById('timeWrap').classList.toggle('hidden', v === 'view');
  });
});

// PASSWORD TOGGLE
document.getElementById('passToggle').addEventListener('change', function() {
  document.getElementById('passwordRow').classList.toggle('show', this.checked);
});

// TABS
function setTab(active) {
  var tabs = ['tabText', 'tabFile', 'tabPassGen'];
  var sections = ['textSection', 'fileSection', 'passGenSection'];
  var secretOptions = document.getElementById('secretOptions');
  var encryptRow = document.querySelector('.encrypt-row');
  var passwordRow = document.getElementById('passwordRow');
  var createBtn = document.getElementById('createBtn');

  tabs.forEach(function(t) { document.getElementById(t).classList.remove('active'); });
  sections.forEach(function(s) { document.getElementById(s).style.display = 'none'; });

  document.getElementById(active).classList.add('active');
  var sectionMap = { tabText: 'textSection', tabFile: 'fileSection', tabPassGen: 'passGenSection' };
  document.getElementById(sectionMap[active]).style.display = 'block';

  var isPassGen = active === 'tabPassGen';
  secretOptions.style.display = isPassGen ? 'none' : '';
  encryptRow.style.display = isPassGen ? 'none' : '';
  passwordRow.style.display = 'none';
  if (isPassGen) {
    createBtn.style.display = 'none';
  } else {
    createBtn.style.display = '';
  }
}

document.getElementById('tabText').addEventListener('click', function() { setTab('tabText'); });
document.getElementById('tabFile').addEventListener('click', function() { setTab('tabFile'); });
document.getElementById('tabPassGen').addEventListener('click', function() { setTab('tabPassGen'); });

// PASSWORD GENERATOR
var generatedPassword = '';

function generatePassword() {
  var len = parseInt(document.getElementById('passLenRange').value);
  var upper = document.getElementById('optUpper').checked;
  var lower = document.getElementById('optLower').checked;
  var numbers = document.getElementById('optNumbers').checked;
  var symbols = document.getElementById('optSymbols').checked;

  var charset = '';
  if (upper) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (lower) charset += 'abcdefghijklmnopqrstuvwxyz';
  if (numbers) charset += '0123456789';
  if (symbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

  if (!charset) {
    showToast('Select at least one character type');
    return;
  }

  var arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  var password = Array.from(arr).map(function(v) { return charset[v % charset.length]; }).join('');
  generatedPassword = password;

  document.getElementById('passGenValue').textContent = password;
  document.getElementById('passGenCopy').style.display = 'block';
  document.getElementById('passGenUseRow').style.display = 'block';
  updateStrength(password, upper, lower, numbers, symbols);
}

function updateStrength(password, upper, lower, numbers, symbols) {
  var score = 0;
  var len = password.length;
  if (len >= 12) score++;
  if (len >= 16) score++;
  if (len >= 24) score++;
  var typeCount = [upper, lower, numbers, symbols].filter(Boolean).length;
  score += typeCount - 1;

  var fill = document.getElementById('passStrengthFill');
  var label = document.getElementById('passStrengthText');
  var levels = [
    { pct: '20%', color: '#ff4d6d', text: 'Weak' },
    { pct: '40%', color: '#f59e0b', text: 'Fair' },
    { pct: '60%', color: '#f59e0b', text: 'Good' },
    { pct: '80%', color: '#2dd4a0', text: 'Strong' },
    { pct: '100%', color: '#2dd4a0', text: 'Very strong' }
  ];
  var level = levels[Math.min(score, 4)];
  fill.style.width = level.pct;
  fill.style.background = level.color;
  label.textContent = level.text;
  label.style.color = level.color;
}

document.getElementById('passLenRange').addEventListener('input', function() {
  document.getElementById('passLenDisplay').textContent = this.value;
  if (generatedPassword) generatePassword();
});

['optUpper', 'optLower', 'optNumbers', 'optSymbols'].forEach(function(id) {
  document.getElementById(id).addEventListener('change', function() {
    if (generatedPassword) generatePassword();
  });
});

document.getElementById('genPassBtn').addEventListener('click', generatePassword);

document.getElementById('passGenCopy').addEventListener('click', function() {
  if (!generatedPassword) return;
  navigator.clipboard.writeText(generatedPassword).then(function() {
    showToast('Password copied!');
  });
});

document.getElementById('useAsSecretBtn').addEventListener('click', function() {
  if (!generatedPassword) return;
  setTab('tabText');
  document.getElementById('secretText').value = generatedPassword;
  showToast('Password ready — set expiry and share');
});

// FILE DROP ZONE
var dropZone = document.getElementById('dropZone');
var fileInput = document.getElementById('fileInput');

dropZone.addEventListener('click', function() { fileInput.click(); });
dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', function() { dropZone.classList.remove('dragover'); });
dropZone.addEventListener('drop', function(e) {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) setSelectedFile(e.dataTransfer.files[0]);
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

function formatTime(secs) {
  if (secs < 60) return secs + 's';
  if (secs < 3600) return (secs / 60) + 'min';
  if (secs < 86400) return (secs / 3600) + 'h';
  return (secs / 86400) + 'd';
}

// CREATE SECRET
document.getElementById('createBtn').addEventListener('click', async function() {
  var mode = document.querySelector('input[name="expiry"]:checked').value;
  var ttlSeconds = parseInt(document.getElementById('timeLimit').value);
  var usePass = document.getElementById('passToggle').checked;
  var password = document.getElementById('passInput').value;
  var isFileTab = document.getElementById('tabFile').classList.contains('active');

  if (usePass && !password) { showToast('Please enter a password'); return; }

  var btn = document.getElementById('createBtn');
  btn.textContent = 'Creating...';
  btn.disabled = true;

  try {
    var res;

    if (isFileTab) {
      if (!selectedFile) { showToast('Please select a file first'); return; }
      if (selectedFile.size > 10 * 1024 * 1024) { showToast('File too large (max 10MB)'); return; }
      var formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('mode', mode);
      if (mode === 'time' || mode === 'both') formData.append('ttlSeconds', ttlSeconds);
      if (usePass) formData.append('password', password);
      res = await fetch(API + '/api/files', { method: 'POST', body: formData });
    } else {
      var text = document.getElementById('secretText').value.trim();
      if (!text) { showToast('Please enter a secret first'); return; }
      var body = { text: text, mode: mode };
      if (mode === 'time' || mode === 'both') body.ttlSeconds = ttlSeconds;
      if (usePass) body.password = password;
      res = await fetch(API + '/api/secrets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }

    var data = await res.json();
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
    btn.textContent = 'Generate secret link';
    btn.disabled = false;
  }
});

// COPY LINK
document.getElementById('copyBtn').addEventListener('click', function() {
  var url = document.getElementById('linkDisplay').textContent;
  navigator.clipboard.writeText(url).then(function() { showToast('Link copied!'); });
});

// VIEW SECRET
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
      document.getElementById('revealOverlay').querySelector('.reveal-text').textContent = 'Click to download - file will self-destruct';
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

// UNLOCK PASSWORD
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

// REVEAL SECRET
window.revealSecret = async function() {
  if (revealed) return;
  revealed = true;
  if (secretMeta && secretMeta.type === 'file') { await downloadFile(''); return; }
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
};

async function downloadFile(password) {
  var errEl = document.getElementById('gateError');
  try {
    var res = await fetch(API + '/api/secrets/' + currentId + '/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password || '' })
    });
    if (res.status === 401) { if (errEl) errEl.style.display = 'block'; return; }
    if (!res.ok) { showDestroyed(); return; }
    var mode = res.headers.get('X-Secret-Mode');
    var blob = await res.blob();
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = secretMeta.filename || 'secret-file';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    document.getElementById('passGate').classList.remove('show');
    document.getElementById('revealOverlay').style.display = 'none';
    revealed = true;
    if (mode === 'view' || mode === 'both') showDestroyWarning('view');
  } catch (err) {
    showToast('Download failed - please try again');
  }
}

function showDestroyWarning(mode) {
  var copyBtn = document.getElementById('copySecretBtn');
  if (copyBtn) {
    copyBtn.style.display = 'block';
    copyBtn.onclick = function() {
      var text = document.getElementById('secretContent').textContent;
      navigator.clipboard.writeText(text).then(function() {
        copyBtn.textContent = 'Copied!';
        setTimeout(function() { copyBtn.textContent = 'Copy secret to clipboard'; }, 2000);
      });
    };
  }
  if (mode === 'view' || mode === 'both') {
    document.getElementById('viewWarning').innerHTML = 'Secret revealed and <strong>permanently destroyed</strong>. Copy it now.';
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

window.showCreate = function(e) {
  if (e) e.preventDefault();
  document.getElementById('viewPage').classList.remove('active');
  document.getElementById('createPage').style.display = '';
  history.pushState({}, '', window.location.pathname);
};

function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, 2500);
}

checkForSecret();

}); // end DOMContentLoaded
