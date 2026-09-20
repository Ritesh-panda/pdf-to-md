// MinerU Web App Client Controller

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const fileInfoBar = document.getElementById('fileInfoBar');
  const fileNameDisplay = document.getElementById('fileNameDisplay');
  const fileRemoveBtn = document.getElementById('fileRemoveBtn');
  const parseForm = document.getElementById('parseForm');
  const parseBtn = document.getElementById('parseBtn');
  const parseBtnText = document.getElementById('parseBtnText');
  const pageRangeInput = document.getElementById('pageRangeInput');
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const hardwareBadge = document.getElementById('hardwareBadge');
  
  const progressContainer = document.getElementById('progressContainer');
  const progressStatus = document.getElementById('progressStatus');
  const progressPercent = document.getElementById('progressPercent');
  const progressBarFill = document.getElementById('progressBarFill');
  
  const resultsCard = document.getElementById('resultsCard');
  const placeholderState = document.getElementById('placeholderState');
  const tabContentContainer = document.getElementById('tabContentContainer');
  const renderedPane = document.getElementById('renderedPane');
  const rawMarkdownPane = document.getElementById('rawMarkdownPane');
  const jsonPane = document.getElementById('jsonPane');
  const mediaPane = document.getElementById('mediaPane');
  const mediaGrid = document.getElementById('mediaGrid');
  
  const downloadMdBtn = document.getElementById('downloadMdBtn');
  const downloadZipBtn = document.getElementById('downloadZipBtn');
  const copyMdBtn = document.getElementById('copyMdBtn');
  
  const tierCards = document.querySelectorAll('.tier-card');
  const tabBtns = document.querySelectorAll('.tab-btn');

  let selectedFile = null;
  let currentTier = 'standard';
  let lastResult = null;

  // Initialize Theme
  const savedTheme = localStorage.getItem('mineru-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  themeToggleBtn.addEventListener('click', () => {
    const activeTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = activeTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('mineru-theme', newTheme);
    updateThemeIcon(newTheme);
  });

  function updateThemeIcon(theme) {
    themeToggleBtn.innerText = theme === 'dark' ? '☀️' : '🌙';
  }

  // Fetch System / Hardware Info
  fetch('/api/health')
    .then(res => res.json())
    .then(data => {
      if (data.device) {
        hardwareBadge.innerText = `${data.device.toUpperCase()} ${data.gpu_name ? '· ' + data.gpu_name : ''}`;
      }
    })
    .catch(() => {
      hardwareBadge.innerText = 'ONLINE';
    });

  // Tier Selector
  tierCards.forEach(card => {
    card.addEventListener('click', () => {
      tierCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      currentTier = card.dataset.tier;
    });
  });

  // Tab Navigation
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const targetPane = document.getElementById(btn.dataset.target);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // Drag and Drop Handling
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt.files && dt.files.length > 0) {
      handleFile(dt.files[0]);
    }
  });

  dropZone.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      handleFile(fileInput.files[0]);
    }
  });

  fileRemoveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedFile = null;
    fileInput.value = '';
    fileInfoBar.style.display = 'none';
    dropZone.style.display = 'block';
    parseBtn.disabled = true;
  });

  function handleFile(file) {
    selectedFile = file;
    fileNameDisplay.innerText = file.name;
    fileInfoBar.style.display = 'flex';
    dropZone.style.display = 'none';
    parseBtn.disabled = false;
  }

  // Parse Submission
  parseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedFile) return;

    // Reset UI for processing
    parseBtn.disabled = true;
    parseBtnText.innerText = 'Extracting Document...';
    progressContainer.style.display = 'block';
    progressStatus.innerText = 'Uploading document...';
    progressBarFill.style.width = '20%';
    progressPercent.innerText = '20%';

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('tier', currentTier);
    if (pageRangeInput.value.trim()) {
      formData.append('page_range', pageRangeInput.value.trim());
    }

    try {
      // Progress simulation for backend inference
      setTimeout(() => {
        if (progressContainer.style.display !== 'none') {
          progressStatus.innerText = 'Running AI layout detection & OCR...';
          progressBarFill.style.width = '55%';
          progressPercent.innerText = '55%';
        }
      }, 1200);

      setTimeout(() => {
        if (progressContainer.style.display !== 'none') {
          progressStatus.innerText = 'Parsing formulas, tables & Markdown...';
          progressBarFill.style.width = '80%';
          progressPercent.innerText = '80%';
        }
      }, 3500);

      setTimeout(() => {
        if (progressContainer.style.display !== 'none' && currentTier === 'standard') {
          progressStatus.innerText = 'Downloading AI model weights (first run) or running CPU inference...';
          progressBarFill.style.width = '90%';
          progressPercent.innerText = '90%';
        }
      }, 10000);

      const response = await fetch('/api/parse', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || result.error || 'Failed to parse document');
      }

      progressBarFill.style.width = '100%';
      progressPercent.innerText = '100%';
      progressStatus.innerText = 'Extraction Complete!';

      setTimeout(() => {
        progressContainer.style.display = 'none';
      }, 1000);

      lastResult = result;
      displayResults(result);
      showToast('Document parsed successfully!', 'success');

    } catch (err) {
      progressContainer.style.display = 'none';
      showToast(err.message || 'Error occurred during parsing', 'error');
    } finally {
      parseBtn.disabled = false;
      parseBtnText.innerText = 'Start Extraction';
    }
  });

  // Render Display Logic
  function displayResults(data) {
    placeholderState.style.display = 'none';
    tabContentContainer.style.display = 'block';
    downloadMdBtn.disabled = false;
    downloadZipBtn.disabled = !data.task_id;
    copyMdBtn.disabled = false;

    // 1. Render Markdown with LaTeX Math
    const markdownContent = data.markdown || '';
    rawMarkdownPane.textContent = markdownContent;
    
    // Render Markdown using Marked & KaTeX
    renderedPane.innerHTML = renderMarkdownWithMath(markdownContent);

    // 2. Render JSON
    if (data.middle_json) {
      jsonPane.textContent = JSON.stringify(data.middle_json, null, 2);
    } else {
      jsonPane.textContent = JSON.stringify(data, null, 2);
    }

    // 3. Render Media Gallery
    mediaGrid.innerHTML = '';
    if (data.images && data.images.length > 0) {
      data.images.forEach(img => {
        const card = document.createElement('div');
        card.className = 'media-item-card';
        card.innerHTML = `
          <img src="${img.url}" alt="${img.name}" loading="lazy" />
          <div class="media-item-label">${img.name}</div>
        `;
        mediaGrid.appendChild(card);
      });
      document.getElementById('mediaTabBtn').style.display = 'inline-block';
    } else {
      document.getElementById('mediaTabBtn').style.display = 'inline-block';
      mediaGrid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:40px 0;">No standalone images extracted.</p>';
    }
  }

  // Math Delimiter Replacement & KaTeX rendering
  function renderMarkdownWithMath(text) {
    if (typeof marked === 'undefined') {
      return `<pre>${escapeHtml(text)}</pre>`;
    }

    // Replace display formulas $$...$$ and inline $...$ with placeholders for KaTeX
    const mathExpressions = [];
    
    // Block math $$...$$
    let processedText = text.replace(/\$\$([\s\S]+?)\$\$/g, (match, math) => {
      const id = `___MATH_BLOCK_${mathExpressions.length}___`;
      mathExpressions.push({ id, math, display: true });
      return id;
    });

    // Inline math $...$
    processedText = processedText.replace(/\$([^\$\n]+?)\$/g, (match, math) => {
      const id = `___MATH_INLINE_${mathExpressions.length}___`;
      mathExpressions.push({ id, math, display: false });
      return id;
    });

    // Render Markdown to HTML
    let html = marked.parse(processedText);

    // Replace placeholders with rendered KaTeX or HTML
    mathExpressions.forEach(({ id, math, display }) => {
      if (typeof katex !== 'undefined') {
        try {
          const renderedMath = katex.renderToString(math.trim(), {
            displayMode: display,
            throwOnError: false
          });
          html = html.replace(id, renderedMath);
        } catch (e) {
          html = html.replace(id, display ? `$$\n${escapeHtml(math)}\n$$` : `$${escapeHtml(math)}$`);
        }
      } else {
        html = html.replace(id, display ? `$$\n${escapeHtml(math)}\n$$` : `$${escapeHtml(math)}$`);
      }
    });

    return html;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
  }

  // Action Buttons
  copyMdBtn.addEventListener('click', () => {
    if (!lastResult || !lastResult.markdown) return;
    navigator.clipboard.writeText(lastResult.markdown).then(() => {
      showToast('Markdown copied to clipboard!', 'success');
    });
  });

  downloadMdBtn.addEventListener('click', () => {
    if (!lastResult || !lastResult.markdown) return;
    const blob = new Blob([lastResult.markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (lastResult.filename ? lastResult.filename.replace(/\.[^/.]+$/, '') : 'document') + '.md';
    a.click();
    URL.revokeObjectURL(url);
  });

  downloadZipBtn.addEventListener('click', () => {
    if (!lastResult || !lastResult.task_id) return;
    const rawName = lastResult.filename || 'document';
    const baseName = encodeURIComponent(rawName.replace(/\.[^/.]+$/, ''));
    window.location.href = `/api/download/${lastResult.task_id}/zip?filename=${baseName}`;
  });

  // Toast System
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '✅' : '⚠️'}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
});
