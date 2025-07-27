import { reviewDiff } from '@/review/review';
import { Config } from '@/types/Config';
import { ReviewRequest, ReviewScope } from '@/types/ReviewRequest';
import * as path from 'path';
import * as vscode from 'vscode';
import { getConfig } from './config';

type WebviewMessage = 
    | { type: 'getBranches' }
    | { type: 'getFilesList'; targetBranch: string; baseBranch: string; reviewType: 'committed' | 'all' }
    | { type: 'reviewChanges'; targetBranch: string; baseBranch: string; reviewType: 'committed' | 'all' }
    | { type: 'openFile'; filePath: string; line: number; comment: string }
    | { type: 'nextComment' }
    | { type: 'previousComment' };

export class CodeReviewPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = 'codeReview.codeReview';
    private _view?: vscode.WebviewView;
    private _config?: Config;
    private _commentController?: vscode.CommentController;
    private _allComments: Array<{filePath: string, line: number, comment: string}> = [];
    private _currentCommentIndex: number = -1;
    private _commentThreads: vscode.CommentThread[] = [];
    private _statusBarItem?: vscode.StatusBarItem;

    constructor(private readonly _extensionUri: vscode.Uri) {
        this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        // Suppress unused parameter warnings
        void _context;
        void _token;
        
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data: WebviewMessage) => {
            console.log('Received message from webview:', data);
            switch (data.type) {
                case 'getBranches':
                    await this._getBranches();
                    break;
                case 'getFilesList':
                    await this._getFilesList(data.targetBranch, data.baseBranch, data.reviewType);
                    break;
                case 'reviewChanges':
                    await this._reviewChanges(data.targetBranch, data.baseBranch, data.reviewType);
                    break;
                case 'openFile':
                    await this._openFileWithComment(data.filePath, data.line, data.comment);
                    break;
                case 'nextComment':
                    await this._navigateToComment('next');
                    break;
                case 'previousComment':
                    await this._navigateToComment('previous');
                    break;
            }
        });
    }

    private async _getBranches() {
        if (!this._config) {
            this._config = await getConfig();
        }

        try {
            const branchList = await this._config.git.getBranchList(undefined, 50);
            const branches = branchList.map(b => b.ref).filter(ref => typeof ref === 'string');
            
            // Get current branch by finding the one marked as current
            const currentBranchList = await this._config.git.getBranchList(undefined, 1);
            const currentBranch = currentBranchList.length > 0 ? currentBranchList[0].ref : '';
            
            // Find default base branch (main, master, develop)
            const defaultBases = ['origin/main', 'origin/master', 'origin/develop', 'main', 'master', 'develop'];
            let defaultBase = defaultBases.find(base => branches.includes(base));
            
            if (!defaultBase && branches.length > 0) {
                defaultBase = branches[0];
            }

            this._view?.webview.postMessage({
                type: 'branchesLoaded',
                branches: branches,
                currentBranch: currentBranch,
                defaultBase: defaultBase
            });
        } catch (error) {
            console.error('Error getting branches:', error);
            this._view?.webview.postMessage({
                type: 'error',
                message: 'Failed to load branches'
            });
        }
    }

    private async _getFilesList(targetBranch: string, baseBranch: string, _reviewType: 'committed' | 'all') {
        // Suppress unused parameter warning
        void _reviewType;
        
        if (!this._config) {
            this._config = await getConfig();
        }

        try {
            const scope: ReviewScope = await this._config.git.getReviewScope(targetBranch, baseBranch);
            const changedFiles = await this._config.git.getChangedFiles(scope);
            
            this._view?.webview.postMessage({
                type: 'filesListLoaded',
                files: changedFiles.map(file => ({
                    name: file.file,
                    status: file.status,
                    from: file.from
                })),
                baseBranch,
                targetBranch
            });
        } catch (error) {
            console.error('Error getting files list:', error);
            this._view?.webview.postMessage({
                type: 'error',
                message: 'Failed to load files list'
            });
        }
    }

    private async _reviewChanges(targetBranch: string, baseBranch: string, reviewType: 'committed' | 'all') {
        if (!this._config) {
            this._config = await getConfig();
        }

        try {
            this._view?.webview.postMessage({
                type: 'reviewStarted'
            });

            const scope: ReviewScope = await this._config.git.getReviewScope(targetBranch, baseBranch);
            
            if (reviewType === 'all') {
                // Include uncommitted changes
                // This would need additional implementation in the git utils
            }

            const reviewRequest: ReviewRequest = { scope };

            const progress = {
                lastMessage: '',
                report: ({ message }: { message: string }) => {
                    if (message && message !== progress.lastMessage) {
                        this._view?.webview.postMessage({
                            type: 'reviewProgress',
                            message: message
                        });
                        progress.lastMessage = message;
                    }
                },
            };

            const result = await reviewDiff(this._config, reviewRequest, progress, new vscode.CancellationTokenSource().token);
            
            // Filter comments by severity
            const options = this._config.getOptions();
            const filteredResults = result.fileComments.map(file => ({
                ...file,
                comments: file.comments.filter(comment => 
                    comment.severity >= options.minSeverity && comment.line > 0
                )
            })).filter(file => file.comments.length > 0);

            // Store all comments for navigation
            this._allComments = [];
            filteredResults.forEach(file => {
                file.comments.forEach(comment => {
                    this._allComments.push({
                        filePath: file.target,
                        line: comment.line,
                        comment: comment.comment
                    });
                });
            });
            this._currentCommentIndex = -1;

            // Hide status bar when no comments
            if (this._statusBarItem) {
                this._statusBarItem.hide();
            }

            this._view?.webview.postMessage({
                type: 'reviewCompleted',
                results: filteredResults,
                errors: result.errors
            });

        } catch (error) {
            console.error('Error during review:', error);
            this._view?.webview.postMessage({
                type: 'reviewError',
                message: error instanceof Error ? error.message : 'Unknown error occurred'
            });
        }
    }

    private async _openFileWithComment(filePath: string, line: number, comment: string) {
        console.log('_openFileWithComment called with:', { filePath, line, comment });
        
        // Find and set current comment index
        this._currentCommentIndex = this._allComments.findIndex(c => 
            c.filePath === filePath && c.line === line && c.comment === comment
        );
        
        await this._showCommentAtIndex(this._currentCommentIndex);
    }

    private async _navigateToComment(direction: 'next' | 'previous') {
        if (this._allComments.length === 0) {
            vscode.window.showInformationMessage('No comments available for navigation');
            return;
        }

        if (direction === 'next') {
            this._currentCommentIndex = (this._currentCommentIndex + 1) % this._allComments.length;
        } else {
            this._currentCommentIndex = this._currentCommentIndex <= 0 
                ? this._allComments.length - 1 
                : this._currentCommentIndex - 1;
        }

        await this._showCommentAtIndex(this._currentCommentIndex);
    }

    private async _showCommentAtIndex(index: number) {
        if (index < 0 || index >= this._allComments.length) {
            return;
        }

        const commentData = this._allComments[index];
        
        if (!this._config) {
            this._config = await getConfig();
        }

        try {
            // Clear existing comment threads
            this._commentThreads.forEach(thread => thread.dispose());
            this._commentThreads = [];

            // Convert relative path to absolute path using git root
            const gitRoot = this._config.git.getGitRoot();
            const absolutePath = path.join(gitRoot, commentData.filePath);
            console.log('Converted path:', { filePath: commentData.filePath, gitRoot, absolutePath });
            
            // Open the file
            const uri = vscode.Uri.file(absolutePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document);

            // Navigate to the line
            const position = new vscode.Position(Math.max(0, commentData.line - 1), 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);

            // Create comment thread using Commenting API
            if (!this._commentController) {
                this._commentController = vscode.comments.createCommentController(
                    'codeReview-comments',
                    'codeReview Code Review Comments'
                );
            }

            // Create a comment thread at the specific line
            const range = new vscode.Range(position, position);
            const thread = this._commentController.createCommentThread(uri, range, []);
            thread.contextValue = 'codeReview-review';
            
            // Create navigation buttons in markdown
            const currentNum = index + 1;
            const totalNum = this._allComments.length;
            
            const comment: vscode.Comment = {
                body: new vscode.MarkdownString(`**codeReview Review Comment (${currentNum}/${totalNum}):**\n\n${commentData.comment}`),
                mode: vscode.CommentMode.Preview,
                author: { name: 'codeReview Bot', iconPath: vscode.Uri.joinPath(this._extensionUri, 'images/icon.png') },
                contextValue: 'codeReview-comment'
            };
            
            thread.comments = [comment];

            thread.canReply = false;
            thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
            
            // Store thread for cleanup
            this._commentThreads.push(thread);

            // Update status bar
            if (this._statusBarItem) {
                this._statusBarItem.text = `$(comment) codeReview: ${currentNum}/${totalNum}`;
                this._statusBarItem.tooltip = `codeReview Review Comment ${currentNum} of ${totalNum}`;
                this._statusBarItem.command = 'codeReview.nextComment';
                this._statusBarItem.show();
            }

        } catch (error) {
            console.error('Error opening file with comment:', error);
            vscode.window.showErrorMessage(`Failed to open file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public refresh() {
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    public async navigateToNext() {
        await this._navigateToComment('next');
    }

    public async navigateToPrevious() {
        await this._navigateToComment('previous');
    }

    public dispose() {
        // Clean up comment threads
        this._commentThreads.forEach(thread => thread.dispose());
        this._commentThreads = [];
        
        // Clean up comment controller
        if (this._commentController) {
            this._commentController.dispose();
        }
        
        // Clean up status bar
        if (this._statusBarItem) {
            this._statusBarItem.dispose();
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
        const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css'));
        const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
        const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));

        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleResetUri.toString()}" rel="stylesheet">
    <link href="${styleVSCodeUri.toString()}" rel="stylesheet">
    <link href="${styleMainUri.toString()}" rel="stylesheet">
    <title>Copilot Code Review</title>
</head>
<body>
    <div class="container">
        <div class="section">
            <h3>Branch Comparison</h3>
            <div class="branch-selector">
                <div class="branch-row">
                    <select id="baseBranch" class="branch-select">
                        <option value="">Select base branch...</option>
                    </select>
                    <span class="arrow">←</span>
                    <select id="targetBranch" class="branch-select">
                        <option value="">Select target branch...</option>
                    </select>
                </div>
            </div>
            
            <div class="review-buttons hidden" id="reviewButtons">
                <button id="reviewCommitted" class="button primary">
                    <span class="codicon codicon-git-commit"></span>
                    Review Committed Changes
                </button>
                <button id="reviewAll" class="button secondary">
                    <span class="codicon codicon-git-branch"></span>
                    Review Committed and Pending Changes
                </button>
            </div>
        </div>

        <div class="section hidden" id="previewSection">
            <h3>Files to Review</h3>
            <div id="previewFiles" class="file-preview">
                <!-- File preview will be populated here -->
            </div>
        </div>

        <div class="section hidden" id="statusSection">
            <h3>Review Status</h3>
            <div id="statusMessage" class="status-message">
                <!-- Status message will be populated here -->
            </div>
            <div class="progress-bar hidden" id="progressBar">
                <div class="progress-fill" id="progressFill"></div>
            </div>
        </div>

        <div class="section hidden" id="resultsSection">
            <h3>Review Results</h3>
            <div id="reviewResults" class="results">
                <!-- Review results will be populated here -->
            </div>
        </div>
    </div>

    <script nonce="${nonce}" src="${scriptUri.toString()}"></script>
</body>
</html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
