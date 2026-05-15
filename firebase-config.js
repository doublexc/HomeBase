// ════════════════════════════════════════════════
//  firebase-config.js  —  HomeVault main app
//  แก้ไข firebaseConfig ด้านล่างให้ตรงกับโปรเจกต์ของคุณ
// ════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, addDoc, query, where, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ──────────────────────────────────────────────
//  🔧 ตั้งค่า Firebase ของคุณที่นี่
// ──────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBnbXPyLcqCnRdsK3zvkKXbvXRSfHOwZdU",
  authDomain: "homebase-ddfd3.firebaseapp.com",
  projectId: "homebase-ddfd3",
  storageBucket: "homebase-ddfd3.firebasestorage.app",
  messagingSenderId: "565115475465",
  appId: "1:565115475465:web:6c6b2be92c4ac3ffb0cad8",
  measurementId: "G-FQZ4H2KV95"
}

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════
let currentUser = null;   // { uid, username, displayName }
let viewingUid  = null;   // uid ของโปรไฟล์ที่กำลังดูอยู่
let editingItemId = null; // id ของ item ที่กำลัง edit (null = add new)

// ════════════════════════════════════════════════
//  ROUTER — simple page switcher
// ════════════════════════════════════════════════
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
  window.scrollTo(0, 0);
}

// ════════════════════════════════════════════════
//  AUTH (manual — stored in Firestore + sessionStorage)
// ════════════════════════════════════════════════

/** hash อย่างง่าย — ไม่ใช่ crypto grade แต่ป้องกัน plain text ใน Firestore */
async function simpleHash(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function loginUser(username, password) {
  const userRef = doc(db, 'users', username.toLowerCase());
  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error('ไม่พบผู้ใช้นี้');
  const data = snap.data();
  const hash = await simpleHash(password);
  if (data.passwordHash !== hash) throw new Error('รหัสผ่านไม่ถูกต้อง');
  return { uid: username.toLowerCase(), username: username.toLowerCase(), displayName: data.displayName };
}

async function registerUser(inviteCode, username, displayName, password) {
  // ตรวจโค้ดเชิญ
  const inviteRef = doc(db, 'settings', 'inviteCodes');
  const inviteSnap = await getDoc(inviteRef);
  if (!inviteSnap.exists()) throw new Error('ไม่พบข้อมูลโค้ดเชิญ กรุณาติดต่อ Admin');
  const codes = inviteSnap.data(); // { "CODE_A": true, "CODE_B": { username: "..." } }

  const key = inviteCode.trim().toUpperCase();
  const entry = codes[key];
  if (!entry) throw new Error('โค้ดเชิญไม่ถูกต้อง');

  // ถ้าโค้ดถูกผูกกับ username เฉพาะ ตรวจด้วย
  if (typeof entry === 'object' && entry.username) {
    if (entry.username.toLowerCase() !== username.trim().toLowerCase()) {
      throw new Error('โค้ดเชิญนี้ไม่ตรงกับ username ที่กำหนด');
    }
  }

  const uid = username.trim().toLowerCase();

  // ตรวจ username ซ้ำ
  const userRef = doc(db, 'users', uid);
  const existing = await getDoc(userRef);
  if (existing.exists()) throw new Error('Username นี้ถูกใช้แล้ว');

  const hash = await simpleHash(password);
  await setDoc(userRef, {
    displayName: displayName.trim(),
    passwordHash: hash,
    createdAt: Date.now()
  });

  // ทำเครื่องหมายโค้ดว่าใช้แล้ว (optional — ถ้าต้องการให้ใช้ครั้งเดียว ให้เปิด comment)
  // await updateDoc(inviteRef, { [key]: { used: true, usedBy: uid } });

  return { uid, username: uid, displayName: displayName.trim() };
}

function saveSession(user) {
  sessionStorage.setItem('hv_user', JSON.stringify(user));
}
function loadSession() {
  const s = sessionStorage.getItem('hv_user');
  return s ? JSON.parse(s) : null;
}
function clearSession() {
  sessionStorage.removeItem('hv_user');
}

// ════════════════════════════════════════════════
//  MEMBERS
// ════════════════════════════════════════════════
async function loadMembers() {
  const grid = document.getElementById('members-grid');
  grid.innerHTML = '<div class="loading">กำลังโหลด...</div>';
  const snap = await getDocs(collection(db, 'users'));
  grid.innerHTML = '';
  snap.forEach(d => {
    const data = d.data();
    const uid  = d.id;
    const card = document.createElement('div');
    card.className = 'member-card';
    const initial = (data.displayName || uid).charAt(0).toUpperCase();
    card.innerHTML = `
      <div class="member-avatar">${initial}</div>
      <div class="member-name">${data.displayName || uid}</div>
      <div class="member-username">@${uid}</div>
    `;
    card.addEventListener('click', () => openProfile(uid, data.displayName || uid));
    grid.appendChild(card);
  });
}

// ════════════════════════════════════════════════
//  PROFILE / ITEMS
// ════════════════════════════════════════════════
async function openProfile(uid, displayName) {
  viewingUid = uid;
  const isOwner = currentUser.uid === uid;

  // header
  document.getElementById('profile-header-name').textContent = displayName;
  document.getElementById('profile-display-name').textContent = displayName;
  document.getElementById('profile-username-text').textContent = '@' + uid;
  document.getElementById('profile-avatar').textContent = displayName.charAt(0).toUpperCase();

  // ปุ่ม Add
  const addBtn = document.getElementById('btn-add-item');
  if (isOwner) addBtn.classList.remove('hidden');
  else addBtn.classList.add('hidden');

  showPage('page-profile');
  await loadItems(uid, isOwner);
}

async function loadItems(uid, isOwner) {
  const list = document.getElementById('items-list');
  list.innerHTML = '<div class="loading">กำลังโหลด...</div>';

  let q;
  if (isOwner) {
    q = query(collection(db, 'users', uid, 'items'), orderBy('createdAt', 'desc'));
  } else {
    q = query(
      collection(db, 'users', uid, 'items'),
      where('public', '==', true),
      orderBy('createdAt', 'desc')
    );
  }

  const snap = await getDocs(q);
  list.innerHTML = '';

  if (snap.empty) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${isOwner ? '📭' : '🔒'}</div>
        <p>${isOwner ? 'ยังไม่มีรายการ กด + เพิ่มได้เลย' : 'ไม่มีรายการสาธารณะ'}</p>
      </div>`;
    return;
  }

  snap.forEach(d => {
    const item = d.data();
    const card = renderItemCard(d.id, item, isOwner);
    list.appendChild(card);
  });
}

function renderItemCard(itemId, item, isOwner) {
  const card = document.createElement('div');
  card.className = 'item-card';

  const badgeClass = item.public ? 'badge-public' : 'badge-private';
  const badgeText  = item.public ? '🌐 Public' : '🔒 Private';

  card.innerHTML = `
    <div class="item-header">
      <div class="item-name">${escHtml(item.name || '-')}</div>
      <span class="item-badge ${badgeClass}">${badgeText}</span>
    </div>
    ${item.username ? `
    <div class="item-row">
      <span class="item-label">Username</span>
      <span class="item-value">${escHtml(item.username)}</span>
    </div>` : ''}
    ${item.password ? `
    <div class="item-row">
      <span class="item-label">Password</span>
      <span class="item-value">${escHtml(item.password)}</span>
    </div>` : ''}
    ${item.note ? `<div class="item-note">${escHtml(item.note)}</div>` : ''}
    <div class="item-actions">
      ${item.username ? `<button class="btn-copy" data-copy="${escHtml(item.username)}">📋 Copy User</button>` : ''}
      ${item.password ? `<button class="btn-copy" data-copy="${escHtml(item.password)}">📋 Copy Pass</button>` : ''}
      ${isOwner ? `<button class="btn-edit" data-id="${itemId}">✏️ แก้ไข</button>` : ''}
    </div>
  `;

  // copy buttons
  card.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.copy).then(() => {
        const orig = btn.textContent;
        btn.textContent = '✅ คัดลอกแล้ว';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1800);
      });
    });
  });

  // edit button
  const editBtn = card.querySelector('.btn-edit');
  if (editBtn) {
    editBtn.addEventListener('click', () => openEditModal(itemId, item));
  }

  return card;
}

// ════════════════════════════════════════════════
//  MODAL — Add / Edit Item
// ════════════════════════════════════════════════
function openAddModal() {
  editingItemId = null;
  document.getElementById('modal-title').textContent = 'เพิ่มรายการใหม่';
  document.getElementById('item-name').value     = '';
  document.getElementById('item-username').value = '';
  document.getElementById('item-password').value = '';
  document.getElementById('item-note').value     = '';
  document.getElementById('item-public').checked = false;
  document.getElementById('visibility-label').textContent = '🔒 Private';
  document.getElementById('btn-delete-item').classList.add('hidden');
  document.getElementById('modal-item').classList.remove('hidden');
}

function openEditModal(itemId, item) {
  editingItemId = itemId;
  document.getElementById('modal-title').textContent = 'แก้ไขรายการ';
  document.getElementById('item-name').value     = item.name     || '';
  document.getElementById('item-username').value = item.username || '';
  document.getElementById('item-password').value = item.password || '';
  document.getElementById('item-note').value     = item.note     || '';
  document.getElementById('item-public').checked = !!item.public;
  document.getElementById('visibility-label').textContent = item.public ? '🌐 Public' : '🔒 Private';
  document.getElementById('btn-delete-item').classList.remove('hidden');
  document.getElementById('modal-item').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-item').classList.add('hidden');
}

async function saveItem() {
  const name     = document.getElementById('item-name').value.trim();
  const username = document.getElementById('item-username').value.trim();
  const password = document.getElementById('item-password').value.trim();
  const note     = document.getElementById('item-note').value.trim();
  const isPublic = document.getElementById('item-public').checked;

  if (!name) { showToast('กรุณาใส่ชื่อรายการ'); return; }

  const payload = { name, username, password, note, public: isPublic };

  try {
    const colRef = collection(db, 'users', currentUser.uid, 'items');
    if (editingItemId) {
      await updateDoc(doc(colRef, editingItemId), payload);
      showToast('อัปเดตแล้ว ✅');
    } else {
      payload.createdAt = Date.now();
      await addDoc(colRef, payload);
      showToast('เพิ่มรายการแล้ว ✅');
    }
    closeModal();
    await loadItems(currentUser.uid, true);
  } catch (e) {
    showToast('เกิดข้อผิดพลาด: ' + e.message);
  }
}

async function deleteItem() {
  if (!editingItemId) return;
  if (!confirm('ลบรายการนี้?')) return;
  try {
    await deleteDoc(doc(db, 'users', currentUser.uid, 'items', editingItemId));
    showToast('ลบแล้ว');
    closeModal();
    await loadItems(currentUser.uid, true);
  } catch (e) {
    showToast('ลบไม่ได้: ' + e.message);
  }
}

// ════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 2600);
}

function showError(elId, msg) {
  const el = document.getElementById(elId);
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideError(elId) { document.getElementById(elId).classList.add('hidden'); }

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ════════════════════════════════════════════════
//  INIT — wire up all events
// ════════════════════════════════════════════════
function init() {
  // ── restore session ──
  const saved = loadSession();
  if (saved) {
    currentUser = saved;
    document.getElementById('header-username').textContent = saved.displayName;
    showPage('page-home');
    loadMembers();
  } else {
    showPage('page-login');
  }

  // ── Login ──
  document.getElementById('btn-login').addEventListener('click', async () => {
    hideError('login-error');
    const u = document.getElementById('login-username').value.trim();
    const p = document.getElementById('login-password').value;
    if (!u || !p) { showError('login-error','กรุณากรอก username และ password'); return; }
    try {
      currentUser = await loginUser(u, p);
      saveSession(currentUser);
      document.getElementById('header-username').textContent = currentUser.displayName;
      showPage('page-home');
      loadMembers();
    } catch (e) {
      showError('login-error', e.message);
    }
  });

  // ── Register ──
  document.getElementById('btn-goto-register').addEventListener('click', () => {
    hideError('login-error');
    showPage('page-register');
  });
  document.getElementById('btn-goto-login').addEventListener('click', () => {
    hideError('reg-error');
    showPage('page-login');
  });

  document.getElementById('btn-register').addEventListener('click', async () => {
    hideError('reg-error');
    const invite = document.getElementById('reg-invite').value.trim();
    const uname  = document.getElementById('reg-username').value.trim();
    const dname  = document.getElementById('reg-displayname').value.trim();
    const pass   = document.getElementById('reg-password').value;
    if (!invite || !uname || !dname || !pass) {
      showError('reg-error', 'กรุณากรอกข้อมูลให้ครบ'); return;
    }
    if (uname.includes(' ')) {
      showError('reg-error', 'Username ห้ามมีช่องว่าง'); return;
    }
    try {
      const user = await registerUser(invite, uname, dname, pass);
      showToast('สมัครสำเร็จ! กรุณา Login');
      showPage('page-login');
      document.getElementById('login-username').value = user.username;
    } catch (e) {
      showError('reg-error', e.message);
    }
  });

  // ── Logout ──
  const doLogout = () => {
    clearSession();
    currentUser = null;
    viewingUid  = null;
    showPage('page-login');
  };
  document.getElementById('btn-logout').addEventListener('click', doLogout);
  document.getElementById('btn-logout2').addEventListener('click', doLogout);

  // ── Back ──
  document.getElementById('btn-back').addEventListener('click', () => {
    showPage('page-home');
    loadMembers();
  });

  // ── Add Item ──
  document.getElementById('btn-add-item').addEventListener('click', openAddModal);
  document.getElementById('btn-cancel-item').addEventListener('click', closeModal);
  document.getElementById('btn-save-item').addEventListener('click', saveItem);
  document.getElementById('btn-delete-item').addEventListener('click', deleteItem);

  // close modal on overlay click
  document.getElementById('modal-item').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-item')) closeModal();
  });

  // visibility toggle label
  document.getElementById('item-public').addEventListener('change', e => {
    document.getElementById('visibility-label').textContent =
      e.target.checked ? '🌐 Public' : '🔒 Private';
  });

  // enter key on login
  ['login-username','login-password'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-login').click();
    });
  });
}

document.addEventListener('DOMContentLoaded', init);
