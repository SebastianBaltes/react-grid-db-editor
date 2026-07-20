import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { GridDbEditor } from "./GridDbEditor";
import { ColumnConfig, FilterState } from "./Types";

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

// The filter input is React-controlled; go through the native value setter so
// React's value tracker sees the change.
const typeInto = (input: HTMLInputElement, text: string) => {
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  setValue.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

const nameFilterInput = () =>
  container.querySelectorAll("th .col-filter-input")[1] as HTMLInputElement;

const renderGrid = (onFilterChange: (f: FilterState) => void, commitFilterOnBlur: boolean) => {
  act(() => {
    root.render(
      <GridDbEditor
        rows={[{ id: 1, name: "alpha" }]}
        columns={columns}
        filters={{}}
        onFilterChange={onFilterChange}
        onRowsChange={() => {}}
        rowKey={(row) => "id:" + row.id}
        commitFilterOnBlur={commitFilterOnBlur}
      />,
    );
  });
};

test("commitFilterOnBlur: typing does not commit until blur", () => {
  const calls: FilterState[] = [];
  renderGrid((f) => calls.push(f), true);

  const input = nameFilterInput();
  act(() => typeInto(input, "al"));
  act(() => typeInto(input, "alp"));
  expect(calls).toHaveLength(0); // no commit while typing

  // React's onBlur maps to the native (bubbling) focusout event.
  act(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
  expect(calls).toEqual([{ name: "alp" }]); // one commit on blur
});

test("commitFilterOnBlur: Enter commits the current value", () => {
  const calls: FilterState[] = [];
  renderGrid((f) => calls.push(f), true);

  const input = nameFilterInput();
  act(() => typeInto(input, "alp"));
  expect(calls).toHaveLength(0);

  act(() =>
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
  );
  expect(calls).toEqual([{ name: "alp" }]);
});

test("default (commit on change): typing commits every keystroke", () => {
  const calls: FilterState[] = [];
  renderGrid((f) => calls.push(f), false);

  const input = nameFilterInput();
  act(() => typeInto(input, "a"));
  act(() => typeInto(input, "al"));
  expect(calls).toEqual([{ name: "a" }, { name: "al" }]);
});
