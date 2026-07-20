export type EditorTransaction<TArtifact> = {
  before: TArtifact;
  after: TArtifact;
};

export type EditorTransactionHistory<TArtifact> = {
  undo: readonly EditorTransaction<TArtifact>[];
  redo: readonly EditorTransaction<TArtifact>[];
};

export type EditorTransactionReplay<TArtifact> =
  | { changed: false; history: EditorTransactionHistory<TArtifact> }
  | { changed: true; artifact: TArtifact; history: EditorTransactionHistory<TArtifact> };

const HISTORY_LIMIT = 20;

export function createEditorTransactionHistory<TArtifact>(): EditorTransactionHistory<TArtifact> {
  return { undo: [], redo: [] };
}

export function recordEditorTransaction<TArtifact>(
  history: EditorTransactionHistory<TArtifact>,
  transaction: EditorTransaction<TArtifact>
): EditorTransactionHistory<TArtifact> {
  return {
    undo: [...history.undo.slice(-(HISTORY_LIMIT - 1)), transaction],
    redo: []
  };
}

export function undoEditorTransaction<TArtifact>(
  history: EditorTransactionHistory<TArtifact>
): EditorTransactionReplay<TArtifact> {
  const transaction = history.undo[history.undo.length - 1];
  if (!transaction) return { changed: false, history };
  return {
    changed: true,
    artifact: transaction.before,
    history: {
      undo: history.undo.slice(0, -1),
      redo: [...history.redo.slice(-(HISTORY_LIMIT - 1)), transaction]
    }
  };
}

export function redoEditorTransaction<TArtifact>(
  history: EditorTransactionHistory<TArtifact>
): EditorTransactionReplay<TArtifact> {
  const transaction = history.redo[history.redo.length - 1];
  if (!transaction) return { changed: false, history };
  return {
    changed: true,
    artifact: transaction.after,
    history: {
      undo: [...history.undo.slice(-(HISTORY_LIMIT - 1)), transaction],
      redo: history.redo.slice(0, -1)
    }
  };
}
