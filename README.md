# codeReview - AI Code Review

[![Latest Release](https://flat.badgen.net/github/release/cpulvermacher/codeReview)](https://github.com/cpulvermacher/codeReview/releases)
![Installs](https://vsmarketplacebadges.dev/installs-short/cpulvermacher.codeReview.svg)
[![Status](https://flat.badgen.net/github/checks/cpulvermacher/codeReview)](https://github.com/cpulvermacher/codeReview/actions/workflows/node.js.yml)
[![License](https://flat.badgen.net/github/license/cpulvermacher/codeReview)](./LICENSE)

codeReview is a Visual Studio Code extension that uses GitHub Copilot Chat to review source code changes in Git. It can help you catch bugs, areas for improvement, and other issues before merging.


## Getting Started


**Open the Chat Sidebar**

Switch to the Chat sidebar and ensure you are in `Ask` mode.

**Start a Review**
- Type `/review` to review uncommitted changes or changes between two branches, commits, or tags.
- You can specify git refs explicitly, e.g. `/review develop main`, or omit arguments to select refs interactively.
- Use `/branch` to review changes between two branches.
- Use `/commit` to review a single commit.

**View Results**

codeReview will respond with review comments grouped by file and sorted by severity. Additionally, review results are automatically displayed in the **Source Control panel** under the "Copilot Code Review" section for easy navigation and management.

**Navigate Review Comments**

- Results in the chat include clickable file references that jump to specific lines
- Use the "Copilot Code Review" section in the Source Control panel for an organized view
- Navigate between comments using the arrow buttons in comment threads
- Use keyboard shortcuts: `Ctrl+Shift+N` (next) and `Ctrl+Shift+B` (previous) when a comment thread is active


![Demo](./images/demo.gif)


## Features

- **Source Control Integration**: Review results appear both in Chat and in the dedicated "Copilot Code Review" panel within the Source Control view for easy navigation and file management.
- **Only Copilot Required**: Uses Copilot Chat for reviewing changes.
- **Model Selection**: Choose any language model available to VS Code via the **codeReview: Select Chat Model** command available in the Command Palette (press `Cmd+Shift+P` or `Ctrl+Shift+P`).
- **Custom Instructions**: Add custom instructions via the `codeReview: Custom Prompt` setting (e.g., change the language of review comments by adding `- In the final JSON output, use Spanish for the comment field.`).
- **Interactive Navigation**: Navigate between review comments using keyboard shortcuts and inline buttons.
- **Agent Support**: Adds tools to enable automatic reviews in agent mode:
  - `#review`: Reviews changes between two git references (branches, tags, or commits)
  - `#reviewStaged`: Reviews only staged changes in your working directory
  - `#reviewUnstaged`: Reviews only unstaged changes in your working directory
  - Example usage: `After your changes, run all tests and run #reviewUnstaged to check your work.`
- **Chat Integration**: Review content remains in chat history for follow-up questions by omitting `@codeReview`.



## Limitations

- This project is a work in progress; comment quality may vary.
- Large change sets may trigger chat model rate limits. Please wait before retrying.
- Some non-Copilot models require setting a system prompt which is not possible just yet.


## Data Usage

Source code changes and commit messages selected for review are sent to the chat model configured in the extension settings (default: GitHub Copilot GPT-4o).


## Contributing

Contributions are welcome! If you have ideas, bug reports, or want to help improve codeReview, please open an issue or submit a pull request on [GitHub](https://github.com/cpulvermacher/codeReview).