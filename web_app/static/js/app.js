// MinerU Web Studio Client Controller (Single Document & Batch Automation)

document.addEventListener('DOMContentLoaded', () => {
  // Mode Navigation Elements
  const modeSingleBtn = document.getElementById('modeSingleBtn');
  const modeBatchBtn = document.getElementById('modeBatchBtn');
  const singleDocumentView = document.getElementById('singleDocumentView');
  const batchFolderView = document.getElementById('batchFolderView');

  // Single Document Elements
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

  // Batch Automation Elements
  const batchInputDir = document.getElementById('batchInputDir');
  const batchOutputDir = document.getElementById('batchOutputDir');
  const batchScanBtn = document.getElementById('batchScanBtn');
  const batchStartBtn = document.getElementById('batchStartBtn');
  const batchStartBtnText = document.getElementById('batchStartBtnText');
  const batchCancelBtn = document.getElementById('batchCancelBtn');
  const batchMasterZipBtn = document.getElementById('batchMasterZipBtn');
  
  const batchProgressCard = document.getElementById('batchProgressCard');
  const batchMasterProgressBar = document.getElementById('batchMasterProgressBar');
  const batchMasterPercent = document.getElementById('batchMasterPercent');
  const batchCurrentTaskText = document.getElementById('batchCurrentTaskText');
  
  const statTotalDocs = document.getElementById('statTotalDocs');
  const statSuccessDocs = document.getElementById('statSuccessDocs');
  const statSkippedDocs = document.getElementById('statSkippedDocs');
  const statFailedDocs = document.getElementById('statFailedDocs');
  
  const scannedCountBadge = document.getElementById('scannedCountBadge');
  const batchTableBody = document.getElementById('batchTableBody');
  const batchTerminalLogs = document.getElementById('batchTerminalLogs');
  const clearLogsBtn = document.getElementById('clearLogsBtn');
  
  const batchTierPills = document.querySelectorAll('[data-batch-tier]');
  const batchCreateZipCheck = document.getElementById('batchCreateZipCheck');
  const batchMasterZipCheck = document.getElementById('batchMasterZipCheck');
  const batchSkipExistingCheck = document.getElementById('batchSkipExistingCheck');
  const batchRecursiveCheck = document.getElementById('batchRecursiveCheck');

  // State
  let selectedFile = null;
  let currentTier = 'standard';
  let lastResult = null;

  let currentBatchTier = 'standard';
  let activeBatchId = null;
  let batchPollInterval = null;
  let scannedDocuments = [];

  // Initialize Theme
  const savedTheme = localStorage.getItem('mineru-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const activeTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = activeTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('mineru-theme', newTheme);
      updateThemeIcon(newTheme);
    });
  }

  function updateThemeIcon(theme) {
    if (themeToggleBtn) {
      themeToggleBtn.innerText = theme === 'dark' ? '☀️' : '🌙';
    }
  }

  // Fetch System / Hardware Info
  if (hardwareBadge) {
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
  }

  // ==========================================
  // Mode Switcher Logic
  // ==========================================
  if (modeSingleBtn && modeBatchBtn) {
    modeSingleBtn.addEventListener('click', () => {
      modeSingleBtn.classList.add('active');
      modeBatchBtn.classList.remove('active');
      if (singleDocumentView) singleDocumentView.style.display = 'grid';
      if (batchFolderView) batchFolderView.style.display = 'none';
    });

    modeBatchBtn.addEventListener('click', () => {
      modeBatchBtn.classList.add('active');
      modeSingleBtn.classList.remove('active');
      if (singleDocumentView) singleDocumentView.style.display = 'none';
      if (batchFolderView) batchFolderView.style.display = 'flex';
    });
  }

  // ==========================================
  // Single Document Mode Logic
  // ==========================================

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
  if (dropZone && fileInput) {
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
  }

  if (fileRemoveBtn) {
    fileRemoveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedFile = null;
      if (fileInput) fileInput.value = '';
      if (fileInfoBar) fileInfoBar.style.display = 'none';
      if (dropZone) dropZone.style.display = 'block';
      if (parseBtn) parseBtn.disabled = true;
    });
  }

  function handleFile(file) {
    selectedFile = file;
    if (fileNameDisplay) fileNameDisplay.innerText = file.name;
    if (fileInfoBar) fileInfoBar.style.display = 'flex';
    if (dropZone) dropZone.style.display = 'none';
    if (parseBtn) parseBtn.disabled = false;
  }

  // Parse Submission
  if (parseForm) {
    parseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!selectedFile) return;

      if (parseBtn) parseBtn.disabled = true;
      if (parseBtnText) parseBtnText.innerText = 'Extracting Document...';
      if (progressContainer) progressContainer.style.display = 'block';
      if (progressStatus) progressStatus.innerText = 'Uploading document...';
      if (progressBarFill) progressBarFill.style.width = '20%';
      if (progressPercent) progressPercent.innerText = '20%';

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('tier', currentTier);
      if (pageRangeInput && pageRangeInput.value.trim()) {
        formData.append('page_range', pageRangeInput.value.trim());
      }

      try {
        setTimeout(() => {
          if (progressContainer && progressContainer.style.display !== 'none') {
            if (progressStatus) progressStatus.innerText = 'Running AI layout detection & OCR...';
            if (progressBarFill) progressBarFill.style.width = '55%';
            if (progressPercent) progressPercent.innerText = '55%';
          }
        }, 1200);

        setTimeout(() => {
          if (progressContainer && progressContainer.style.display !== 'none') {
            if (progressStatus) progressStatus.innerText = 'Parsing formulas, tables & Markdown...';
            if (progressBarFill) progressBarFill.style.width = '80%';
            if (progressPercent) progressPercent.innerText = '80%';
          }
        }, 3500);

        const response = await fetch('/api/parse', {
          method: 'POST',
          body: formData
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.detail || result.error || 'Failed to parse document');
        }

        if (progressBarFill) progressBarFill.style.width = '100%';
        if (progressPercent) progressPercent.innerText = '100%';
        if (progressStatus) progressStatus.innerText = 'Extraction Complete!';

        setTimeout(() => {
          if (progressContainer) progressContainer.style.display = 'none';
        }, 1000);

        lastResult = result;
        displayResults(result);
        showToast('Document parsed successfully!', 'success');

      } catch (err) {
        if (progressContainer) progressContainer.style.display = 'none';
        showToast(err.message || 'Error occurred during parsing', 'error');
      } finally {
        if (parseBtn) parseBtn.disabled = false;
        if (parseBtnText) parseBtnText.innerText = 'Start Extraction';
      }
    });
  }

  function displayResults(data) {
    if (placeholderState) placeholderState.style.display = 'none';
    if (tabContentContainer) tabContentContainer.style.display = 'block';
    if (downloadMdBtn) downloadMdBtn.disabled = false;
    if (downloadZipBtn) downloadZipBtn.disabled = !data.task_id;
    if (copyMdBtn) copyMdBtn.disabled = false;

    const markdownContent = data.markdown || '';
    if (rawMarkdownPane) rawMarkdownPane.textContent = markdownContent;
    if (renderedPane) renderedPane.innerHTML = renderMarkdownWithMath(markdownContent);

    if (jsonPane) {
      if (data.middle_json) {
        jsonPane.textContent = JSON.stringify(data.middle_json, null, 2);
      } else {
        jsonPane.textContent = JSON.stringify(data, null, 2);
      }
    }

    if (mediaGrid) {
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
        const mediaTab = document.getElementById('mediaTabBtn');
        if (mediaTab) mediaTab.style.display = 'inline-block';
      } else {
        const mediaTab = document.getElementById('mediaTabBtn');
        if (mediaTab) mediaTab.style.display = 'inline-block';
        mediaGrid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:40px 0;">No standalone images extracted.</p>';
      }
    }
  }

  function renderMarkdownWithMath(text) {
    if (typeof marked === 'undefined') {
      return `<pre>${escapeHtml(text)}</pre>`;
    }

    const mathExpressions = [];
    
    let processedText = text.replace(/\$\$([\s\S]+?)\$\$/g, (match, math) => {
      const id = `___MATH_BLOCK_${mathExpressions.length}___`;
      mathExpressions.push({ id, math, display: true });
      return id;
    });

    processedText = processedText.replace(/\$([^\$\n]+?)\$/g, (match, math) => {
      const id = `___MATH_INLINE_${mathExpressions.length}___`;
      mathExpressions.push({ id, math, display: false });
      return id;
    });

    let html = marked.parse(processedText);

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

  if (copyMdBtn) {
    copyMdBtn.addEventListener('click', () => {
      if (!lastResult || !lastResult.markdown) return;
      navigator.clipboard.writeText(lastResult.markdown).then(() => {
        showToast('Markdown copied to clipboard!', 'success');
      });
    });
  }

  if (downloadMdBtn) {
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
  }

  if (downloadZipBtn) {
    downloadZipBtn.addEventListener('click', () => {
      if (!lastResult || !lastResult.task_id) return;
      const rawName = lastResult.filename || 'document';
      const baseName = encodeURIComponent(rawName.replace(/\.[^/.]+$/, ''));
      window.location.href = `/api/download/${lastResult.task_id}/zip?filename=${baseName}`;
    });
  }

  // ==========================================
  // Batch Folder Automation Logic
  // ==========================================

  // Batch Tier Selector
  batchTierPills.forEach(pill => {
    pill.addEventListener('click', () => {
      batchTierPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentBatchTier = pill.dataset.batchTier;
    });
  });

  // Clear Logs
  if (clearLogsBtn && batchTerminalLogs) {
    clearLogsBtn.addEventListener('click', () => {
      batchTerminalLogs.innerHTML = '<div class="terminal-line muted">Logs cleared.</div>';
    });
  }

  function appendTerminalLog(msg) {
    if (!batchTerminalLogs) return;
    const line = document.createElement('div');
    line.className = 'terminal-line';
    line.textContent = msg;
    batchTerminalLogs.appendChild(line);
    batchTerminalLogs.scrollTop = batchTerminalLogs.scrollHeight;
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Scan Folder
  if (batchScanBtn) {
    batchScanBtn.addEventListener('click', async () => {
      const inputDir = batchInputDir ? batchInputDir.value.trim() : '';
      if (!inputDir) {
        showToast('Please enter a source folder path first', 'error');
        if (batchInputDir) batchInputDir.focus();
        return;
      }

      batchScanBtn.disabled = true;
      batchScanBtn.innerText = 'Scanning...';
      appendTerminalLog(`🔍 Scanning directory: ${inputDir}...`);

      try {
        const res = await fetch('/api/batch/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input_dir: inputDir,
            output_dir: batchOutputDir ? batchOutputDir.value.trim() : '',
            recursive: batchRecursiveCheck ? batchRecursiveCheck.checked : false
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || 'Failed to scan folder.');
        }

        scannedDocuments = data.documents || [];
        if (scannedCountBadge) scannedCountBadge.innerText = `${scannedDocuments.length} Files Found`;

        if (batchOutputDir && !batchOutputDir.value.trim()) {
          batchOutputDir.value = data.output_dir;
        }

        renderBatchTable(scannedDocuments);

        if (scannedDocuments.length > 0) {
          if (batchStartBtn) batchStartBtn.disabled = false;
          showToast(`Found ${scannedDocuments.length} document(s) in folder!`, 'success');
          appendTerminalLog(`✅ Found ${scannedDocuments.length} supported documents.`);
        } else {
          if (batchStartBtn) batchStartBtn.disabled = true;
          showToast('No PDF or supported documents found in this directory.', 'error');
          appendTerminalLog('⚠️ No PDF/document files found in directory.');
        }

      } catch (err) {
        showToast(err.message || 'Error scanning directory', 'error');
        appendTerminalLog(`❌ Scan Error: ${err.message}`);
      } finally {
        batchScanBtn.disabled = false;
        batchScanBtn.innerText = '🔍 Scan Folder';
      }
    });
  }

  function renderBatchTable(docs) {
    if (!batchTableBody) return;
    if (!docs || docs.length === 0) {
      batchTableBody.innerHTML = `
        <tr class="empty-table-row">
          <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px 0;">
            No documents found. Check the folder path and try again.
          </td>
        </tr>
      `;
      return;
    }

    batchTableBody.innerHTML = '';
    docs.forEach((doc, idx) => {
      const row = document.createElement('tr');
      row.id = `batchRow_${idx}`;
      
      const statusClass = `badge-${doc.status || 'pending'}`;
      const statusText = doc.status ? doc.status.toUpperCase() : 'PENDING';

      row.innerHTML = `
        <td style="color:var(--text-muted);">${idx + 1}</td>
        <td style="font-weight:600;" title="${escapeHtml(doc.path || '')}">
          📄 ${escapeHtml(doc.rel_path || doc.name)}
        </td>
        <td style="color:var(--text-secondary);">${formatBytes(doc.size_bytes || 0)}</td>
        <td>
          <span class="status-badge ${statusClass}" id="badge_${idx}">${statusText}</span>
        </td>
        <td id="pages_${idx}">${doc.pages ? doc.pages + ' p.' : '-'}</td>
        <td id="time_${idx}" style="color:var(--text-muted);">${doc.elapsed_seconds ? doc.elapsed_seconds + 's' : '-'}</td>
        <td style="text-align:right;" id="actions_${idx}">
          <span style="color:var(--text-muted);font-size:12px;">Waiting...</span>
        </td>
      `;
      batchTableBody.appendChild(row);
    });
  }

  // Start Batch Conversion
  if (batchStartBtn) {
    batchStartBtn.addEventListener('click', async () => {
      const inputDir = batchInputDir ? batchInputDir.value.trim() : '';
      const outputDir = batchOutputDir ? batchOutputDir.value.trim() : '';

      if (!inputDir) {
        showToast('Please enter an input directory path.', 'error');
        return;
      }

      batchStartBtn.disabled = true;
      if (batchStartBtnText) batchStartBtnText.innerText = 'Converting Documents...';
      if (batchCancelBtn) batchCancelBtn.style.display = 'inline-flex';
      if (batchMasterZipBtn) batchMasterZipBtn.style.display = 'none';
      if (batchProgressCard) batchProgressCard.style.display = 'block';

      appendTerminalLog(`\n🚀 Starting batch conversion job...`);
      appendTerminalLog(`📂 Source: ${inputDir}`);
      appendTerminalLog(`💾 Destination: ${outputDir}`);

      try {
        const res = await fetch('/api/batch/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input_dir: inputDir,
            output_dir: outputDir,
            tier: currentBatchTier,
            recursive: batchRecursiveCheck ? batchRecursiveCheck.checked : false,
            skip_existing: batchSkipExistingCheck ? batchSkipExistingCheck.checked : false,
            create_zip: batchCreateZipCheck ? batchCreateZipCheck.checked : true,
            create_master_zip: batchMasterZipCheck ? batchMasterZipCheck.checked : true
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || 'Failed to start batch conversion.');
        }

        activeBatchId = data.batch_id;
        showToast('Batch conversion started in background!', 'success');

        // Start Polling
        if (batchPollInterval) clearInterval(batchPollInterval);
        batchPollInterval = setInterval(pollBatchStatus, 1000);

      } catch (err) {
        batchStartBtn.disabled = false;
        if (batchStartBtnText) batchStartBtnText.innerText = 'Start Batch Conversion';
        if (batchCancelBtn) batchCancelBtn.style.display = 'none';
        showToast(err.message || 'Error starting batch', 'error');
        appendTerminalLog(`❌ Launch Error: ${err.message}`);
      }
    });
  }

  // Poll Batch Status
  async function pollBatchStatus() {
    if (!activeBatchId) return;

    try {
      const res = await fetch(`/api/batch/status/${activeBatchId}`);
      if (!res.ok) return;

      const data = await res.json();

      // Update counters
      if (statTotalDocs) statTotalDocs.innerText = data.total || 0;
      if (statSuccessDocs) statSuccessDocs.innerText = data.successful || 0;
      if (statSkippedDocs) statSkippedDocs.innerText = data.skipped || 0;
      if (statFailedDocs) statFailedDocs.innerText = data.failed || 0;

      // Update Progress Bar
      const percent = data.progress_percent || 0;
      if (batchMasterProgressBar) batchMasterProgressBar.style.width = `${percent}%`;
      if (batchMasterPercent) batchMasterPercent.innerText = `${percent}%`;

      if (batchCurrentTaskText) {
        if (data.current_file) {
          batchCurrentTaskText.innerText = `[${data.current_index}/${data.total}] Processing: ${data.current_file}`;
        } else if (data.status === 'completed') {
          batchCurrentTaskText.innerText = '✅ All conversions completed!';
        } else if (data.status === 'cancelled') {
          batchCurrentTaskText.innerText = '🛑 Batch stopped.';
        }
      }

      // Update Document Table Rows
      if (data.documents && data.documents.length > 0) {
        data.documents.forEach((doc, idx) => {
          const badge = document.getElementById(`badge_${idx}`);
          const pagesCell = document.getElementById(`pages_${idx}`);
          const timeCell = document.getElementById(`time_${idx}`);
          const actionsCell = document.getElementById(`actions_${idx}`);

          if (badge) {
            badge.className = `status-badge badge-${doc.status || 'pending'}`;
            badge.innerText = (doc.status || 'pending').toUpperCase();
          }

          if (pagesCell && doc.pages) {
            pagesCell.innerText = `${doc.pages} p.`;
          }

          if (timeCell && doc.elapsed_seconds) {
            timeCell.innerText = `${doc.elapsed_seconds}s`;
          }

          if (actionsCell) {
            if (doc.status === 'success') {
              actionsCell.innerHTML = `
                <span style="color:var(--success);font-weight:600;font-size:12px;">✅ Saved</span>
              `;
            } else if (doc.status === 'skipped') {
              actionsCell.innerHTML = `
                <span style="color:var(--warning);font-weight:600;font-size:12px;">⏭️ Exists</span>
              `;
            } else if (doc.status === 'error') {
              actionsCell.innerHTML = `
                <span style="color:var(--error);font-weight:600;font-size:12px;" title="${escapeHtml(doc.error || '')}">❌ Error</span>
              `;
            } else if (doc.status === 'processing') {
              actionsCell.innerHTML = `
                <span style="color:var(--info);font-weight:600;font-size:12px;">⚙️ Parsing...</span>
              `;
            }
          }
        });
      }

      // Sync Logs
      if (data.logs && data.logs.length > 0 && batchTerminalLogs) {
        batchTerminalLogs.innerHTML = '';
        data.logs.forEach(log => {
          const line = document.createElement('div');
          line.className = 'terminal-line';
          line.textContent = log;
          batchTerminalLogs.appendChild(line);
        });
        batchTerminalLogs.scrollTop = batchTerminalLogs.scrollHeight;
      }

      // Check if finished
      if (data.status === 'completed' || data.status === 'cancelled' || data.status === 'error') {
        clearInterval(batchPollInterval);
        batchPollInterval = null;
        if (batchStartBtn) {
          batchStartBtn.disabled = false;
          if (batchStartBtnText) batchStartBtnText.innerText = 'Start Batch Conversion';
        }
        if (batchCancelBtn) batchCancelBtn.style.display = 'none';

        if (data.status === 'completed') {
          showToast(`Batch conversion complete! ${data.successful} converted, ${data.skipped} skipped.`, 'success');
          if (batchMasterProgressBar) batchMasterProgressBar.style.width = '100%';
          if (batchMasterPercent) batchMasterPercent.innerText = '100%';
          if (batchMasterZipBtn) batchMasterZipBtn.style.display = 'inline-flex';
        } else if (data.status === 'cancelled') {
          showToast('Batch conversion was cancelled.', 'info');
        }
      }

    } catch (err) {
      console.error('Error polling batch status:', err);
    }
  }

  // Cancel Batch
  if (batchCancelBtn) {
    batchCancelBtn.addEventListener('click', async () => {
      if (!activeBatchId) return;
      try {
        await fetch(`/api/batch/cancel/${activeBatchId}`, { method: 'POST' });
        showToast('Cancelling batch...', 'info');
        appendTerminalLog('🛑 Sent cancellation request to server...');
      } catch (err) {
        showToast('Failed to cancel batch', 'error');
      }
    });
  }

  // Download Master ZIP Bundle
  if (batchMasterZipBtn) {
    batchMasterZipBtn.addEventListener('click', () => {
      if (!activeBatchId) return;
      window.location.href = `/api/batch/download/${activeBatchId}/zip`;
    });
  }

  // Toast Notification System
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
});
