import React, { useState } from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { GridDbEditor } from "./GridDbEditor";
import { ColumnConfig, FilterState, Row, SortConfig } from "./Types";

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

const cell = (rowIdx: number, colIdx: number) =>
  container.querySelector(
    `td[data-row-idx="${rowIdx}"][data-col-idx="${colIdx}"]`,
  ) as HTMLTableCellElement;
const activeInput = () => document.activeElement as HTMLInputElement;

// The editor input is React-controlled, so assigning .value directly is invisible
// to React's value tracker. Go through the native setter it patches.
const typeIntoEditor = (text: string) => {
  const input = activeInput();
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  setValue.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

// buttons:1 matters — the cell's onMouseDown ignores anything else.
const editCell = async (rowIdx: number, colIdx: number, text: string) => {
  const td = cell(rowIdx, colIdx);
  await act(async () => {
    td.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, buttons: 1 }));
    await tick();
  });
  await act(async () => {
    td.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await tick();
  });
  await act(async () => typeIntoEditor(text));
  await act(async () => {
    activeInput().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    await tick();
  });
};

const tick = () => new Promise((r) => setTimeout(r, 0));
const nameColumn = () =>
  Array.from(container.querySelectorAll('td[data-col-idx="1"]')).map(
    (td) => td.textContent?.trim() ?? "",
  );

// ---------------------------------------------------------------------------
// Controlled sort/filter = an external data source owns ordering and row set.
// ---------------------------------------------------------------------------

test("controlled sort: grid does not reorder rows it was given", () => {
  const sortConfig: SortConfig = [{ column: "name", direction: "asc" }];
  act(() => {
    root.render(
      <GridDbEditor
        rows={[
          { id: 1, name: "c" },
          { id: 2, name: "a" },
          { id: 3, name: "b" },
        ]}
        columns={columns}
        sortConfig={sortConfig}
        onSortChange={() => {}}
        onRowsChange={() => {}}
        rowKey={(row) => "id:" + row.id}
      />,
    );
  });
  // The data source claims this order is already sorted; the grid must trust it
  // rather than apply name-asc itself (which would yield a, b, c).
  expect(nameColumn()).toEqual(["c", "a", "b"]);
});

test("uncontrolled sort: grid still sorts on its own", () => {
  act(() => {
    root.render(
      <GridDbEditor
        rows={[
          { id: 1, name: "c" },
          { id: 2, name: "a" },
          { id: 3, name: "b" },
        ]}
        columns={columns}
        onRowsChange={() => {}}
        rowKey={(row) => "id:" + row.id}
      />,
    );
  });
  const label = container.querySelectorAll("th .col-header-label")[1] as HTMLElement;
  act(() => label.click());
  expect(nameColumn()).toEqual(["a", "b", "c"]);
});

test("controlled filter: grid does not drop rows it was given", () => {
  const filters: FilterState = { name: "zzz" };
  act(() => {
    root.render(
      <GridDbEditor
        rows={[
          { id: 1, name: "a" },
          { id: 2, name: "b" },
        ]}
        columns={columns}
        filters={filters}
        onFilterChange={() => {}}
        onRowsChange={() => {}}
        rowKey={(row) => "id:" + row.id}
      />,
    );
  });
  // The backend already applied the filter and returned these rows. Re-filtering
  // with the grid's substring semantics would blank the table.
  expect(nameColumn()).toEqual(["a", "b"]);
});

// The original defect: under controlled sort the grid re-sorted on every commit,
// so an edited row jumped away from under the cursor and looked deleted.
test("controlled sort: edited row keeps its position after commit", async () => {
  function Harness() {
    const [rows, setRows] = useState<Row[]>([
      { id: 1, name: "a" },
      { id: 2, name: "b" },
      { id: 3, name: "c" },
    ]);
    const sortConfig: SortConfig = [{ column: "name", direction: "asc" }];
    return (
      <GridDbEditor
        rows={rows}
        columns={columns}
        sortConfig={sortConfig}
        onSortChange={() => {}}
        onRowsChange={(r) => setRows(r)}
        rowKey={(row) => "id:" + row.id}
      />
    );
  }
  await act(async () => {
    root.render(<Harness />);
  });
  // Edit the middle row's name to "zzz" — under a client-side name-asc sort it
  // would jump to the bottom the moment it is committed.
  await editCell(1, 1, "zzz");
  expect(nameColumn()).toEqual(["a", "zzz", "c"]);
});

// Enter commits and lets the key bubble, which focuses the grid container while
// the input is still mounted -> synchronous focusout -> a second commit.
test("Enter commits exactly once", async () => {
  const updates: Row[][] = [];
  function Harness() {
    const [rows, setRows] = useState<Row[]>([{ id: 1, name: "a" }]);
    return (
      <GridDbEditor
        rows={rows}
        columns={columns}
        onRowsChange={(r) => setRows(r)}
        onUpdateRows={(updated) => {
          updates.push(updated);
        }}
        rowKey={(row) => "id:" + row.id}
      />
    );
  }
  await act(async () => {
    root.render(<Harness />);
  });
  await editCell(0, 1, "b");
  expect(updates).toHaveLength(1);
});
