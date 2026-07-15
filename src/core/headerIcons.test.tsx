import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { GridDbEditor } from "./GridDbEditor";
import { ColumnConfig, SortConfig } from "./Types";

(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) =>
  setTimeout(() => cb(Date.now()), 0) as unknown as number;
(globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
(globalThis as any).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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

function render(onIconClick: jest.Mock, onSortChange: jest.Mock) {
  const columns: ColumnConfig<any>[] = [
    { name: "id", type: "Number", readOnly: true },
    {
      name: "fk",
      type: "String",
      headerIcons: [
        { glyph: "➔", title: "Open target", onClick: onIconClick },
        { glyph: "🔑", title: "primary key" },
      ],
    },
  ];
  const sortConfig: SortConfig = [];
  act(() => {
    root.render(
      <GridDbEditor
        rows={[{ id: 1, fk: "x" }]}
        columns={columns}
        sortConfig={sortConfig}
        onSortChange={onSortChange}
        onRowsChange={() => {}}
      />,
    );
  });
}

test("clickable headerIcon fires onClick and does NOT trigger sort", () => {
  const onIconClick = jest.fn();
  const onSortChange = jest.fn();
  render(onIconClick, onSortChange);

  const btn = container.querySelector(".col-header-icon-button") as HTMLButtonElement;
  expect(btn).not.toBeNull();
  expect(btn.textContent).toBe("➔");
  expect(btn.getAttribute("title")).toBe("Open target");

  act(() => {
    btn.click();
  });
  expect(onIconClick).toHaveBeenCalledTimes(1);
  expect(onSortChange).not.toHaveBeenCalled(); // click isolated from sort
});

test("non-clickable headerIcon renders as a passive glyph (not a button)", () => {
  const onIconClick = jest.fn();
  const onSortChange = jest.fn();
  render(onIconClick, onSortChange);

  const icons = Array.from(container.querySelectorAll(".col-header-icon"));
  const info = icons.find((el) => el.textContent === "🔑") as HTMLElement;
  expect(info).not.toBeNull();
  expect(info.tagName).toBe("SPAN"); // not a button
  expect(info.getAttribute("title")).toBe("primary key");
});

test("clicking the header label still sorts (icons don't break sort)", () => {
  const onIconClick = jest.fn();
  const onSortChange = jest.fn();
  render(onIconClick, onSortChange);

  const fkLabel = container.querySelectorAll(".col-header-label")[1] as HTMLElement;
  act(() => {
    fkLabel.click();
  });
  expect(onSortChange).toHaveBeenCalledTimes(1);
  expect(onSortChange.mock.calls[0][0]).toEqual([{ column: "fk", direction: "asc" }]);
});
