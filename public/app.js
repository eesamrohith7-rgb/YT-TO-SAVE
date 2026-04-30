const form = document.getElementById('url-form');
const urlInput = document.getElementById('url-input');
const fetchBtn = document.getElementById('fetch-btn');
const errorBanner = document.getElementById('error-banner');
const errorMessage = document.getElementById('error-message');
const videoInfo = document.getElementById('video-info');
const thumbnail = document.getElementById('thumbnail');
const duration = document.getElementById('duration');
const videoTitle = document.getElementById('video-title');
const videoChannel = document.getElementById('video-channel');
const viewCount = document.getElementById('view-count');
const formatSection = document.getElementById('format-section');
const loadingFormats = document.getElementById('loading-formats');
const formatGroups = document.getElementById('format-groups');
const downloadSection = document.getElementById('download-section');
const progressBar = document.getElementById('progress-bar');
const downloadPercent = document.getElementById('download-percent');
const downloadSpeed = document.getElementById('download-speed');
const downloadEta = document.getElementById('download-eta');
const downloadLabel = document.getElementById('download-label');

let debounceTimer = null;
let currentFormats = null;

// Format quality labels with sorting
const QUALITY_ORDER = ['4320p', '2160p', '1440p', '1080p', '720p', '480p', '360p', '240p', '144p', 'audio'];

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function showError(msg) {
  errorMessage.textContent = msg;
  errorBanner.classList.remove('hidden');
  videoInfo.classList.add('hidden');
  formatSection.classList.add('hidden');
  downloadSection.classList.add('hidden');
}

function hideError() {
  errorBanner.classList.add('hidden');
}

function setLoading(loading) {
  fetchBtn.classList.toggle('loading', loading);
  fetchBtn.disabled = loading;
}

function showVideoInfo(data) {
  thumbnail.src = data.thumbnail;
  thumbnail.alt = data.title;
  duration.textContent = formatDuration(data.duration);
  videoTitle.textContent = data.title;
  videoChannel.textContent = data.channel;
  viewCount.textContent = data.viewCount;
  videoInfo.classList.remove('hidden');
}

function renderFormats(formats) {
  formatGroups.innerHTML = '';
  loadingFormats.style.display = 'none';

  const groups = [
    { key: 'videoAudio', label: 'Video + Audio', icon: '▶' },
    { key: 'videoOnly', label: 'Video Only', icon: '🎬' },
    { key: 'audioOnly', label: 'Audio Only', icon: '🎵' }
  ];

  for (const group of groups) {
    const items = formats[group.key];
    if (!items || items.length === 0) continue;

    // Sort items by quality
    const sorted = items.slice().sort((a, b) => {
      const qa = a.quality.replace(/[^\d]/g, '') || '0';
      const qb = b.quality.replace(/[^\d]/g, '') || '0';
      return parseInt(qb) - parseInt(qa);
    });

    const groupDiv = document.createElement('div');
    groupDiv.className = 'format-group';

    const label = document.createElement('div');
    label.className = 'format-group-label';
    label.textContent = group.label;
    groupDiv.appendChild(label);

    const grid = document.createElement('div');
    grid.className = 'format-grid';

    sorted.forEach(fmt => {
      const card = document.createElement('div');
      card.className = 'format-card';
      card.dataset.formatId = fmt.format_id;
      card.dataset.type = group.key;

      const labelSpan = document.createElement('span');
      labelSpan.className = 'format-label';
      labelSpan.textContent = fmt.quality || fmt.format_note || fmt.ext.toUpperCase();

      const metaDiv = document.createElement('div');
      metaDiv.className = 'format-meta';

      const extSpan = document.createElement('span');
      extSpan.className = 'ext';
      extSpan.textContent = fmt.ext;

      metaDiv.appendChild(extSpan);

      if (fmt.resolution) {
        const resSpan = document.createElement('span');
        resSpan.textContent = fmt.resolution;
        metaDiv.appendChild(resSpan);
      }

      const sizeDiv = document.createElement('div');
      sizeDiv.className = 'format-size';
      sizeDiv.textContent = fmt.filesize || 'Unknown size';

      card.appendChild(labelSpan);
      card.appendChild(metaDiv);
      card.appendChild(sizeDiv);

      card.addEventListener('click', () => startDownload(fmt, card));
      grid.appendChild(card);
    });

    groupDiv.appendChild(grid);
    formatGroups.appendChild(groupDiv);
  }
}

function startDownload(fmt, card) {
  // Highlight selected card
  document.querySelectorAll('.format-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');

  const videoId = urlInput.dataset.videoId;

  downloadSection.classList.remove('hidden');
  formatSection.classList.add('hidden');
  videoInfo.classList.add('hidden');
  progressBar.style.width = '0%';
  downloadPercent.textContent = '0%';
  downloadSpeed.textContent = '';
  downloadEta.textContent = '';
  downloadLabel.textContent = `Downloading ${fmt.quality} (${fmt.ext})...`;

  const es = new EventSource(`/api/download/${videoId}/${fmt.format_id}`);

  es.addEventListener('progress', e => {
    const d = JSON.parse(e.data);
    const pct = Math.min(d.percent || 0, 99);
    progressBar.style.width = `${pct}%`;
    downloadPercent.textContent = `${pct.toFixed(1)}%`;
    if (d.speed) downloadSpeed.textContent = d.speed;
    if (d.eta) downloadEta.textContent = `ETA ${d.eta}`;
  });

  es.addEventListener('done', e => {
    const d = JSON.parse(e.data);
    progressBar.style.width = '100%';
    downloadPercent.textContent = '100%';
    downloadLabel.textContent = 'Download complete — starting...';
    downloadSpeed.textContent = '';
    downloadEta.textContent = '';
    es.close();

    // Trigger browser download
    window.location.href = `/api/file/${d.filename}`;
  });

  es.addEventListener('error', e => {
    const d = JSON.parse(e.data);
    showError(d.message || 'Download failed');
    es.close();
    downloadSection.classList.add('hidden');
  });
}

async function fetchVideoInfo(url) {
  hideError();
  setLoading(true);

  try {
    const res = await fetch('/api/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch video info');
    }

    setLoading(false);
    urlInput.dataset.videoId = data.id;
    showVideoInfo(data);

    formatSection.classList.remove('hidden');
    loadingFormats.style.display = 'flex';
    formatGroups.innerHTML = '';
    downloadSection.classList.add('hidden');

    renderFormats(data.formats);

  } catch (err) {
    setLoading(false);
    showError(err.message || 'Something went wrong');
  }
}

form.addEventListener('submit', e => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;
  fetchVideoInfo(url);
});

urlInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const url = urlInput.value.trim();
    if (url && (url.includes('youtube.com') || url.includes('youtu.be'))) {
      fetchVideoInfo(url);
    }
  }, 800);
});

urlInput.addEventListener('paste', e => {
  setTimeout(() => {
    const url = urlInput.value.trim();
    if (url && (url.includes('youtube.com') || url.includes('youtu.be'))) {
      fetchVideoInfo(url);
    }
  }, 50);
});

// FAQ Toggle Functionality
document.querySelectorAll('.faq-toggle').forEach(button => {
  button.addEventListener('click', () => {
    const faqItem = button.closest('.faq-item');
    const isActive = faqItem.classList.contains('active');
    
    // Close all other FAQ items
    document.querySelectorAll('.faq-item').forEach(item => {
      item.classList.remove('active');
    });
    
    // Toggle current item
    if (!isActive) {
      faqItem.classList.add('active');
    }
  });
});

// Smooth anchor navigation for in-page sections
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', (e) => {
    const href = link.getAttribute('href');
    if (!href || href === '#') return;
    const targetId = href.substring(1);
    const target = document.getElementById(targetId);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // update URL hash without jumping
      history.replaceState(null, '', href);
    }
  });
});

// Autofocus input and Paste & Detect behavior
try {
  if (urlInput) urlInput.focus();
} catch (e) {
  // ignore
}

const pasteBtn = document.getElementById('paste-btn');
if (pasteBtn) {
  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      urlInput.value = text.trim();
      if (text.includes('youtube.com') || text.includes('youtu.be')) {
        fetchVideoInfo(text.trim());
      }
    } catch (err) {
      console.warn('Clipboard read failed', err);
    }
  });
}