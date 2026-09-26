/**
 * The signing page previews the carrier's adopted signature (2026-09-26).
 *
 * The executed agreement now sets the typed name in the signature face on the
 * SIGNATURE line, so the page a carrier signs on shows them that, the way an
 * e-signature platform does, before they commit.
 */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";

// next/font only works under the Next compiler; the class name is what matters here.
vi.mock("@/lib/signatureFont", () => ({ signatureFont: { className: "sig-face" } }));

import { SignaturePreview } from "./SignaturePreview";

describe("SignaturePreview", () => {
  it("renders nothing until a name is typed", () => {
    const { container } = render(<SignaturePreview name="   " />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the trimmed name in the signature face, captioned as the PDF captions it", () => {
    render(<SignaturePreview name="  Jane Carrier " />);
    const el = screen.getByTestId("signature-preview-name");
    expect(el.textContent).toBe("Jane Carrier");
    expect(el.className).toContain("sig-face");
    expect(screen.getByText("Electronically signed")).toBeTruthy();
  });

  it("the activation page previews both signatures, and loads the face the PDF uses", () => {
    const page = fs.readFileSync(
      path.resolve(__dirname, "../../app/carrier/dashboard/activation/page.tsx"), "utf8");
    expect(page).toContain("<SignaturePreview name={name} />");
    expect(page).toContain("<SignaturePreview name={qpName} />");

    const font = fs.readFileSync(path.resolve(__dirname, "../../lib/signatureFont.ts"), "utf8");
    expect(font).toContain('"../fonts/AlexBrush-Regular.ttf"');
    // Same bytes as the face the backend embeds in the executed PDF.
    const front = fs.readFileSync(path.resolve(__dirname, "../../fonts/AlexBrush-Regular.ttf"));
    const back = fs.readFileSync(
      path.resolve(__dirname, "../../../../backend/src/assets/fonts/signature/AlexBrush-Regular.ttf"));
    expect(front.equals(back)).toBe(true);
  });
});
