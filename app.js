const urlInput = document.getElementById('urlInput');
const submitBtn = document.getElementById('submitBtn');
const status = document.getElementById('status');
const statusText = document.getElementById('statusText');
const result = document.getElementById('result');
const notice = document.getElementById('notice');
const noticeBody = document.getElementById('noticeBody');

function showNotice(message){
  noticeBody.textContent = message;
  notice.classList.add('show');
  addNotification(message);
}
function hideNotice(){
  notice.classList.remove('show');
}
document.getElementById('noticeClose').addEventListener('click', hideNotice);
document.getElementById('noticeGuide').addEventListener('click', () => {
  hideNotice();
  document.getElementById('accordion').scrollIntoView({ behavior:'smooth', block:'start' });
});

function fmtNum(n){
  n = Number(n) || 0;
  if(n >= 1_000_000) return (n/1_000_000).toFixed(1).replace(/\.0$/,'') + 'M';
  if(n >= 1_000) return (n/1_000).toFixed(1).replace(/\.0$/,'') + 'K';
  return String(n);
}

function setStatus(text, isError){
  status.classList.add('show');
  status.classList.toggle('error', !!isError);
  statusText.textContent = text;
  status.querySelector('.spinner').style.display = isError ? 'none' : 'block';
}
function clearStatus(){
  status.classList.remove('show','error');
}

/* Notifications (localStorage) */
const NOTIF_KEY = 'orbinest_notifications';
function getNotifications(){
  try{ return JSON.parse(localStorage.getItem(NOTIF_KEY)) || []; }catch(e){ return []; }
}
function addNotification(message){
  const list = getNotifications();
  list.unshift({ message, time: Date.now() });
  localStorage.setItem(NOTIF_KEY, JSON.stringify(list.slice(0,50)));
  renderNotifications();
  updateNotifBadge();
}
function renderNotifications(){
  const list = getNotifications();
  const el = document.getElementById('notifList');
  if(!list.length){ el.innerHTML = '<div class="notif-empty">Belum ada notifikasi.</div>'; return; }
  el.innerHTML = list.map(n => `
    <div class="notif-item">
      <div>${escapeHtml(n.message)}</div>
      <div class="notif-time">${new Date(n.time).toLocaleString('id-ID')}</div>
    </div>
  `).join('');
}
function updateNotifBadge(){
  document.getElementById('notifBadge').style.display = getNotifications().length ? 'block' : 'none';
}

/* Download history (localStorage) */
const DL_KEY = 'orbinest_downloads';
function getDownloads(){
  try{ return JSON.parse(localStorage.getItem(DL_KEY)) || []; }catch(e){ return []; }
}
function addDownload(name, thumbnail){
  const list = getDownloads();
  list.unshift({ name, thumbnail, time: Date.now() });
  localStorage.setItem(DL_KEY, JSON.stringify(list.slice(0,50)));
  renderDownloads();
}
function renderDownloads(){
  const list = getDownloads();
  const el = document.getElementById('downloadList');
  if(!list.length){ el.innerHTML = '<div class="download-empty">Belum ada riwayat download.</div>'; return; }
  el.innerHTML = list.map(d => `
    <div class="download-item">
      ${d.thumbnail ? `<img src="${d.thumbnail}" alt="thumb">` : `<div class="dl-thumb-empty"></div>`}
      <div>
        <div class="dl-name">${escapeHtml(d.name)}</div>
        <div class="dl-time">${new Date(d.time).toLocaleString('id-ID')}</div>
      </div>
    </div>
  `).join('');
}

/* Bottom nav tab switching */
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.view).classList.add('active');
    if(btn.dataset.view === 'viewMenu') startServiceStatusPolling(); else stopServiceStatusPolling();
  });
});

/* Badge status real-time (merah/hijau) buat tiap tool di menu "Lainnya" */
let serviceStatusInterval = null;
async function checkServiceStatus(){
  const dotSpotify = document.getElementById('statusDotSpotify');
  const dotPlaySpotify = document.getElementById('statusDotPlaySpotify');
  try{
    const res = await fetch('/api/proxy?service=health');
    const data = await res.json();
    [dotSpotify, dotPlaySpotify].forEach(dot => {
      if(!dot) return;
      dot.classList.toggle('online', !!data.spotify);
      dot.classList.toggle('offline', !data.spotify);
      dot.title = data.spotify ? 'Layanan aktif' : 'Layanan sedang bermasalah';
    });
  }catch(_){
    [dotSpotify, dotPlaySpotify].forEach(dot => {
      if(!dot) return;
      dot.classList.remove('online');
      dot.classList.add('offline');
      dot.title = 'Layanan sedang bermasalah';
    });
  }
}
function startServiceStatusPolling(){
  checkServiceStatus();
  if(serviceStatusInterval) clearInterval(serviceStatusInterval);
  serviceStatusInterval = setInterval(checkServiceStatus, 15000);
}
function stopServiceStatusPolling(){
  if(serviceStatusInterval){ clearInterval(serviceStatusInterval); serviceStatusInterval = null; }
}

function isValidTikTokUrl(str){
  let u;
  try{ u = new URL(str); }catch(e){ return false; }
  if(u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  return host === 'tiktok.com' || host.endsWith('.tiktok.com');
}

async function handleSubmit(){
  const url = urlInput.value.trim();
  if(!url){ setStatus('Please enter a TikTok link first.', true); return; }
  if(!isValidTikTokUrl(url)){ setStatus('Please enter a valid TikTok link.', true); return; }

  result.classList.remove('show');
  result.innerHTML = '';
  hideNotice();
  submitBtn.disabled = true;
  setStatus('Processing video...');

  try{
    const res = await fetch('/api/download', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ url })
    });
    const data = await res.json();

    if(res.status === 429){
      clearStatus();
      if(data.spam){
        showNotice(data.message || 'You have been flagged for spam activity.');
      } else {
        setStatus(data.message || 'Download limit reached. Please try again later.', true);
      }
      return;
    }
    if(!res.ok || !data.success){
      setStatus(data.message || 'Failed to process the video. Please check the link.', true);
      return;
    }

    clearStatus();
    renderResult(data.data);
  }catch(err){
    setStatus('A network error occurred. Please try again.', true);
  }finally{
    submitBtn.disabled = false;
  }
}

function proxyDownloadUrl(rawUrl, filename){
  return `/api/proxy?url=${encodeURIComponent(rawUrl)}&filename=${encodeURIComponent(filename)}`;
}

function setDownloadButtonsLocked(locked){
  document.querySelectorAll('.dl-btn').forEach(b => b.classList.toggle('dl-locked', locked));
}

function handleDownloadClick(btn, action){
  setDownloadButtonsLocked(true);
  btn.classList.add('dl-pulse');
  try{
    if(action) action();
  } finally {
    btn.addEventListener('animationend', function onDlPulseEnd(){
      btn.classList.remove('dl-pulse');
      setDownloadButtonsLocked(false);
      btn.removeEventListener('animationend', onDlPulseEnd);
    });
  }
}

function renderResult(d){
  const authorAvatar = d.author.avatar || '';
  const uname = d.author.username || 'video';
  const isPhotoPost = Array.isArray(d.images) && d.images.length > 0;

  const previewBlock = isPhotoPost ? `
    <div class="photo-viewer">
      <div class="photo-track" id="photoTrack">
        ${d.images.map((img, i) => `
          <div class="photo-slide"><img src="${img}" alt="photo ${i+1}"></div>
        `).join('')}
      </div>
      <div class="photo-indicator" id="photoIndicator">1 / ${d.images.length}</div>
    </div>
  ` : `
    <div class="video-preview">
      ${d.cover ? `<img src="${d.cover}" alt="thumbnail">` : ''}
    </div>
  `;

  const dlIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg>';

  const dlButtonsBlock = isPhotoPost ? `
    <div class="dl-buttons">
      <button type="button" class="dl-btn primary" id="downloadCurrentPhoto">
        <span class="dl-btn-label">${dlIcon}Download Image</span><small>Original</small>
      </button>
      <button type="button" class="dl-btn" id="downloadAllPhotos">
        <span class="dl-btn-label">${dlIcon}Download All Images</span><small>${d.images.length} Foto</small>
      </button>
    </div>
  ` : `
    <div class="dl-buttons">
      <a class="dl-btn primary" href="${proxyDownloadUrl(d.video.noWatermark, `tiktokdwd-${uname}-no-watermark.mp4`)}" download>
        <span class="dl-btn-label">${dlIcon}Download No Watermark</span><small>${d.video.resolution || 'Default'}</small>
      </a>
      ${d.audio ? `<a class="dl-btn" href="${proxyDownloadUrl(d.audio, `tiktokdwd-${uname}-audio.mp3`)}" download><span class="dl-btn-label">${dlIcon}Download Audio (MP3)</span><small>Sound only</small></a>` : ''}
    </div>
  `;

  result.innerHTML = `
    ${previewBlock}
    <div class="caption">${d.caption ? escapeHtml(d.caption) : '<span style="color:var(--text-faint)">No caption</span>'}</div>
    <div class="author-row">
      ${authorAvatar ? `<img src="${authorAvatar}" alt="avatar">` : ''}
      <div>
        <div class="author-name">${escapeHtml(d.author.nickname || '-')}</div>
        <div class="author-handle">@${escapeHtml(d.author.username || '-')}</div>
      </div>
    </div>
    <div class="stats-grid">
      <div class="stat-box"><div class="stat-num">${fmtNum(d.stats.views)}</div><div class="stat-label">Views</div></div>
      <div class="stat-box"><div class="stat-num">${fmtNum(d.stats.likes)}</div><div class="stat-label">Likes</div></div>
      <div class="stat-box"><div class="stat-num">${fmtNum(d.stats.comments)}</div><div class="stat-label">Comments</div></div>
      <div class="stat-box"><div class="stat-num">${fmtNum(d.stats.shares)}</div><div class="stat-label">Shares</div></div>
    </div>
    ${dlButtonsBlock}
  `;
  result.classList.add('show');

  const dlName = d.author.nickname || d.author.username || 'Video TikTok';

  if(isPhotoPost){
    const track = document.getElementById('photoTrack');
    const indicator = document.getElementById('photoIndicator');
    const downloadCurrentBtn = document.getElementById('downloadCurrentPhoto');
    const downloadAllBtn = document.getElementById('downloadAllPhotos');
    let currentPhotoIndex = 0;

    track.addEventListener('scroll', () => {
      const idx = Math.round(track.scrollLeft / track.clientWidth);
      currentPhotoIndex = Math.max(0, Math.min(idx, d.images.length - 1));
      indicator.textContent = `${currentPhotoIndex+1} / ${d.images.length}`;
    });

    downloadCurrentBtn.addEventListener('click', () => {
      handleDownloadClick(downloadCurrentBtn, () => {
        const a = document.createElement('a');
        a.href = proxyDownloadUrl(d.images[currentPhotoIndex], `tiktokdwd-${uname}-photo-${currentPhotoIndex+1}.jpg`);
        a.download = '';
        document.body.appendChild(a);
        a.click();
        a.remove();
        addDownload(dlName, d.images[currentPhotoIndex] || '');
      });
    });

    downloadAllBtn.addEventListener('click', () => {
      handleDownloadClick(downloadAllBtn, () => {
        d.images.forEach((img, idx) => {
          const a = document.createElement('a');
          a.href = proxyDownloadUrl(img, `tiktokdwd-${uname}-photo-${idx+1}.jpg`);
          a.download = '';
          document.body.appendChild(a);
          a.click();
          a.remove();
        });
        addDownload(dlName, d.images[0] || '');
      });
    });
  }

  result.querySelectorAll('.dl-btn').forEach(btn => {
    if(btn.id === 'downloadCurrentPhoto' || btn.id === 'downloadAllPhotos') return;
    btn.addEventListener('click', () => addDownload(dlName, d.cover || (d.images && d.images[0]) || ''));
  });

  result.querySelectorAll('.dl-btn').forEach(btn => {
    if(btn.id === 'downloadCurrentPhoto' || btn.id === 'downloadAllPhotos') return;
    btn.addEventListener('click', () => handleDownloadClick(btn));
  });
}

function escapeHtml(s){
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

submitBtn.addEventListener('click', handleSubmit);
urlInput.addEventListener('keydown', e => { if(e.key === 'Enter') handleSubmit(); });

// Accordion
document.querySelectorAll('.acc-item').forEach(item => {
  const head = item.querySelector('.acc-head');
  const body = item.querySelector('.acc-body');
  head.addEventListener('click', () => {
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.acc-item.open').forEach(o => {
      if(o !== item){ o.classList.remove('open'); o.querySelector('.acc-body').style.maxHeight = null; }
    });
    item.classList.toggle('open');
    body.style.maxHeight = isOpen ? null : body.scrollHeight + 'px';
  });
});

/* Contact Owner modal (kontak di-encode base64, di-decode saat modal dibuka) */
const contactModalOverlay = document.getElementById('contactModalOverlay');
document.getElementById('menuContact').addEventListener('click', () => {
  const waNumber = atob('NjI4MjI1ODA1Nzk3Ng==');
  const tgUsername = atob('SW50RHk1');
  document.getElementById('contactWhatsapp').href = `https://wa.me/${waNumber}`;
  document.getElementById('contactTelegram').href = `https://t.me/${tgUsername}`;
  contactModalOverlay.classList.add('show');
});
document.getElementById('contactModalClose').addEventListener('click', () => contactModalOverlay.classList.remove('show'));
contactModalOverlay.addEventListener('click', e => { if(e.target === contactModalOverlay) contactModalOverlay.classList.remove('show'); });

renderNotifications();
renderDownloads();
updateNotifBadge();
