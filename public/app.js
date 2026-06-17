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

// Word pool — varied lengths so we can hit exact character targets
var WORD_POOL = [
  'cobra','tiger','falcon','raven','viper','lynx','bison','crane','eagle','finch',
  'robin','swift','shrimp','gecko','moose','otter','panda','quail','skunk','trout',
  'whale','zebra','camel','dingo','ferret','goose','hyena','iguana','jackal','koala',
  'llama','mamba','newt','okapi','parrot','rhino','sloth','tapir','urial','vole',
  'wombat','yak','alpaca','baboon','condor','donkey','emu','foxhound','gibbon','heron',
  'impala','jaguar','kestrel','lemur','meerkat','narwhal','osprey','pelican','quokka','raccoon',
  'salmon','toucan','urchin','vulture','walrus','xerus','yellowfin','zorilla','coyote','storm',
  'blaze','frost','ember','cedar','flint','maple','orbit','ridge','solar','vapor',
  'walnut','xenon','lunar','marsh','prism','thorn','vault','wheat','axiom','brace',
  'chime','drift','flare','glyph','hinge','iris','knot','lava','mist','nova',
  'onyx','pixel','quartz','resin','slate','titan','ultra','willow','zinc','abyss',
  'birch','crest','dune','fjord','grove','haven','inlet','jade','kelp','lichen',
  'mosaic','nimbus','opal','pebble','quarry','ravine','summit','tundra','valley','canyon',
  'delta','escarp','forest','glacier','harbor','island','jungle','karst','lagoon','meadow',
  'nebula','outcrop','plateau','quiver','reef','savanna','taiga','uplift','wetland','arrow',
  'atlas','anchor','anvil','badge','beacon','blade','bolt','bridge','brush','cable',
  'cipher','clock','comet','compass','core','crown','crystal','cursor','dagger','deck',
  'diesel','domain','draft','drill','drone','dynamo','engine','epoch','factor','flame',
  'flask','forge','frame','fuel','fulcrum','gadget','gauge','gear','globe','hammer',
  'helix','hook','hull','index','ingot','input','kernel','laser','lathe','layer',
  'ledger','lens','lever','linker','logic','magnet','matrix','mirror','module','motor',
  'mutex','nerve','nexus','node','notch','nozzle','nucleus','offset','optic','output',
  'oxide','panel','patch','payload','phase','pilot','pipe','pivot','plank','plasma',
  'plugin','pointer','portal','probe','proxy','pulse','pump','qubit','radar','radius',
  'relay','render','riser','rotor','router','scalar','scope','sensor','servo','shader',
  'signal','socket','spawn','spool','stack','strobe','struct','switch','tensor','thread',
  'toggle','token','torque','tracer','tunnel','turbo','vector','vertex','warden','wedge',
  'widget','wiring','wrench','zener','zenith','buffer','cache','codec','shadow','phantom',
  'legend','specter','mystic','cosmic','arcane','primal','quantum','eternal','radiant','crimson',
  'silver','golden','blazing','frozen','hidden','sacred','ancient','mighty','fierce','silent',
  'hollow','broken','rising','fallen','bound','unbound','venom','valor','virtue','vision',
  'vigil','vortex','verdict','verify','vivid','vocal','wrath','whisper','wonder','wander',
  'weave','witch','wolven'
];

var SYM_POOL = ['!','@','#','$','%','&','*','+','=','?','^','~'];
var NUM_CHARS = ['0','1','2','3','4','5','6','7','8','9'];

function randInt(max) {
  var a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % max;
}

function randFrom(arr) { return arr[randInt(arr.length)]; }

function generatePassword() {
  var targetLen = parseInt(document.getElementById('passLenRange').value);
  var upper   = document.getElementById('optUpper').checked;
  var lower   = document.getElementById('optLower').checked;
  var numbers = document.getElementById('optNumbers').checked;
  var symbols = document.getElementById('optSymbols').checked;

  if (!upper && !lower) {
    showToast('Enable uppercase or lowercase');
    return;
  }

  // --- Strategy: pick 2 random words, then pad/trim with numbers+symbols ---
  // This keeps word choice fully random (no bias toward short filler words),
  // and uses the separators to absorb the leftover length.

  function styleWord(w) {
    if (upper && lower) return w[0].toUpperCase() + w.slice(1).toLowerCase();
    if (upper) return w.toUpperCase();
    return w.toLowerCase();
  }

  // Reserve guaranteed space for separators so enabled options always show up
  var sepCount = (numbers ? 1 : 0) + (symbols ? 1 : 0); // at least 1 char per enabled type, doubled below
  var reservedSep = sepCount * 2; // ensure at least 2 separator chars total when any are enabled
  if (reservedSep > targetLen - 4) reservedSep = Math.max(0, targetLen - 4); // keep room for words

  var wordBudget = targetLen - reservedSep;
  var maxWordLen = Math.max(2, Math.floor(wordBudget * 0.55));
  var pool = WORD_POOL.filter(function(w) { return w.length <= maxWordLen; });
  if (!pool.length) pool = WORD_POOL.slice().sort(function(a,b){return a.length-b.length;}).slice(0, 30);

  // Pick word1, then pick word2 so that word1+word2 fits within wordBudget
  var word1Raw = randFrom(pool);
  var maxWord2Len = Math.max(2, wordBudget - word1Raw.length);
  var pool2 = pool.filter(function(w) { return w.length <= maxWord2Len; });
  if (!pool2.length) pool2 = pool.slice().sort(function(a,b){return a.length-b.length;}).slice(0, 10);
  var word2Raw = randFrom(pool2);

  var word1 = styleWord(word1Raw);
  var word2 = styleWord(word2Raw);

  // Build the separator characters (numbers/symbols) to fill remaining space
  var used = word1.length + word2.length;
  var remaining = targetLen - used;
  if (remaining < 0) remaining = 0;

  // Build the exact list of separator chars first, guaranteeing both types
  // appear at least once when both numbers and symbols are enabled.
  var sepChars = [];
  if (numbers && symbols) {
    if (remaining >= 1) sepChars.push(randFrom(NUM_CHARS));
    if (remaining >= 2) sepChars.push(randFrom(SYM_POOL));
    while (sepChars.length < remaining) {
      sepChars.push(randInt(2) === 0 ? randFrom(NUM_CHARS) : randFrom(SYM_POOL));
    }
  } else if (numbers) {
    while (sepChars.length < remaining) sepChars.push(randFrom(NUM_CHARS));
  } else if (symbols) {
    while (sepChars.length < remaining) sepChars.push(randFrom(SYM_POOL));
  } else {
    var fillerSet = upper ? 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split('') : 'abcdefghjkmnpqrstuvwxyz'.split('');
    while (sepChars.length < remaining) sepChars.push(randFrom(fillerSet));
  }

  // Shuffle so number/symbol placement isn't predictable (Fisher-Yates)
  for (var k = sepChars.length - 1; k > 0; k--) {
    var swapIdx = randInt(k + 1);
    var tmp = sepChars[k];
    sepChars[k] = sepChars[swapIdx];
    sepChars[swapIdx] = tmp;
  }

  // Distribute shuffled separator chars across 3 gaps: before word1, between words, after word2
  var gap1 = Math.floor(sepChars.length / 3);
  var gap2 = Math.floor(sepChars.length / 3);
  var gap3 = sepChars.length - gap1 - gap2;

  var result = sepChars.slice(0, gap1).join('') + word1 +
               sepChars.slice(gap1, gap1 + gap2).join('') + word2 +
               sepChars.slice(gap1 + gap2).join('');

  // Safety: trim or pad to exact targetLen (should already be exact)
  if (result.length > targetLen) {
    result = result.slice(0, targetLen);
  }
  while (result.length < targetLen) {
    if (numbers) result += randFrom(NUM_CHARS);
    else if (symbols) result += randFrom(SYM_POOL);
    else result += upper ? randFrom('ABCDEFGHJKLMNPQRSTUVWXYZ'.split('')) : randFrom('abcdefghjkmnpqrstuvwxyz'.split(''));
  }

  generatedPassword = result;
  document.getElementById('passGenValue').textContent = result;
  document.getElementById('passGenCopy').style.display = 'block';
  document.getElementById('passGenUseRow').style.display = 'block';
  updateStrength(result, upper, lower, numbers, symbols);
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
  document.getElementById('passLenDisplay').textContent = this.value + ' chars';
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
