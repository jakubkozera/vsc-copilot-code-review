import type { PromptType } from './PromptType';

export type ProposedAdjustment = {
    originalCode: string; // the original code block that needs to be changed
    adjustedCode: string; // the proposed code block replacement
    description: string; // explanation of the change
    startLine?: number; // optional start line for the replacement (if different from comment line)
    endLine?: number; // optional end line for the replacement (if different from comment line)
};

export type ReviewComment = {
    file: string; // file path
    comment: string; // review comment
    line: number; // first affected line number (1-based, to-side of diff)
    severity: number; // in 0..5
    promptType?: PromptType; // which prompt was used to generate this comment (if overridden)
    proposedAdjustment?: ProposedAdjustment; // optional proposed code adjustment
};
