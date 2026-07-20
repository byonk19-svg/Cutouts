import {
  createEditorTransactionHistory,
  recordEditorTransaction,
  redoEditorTransaction,
  undoEditorTransaction
} from "../src/editorTransactions.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

{
  const empty = createEditorTransactionHistory<string>();
  const first = recordEditorTransaction(empty, { before: "detail-a", after: "detail-b" });
  const second = recordEditorTransaction(first, { before: "detail-b", after: "detail-c" });

  assertEqual(second.undo.length, 2, "each committed editor action should create exactly one Undo entry");
  assertEqual(second.redo.length, 0, "a committed editor action should clear the Redo branch");

  const undone = undoEditorTransaction(second);
  assert(undone.changed, "Undo should return the prior editable artifact");
  assertEqual(undone.artifact, "detail-b", "Undo should restore only the transaction's prior artifact");
  assertEqual(undone.history.undo.length, 1, "Undo should consume one Undo entry");
  assertEqual(undone.history.redo.length, 1, "Undo should create one Redo entry");

  const redone = redoEditorTransaction(undone.history);
  assert(redone.changed, "Redo should return the transaction's next editable artifact");
  assertEqual(redone.artifact, "detail-c", "Redo should reapply only the transaction's next artifact");
  assertDeepEqual(redone.history, second, "Redo should restore the prior runtime history shape");

  const branched = recordEditorTransaction(undone.history, { before: "detail-b", after: "detail-d" });
  assertEqual(branched.undo.length, 2, "a new edit after Undo should create one replacement Undo entry");
  assertEqual(branched.redo.length, 0, "a new edit after Undo should discard the abandoned Redo branch");
}

{
  const empty = createEditorTransactionHistory<string>();
  assertEqual(undoEditorTransaction(empty).changed, false, "Undo should be unchanged without an entry");
  assertEqual(redoEditorTransaction(empty).changed, false, "Redo should be unchanged without an entry");
}

console.log("editor transaction tests passed");
