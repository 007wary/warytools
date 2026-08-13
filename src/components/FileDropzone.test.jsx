import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import FileDropzone from "./FileDropzone";

// The entry point for every PDF and image tool on the site. Three things here
// are worth pinning:
//
//   - It is reachable by keyboard. A div with a click handler is not, and this
//     one is the only way into most tools.
//   - The <input> value is cleared after every selection. Without that, picking
//     the same file twice in a row fires no change event at all and the tool
//     appears frozen — a bug that only shows up on the second attempt.
//   - An empty drop is ignored rather than passed on as an empty list.

function file(name = "doc.pdf", type = "application/pdf") {
  return new File(["%PDF-1.4"], name, { type });
}

/** A drop/dragover event carrying a DataTransfer-shaped payload jsdom accepts. */
function dropEvent(files) {
  return { dataTransfer: { files, items: files.map((f) => ({ kind: "file", getAsFile: () => f })), types: ["Files"] } };
}

describe("FileDropzone", () => {
  it("exposes a labelled control that is reachable by keyboard", async () => {
    render(<FileDropzone onFiles={vi.fn()} />);

    const zone = screen.getByRole("button", { name: /Drag & drop/ });
    await userEvent.tab();

    expect(zone).toHaveFocus();
  });

  it("opens the file picker on Enter and on Space", async () => {
    const { container } = render(<FileDropzone onFiles={vi.fn()} />);
    const input = container.querySelector("input[type='file']");
    const click = vi.spyOn(input, "click").mockImplementation(() => {});

    const zone = screen.getByRole("button", { name: /Drag & drop/ });
    zone.focus();

    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");

    // Both, because a role="button" is expected to answer to either and a
    // keyboard user has no other way in.
    expect(click).toHaveBeenCalledTimes(2);
  });

  it("passes dropped files to onFiles", () => {
    const onFiles = vi.fn();
    render(<FileDropzone onFiles={onFiles} />);

    const zone = screen.getByRole("button", { name: /Drag & drop/ });
    fireEvent.drop(zone, dropEvent([file()]));

    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0][0].name).toBe("doc.pdf");
  });

  it("ignores a drop that carries no files", () => {
    const onFiles = vi.fn();
    render(<FileDropzone onFiles={onFiles} />);

    // Dragging a text selection or a URL onto the zone lands here. Forwarding
    // an empty list would make every tool handle a case it never asked about.
    fireEvent.drop(screen.getByRole("button", { name: /Drag & drop/ }), dropEvent([]));

    expect(onFiles).not.toHaveBeenCalled();
  });

  it("clears the input value so re-selecting the same file still fires", async () => {
    const onFiles = vi.fn();
    const { container } = render(<FileDropzone onFiles={onFiles} />);
    const input = container.querySelector("input[type='file']");

    await userEvent.upload(input, file());
    expect(onFiles).toHaveBeenCalledTimes(1);

    // The browser fires no change event when the picked file is identical to
    // the one already in the input, so without the reset the tool silently
    // does nothing the second time — and looks broken rather than idle.
    expect(input.value).toBe("");
  });

  it("forwards accept and multiple to the underlying input", () => {
    const { container } = render(
      <FileDropzone onFiles={vi.fn()} accept="image/*" multiple />
    );
    const input = container.querySelector("input[type='file']");

    expect(input).toHaveAttribute("accept", "image/*");
    expect(input).toHaveAttribute("multiple");
  });

  it("uses the supplied label as the accessible name", () => {
    render(<FileDropzone onFiles={vi.fn()} label="Drop your PDFs here" />);

    expect(screen.getByRole("button", { name: "Drop your PDFs here" })).toBeInTheDocument();
  });
});
