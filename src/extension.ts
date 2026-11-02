import * as vscode from 'vscode';

import { UncommittedRef } from '@/types/Ref';
import { CodeReviewPanel } from '@/vscode/CodeReviewPanel';
import { getConfig } from '@/vscode/config';
import { ReviewTool } from '@/vscode/ReviewTool';
import {
    parsePullRequest,
    RemoteBranchNotFound,
    UnsupportedModelError,
} from './utils/parsePullRequest';
import { registerChatParticipant } from './vscode/chat';
import { fixComment } from './vscode/fix';
import { getModelQuickPickItems } from './vscode/model';
import { reviewChangesCommand } from './vscode/reviewChangesCommand';
import { promptToFetchRemotes } from './vscode/ui';

// called the first time a command is executed
export function activate(context: vscode.ExtensionContext) {
    const codeReviewPanel = new CodeReviewPanel(context.extensionUri);
    context.subscriptions.push(
        codeReviewPanel,
        vscode.window.registerWebviewViewProvider(
            CodeReviewPanel.viewType,
            codeReviewPanel
        ),
        registerChatParticipant(context, async (result) => {
            await vscode.commands.executeCommand('workbench.view.scm');
            await codeReviewPanel.displayChatReviewResults(result);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'codeReview.selectChatModel',
            handleSelectChatModel
        ),
        vscode.commands.registerCommand(
            'codeReview.startCodeReview',
            startCodeReviewCommand
        ),
        vscode.commands.registerCommand(
            'codeReview.reviewStagedChanges',
            reviewStagedChangesCommand
        ),
        vscode.commands.registerCommand(
            'codeReview.reviewUnstagedChanges',
            reviewUnstagedChangesCommand
        ),
        vscode.commands.registerCommand(
            'codeReview.reviewPullRequest',
            reviewPullRequestCommand
        ),
        vscode.commands.registerCommand(
            'codeReview.reviewChanges',
            reviewChangesCommand
        ),
        vscode.commands.registerCommand('codeReview.fixComment', fixComment),
        vscode.commands.registerCommand('codeReview.refreshCodeReview', () =>
            codeReviewPanel.refresh()
        ),
        vscode.commands.registerCommand('codeReview.nextComment', () =>
            codeReviewPanel.navigateToNext()
        ),
        vscode.commands.registerCommand('codeReview.previousComment', () =>
            codeReviewPanel.navigateToPrevious()
        ),
        vscode.commands.registerCommand(
            'codeReview.openCodeReviewPanel',
            async () => {
                await vscode.commands.executeCommand('workbench.view.scm');
                await vscode.commands.executeCommand(
                    'codeReview.codeReview.focus'
                );
            }
        ),
        vscode.commands.registerCommand(
            'codeReview.applyCurrentAdjustment',
            async () => {
                try {
                    await codeReviewPanel.applyCurrentCommentAdjustment();
                } catch (error) {
                    vscode.window.showErrorMessage(
                        `Failed to apply current adjustment: ${errorMessage(error)}`
                    );
                }
            }
        ),
        vscode.commands.registerCommand(
            'codeReview.applyAdjustment',
            async (adjustment: unknown) => {
                try {
                    // command URIs may wrap the single argument in an array
                    const data = Array.isArray(adjustment)
                        ? adjustment[0]
                        : adjustment;
                    await codeReviewPanel.applyAdjustment(
                        data as Parameters<
                            CodeReviewPanel['applyAdjustment']
                        >[0]
                    );
                } catch (error) {
                    vscode.window.showErrorMessage(
                        `Failed to apply adjustment: ${errorMessage(error)}`
                    );
                }
            }
        )
    );

    context.subscriptions.push(
        vscode.lm.registerTool('review', new ReviewTool()),
        vscode.lm.registerTool(
            'reviewStaged',
            new ReviewTool({ defaultTarget: UncommittedRef.Staged })
        ),
        vscode.lm.registerTool(
            'reviewUnstaged',
            new ReviewTool({ defaultTarget: UncommittedRef.Unstaged })
        )
    );
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error';
}

async function startCodeReviewCommand() {
    await startReviewChat();
}
async function reviewStagedChangesCommand() {
    await startReviewChat('staged');
}
async function reviewUnstagedChangesCommand() {
    await startReviewChat('unstaged');
}
async function reviewPullRequestCommand(model: unknown) {
    const config = await getConfig({ refreshWorkspace: true });

    let pullRequest;
    try {
        pullRequest = await parsePullRequest(config, model);
    } catch (error) {
        if (error instanceof UnsupportedModelError) {
            await vscode.window.showInformationMessage(
                'Click "Review Pull Request" on a pull request to start a review.'
            );
        } else if (error instanceof RemoteBranchNotFound) {
            const action = await promptToFetchRemotes(error.message);
            if (action === 'fetch') {
                await reviewPullRequestCommand(model);
            }
        } else {
            const msg = error instanceof Error ? error.message : String(error);
            await vscode.window.showErrorMessage(msg);
        }

        return;
    }
    const { target, base } = pullRequest;
    await startReviewChat(target, base);
}

async function startReviewChat(target: string = '', base: string = '') {
    // if chat view is not focused, the command sometimes fizzles without doing anything, so focus it first before sending the command.
    await vscode.commands.executeCommand(
        'workbench.panel.chat.view.copilot.focus'
    );

    // wait for chat to initialize...
    const delayMs = 200;
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    // start a fresh chat session so the review isn't appended to existing history
    await vscode.commands.executeCommand('workbench.action.chat.newChat');

    const query = `@codereview /review ${target} ${base}`.trim();

    await vscode.commands.executeCommand('workbench.action.chat.open', {
        query,
        // set `isPartialQuery: true` to not send directly
    });
}

async function handleSelectChatModel() {
    const models = await vscode.lm.selectChatModels();
    const config = await getConfig();
    const currentModelId = config.getOptions().chatModel;
    const quickPickItems = getModelQuickPickItems(models ?? []).map((item) => {
        if (item.kind === vscode.QuickPickItemKind.Separator) return item;

        const isCurrentModel =
            item.providerId === currentModelId ||
            item.modelIdWithVendor === currentModelId ||
            item.id === currentModelId;
        const prefix = isCurrentModel ? '$(check)' : '\u2003 ';
        return {
            ...item,
            label: prefix + item.label,
        };
    });
    const selectedQuickPickItem = await vscode.window.showQuickPick(
        quickPickItems,
        { placeHolder: 'Select a review provider for Code Review reviews' }
    );
    if (selectedQuickPickItem?.providerId) {
        await config.setOption('chatModel', selectedQuickPickItem.providerId);
        vscode.window.showInformationMessage(
            `Code Review provider set to: ${selectedQuickPickItem.name}`
        );
    }
}
