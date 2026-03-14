// Policy Pulse Clipper — Popup Script
const SUPABASE_URL = 'https://fkooinfagkwugdaobjra.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrb29pbmZhZ2t3dWdkYW9ianJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0ODQ4ODAsImV4cCI6MjA4OTA2MDg4MH0.CEFqNf4sOM4ssT-E-wRSIcdILMabef8KWA36jDdKgiU';

const content = document.getElementById('content');

async function init() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url || !tab.url.includes('bb.org.bd')) {
      showNotOnBB();
      return;
    }

    // Ping content script
    chrome.tabs.sendMessage(tab.id, { action: 'ping' }, (resp) => {
      if (chrome.runtime.lastError || !resp || !resp.ok) {
        showNotOnCircularPage();
        return;
      }
      showReady(tab.id);
    });
  } catch (err) {
    showError('Failed to connect to tab: ' + err.message);
  }
}

function showNotOnBB() {
  content.innerHTML = `
    <div class="status warn"><div class="dot orange"></div>Not on bb.org.bd</div>
    <p style="font-size:13px;color:#475569;line-height:1.5">
      Navigate to <strong>bb.org.bd/en/index.php/mediaroom/circular</strong> and solve the CAPTCHA, then open this extension.
    </p>
  `;
}

function showNotOnCircularPage() {
  content.innerHTML = `
    <div class="status warn"><div class="dot orange"></div>Content script not loaded</div>
    <p style="font-size:13px;color:#475569;line-height:1.5">
      Make sure you're on the <strong>Circulars/Circular Letters</strong> page and the page has fully loaded (past the CAPTCHA).
    </p>
  `;
}

function showReady(tabId) {
  content.innerHTML = `
    <div class="status success"><div class="dot green"></div>Connected to BB circular page</div>
    <p style="font-size:13px;color:#475569;margin-bottom:12px;line-height:1.5">
      Click below to extract all circulars from the current page and send them to Policy Pulse.
    </p>
    <button class="btn btn-primary" id="extract-btn">Extract & Import Circulars</button>
  `;
  document.getElementById('extract-btn').addEventListener('click', () => doExtract(tabId));
}

async function doExtract(tabId) {
  const btn = document.getElementById('extract-btn');
  if (btn) btn.disabled = true;

  content.innerHTML = `
    <div class="status info"><div class="dot blue"></div>Extracting circulars from page...</div>
    <div class="progress"><div class="progress-bar" id="pbar" style="width:20%"></div></div>
  `;

  chrome.tabs.sendMessage(tabId, { action: 'extract' }, async (resp) => {
    if (chrome.runtime.lastError || !resp) {
      showError('Failed to extract data. Try refreshing the page.');
      return;
    }

    const { circulars } = resp;
    if (!circulars || circulars.length === 0) {
      showError('No circulars found on the page.');
      return;
    }

    updateProgress(40);
    await sendToSupabase(circulars);
  });
}

async function sendToSupabase(circulars) {
  updateProgress(60);

  try {
    // Fetch existing circular numbers to avoid duplicates
    const existingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/circulars?select=circular_number`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const existing = await existingRes.json();
    const existingNums = new Set(existing.map((e) => e.circular_number));

    const newCirculars = circulars.filter((c) => !existingNums.has(c.circular_number));
    const skipped = circulars.length - newCirculars.length;

    updateProgress(80);

    let imported = 0;
    let errors = 0;

    if (newCirculars.length > 0) {
      // Batch insert
      const res = await fetch(`${SUPABASE_URL}/rest/v1/circulars`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(newCirculars),
      });

      if (res.ok) {
        const data = await res.json();
        imported = data.length;
      } else {
        // Try one by one for partial success
        for (const c of newCirculars) {
          const r = await fetch(`${SUPABASE_URL}/rest/v1/circulars`, {
            method: 'POST',
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify(c),
          });
          if (r.ok) imported++;
          else errors++;
        }
      }
    }

    updateProgress(100);
    showResults(circulars, imported, skipped, errors);
  } catch (err) {
    showError('Network error: ' + err.message);
  }
}

function showResults(circulars, imported, skipped, errors) {
  content.innerHTML = `
    <div class="status success"><div class="dot green"></div>Import complete!</div>
    <div class="stats">
      <div class="stat"><div class="stat-value">${circulars.length}</div><div class="stat-label">Found</div></div>
      <div class="stat"><div class="stat-value">${imported}</div><div class="stat-label">Imported</div></div>
    </div>
    ${skipped > 0 ? `<div class="status info" style="margin-bottom:8px"><div class="dot blue"></div>${skipped} already existed (skipped)</div>` : ''}
    ${errors > 0 ? `<div class="status error" style="margin-bottom:8px"><div class="dot red"></div>${errors} failed to import</div>` : ''}
    <div class="circular-list">
      ${circulars.slice(0, 20).map((c) => `
        <div class="circular-item">
          <div class="num">${esc(c.circular_number)}</div>
          <div class="title">${esc(c.title).substring(0, 80)}${c.title.length > 80 ? '...' : ''}</div>
          <div class="date">${c.issued_date || 'No date'} · ${esc(c.department)}</div>
        </div>
      `).join('')}
      ${circulars.length > 20 ? `<div class="circular-item" style="text-align:center;color:#94a3b8">...and ${circulars.length - 20} more</div>` : ''}
    </div>
    <button class="btn btn-secondary" id="open-app">Open Policy Pulse</button>
  `;
  const openBtn = document.getElementById('open-app');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://policy-pulse.vercel.app' });
    });
  }
}

function showError(msg) {
  content.innerHTML = `
    <div class="status error"><div class="dot red"></div>${esc(msg)}</div>
    <button class="btn btn-secondary" onclick="location.reload()">Retry</button>
  `;
}

function updateProgress(pct) {
  const bar = document.getElementById('pbar');
  if (bar) bar.style.width = pct + '%';
}

function esc(s) {
  const div = document.createElement('div');
  div.textContent = s || '';
  return div.innerHTML;
}

init();
