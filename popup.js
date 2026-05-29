const _ext = (typeof browser !== 'undefined') ? browser : chrome;

const CAT_COLORS = ['#6c8ef7','#4ade80','#f5c842','#f87171','#a78bfa','#38bdf8','#fb923c','#e879f9','#34d399','#f472b6'];

let state = {
  savedLinks: [],
  recentLinks: [],
  categories: [],
  activeTab: 'saved',
  searchQuery: '',
  editingId: null,
  openCategories: {}
};

// --- Storage ---
async function loadData() {
  const res = await _ext.storage.local.get(['savedLinks','recentLinks','categories','openCategories']);
  state.savedLinks = res.savedLinks || [];
  state.recentLinks = res.recentLinks || [];
  state.categories = res.categories && res.categories.length > 0
    ? res.categories
    : [{ id:'work', name:'Work', color: CAT_COLORS[0] },
       { id:'personal', name:'Personal', color: CAT_COLORS[1] },
       { id:'tools', name:'Tools', color: CAT_COLORS[2] }];
  state.openCategories = res.openCategories || {};
}

function saveLinks() {
  _ext.storage.local.set({ savedLinks: state.savedLinks });
}
function saveCategories() {
  _ext.storage.local.set({ categories: state.categories });
}
function saveOpenCats() {
  _ext.storage.local.set({ openCategories: state.openCategories });
}

// --- Helpers ---
function genId() { return '_' + Math.random().toString(36).slice(2,9); }

function getDomain(url) {
  try { return new URL(url).hostname.replace('www.',''); } catch { return ''; }
}

function getFavicon(url) {
  try {
    const domain = new URL(url).origin;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch { return null; }
}

function timeAgo(ts) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff/60) + 'm ago';
  if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff/86400) + 'd ago';
  return new Date(ts).toLocaleDateString();
}

function getCatById(id) {
  return state.categories.find(c => c.id === id);
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
}

async function copyToClipboard(url, el) {
  try {
    await navigator.clipboard.writeText(url);
    el && el.classList.add('copied');
    setTimeout(() => el && el.classList.remove('copied'), 400);
    showToast('Copied!');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = url; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Copied!');
  }
}

// --- Render ---
function render() {
  const content = document.getElementById('mainContent');
  const q = state.searchQuery.toLowerCase();

  if (state.activeTab === 'recent') {
    renderRecent(content, q);
  } else if (state.activeTab === 'starred') {
    renderStarred(content, q);
  } else {
    renderSaved(content, q);
  }
}

function renderSaved(content, q) {
  const filtered = state.savedLinks.filter(l =>
    !q || l.title.toLowerCase().includes(q) || l.url.toLowerCase().includes(q)
  );

  if (filtered.length === 0) {
    content.innerHTML = emptyStateHtml(
      q ? 'No links match your search.' : 'No saved links yet.\nClick + to save your first link.'
    );
    return;
  }

  // Group by category
  const groups = {};
  const noCat = [];
  for (const link of filtered) {
    if (link.category) {
      if (!groups[link.category]) groups[link.category] = [];
      groups[link.category].push(link);
    } else {
      noCat.push(link);
    }
  }

  let html = '';

  // Category groups
  for (const [catId, links] of Object.entries(groups)) {
    const cat = getCatById(catId);
    const name = cat ? cat.name : catId;
    const color = cat ? cat.color : '#8b90a0';
    const isOpen = state.openCategories[catId] !== false;
    html += `
      <div class="cat-section" data-cat="${catId}">
        <div class="cat-header" data-toggle="${catId}">
          <div class="cat-header-left">
            <span class="cat-dot" style="background:${color}"></span>
            ${escHtml(name)} <span class="cat-count">${links.length}</span>
          </div>
          <svg class="cat-chevron ${isOpen?'open':''}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
        <div class="cat-links ${isOpen?'open':''}">
          ${links.map(l => linkItemHtml(l, false)).join('')}
        </div>
      </div>`;
  }

  // Uncategorized
  if (noCat.length > 0) {
    const isOpen = state.openCategories['__none'] !== false;
    html += `
      <div class="cat-section" data-cat="__none">
        <div class="cat-header" data-toggle="__none">
          <div class="cat-header-left">
            <span class="cat-dot" style="background:#5a5f70"></span>
            Uncategorized <span class="cat-count">${noCat.length}</span>
          </div>
          <svg class="cat-chevron ${isOpen?'open':''}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
        <div class="cat-links ${isOpen?'open':''}">
          ${noCat.map(l => linkItemHtml(l, false)).join('')}
        </div>
      </div>`;
  }

  content.innerHTML = html;
  attachLinkEvents(content, false);
  attachToggleEvents(content);
}

function renderRecent(content, q) {
  const recent = state.recentLinks.filter(l =>
    !q || l.title.toLowerCase().includes(q) || l.url.toLowerCase().includes(q)
  );
  if (recent.length === 0) {
    content.innerHTML = emptyStateHtml(q ? 'No recent links match.' : 'No recent links yet.\nBrowse some pages!');
    return;
  }
  content.innerHTML = recent.map(l => recentItemHtml(l)).join('');
  attachLinkEvents(content, true);
}

function renderStarred(content, q) {
  const starred = state.savedLinks.filter(l => l.starred && (
    !q || l.title.toLowerCase().includes(q) || l.url.toLowerCase().includes(q)
  ));
  if (starred.length === 0) {
    content.innerHTML = emptyStateHtml(q ? 'No starred links match.' : 'No starred links yet.\nStar a saved link to pin it here.');
    return;
  }
  content.innerHTML = starred.map(l => linkItemHtml(l, false)).join('');
  attachLinkEvents(content, false);
}

function linkItemHtml(l, isRecent) {
  const fav = getFavicon(l.url);
  const domain = getDomain(l.url);
  return `
    <div class="link-item" data-id="${l.id||l.url}" data-url="${escHtml(l.url)}">
      <div class="link-favicon-wrap">
        ${fav
          ? `<img class="link-favicon" src="${fav}" onerror="this.style.display='none';this.nextSibling.style.display='flex'" alt="" /><div class="link-favicon-placeholder" style="display:none">${domain[0]?.toUpperCase()||'?'}</div>`
          : `<div class="link-favicon-placeholder">${domain[0]?.toUpperCase()||'?'}</div>`
        }
      </div>
      <div class="link-info">
        <div class="link-title">${escHtml(l.title||l.url)}</div>
        <div class="link-url">${escHtml(domain)}</div>
      </div>
      <div class="link-actions">
        <button class="action-btn copy-btn" title="Copy URL" data-url="${escHtml(l.url)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button class="action-btn open-btn" title="Open in tab" data-url="${escHtml(l.url)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </button>
        ${!isRecent ? `
        <button class="action-btn star-btn ${l.starred?'starred':''}" title="${l.starred?'Unstar':'Star'}" data-id="${l.id}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="${l.starred?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </button>
        <button class="action-btn edit-btn" title="Edit" data-id="${l.id}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="action-btn danger del-btn" title="Delete" data-id="${l.id}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>` : ''}
      </div>
    </div>`;
}

function recentItemHtml(l) {
  const fav = getFavicon(l.url);
  const domain = getDomain(l.url);
  return `
    <div class="link-item" data-url="${escHtml(l.url)}">
      <div class="link-favicon-wrap">
        ${fav
          ? `<img class="link-favicon" src="${fav}" onerror="this.style.display='none';this.nextSibling.style.display='flex'" alt="" /><div class="link-favicon-placeholder" style="display:none">${domain[0]?.toUpperCase()||'?'}</div>`
          : `<div class="link-favicon-placeholder">${domain[0]?.toUpperCase()||'?'}</div>`
        }
      </div>
      <div class="link-info">
        <div class="link-title">${escHtml(l.title||l.url)}</div>
        <div class="link-url">${escHtml(domain)}</div>
      </div>
      <div class="link-actions">
        <span class="link-time">${timeAgo(l.visitedAt)}</span>
        <button class="action-btn copy-btn" title="Copy URL" data-url="${escHtml(l.url)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
        <button class="action-btn open-btn" title="Open in tab" data-url="${escHtml(l.url)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </button>
        <button class="action-btn save-recent-btn" title="Save this link" data-url="${escHtml(l.url)}" data-title="${escHtml(l.title||'')}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
    </div>`;
}

function emptyStateHtml(msg) {
  return `<div class="empty-state">
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
    <p>${msg.replace(/\n/g,'<br>')}</p>
  </div>`;
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// --- Events ---
function attachLinkEvents(content, isRecent) {
  content.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      copyToClipboard(btn.dataset.url, btn.closest('.link-item'));
    });
  });
  content.querySelectorAll('.open-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      _ext.tabs.create({ url: btn.dataset.url });
    });
  });
  if (!isRecent) {
    content.querySelectorAll('.star-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        toggleStar(btn.dataset.id);
      });
    });
    content.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        openEditModal(btn.dataset.id);
      });
    });
    content.querySelectorAll('.del-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        deleteLink(btn.dataset.id);
      });
    });
    // Click item row to copy
    content.querySelectorAll('.link-item').forEach(item => {
      item.addEventListener('click', () => {
        copyToClipboard(item.dataset.url, item);
      });
    });
  }
  content.querySelectorAll('.save-recent-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openAddModal(btn.dataset.url, btn.dataset.title);
    });
  });
}

function attachToggleEvents(content) {
  content.querySelectorAll('[data-toggle]').forEach(el => {
    el.addEventListener('click', () => {
      const catId = el.dataset.toggle;
      state.openCategories[catId] = state.openCategories[catId] === false ? true : false;
      saveOpenCats();
      const section = el.closest('.cat-section');
      const links = section.querySelector('.cat-links');
      const chevron = section.querySelector('.cat-chevron');
      const isNowOpen = state.openCategories[catId] !== false;
      links.classList.toggle('open', isNowOpen);
      chevron.classList.toggle('open', isNowOpen);
    });
  });
}

// --- Actions ---
function toggleStar(id) {
  const link = state.savedLinks.find(l => l.id === id);
  if (link) { link.starred = !link.starred; saveLinks(); render(); }
}

function deleteLink(id) {
  state.savedLinks = state.savedLinks.filter(l => l.id !== id);
  saveLinks(); render();
  showToast('Deleted');
}

// --- Modal ---
function openAddModal(url='', title='') {
  state.editingId = null;
  document.getElementById('modalTitle').textContent = 'Add Link';
  document.getElementById('modalUrl').value = url;
  document.getElementById('modalName').value = title;
  refreshCatSelect();
  document.getElementById('modalOverlay').style.display = 'flex';
  setTimeout(() => document.getElementById('modalUrl').focus(), 50);
}

function openEditModal(id) {
  const link = state.savedLinks.find(l => l.id === id);
  if (!link) return;
  state.editingId = id;
  document.getElementById('modalTitle').textContent = 'Edit Link';
  document.getElementById('modalUrl').value = link.url;
  document.getElementById('modalName').value = link.title;
  refreshCatSelect(link.category);
  document.getElementById('modalOverlay').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
  document.getElementById('newCatInput').style.display = 'none';
  document.getElementById('modalCat').style.display = '';
  state.editingId = null;
}

function refreshCatSelect(selected='') {
  const sel = document.getElementById('modalCat');
  sel.innerHTML = `<option value="">No category</option>` +
    state.categories.map(c => `<option value="${c.id}" ${selected===c.id?'selected':''}>${escHtml(c.name)}</option>`).join('');
}

function saveModalLink() {
  const url = document.getElementById('modalUrl').value.trim();
  const title = document.getElementById('modalName').value.trim() || url;
  let category = document.getElementById('modalCat').value;
  const newCatInput = document.getElementById('newCatInput');
  if (newCatInput.style.display !== 'none' && newCatInput.value.trim()) {
    const name = newCatInput.value.trim();
    const id = '_cat_' + genId();
    const color = CAT_COLORS[state.categories.length % CAT_COLORS.length];
    state.categories.push({ id, name, color });
    saveCategories();
    category = id;
  }
  if (!url) { showToast('Please enter a URL'); return; }
  if (state.editingId) {
    const link = state.savedLinks.find(l => l.id === state.editingId);
    if (link) { link.url = url; link.title = title; link.category = category; }
  } else {
    state.savedLinks.unshift({ id: genId(), url, title, category, starred: false, addedAt: Date.now() });
  }
  saveLinks(); closeModal(); render();
  showToast(state.editingId ? 'Updated!' : 'Link saved!');
}

// --- Cat manager ---
function renderCatManager() {
  const list = document.getElementById('catList');
  list.innerHTML = state.categories.map(c => `
    <div class="cat-list-item" data-catid="${c.id}">
      <span class="cat-list-dot" style="background:${c.color}"></span>
      <span class="cat-list-name">${escHtml(c.name)}</span>
      <button class="cat-list-del" data-catid="${c.id}" title="Delete">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join('');
  list.querySelectorAll('.cat-list-del').forEach(btn => {
    btn.addEventListener('click', () => {
      state.categories = state.categories.filter(c => c.id !== btn.dataset.catid);
      saveCategories(); renderCatManager();
    });
  });
}

// --- Tab setup ---
function setupTabs() {
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      state.activeTab = t.dataset.tab;
      render();
    });
  });
}

// --- Search ---
function setupSearch() {
  const input = document.getElementById('searchInput');
  const clear = document.getElementById('clearSearch');
  input.addEventListener('input', () => {
    state.searchQuery = input.value;
    clear.style.display = input.value ? 'flex' : 'none';
    render();
  });
  clear.addEventListener('click', () => {
    input.value = ''; state.searchQuery = '';
    clear.style.display = 'none';
    render();
  });
}

// --- Init ---
async function init() {
  await loadData();
  setupTabs();
  setupSearch();

  // Add current tab btn
  document.getElementById('addCurrentBtn').addEventListener('click', async () => {
    const [tab] = await _ext.tabs.query({ active: true, currentWindow: true });
    if (tab) openAddModal(tab.url, tab.title||tab.url);
    else openAddModal();
  });

  // Settings btn
  document.getElementById('settingsBtn').addEventListener('click', () => {
    renderCatManager();
    document.getElementById('catOverlay').style.display = 'flex';
  });

  // Modal buttons
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('cancelModal').addEventListener('click', closeModal);
  document.getElementById('saveModal').addEventListener('click', saveModalLink);

  document.getElementById('newCatToggle').addEventListener('click', () => {
    const ni = document.getElementById('newCatInput');
    const sel = document.getElementById('modalCat');
    const show = ni.style.display === 'none';
    ni.style.display = show ? '' : 'none';
    sel.style.display = show ? 'none' : '';
    if (show) ni.focus();
  });

  // Cat modal
  document.getElementById('closeCatModal').addEventListener('click', () => {
    document.getElementById('catOverlay').style.display = 'none';
    render();
  });
  document.getElementById('addCatBtn').addEventListener('click', () => {
    const val = document.getElementById('addCatInput').value.trim();
    if (!val) return;
    const id = '_cat_' + genId();
    const color = CAT_COLORS[state.categories.length % CAT_COLORS.length];
    state.categories.push({ id, name: val, color });
    saveCategories();
    document.getElementById('addCatInput').value = '';
    renderCatManager();
  });
  document.getElementById('addCatInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('addCatBtn').click();
  });

  // Close overlays on bg click
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
  document.getElementById('catOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('catOverlay')) {
      document.getElementById('catOverlay').style.display = 'none'; render();
    }
  });

  render();
}

init();
