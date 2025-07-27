// @ts-check

(function () {
    const vscode = acquireVsCodeApi();

    // DOM elements
    const baseBranchButton = document.getElementById('baseBranch');
    const targetBranchButton = document.getElementById('targetBranch');
    const baseBranchText = document.getElementById('baseBranchText');
    const targetBranchText = document.getElementById('targetBranchText');
    const reviewButtons = document.getElementById('reviewButtons');
    const mainButton = document.getElementById('mainButton');
    const mainArea = document.getElementById('mainArea');
    const chevronArea = document.getElementById('chevronArea');
    const dropdownMenu = document.getElementById('dropdownMenu');
    const dropdownArrow = document.getElementById('dropdownArrow');
    const previewSection = document.getElementById('previewSection');
    const previewFiles = document.getElementById('previewFiles');
    const statusSection = document.getElementById('statusSection');
    const statusMessage = document.getElementById('statusMessage');
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    const resultsSection = document.getElementById('resultsSection');
    const reviewResults = document.getElementById('reviewResults');
    const reviewStatus = document.getElementById('reviewStatus');
    const reviewStatusText = document.getElementById('reviewStatusText');

    let currentBranches = [];
    let selectedBaseBranch = '';
    let selectedTargetBranch = '';
    let isReviewing = false;
    let isDropdownOpen = false;
    let currentResults = [];

    // Initialize
    window.addEventListener('load', () => {
        setupEventListeners();
        loadBranches();
    });

    function setupEventListeners() {
        // Branch selection
        baseBranchButton?.addEventListener('click', () => {
            vscode.postMessage({ type: 'selectBaseBranch' });
        });
        
        targetBranchButton?.addEventListener('click', () => {
            vscode.postMessage({ type: 'selectTargetBranch' });
        });

        // Dropdown functionality
        if (mainArea) {
            mainArea.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!isReviewing && !mainButton?.classList.contains('disabled')) {
                    startReview('committed');
                }
            });
        }

        if (chevronArea) {
            chevronArea.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!mainButton?.classList.contains('disabled')) {
                    toggleDropdown();
                }
            });
        }

        // Dropdown options
        const dropdownOptions = document.querySelectorAll('.dropdown-option');
        dropdownOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = option.getAttribute('data-action');
                if (action && !isReviewing && !mainButton?.classList.contains('disabled')) {
                    startReview(action);
                }
                closeDropdown();
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            if (isDropdownOpen) {
                closeDropdown();
            }
        });

        // Prevent dropdown from closing when clicking inside it
        if (dropdownMenu) {
            dropdownMenu.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        // Listen for messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            handleMessage(message);
        });
    }

    function toggleDropdown() {
        isDropdownOpen = !isDropdownOpen;
        
        if (isDropdownOpen) {
            dropdownMenu?.classList.add('show');
            mainButton?.classList.add('expanded');
            dropdownArrow?.classList.add('expanded');
        } else {
            dropdownMenu?.classList.remove('show');
            mainButton?.classList.remove('expanded');
            dropdownArrow?.classList.remove('expanded');
        }
    }

    function closeDropdown() {
        isDropdownOpen = false;
        dropdownMenu?.classList.remove('show');
        mainButton?.classList.remove('expanded');
        dropdownArrow?.classList.remove('expanded');
    }

    function loadBranches() {
        vscode.postMessage({ type: 'getBranches' });
    }

    function formatBranchDisplay(branchName) {
        if (!branchName) return branchName;
        
        // Check if branch starts with remote/origin prefixes
        const remoteOriginPrefixes = ['remote/origin/', 'remotes/origin/', 'origin/'];
        let isRemote = false;
        let displayName = branchName;
        
        for (const prefix of remoteOriginPrefixes) {
            if (branchName.startsWith(prefix)) {
                isRemote = true;
                displayName = branchName.substring(prefix.length);
                break;
            }
        }
        
        if (isRemote) {
            // Return HTML with cloud icon for remote branches
            return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-cloud" style="margin-right: 4px; vertical-align: middle;"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M6.657 18c-2.572 0 -4.657 -2.007 -4.657 -4.483c0 -2.475 2.085 -4.482 4.657 -4.482c.393 -1.762 1.794 -3.2 3.675 -3.773c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.486c0 1.927 -1.551 3.487 -3.465 3.487h-11.878" /></svg><span style="vertical-align: middle;">${displayName}</span>`;
        }
        
        // Return plain text for local branches
        return `<span>${displayName}</span>`;
    }

    function handleMessage(message) {
        console.log('WebView received message:', message.type, message);
        switch (message.type) {
            case 'branchesLoaded':
                populateBranches(message.branches, message.currentBranch, message.defaultBase);
                break;
            case 'baseBranchSelected':
                selectedBaseBranch = message.branch;
                if (baseBranchText) {
                    baseBranchText.innerHTML = formatBranchDisplay(message.branch);
                }
                if (baseBranchButton) {
                    baseBranchButton.title = message.branch;
                }
                updateReviewButtons();
                break;
            case 'targetBranchSelected':
                selectedTargetBranch = message.branch;
                if (targetBranchText) {
                    targetBranchText.innerHTML = formatBranchDisplay(message.branch);
                }
                if (targetBranchButton) {
                    targetBranchButton.title = message.branch;
                }
                updateReviewButtons();
                break;
            case 'filesListLoaded':
                handleFilesListLoaded(message.files, message.baseBranch, message.targetBranch);
                break;
            case 'reviewStarted':
                handleReviewStarted();
                break;
            case 'chatReviewDisplaying':
                handleChatReviewDisplaying();
                break;
            case 'reviewProgress':
                handleReviewProgress(message.message);
                break;
            case 'fileReviewCompleted':
                handleFileReviewCompleted(message.fileResult);
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

        // Set defaults
        if (currentBranch) {
            selectedTargetBranch = currentBranch;
            if (targetBranchText) {
                targetBranchText.innerHTML = formatBranchDisplay(currentBranch);
            }
            if (targetBranchButton) {
                targetBranchButton.title = currentBranch;
            }
        }
        if (defaultBase) {
            selectedBaseBranch = defaultBase;
            if (baseBranchText) {
                baseBranchText.innerHTML = formatBranchDisplay(defaultBase);
            }
            if (baseBranchButton) {
                baseBranchButton.title = defaultBase;
            }
        }

        updateReviewButtons();
    }

    function updateReviewButtons() {
        const baseBranch = selectedBaseBranch;
        const targetBranch = selectedTargetBranch;
        
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
        const baseBranch = selectedBaseBranch;
        const targetBranch = selectedTargetBranch;

        if (!baseBranch || !targetBranch) {
            showError('Please select both base and target branches');
            return;
        }

        isReviewing = true;
        if (mainButton) mainButton.classList.add('disabled');

        vscode.postMessage({
            type: 'reviewChanges',
            baseBranch: baseBranch,
            targetBranch: targetBranch,
            reviewType: reviewType
        });
    }

    function handleReviewStarted() {
        console.log('handleReviewStarted called');
        
        isReviewing = true;
        if (mainButton) mainButton.classList.add('disabled');
        
        previewSection?.classList.add('hidden');
        statusSection?.classList.add('hidden');
        resultsSection?.classList.remove('hidden');
        reviewStatus?.classList.remove('hidden');
        
        if (reviewStatusText) reviewStatusText.textContent = 'Starting code review...';
        
        // Clear previous results
        currentResults = [];
        if (reviewResults) {
            reviewResults.innerHTML = '';
            console.log('Cleared previous results');
        }
    }

    function handleChatReviewDisplaying() {
        console.log('handleChatReviewDisplaying called - results from chat');
        
        // Make sure we show the results section and hide other sections
        previewSection?.classList.add('hidden');
        statusSection?.classList.add('hidden');
        resultsSection?.classList.remove('hidden');
        
        // Hide the review status spinner since this is from chat
        reviewStatus?.classList.add('hidden');
        
        console.log('UI prepared for chat review results');
    }

    function handleReviewProgress(message) {
        if (reviewStatusText) reviewStatusText.textContent = message;
    }

    function handleFileReviewCompleted(fileResult) {
        if (!fileResult) return;
        
        // Add to current results
        currentResults.push(fileResult);
        
        // Update status
        if (reviewStatusText) {
            reviewStatusText.textContent = `Reviewed ${currentResults.length} file(s)...`;
        }
        
        // Append just this file result to UI
        updateResultsUI([fileResult], null, false, true); // append mode
    }

    function handleReviewCompleted(results, errors) {
        console.log('handleReviewCompleted called with:', { resultsCount: results?.length, errorsCount: errors?.length });
        
        isReviewing = false;
        if (mainButton) mainButton.classList.remove('disabled');
        
        // Hide spinner
        reviewStatus?.classList.add('hidden');
        
        // Ensure results section is visible
        resultsSection?.classList.remove('hidden');
        
        // Show final results
        if (results && results.length > 0) {
            currentResults = results;
            console.log('Updating UI with results:', currentResults);
        } else {
            console.log('No results to display');
            currentResults = [];
        }
        
        updateResultsUI(currentResults, errors, true);
    }

    function handleReviewError(message) {
        isReviewing = false;
        if (mainButton) mainButton.classList.remove('disabled');
        
        reviewStatus?.classList.add('hidden');
        
        if (reviewResults) {
            reviewResults.innerHTML = `<div class="error-message">Error: ${message}</div>`;
        }
    }

    function updateResultsUI(results, errors = null, isComplete = false, append = false) {
        if (!results || results.length === 0) {
            if (isComplete && reviewResults) {
                reviewResults.innerHTML = `
                    <div class="empty-state">
                        ✅ No issues found in the code review!
                    </div>
                `;
            }
            return;
        }

        let html = '';
        
        // Calculate file index offset for append mode
        const fileIndexOffset = append ? (reviewResults?.children.length || 0) : 0;
        
        results.forEach((file, fileIndex) => {
            const actualFileIndex = fileIndexOffset + fileIndex;
            const fileName = getFileName(file.target);
            
            html += `
                <div class="result-file">
                    <div class="result-file-header" data-file-index="${actualFileIndex}">
                        <div class="result-file-title">
                            ${getFileIcon()} ${fileName}
                        </div>
                        <svg class="result-file-chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                            <path d="M6 9l6 6l6 -6" />
                        </svg>
                    </div>
                    <div class="result-comments" id="comments-${actualFileIndex}">
            `;
            
            file.comments.forEach(comment => {
                html += `
                    <div class="result-comment severity-${comment.severity}" data-file-path="${escapeHtml(file.target)}" data-line="${comment.line}" data-comment="${escapeHtml(comment.comment)}">
                        <div class="comment-line">Line ${comment.line}</div>
                        <div class="comment-text">${escapeHtml(comment.comment)}</div>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        });

        // Error handling temporarily disabled to focus on progressive updates
        // if (errors && Array.isArray(errors) && errors.length > 0 && isComplete) {
        //     html += `
        //         <div class="error-message">
        //             <strong>Errors occurred during review:</strong><br>
        //             ${errors.map(error => escapeHtml(error.message || error.toString())).join('<br>')}
        //         </div>
        //     `;
        // }

        if (reviewResults) {
            if (append) {
                // Append to existing content
                reviewResults.insertAdjacentHTML('beforeend', html);
            } else {
                // Replace all content
                reviewResults.innerHTML = html;
            }
            
            // Re-attach event listeners (only for new elements if appending)
            if (append) {
                attachResultEventListeners();
            } else {
                attachResultEventListeners();
            }
        }
    }

    function attachResultEventListeners() {
        if (!reviewResults) return;
        
        // Add click event listeners for collapsible headers
        const fileHeaders = reviewResults.querySelectorAll('.result-file-header[data-file-index]');
        fileHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const fileIndex = header.getAttribute('data-file-index');
                const commentsSection = document.getElementById(`comments-${fileIndex}`);
                const chevron = header.querySelector('.result-file-chevron');
                
                if (commentsSection && chevron) {
                    const isExpanded = commentsSection.classList.contains('expanded');
                    
                    if (isExpanded) {
                        commentsSection.classList.remove('expanded');
                        chevron.classList.remove('expanded');
                    } else {
                        commentsSection.classList.add('expanded');
                        chevron.classList.add('expanded');
                    }
                }
            });
        });
        
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

    function showResults(results, errors) {
        updateResultsUI(results, errors, true);
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