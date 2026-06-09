var API = 'https://www.singlereveal.com';

document.querySelectorAll('input[name="expiry"]').forEach(function(r) {
  r.addEventListener('change', function() {
    var v = document.querySelector('input[name="expiry"]:checked').value;
    document.getElementById('timeWrap').classList.toggle('hidden', v === 'view');
  });
});

document.getElementById('passToggle').addEventListener('change', function() {
  document.getElementById('passwordRow').classList.toggle('show', this.checked);
});

document.getElementById('createBtn').addEventListener('click', async function() {
  var text = document.getElementById('secretText').value.trim();
  if (!text) { showToast('Please enter a secret first'); return; }

  var mode = document.querySelector('input[name="expiry"]:checked').value;
  var ttlSeconds = parseInt(document.getElementById('timeLimit').value);
  var usePass = document.getElementById('passToggle').checked;
  var password = document.getElementById('passInput').value;

  if (usePass && !password) { showToast('Please enter a password to protect it'); return; }

  var btn = document.getElementById('createBtn');
  btn.textContent = 'Creating...';
  btn.disabled = true;

  try {
    var body = { text: text, mode: mode };
    if (mode === 'time' || mode === 'both') body.ttlSeconds = ttlSeconds;
    if (usePass) body.password = password;

    var res = await fetch(API + '/api/secrets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

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
  } catch (err) {
    showToast('Network error');
  }
});

document.getElementById('gateInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') document.getElementById('unlockBtn').click();
});

async function revealSecret() {
  if (revealed) return;
  revealed = true;
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

var saved = localStorage.getItem('theme');
if (saved === 'light') {
  document.body.classList.add('light');
  document.getElementById('themeIcon').textContent = '🌙';
  document.getElementById('themeLabel').textContent = 'Dark';
}

checkForSecret();
