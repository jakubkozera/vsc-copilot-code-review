// @ts-check

(function () {
    const vscode = acquireVsCodeApi();

    // DOM elements
    const baseBranchSelect = document.getElementById('baseBranch');
    const targetBranchSelect = document.getElementById('targetBranch');
    const reviewButtons = document.getElementById('reviewButtons');
    const reviewCommittedBtn = document.getElementById('reviewCommitted');
    const reviewAllBtn = document.getElementById('reviewAll');
    const previewSection = document.getElementById('previewSection');
    const previewFiles = document.getElementById('previewFiles');
    const statusSection = document.getElementById('statusSection');
    const statusMessage = document.getElementById('statusMessage');
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    const resultsSection = document.getElementById('resultsSection');
    const reviewResults = document.getElementById('reviewResults');

    let currentBranches = [];
    let isReviewing = false;

    // Initialize
    window.addEventListener('load', () => {
        setupEventListeners();
        loadBranches();
    });

    function setupEventListeners() {
        // Branch selection
        baseBranchSelect?.addEventListener('change', updateReviewButtons);
        targetBranchSelect?.addEventListener('change', updateReviewButtons);

        // Review buttons
        reviewCommittedBtn?.addEventListener('click', () => {
            if (!isReviewing) {
                startReview('committed');
            }
        });

        reviewAllBtn?.addEventListener('click', () => {
            if (!isReviewing) {
                startReview('all');
            }
        });

        // Listen for messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            handleMessage(message);
        });
    }

    function loadBranches() {
        vscode.postMessage({ type: 'getBranches' });
    }

    function handleMessage(message) {
        switch (message.type) {
            case 'branchesLoaded':
                populateBranches(message.branches, message.currentBranch, message.defaultBase);
                break;
            case 'filesListLoaded':
                handleFilesListLoaded(message.files, message.baseBranch, message.targetBranch);
                break;
            case 'reviewStarted':
                handleReviewStarted();
                break;
            case 'reviewProgress':
                handleReviewProgress(message.message);
                break;
            case 'reviewCompleted':
                handleReviewCompleted(message.results, message.errors);
                break;
            case 'reviewError':
                handleReviewError(message.message);
                break;
            case 'error':
                showError(message.message);
                break;
        }
    }

    function populateBranches(branches, currentBranch, defaultBase) {
        currentBranches = branches;

        // Clear existing options
        if (baseBranchSelect) {
            baseBranchSelect.innerHTML = '<option value="">Select base branch...</option>';
        }
        if (targetBranchSelect) {
            targetBranchSelect.innerHTML = '<option value="">Select target branch...</option>';
        }

        // Populate branches
        branches.forEach(branch => {
            const baseOption = document.createElement('option');
            baseOption.value = branch;
            baseOption.textContent = branch;
            baseBranchSelect?.appendChild(baseOption);

            const targetOption = document.createElement('option');
            targetOption.value = branch;
            targetOption.textContent = branch;
            targetBranchSelect?.appendChild(targetOption);
        });

        // Set defaults
        if (currentBranch && targetBranchSelect) {
            targetBranchSelect.value = currentBranch;
        }
        if (defaultBase && baseBranchSelect) {
            baseBranchSelect.value = defaultBase;
        }

        updateReviewButtons();
    }

    function updateReviewButtons() {
        const baseBranch = baseBranchSelect?.value || '';
        const targetBranch = targetBranchSelect?.value || '';
        
        if (baseBranch && targetBranch && baseBranch !== targetBranch) {
            reviewButtons?.classList.remove('hidden');
            requestFilesList(baseBranch, targetBranch);
        } else {
            reviewButtons?.classList.add('hidden');
            previewSection?.classList.add('hidden');
            statusSection?.classList.add('hidden');
            resultsSection?.classList.add('hidden');
        }
    }

    function requestFilesList(baseBranch, targetBranch) {
        vscode.postMessage({
            type: 'getFilesList',
            baseBranch: baseBranch,
            targetBranch: targetBranch,
            reviewType: 'committed' // Default to committed for preview
        });
    }

    function handleFilesListLoaded(files, baseBranch, targetBranch) {
        previewSection?.classList.remove('hidden');
        
        if (!files || files.length === 0) {
            if (previewFiles) {
                previewFiles.innerHTML = `
                    <div class="file-item">No files changed between <strong>${baseBranch}</strong> and <strong>${targetBranch}</strong></div>
                `;
            }
            return;
        }

        let html = `<div class="file-item">Reviewing changes from <strong>${baseBranch}</strong> to <strong>${targetBranch}</strong></div>`;
        
        files.forEach(file => {
            const fileName = getFileName(file.name);
            const statusClass = getStatusClass(file.status);
            const fileIcon = getFileIcon();
            html += `<div class="file-item ${statusClass}">${fileIcon}${fileName}</div>`;
        });
        
        html += `<div class="file-item">Click a review button to start analysis...</div>`;
        
        if (previewFiles) {
            previewFiles.innerHTML = html;
        }
    }

    function getFileName(filePath) {
        // Extract just the filename from the full path
        const parts = filePath.split('/');
        return parts[parts.length - 1];
    }

    function getStatusClass(status) {
        switch (status) {
            case 'A': return 'status-added';    // Added
            case 'M': return 'status-modified'; // Modified  
            case 'D': return 'status-deleted';  // Deleted
            case 'R': return 'status-renamed';  // Renamed
            case 'C': return 'status-copied';   // Copied
            default: return '';
        }
    }

    function getFileIcon() {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="file-icon"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" /></svg>`;
    }

    function startReview(reviewType) {
        const baseBranch = baseBranchSelect?.value || '';
        const targetBranch = targetBranchSelect?.value || '';

        if (!baseBranch || !targetBranch) {
            showError('Please select both base and target branches');
            return;
        }

        isReviewing = true;
        if (reviewCommittedBtn) reviewCommittedBtn.disabled = true;
        if (reviewAllBtn) reviewAllBtn.disabled = true;

        vscode.postMessage({
            type: 'reviewChanges',
            baseBranch: baseBranch,
            targetBranch: targetBranch,
            reviewType: reviewType
        });
    }

    function handleReviewStarted() {
        previewSection?.classList.add('hidden');
        statusSection?.classList.remove('hidden');
        resultsSection?.classList.add('hidden');
        if (statusMessage) statusMessage.textContent = 'Starting code review...';
        progressBar?.classList.remove('hidden');
        if (progressFill) progressFill.style.width = '10%';
    }

    function handleReviewProgress(message) {
        if (statusMessage) statusMessage.textContent = message;
        // Simulate progress increase
        const currentWidth = parseInt(progressFill?.style.width || '10') || 10;
        const newWidth = Math.min(currentWidth + 20, 90);
        if (progressFill) progressFill.style.width = newWidth + '%';
    }

    function handleReviewCompleted(results, errors) {
        isReviewing = false;
        if (reviewCommittedBtn) reviewCommittedBtn.disabled = false;
        if (reviewAllBtn) reviewAllBtn.disabled = false;
        
        if (progressFill) progressFill.style.width = '100%';
        if (statusMessage) statusMessage.textContent = 'Review completed!';
        
        setTimeout(() => {
            statusSection?.classList.add('hidden');
            showResults(results, errors);
        }, 1000);
    }

    function handleReviewError(message) {
        isReviewing = false;
        if (reviewCommittedBtn) reviewCommittedBtn.disabled = false;
        if (reviewAllBtn) reviewAllBtn.disabled = false;
        
        progressBar?.classList.add('hidden');
        if (statusMessage) statusMessage.innerHTML = `<div class="error-message">Error: ${message}</div>`;
    }

    function showResults(results, errors) {
        resultsSection?.classList.remove('hidden');
        
        if (!results || results.length === 0) {
            if (reviewResults) {
                reviewResults.innerHTML = `
                    <div class="empty-state">
                        ✅ No issues found in the code review!
                    </div>
                `;
            }
            return;
        }

        let html = '';
        
        results.forEach(file => {
            html += `
                <div class="result-file">
                    <div class="result-file-header">${getFileIcon()} ${file.target}</div>
                    <div class="result-comments">
            `;
            
            file.comments.forEach(comment => {
                html += `
                    <div class="result-comment" data-file-path="${escapeHtml(file.target)}" data-line="${comment.line}" data-comment="${escapeHtml(comment.comment)}">
                        <div class="comment-line">Line ${comment.line}</div>
                        <div class="comment-text">${escapeHtml(comment.comment)}</div>
                        <div class="comment-severity severity-${comment.severity}">Severity: ${comment.severity}/5</div>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        });

        if (errors && errors.length > 0) {
            html += `
                <div class="error-message">
                    <strong>Errors occurred during review:</strong><br>
                    ${errors.map(error => escapeHtml(error.message)).join('<br>')}
                </div>
            `;
        }

        if (reviewResults) {
            reviewResults.innerHTML = html;
            
            // Add click event listeners to comment elements
            const commentElements = reviewResults.querySelectorAll('.result-comment[data-file-path]');
            commentElements.forEach(element => {
                element.addEventListener('click', () => {
                    const filePath = element.getAttribute('data-file-path');
                    const lineAttr = element.getAttribute('data-line');
                    const comment = element.getAttribute('data-comment');
                    
                    console.log('Comment clicked:', { filePath, lineAttr, comment });
                    
                    if (filePath && lineAttr && comment) {
                        const line = parseInt(lineAttr, 10);
                        console.log('Sending openFile message:', { filePath, line, comment });
                        vscode.postMessage({
                            type: 'openFile',
                            filePath: filePath,
                            line: line,
                            comment: comment
                        });
                    }
                });
            });
        }
    }

    function showError(message) {
        statusSection?.classList.remove('hidden');
        if (statusMessage) statusMessage.innerHTML = `<div class="error-message">${escapeHtml(message)}</div>`;
        progressBar?.classList.add('hidden');
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

})();