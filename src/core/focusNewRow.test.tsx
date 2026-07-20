import React, { useState, useRef } from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { GridDbEditor } from "./GridDbEditor";
import { ColumnConfig, Row, SortConfig } from "./Types";

// jsdom lacks requestAnimationFrame; the grid uses it. Polyfill to a macrotask.
(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) =>
  setTimeout(() => cb(Date.now()), 0) as unknown as number;
(globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
(globalThis as any).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const columns: ColumnConfig<any>[] = [
  { name: "id", type: "Number", readOnly: true },
  { name: "name", type: "String" },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const grid = () => container.querySelector(".grid-db-editor") as HTMLElement;
const createBtn = () => container.querySelector(".toolbar-button") as HTMLButtonElement;
const activeInput = () => {
  const el = document.activeElement as HTMLElement | null;
  return el && el.classList.contains("cell-editor-input") ? (el as HTMLInputElement) : null;
};

// ---------------------------------------------------------------------------
// Defect 2 — Alt+Insert must trigger Create Rows
// ---------------------------------------------------------------------------
test("Alt+Insert triggers handleCreateRows (onCreateRows called)", () => {
  const onCreateRows = jest.fn();
  act(() => {
    root.render(
      <GridDbEditor
        rows={[{ id: 1, name: "a" }]}
        columns={columns}
        onRowsChange={() => {}}
        onCreateRows={onCreateRows}
      />,
    );
  });
  grid().focus();
  act(() => {
    grid().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Insert", altKey: true, bubbles: true, cancelable: true }),
    );
  });
  expect(onCreateRows).toHaveBeenCalledTimes(1);
});

// ---------------------------------------------------------------------------
// Defect 1a — sync create: cursor lands in first editable cell, editor focused
// ---------------------------------------------------------------------------
function SyncHarness() {
  const [rows, setRows] = useState<Row[]>([{ id: 1, name: "a" }]);
  return (
    <GridDbEditor
      rows={rows}
      columns={columns}
      onRowsChange={(r) => setRows(r)}
      onCreateRows={() => {}}
      rowKey={(row, i) => (row.id === "" ? "tmp:" + i : "id:" + row.id)}
    />
  );
}

test("sync create focuses first editable cell (skips readOnly id) in edit mode", () => {
  act(() => {
    root.render(<SyncHarness />);
  });
  act(() => {
    createBtn().click();
  });
  const input = activeInput();
  expect(input).not.toBeNull();
  const td = input!.closest("td");
  expect(td?.getAttribute("data-col-idx")).toBe("1"); // "name", not readOnly "id"
});

// ---------------------------------------------------------------------------
// Defect 1b — async create with server PK assignment + resort/rekey (goback case)
// ---------------------------------------------------------------------------
// A controllable "server": onCreateRows returns a promise that stays pending
// until the test calls `serverRespond()`, so the optimistic commit (and the
// one-shot focus) happens in a SEPARATE frame from the PK-assign + resort —
// exactly like a real network round-trip in goback.
let serverRespond: () => void = () => {};
// Controlled sort means this harness stands in for the data source, so it sorts
// its own rows — the grid must not do it.
const byIdDesc = (rows: Row[]) =>
  [...rows].sort((a, b) => Number(b.id || 0) - Number(a.id || 0));

function AsyncHarness() {
  const [rows, setRows] = useState<Row[]>([
    { id: 2, name: "b" },
    { id: 1, name: "a" },
  ]);
  const nextId = useRef(3);
  const sortConfig: SortConfig = [{ column: "id", direction: "desc" }];
  return (
    <GridDbEditor
      rows={rows}
      columns={columns}
      sortConfig={sortConfig}
      onSortChange={() => {}}
      onRowsChange={(r) => setRows(r)}
      onCreateRows={(created) =>
        new Promise<void>((resolve) => {
          serverRespond = () => {
            created.forEach((row) => {
              row.id = nextId.current++; // assign PK in-place (same object ref)
            });
            setRows((prev) => byIdDesc(prev)); // resort: new row (max id) → top; rowKey changes
            resolve();
          };
        })
      }
      rowKey={(row, i) => (row.id === "" ? "tmp:" + i : "id:" + row.id)}
    />
  );
}

test("async create (PK assign + resort + rekey) ends with editor focused on the new row", async () => {
  await act(async () => {
    root.render(<AsyncHarness />);
  });
  // 1) Footer create → optimistic add + one-shot focus fires on the transient
  //    bottom position (new row has id="" → sorts last under id-desc).
  await act(async () => {
    createBtn().click();
  });
  // 2) Server responds later: assigns PK, row resorts to the top, rowKey changes.
  await act(async () => {
    serverRespond();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });
  const input = activeInput();
  expect(input).not.toBeNull();
  const td = input!.closest("td");
  expect(td?.getAttribute("data-col-idx")).toBe("1"); // first editable = name
  // new row has the max id (3) → under id-desc it is the top display row (idx 0)
  expect(td?.getAttribute("data-row-idx")).toBe("0");
});
