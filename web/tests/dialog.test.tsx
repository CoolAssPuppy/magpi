import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it } from "vitest";

import { Dialog } from "@/components/dialog";

/**
 * jsdom knows the dialog element but not the top layer, so showModal and close
 * are supplied. Everything else under test is ours.
 */
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});

function open(text = "Open") {
  return render(
    <Dialog title="Link a badge" trigger={(show) => <button onClick={show}>{text}</button>}>
      {(close) => <button onClick={close}>Done</button>}
    </Dialog>,
  );
}

describe("the dialog", () => {
  it("stays shut until the trigger is used", () => {
    open();

    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  });

  it("opens on the trigger, and names itself", async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(screen.getByRole("dialog", { name: "Link a badge" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  it("closes from the close control", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: "Open" }));

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  });

  it("hands its content a way to close itself", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: "Open" }));

    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  });

  it("closes on a click that lands on the backdrop", async () => {
    const user = userEvent.setup();
    const { container } = open();
    await user.click(screen.getByRole("button", { name: "Open" }));

    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("no dialog");
    await user.click(dialog);

    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  });

  it("stays open when the click lands on something inside it", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: "Open" }));

    await user.click(screen.getByRole("heading", { name: "Link a badge" }));

    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  it("can start open, for a link that arrives asking for it", () => {
    render(
      <Dialog
        title="Link a badge"
        defaultOpen
        trigger={(show) => <button onClick={show}>Open</button>}
      >
        {() => <p>Type the code</p>}
      </Dialog>,
    );

    expect(screen.getByText("Type the code")).toBeInTheDocument();
  });

  it("closes when the platform closes it, such as on Escape", async () => {
    const user = userEvent.setup();
    const { container } = open();
    await user.click(screen.getByRole("button", { name: "Open" }));

    const dialog = container.querySelector("dialog");
    if (!dialog) throw new Error("no dialog");
    // fireEvent wraps the dispatch in act, so React flushes the close.
    fireEvent(dialog, new Event("close"));

    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  });
});
