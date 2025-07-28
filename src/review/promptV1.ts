import { responseExample } from './prompt';

export function createReviewPromptV1(
    changeDescription: string | undefined,
    diff: string,
    customPrompt: string
): string {
    customPrompt = customPrompt.length > 0 ? customPrompt.trim() + '\n' : '';

    const wrappedChangeDescription = changeDescription
        ? `<Change Description>\n${changeDescription}\n</Change Description>`
        : '';

    return `You are a senior software engineer reviewing a pull request. Analyze the following git diff for the changed files.

<Diff Format>
- The diff starts with a diff header, followed by diff lines.
- Diff lines have the format \`<LINE NUMBER><TAB><DIFF TYPE><LINE>\`.
- Lines with DIFF TYPE \`+\` are added.
- Lines with DIFF TYPE \`-\` are removed. (LINE NUMBER will be 0)
- Lines with DIFF TYPE \` \` are unchanged and provided for context.
</Diff Format>

<Review Rules>
- Provide comments on bugs, security vulnerabilities, code smells, and typos.
- Only provide comments for added lines.
- All comments must be actionable. Do not provide comments that are only positive feedback.
- Do not provide comments on formatting.
- Avoid repetitive comments.
- Do not make assumptions about code that is not included in the diff.
${customPrompt}</Review Rules>

<Output Rules>
- Respond with a JSON list of comments objects, which contain the fields \`file\`, \`line\`, \`comment\`, \`severity\`, and optionally \`proposedAdjustment\`.
\`file\` is the path of the file, taken from the diff header.
\`comment\` is a string describing the issue.
\`line\` is the first affected LINE NUMBER.
\`severity\` is the severity of the issue as an integer from 1 (likely irrelevant) to 5 (critical).
\`proposedAdjustment\` (optional) is an object with proposed code changes containing:
  - \`originalCode\`: The original code block that needs to be changed
  - \`adjustedCode\`: The proposed code block replacement  
  - \`description\`: Explanation of the change
  - \`startLine\` (optional): Start line for the replacement (if different from comment line)
  - \`endLine\` (optional): End line for the replacement (if different from comment line)
- Include \`proposedAdjustment\` when you can provide a specific, actionable code fix for the identified issue.
- Respond with only JSON, do NOT include other text or markdown.
</Output Rules>

<Output Example>
\`\`\`json
${JSON.stringify(responseExample, undefined, 2)}
\`\`\`
</Output Example>

${wrappedChangeDescription}

<Diff>
${diff}
</Diff>
`;
}
