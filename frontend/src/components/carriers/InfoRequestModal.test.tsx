/**
 * The AE is told what the carrier will be held to.
 *
 * v3.8.bca. The server refuses a fileless answer to a document category (422,
 * v3.8.bby) and the carrier form marks the attach control required (v3.8.bbz).
 * This modal is the third surface that can name that rule, and it reads the
 * same set, so an AE picking "Updated W-9 form" sees that a note alone will be
 * refused BEFORE the carrier finds out.
 *
 * Rendered with the real component; only the network layer is stubbed.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({ api: { post: vi.fn() } }));

import { InfoRequestModal } from "./InfoRequestModal";
import { INFO_REQUEST_CATEGORIES, requiresAttachment } from "@shared/constants/infoRequestCategories";

function mount() {
  render(<InfoRequestModal carrierId="cp-1" carrierCompany="CJ MASTER FREIGHT INC" open={true} onClose={() => {}} />);
  return screen.getByRole("combobox") as HTMLSelectElement;
}

describe("attachment cue", () => {
  it("opens on COI_UPDATE saying the carrier must attach a file", () => {
    mount();
    expect(screen.getByTestId("attachment-cue").textContent).toMatch(/must attach a file/);
  });

  it("switching to a prose category says attachments are optional", () => {
    const select = mount();
    fireEvent.change(select, { target: { value: "REFERENCES" } });
    expect(screen.getByTestId("attachment-cue").textContent).toMatch(/optional/);
    expect(screen.getByTestId("attachment-cue").textContent).not.toMatch(/must attach/);
  });

  it("every category renders the cue that matches the shared set — no surface keeps its own list", () => {
    const select = mount();
    for (const c of INFO_REQUEST_CATEGORIES) {
      fireEvent.change(select, { target: { value: c } });
      const text = screen.getByTestId("attachment-cue").textContent ?? "";
      if (requiresAttachment(c)) expect(text).toMatch(/must attach a file/);
      else expect(text).toMatch(/optional/);
    }
  });
});
