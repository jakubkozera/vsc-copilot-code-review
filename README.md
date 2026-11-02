![Demo](https://raw.githubusercontent.com/jakubkozera/vsc-copilot-code-review/refs/heads/master/githubcopilot-code-reviewer.gif)

# Github Copilot Code Reviewer

[![Latest Release](https://flat.badgen.net/github/release/jakubkozera/vsc-copilot-code-review)](https://github.com/jakubkozera/vsc-copilot-code-review/releases)
![Installs](https://vsmarketplacebadges.dev/installs-short/jakubkozera.github-copilot-code-reviewer.svg)
[![License](https://flat.badgen.net/github/license/jakubkozera/vsc-copilot-code-review)](./LICENSE)

Github Copilot Code Reviewer is a Visual Studio Code extension that uses GitHub Copilot Chat to review pull requests and source code changes in Git. It can help you catch bugs, areas for improvement, and other issues before merging.

> **Note**: This project is a fork of [cpulvermacher/lgtm](https://github.com/cpulvermacher/lgtm) with enhanced Source Control integration and additional features.

## Getting Started

Open the command palette and select `Code Review: Start Code Review...` to choose what to review, or use the Chat sidebar:

- Type `@codereview /review` to review changes between two branches, commits, or tags.
- Specify git refs explicitly, e.g. `/review develop main`, or omit arguments to select refs interactively.
- Use `/review staged` or `/review unstaged` to review uncommitted changes.
- Use `model:id` to pick a review model inline (e.g. `/review model:copilot:gpt-5.5 develop main`) and `context:path` / `context:none` to override context files.

### Reviewing Pull Requests

If you have the [GitHub Pull Requests](https://marketplace.visualstudio.com/items?itemName=GitHub.vscode-pull-request-github) or [Atlassian: Jira, Rovo Dev, Bitbucket](https://marketplace.visualstudio.com/items?itemName=Atlassian.atlascode) extension installed, hover over a pull request and click the review icon to start a review.

### Viewing and Navigating Results

Comments are printed in the chat, grouped by file and sorted by severity, and are also shown in the **Copilot Code Review** view in the Source Control panel.

- Click a comment to jump to the relevant line.
- Navigate between comments using the arrow buttons in comment threads, or `Ctrl+Shift+N` (next) and `Ctrl+Shift+B` (previous).
- Use **Apply Fix** on comments that include a proposed code adjustment, or the chat `Fix` action to fix a comment automatically with the inline chat model.

### Use in Agent Mode

Adds tools for automatic reviews in agent mode:

- `#review`: Reviews changes between two git references (branches, tags, or commits)
- `#reviewStaged`: Reviews only staged changes in your working directory
- `#reviewUnstaged`: Reviews only unstaged changes in your working directory
- Example: `After your changes, run all tests and run #reviewUnstaged to check your work.`

## Features

- **Source Control Integration**: Review results appear in a dedicated "Copilot Code Review" view in the Source Control panel, as well as in the chat.
- **Proposed Fixes**: The model can suggest concrete code changes that you can apply with one click.
- **Only Copilot Required**: Uses Copilot Chat for reviewing changes. Both free and paid plans are supported.
- **Model Selection**: Choose from language models available to VS Code, including Copilot Code Review, via the **Code Review: Select Review Model...** command. Select several models to compare their results.
- **Pull Request Integration**: Review pull requests from the GitHub Pull Requests or Bitbucket extensions.
- **Project-Specific Context Files**: By default, `AGENTS.md` is added to the review prompt. Configure with the `codeReview.contextFiles` setting.
- **Custom Instructions**: Add custom instructions via the `codeReview.customPrompt` setting (e.g. `- In the final JSON output, use Spanish for the comment field.`).

## Programmatic Use

Extensions and automation can call the hidden `codeReview.reviewChanges` command. It runs the review in the background and resolves with structured review comments, per-model results, and any errors. See `src/types/ReviewChangesCommand.ts` for the argument and result types.

```ts
// Review staged changes using the configured `codeReview.chatModel`.
const staged = await vscode.commands.executeCommand(
    'codeReview.reviewChanges',
    'staged'
);

// Review a topic/base pair with the default plus all preferred providers.
const branchReview = await vscode.commands.executeCommand(
    'codeReview.reviewChanges',
    'feature-branch',
    'main',
    'preferred'
);

// Options object form.
await vscode.commands.executeCommand('codeReview.reviewChanges', {
    topic: 'feature-branch',
    base: 'origin/main',
    models: ['copilot:gpt-5.5', 'copilot-code-review'],
});
```

## Limitations

- Chat models listed under "Unsupported Models" can be selected but reviews will fail at runtime.
- Some models (e.g. those added by directly adding an API key) may fail to work.
- Large change sets may trigger model rate limits. Please wait before retrying.

## Data Usage

Source code changes and commit messages selected for review are sent to the configured review model/provider.

## Contributing

Contributions are welcome! If you have ideas, bug reports, or want to help improve Github Copilot Code Reviewer, please open an issue or submit a pull request on [GitHub](https://github.com/jakubkozera/vsc-copilot-code-review).
